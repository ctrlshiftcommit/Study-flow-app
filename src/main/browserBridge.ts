import type { BrowserWindow } from 'electron';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import type { BrowserBridgeStatus, BrowserClassEventType, BrowserConflictEvent, Settings } from '../shared/types';

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
      patterns: settings.browserClassRules.map((rule) => rule.pattern).filter(Boolean),
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
  const pattern = urlToWildcard(payload.url);
  const label = titleToLabel(payload.title, payload.url);
  if (payload.type === 'class') {
    const exists = settings.browserClassRules.some((rule) => matchesPattern(payload.url, rule.pattern) || rule.pattern === pattern);
    return {
      ...settings,
      browserLoggingEnabled: true,
      browserClassRules: exists ? settings.browserClassRules : [...settings.browserClassRules, { id: randomUUID(), pattern, subjectId: null }]
    };
  }
  const exists = settings.browserDistractionRules.some((rule) => matchesPattern(payload.url, rule.pattern) || rule.pattern === pattern);
  return {
    ...settings,
    browserDistractionRemindersEnabled: true,
    browserDistractionRules: exists ? settings.browserDistractionRules : [...settings.browserDistractionRules, { id: randomUUID(), pattern, label }]
  };
}

function ruleStatusForUrl(url: string, settings: Settings) {
  return {
    connected: true,
    message: 'Saved in StudyFlow',
    classApproved: settings.browserLoggingEnabled && settings.browserClassRules.some((rule) => matchesPattern(url, rule.pattern)),
    distractionMatch: settings.browserDistractionRemindersEnabled && settings.browserDistractionRules.some((rule) => matchesPattern(url, rule.pattern))
  };
}

function urlToWildcard(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}/*`;
  } catch {
    return `${url.replace(/[#?].*$/, '').replace(/\/?$/, '')}*`;
  }
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
  getDb().prepare('UPDATE sessions SET ended_at=?, duration_seconds=? WHERE id=?')
    .run(ended ? Date.now() : null, seconds, browserSession.id);
}

function findMatchingRule(url: string, settings: Settings) {
  return settings.browserClassRules.find((rule) => matchesPattern(url, rule.pattern));
}

function matchesPattern(url: string, pattern: string): boolean {
  const raw = pattern.trim();
  if (!raw) return false;
  const candidates = new Set([url]);
  try {
    const parsed = new URL(url);
    if (parsed.hostname.startsWith('www.')) {
      parsed.hostname = parsed.hostname.slice(4);
      candidates.add(parsed.toString());
    } else {
      parsed.hostname = `www.${parsed.hostname}`;
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
