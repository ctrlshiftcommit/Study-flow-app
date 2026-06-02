import type { BrowserWindow } from 'electron';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
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
let mainWindow: BrowserWindow | null = null;
let browserSession: BrowserSession | null = null;
let manualActive = false;
let manualDecision: 'pending' | 'merged' | 'declined' | null = null;
let pendingConflict: BrowserConflictEvent | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;

export function startBrowserBridge(win: BrowserWindow, readSettings: () => Settings): void {
  if (server) return;
  mainWindow = win;
  settingsReader = readSettings;
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
    if (!settings?.browserLoggingEnabled) return send(response, 403, { error: 'Browser class logging is disabled.' });
    return send(response, 200, { patterns: settings.browserClassRules.map((rule) => rule.pattern).filter(Boolean) });
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
  const seconds = Math.max(0, Math.round(browserSession.accumulatedMs / 1000));
  getDb().prepare('UPDATE sessions SET ended_at=?, duration_seconds=? WHERE id=?')
    .run(ended ? Date.now() : null, seconds, browserSession.id);
}

function findMatchingRule(url: string, settings: Settings) {
  return settings.browserClassRules.find((rule) => matchesPattern(url, rule.pattern));
}

function matchesPattern(url: string, pattern: string): boolean {
  const escaped = pattern.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  if (!escaped) return false;
  try {
    return new RegExp(`^${escaped}$`, 'i').test(url);
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
