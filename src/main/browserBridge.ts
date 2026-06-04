import type { BrowserWindow } from 'electron';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import type { BrowserBridgeStatus, BrowserClassEventType, BrowserConflictEvent, Settings, Subject } from '../shared/types';

const HOST = '127.0.0.1';
const PORT = 17384;
const HEARTBEAT_TIMEOUT_MS = 15_000;

interface BrowserEventPayload {
  type: BrowserClassEventType;
  url: string;
  title?: string;
  token?: string;
}

interface BrowserRulePayload {
  type: 'class' | 'distraction';
  url: string;
  title?: string;
}

interface BrowserSubjectPayload {
  url: string;
  subjectId: number | null;
}

interface BrowserSession {
  id: number;
  accumulatedMs: number;
  resumedAt: number | null;
  url: string;
  title: string;
  subjectId: number | null;
  lastHeartbeatAt: number;
}

let server: Server | null = null;
let settingsReader: (() => Settings) | null = null;
let settingsWriter: ((settings: Settings) => Settings) | null = null;
let mainWindow: BrowserWindow | null = null;
let browserSession: BrowserSession | null = null;
let manualActive = false;
let manualDecision: 'pending' | 'merged' | 'declined' | null = null;
let pendingConflict: BrowserConflictEvent | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;

export function startBrowserBridge(win: BrowserWindow, readSettings: () => Settings, saveSettings?: (settings: Settings) => Settings): void {
  if (server) return;
  mainWindow = win;
  settingsReader = readSettings;
  settingsWriter = saveSettings || null;
  server = createServer((request, response) => void route(request, response));
  server.listen(PORT, HOST);
  heartbeatTimer = setInterval(() => {
    if (browserSession?.resumedAt && Date.now() - browserSession.lastHeartbeatAt > HEARTBEAT_TIMEOUT_MS) {
      pauseBrowserSession();
    }
  }, 5_000);
}

export function stopBrowserBridge(): void {
  finalizeBrowserSession();
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  server?.close();
  server = null;
  settingsWriter = null;
}

export function getBrowserBridgeStatus(): BrowserBridgeStatus {
  const settings = settingsReader?.();
  const address = server?.address() as AddressInfo | null;
  return {
    running: Boolean(server?.listening),
    host: HOST,
    port: address?.port || PORT,
    enabled: Boolean(settings?.browserLoggingEnabled),
    paired: Boolean(settings?.browserPairingToken)
  };
}

export function setBrowserManualState(active: boolean): void {
  manualActive = active;
  if (!active) {
    manualDecision = null;
    pendingConflict = null;
  }
}

export function respondToBrowserConflict(merge: boolean): void {
  if (!pendingConflict || !manualActive) return;
  manualDecision = merge ? 'merged' : 'declined';
  if (merge) mainWindow?.webContents.send('browser:merged', pendingConflict);
  pendingConflict = null;
}

export function notifyBrowserSettingsChanged(): void {
  if (!settingsReader?.().browserLoggingEnabled) finalizeBrowserSession();
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  setCors(response);
  if (request.method === 'OPTIONS') return send(response, 204);
  if (request.url === '/status' && request.method === 'GET') {
    if (!hasValidToken(request)) return send(response, 401, { error: 'Invalid pairing token.' });
    return send(response, 200, getBrowserBridgeStatus());
  }
  if (request.url === '/rules' && request.method === 'GET') {
    if (!hasValidToken(request)) return send(response, 401, { error: 'Invalid pairing token.' });
    const settings = settingsReader?.();
    if (!settings) return send(response, 503, { error: 'StudyFlow settings are not ready.' });
    return send(response, 200, {
      classLoggingEnabled: Boolean(settings.browserLoggingEnabled),
      classRules: settings.browserClassRules.filter((rule) => rule.pattern.trim()),
      patterns: settings.browserClassRules.map((rule) => rule.pattern).filter(Boolean),
      subjects: getSubjects(),
      distractions: {
        enabled: Boolean(settings.browserDistractionRemindersEnabled),
        cooldownMinutes: Math.max(1, Number(settings.browserDistractionCooldownMinutes) || 10),
        message: settings.browserDistractionMessage || 'This looks like distraction territory. Come back to your StudyFlow plan.',
        rules: settings.browserDistractionRules.filter((rule) => rule.pattern.trim())
      }
    });
  }
  if (request.url === '/rules' && request.method === 'POST') {
    if (!hasValidToken(request)) return send(response, 401, { error: 'Invalid pairing token.' });
    if (!settingsWriter) return send(response, 503, { error: 'StudyFlow settings cannot be updated from the bridge.' });
    const payload = await readJson(request) as BrowserRulePayload;
    const settings = settingsReader?.();
    if (!settings) return send(response, 503, { error: 'StudyFlow settings are not ready.' });
    const next = addRuleFromBrowser(settings, payload);
    const saved = settingsWriter(next);
    mainWindow?.webContents.send('settings:updated', saved);
    return send(response, 200, ruleStatusForUrl(payload.url, saved));
  }
  if (request.url === '/class-subject' && request.method === 'POST') {
    if (!hasValidToken(request)) return send(response, 401, { error: 'Invalid pairing token.' });
    if (!settingsWriter) return send(response, 503, { error: 'StudyFlow settings cannot be updated from the bridge.' });
    const payload = await readJson(request) as BrowserSubjectPayload;
    const settings = settingsReader?.();
    if (!settings) return send(response, 503, { error: 'StudyFlow settings are not ready.' });
    const next = setSubjectForBrowserRule(settings, payload);
    const saved = settingsWriter(next);
    updateActiveBrowserSubject(payload.url, payload.subjectId);
    mainWindow?.webContents.send('settings:updated', saved);
    mainWindow?.webContents.send('browser:sessions-updated');
    const status = ruleStatusForUrl(payload.url, saved);
    return send(response, 200, { ...status, subjects: getSubjects(), subjectId: status.classSubjectId });
  }
  if (request.url !== '/events' || request.method !== 'POST') return send(response, 404, { error: 'Not found.' });
  try {
    const payload = await readJson(request) as BrowserEventPayload;
    if (!hasValidToken(request, payload.token)) return send(response, 401, { error: 'Invalid pairing token.' });
    const settings = settingsReader?.();
    if (!settings?.browserLoggingEnabled) return send(response, 403, { error: 'Browser class logging is disabled.' });
    const rule = findMatchingRule(payload.url, settings);
    if (!rule) return send(response, 403, { error: 'URL is not approved.' });
    handleBrowserEvent(payload, rule.subjectId);
    return send(response, 200, { ok: true });
  } catch (error) {
    return send(response, 400, { error: error instanceof Error ? error.message : 'Invalid request.' });
  }
}

function addRuleFromBrowser(settings: Settings, payload: BrowserRulePayload): Settings {
  const patterns = urlToWildcards(payload.url);
  const label = titleToLabel(payload.title, payload.url);
  if (payload.type === 'class') {
    const nextRules = [...settings.browserClassRules];
    for (const pattern of patterns) {
      const exists = nextRules.some((rule) => matchesPattern(payload.url, rule.pattern) || rule.pattern === pattern);
      if (!exists) nextRules.push({ id: randomUUID(), pattern, subjectId: null });
    }
    return {
      ...settings,
      browserLoggingEnabled: true,
      browserClassRules: nextRules
    };
  }
  const nextRules = [...settings.browserDistractionRules];
  for (const pattern of patterns) {
    const exists = nextRules.some((rule) => matchesPattern(payload.url, rule.pattern) || rule.pattern === pattern);
    if (!exists) nextRules.push({ id: randomUUID(), pattern, label });
  }
  return {
    ...settings,
    browserDistractionRemindersEnabled: true,
    browserDistractionRules: nextRules
  };
}

function setSubjectForBrowserRule(settings: Settings, payload: BrowserSubjectPayload): Settings {
  const subjectId = normalizeSubjectId(payload.subjectId);
  return {
    ...settings,
    browserClassRules: settings.browserClassRules.map((rule) =>
      matchesPattern(payload.url, rule.pattern) ? { ...rule, subjectId } : rule
    )
  };
}

function updateActiveBrowserSubject(url: string, subjectId: number | null): void {
  if (!browserSession || !matchesSameBrowserUrl(browserSession.url, url)) return;
  const cleanSubjectId = normalizeSubjectId(subjectId);
  browserSession.subjectId = cleanSubjectId;
  getDb().prepare('UPDATE sessions SET subject_id=? WHERE id=?').run(cleanSubjectId, browserSession.id);
}

function ruleStatusForUrl(url: string, settings: Settings) {
  const matchedClassRule = findMatchingRule(url, settings);
  return {
    connected: true,
    message: 'Saved in StudyFlow',
    classApproved: Boolean(matchedClassRule),
    classSubjectId: matchedClassRule?.subjectId ?? null,
    distractionMatch: settings.browserDistractionRemindersEnabled && settings.browserDistractionRules.some((rule) => matchesPattern(url, rule.pattern))
  };
}

function urlToWildcards(url: string): string[] {
  try {
    const parsed = new URL(normalizeUrlForParsing(url));
    const host = parsed.hostname.replace(/^www\./, '');
    const baseDomain = baseDomainFor(host);
    const patterns = new Set<string>([
      `${parsed.protocol}//${host}/*`,
      `${parsed.protocol}//*.${host}/*`
    ]);
    if (baseDomain !== host) {
      patterns.add(`${parsed.protocol}//${baseDomain}/*`);
      patterns.add(`${parsed.protocol}//*.${baseDomain}/*`);
    }
    return [...patterns];
  } catch {
    return [`${url.replace(/[#?].*$/, '').replace(/\/?$/, '')}*`];
  }
}

function normalizeUrlForParsing(value: string): string {
  let raw = String(value || '').trim().replace(/\\/g, '/');
  if (/^https?:\/?(?!\/)/i.test(raw)) raw = raw.replace(/^(https?):\/*/i, '$1://');
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  return raw;
}

function baseDomainFor(host: string): string {
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
}

function titleToLabel(title = '', url = ''): string {
  const cleanTitle = title.split('|')[0].split('-')[0].trim();
  if (cleanTitle && cleanTitle.length <= 40) return cleanTitle;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Website';
  }
}

function handleBrowserEvent(payload: BrowserEventPayload, subjectId: number | null): void {
  const event = { url: payload.url, title: String(payload.title || '') };
  if (manualActive) {
    finalizeBrowserSession();
    if (manualDecision === null) {
      manualDecision = 'pending';
      pendingConflict = event;
      mainWindow?.webContents.send('browser:conflict', event);
    }
    return;
  }
  if (payload.type === 'class-ended') {
    finalizeBrowserSession();
    return;
  }
  if (payload.type === 'class-paused') {
    pauseBrowserSession();
    return;
  }
  resumeBrowserSession(event, subjectId);
}

function resumeBrowserSession(event: BrowserConflictEvent, subjectId: number | null): void {
  const time = Date.now();
  if (browserSession && browserSession.url !== event.url) finalizeBrowserSession();
  if (!browserSession) {
    const info = getDb().prepare(
      `INSERT INTO sessions(subject_id,started_at,session_type,source,tags,source_url,source_title)
       VALUES (?,?,?,?,?,?,?)`
    ).run(subjectId, time, 'freeform', 'browser', JSON.stringify(['browser-auto', 'class']), event.url, event.title);
    browserSession = {
      id: Number(info.lastInsertRowid),
      accumulatedMs: 0,
      resumedAt: time,
      url: event.url,
      title: event.title,
      subjectId,
      lastHeartbeatAt: time
    };
    return;
  }
  browserSession.lastHeartbeatAt = time;
  if (!browserSession.resumedAt) browserSession.resumedAt = time;
  persistBrowserSession(false);
}

function pauseBrowserSession(): void {
  if (!browserSession?.resumedAt) return;
  browserSession.accumulatedMs += Date.now() - browserSession.resumedAt;
  browserSession.resumedAt = null;
  persistBrowserSession(false);
}

function finalizeBrowserSession(): void {
  if (!browserSession) return;
  pauseBrowserSession();
  persistBrowserSession(true);
  browserSession = null;
}

function persistBrowserSession(ended: boolean): void {
  if (!browserSession) return;
  const activeMs = browserSession.resumedAt ? Date.now() - browserSession.resumedAt : 0;
  const seconds = Math.max(0, Math.round((browserSession.accumulatedMs + activeMs) / 1000));
  getDb().prepare('UPDATE sessions SET subject_id=?, ended_at=?, duration_seconds=? WHERE id=?')
    .run(browserSession.subjectId, ended ? Date.now() : null, seconds, browserSession.id);
  mainWindow?.webContents.send('browser:sessions-updated');
}

function findMatchingRule(url: string, settings: Settings) {
  return settings.browserClassRules.find((rule) => matchesPattern(url, rule.pattern));
}

function getSubjects(): Subject[] {
  return getDb().prepare('SELECT id,name,color,icon,created_at FROM subjects ORDER BY created_at ASC, id ASC').all() as Subject[];
}

function normalizeSubjectId(subjectId: number | null | undefined): number | null {
  if (subjectId === null || subjectId === undefined) return null;
  const id = Number(subjectId);
  if (!Number.isFinite(id)) return null;
  const row = getDb().prepare('SELECT id FROM subjects WHERE id=?').get(id) as { id: number } | undefined;
  return row ? id : null;
}

function matchesSameBrowserUrl(left: string, right: string): boolean {
  try {
    const first = new URL(left);
    const second = new URL(right);
    return first.hostname.replace(/^www\./, '') === second.hostname.replace(/^www\./, '') && first.pathname === second.pathname;
  } catch {
    return left === right;
  }
}

function matchesPattern(url: string, pattern: string): boolean {
  const raw = pattern.trim();
  if (!raw) return false;
  const candidates = new Set([url]);
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const baseDomain = baseDomainFor(host.replace(/^www\./, ''));
    for (const candidateHost of new Set([host, host.replace(/^www\./, ''), `www.${host.replace(/^www\./, '')}`, baseDomain, `www.${baseDomain}`])) {
      parsed.hostname = candidateHost;
      candidates.add(parsed.toString());
    }
  } catch {
    // Keep the original URL candidate.
  }
  const escaped = raw.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  try {
    const regex = new RegExp(`^${escaped}$`, 'i');
    return [...candidates].some((candidate) => regex.test(candidate));
  } catch {
    return false;
  }
}

function hasValidToken(request: IncomingMessage, bodyToken?: string): boolean {
  const token = String(request.headers['x-studyflow-token'] || bodyToken || '');
  return Boolean(token) && token === settingsReader?.().browserPairingToken;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error('Request is too large.');
  }
  return JSON.parse(body || '{}');
}

function setCors(response: ServerResponse): void {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-StudyFlow-Token');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function send(response: ServerResponse, status: number, payload?: unknown): void {
  response.statusCode = status;
  if (payload === undefined) {
    response.end();
    return;
  }
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
}
