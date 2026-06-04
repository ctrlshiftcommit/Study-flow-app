const BRIDGE = 'http://127.0.0.1:17384';
const videoByTab = new Map();
const distractionLastShown = new Map();
let lastStatus = { connected: false, message: 'Not checked yet', classApproved: false, classLoggingEnabled: false, distractionMatch: false };
let currentActive = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'video-state' && sender.tab?.id) {
    videoByTab.set(sender.tab.id, Boolean(message.playing));
    void evaluate();
    return;
  }
  if (message?.type === 'popup-status') return handlePopupStatus(sendResponse);
  if (message?.type === 'save-token') return handleSaveToken(message.token, sendResponse);
  if (message?.type === 'test-reminder') return handleTestReminder(sendResponse);
  if (message?.type === 'add-current-site') return handleAddCurrentSite(message.ruleType, sendResponse);
});

chrome.tabs.onActivated.addListener(() => void evaluate());
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if ('audible' in changeInfo || 'url' in changeInfo || 'status' in changeInfo) void evaluate();
});
chrome.tabs.onRemoved.addListener((tabId) => {
  videoByTab.delete(tabId);
  void evaluate();
});
setInterval(() => void evaluate(true), 5000);

async function evaluate(heartbeat = false) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const token = await getToken();
  if (!token || !tab?.id || !tab.url) return transition(null, token);
  const rules = await getRules(token);
  const approved = rules.patterns.some((pattern) => matches(tab.url, pattern));
  const distractionRule = getDistractionRule(tab.url, rules.distractions);
  lastStatus = {
    connected: rules.connected,
    message: rules.message,
    classApproved: approved,
    classLoggingEnabled: Boolean(rules.classLoggingEnabled),
    distractionMatch: Boolean(distractionRule)
  };
  await maybeShowDistractionReminder(tab, rules.distractions, distractionRule);
  const isActive = rules.classLoggingEnabled && approved && tab.audible === true && videoByTab.get(tab.id) === true;
  if (!isActive) return transition(null, token);
  const next = { tabId: tab.id, url: tab.url, title: tab.title || '' };
  if (!currentActive || currentActive.tabId !== next.tabId || currentActive.url !== next.url) {
    if (currentActive) await postEvent('class-ended', currentActive, token);
    currentActive = next;
    return postEvent('class-active', next, token);
  }
  if (heartbeat) return postEvent('heartbeat', next, token);
}

async function transition(next, token) {
  if (!currentActive) return;
  const previous = currentActive;
  currentActive = next;
  if (token) await postEvent('class-paused', previous, token);
}

async function getRules(token) {
  try {
    const response = await fetch(`${BRIDGE}/rules`, { headers: { 'X-StudyFlow-Token': token } });
    if (!response.ok) return { connected: false, message: response.status === 401 ? 'Token rejected' : 'StudyFlow bridge rejected rules', classLoggingEnabled: false, patterns: [], distractions: null };
    const { classLoggingEnabled = false, patterns = [], distractions = null } = await response.json();
    return { connected: true, message: 'Connected to StudyFlow', classLoggingEnabled, patterns, distractions };
  } catch {
    return { connected: false, message: 'StudyFlow bridge is offline', classLoggingEnabled: false, patterns: [], distractions: null };
  }
}

function getDistractionRule(url, distractions) {
  if (!distractions?.enabled || !url) return null;
  return (distractions.rules || []).find((item) => matches(url, item.pattern)) || null;
}

async function maybeShowDistractionReminder(tab, distractions, matchedRule) {
  if (!distractions?.enabled || !tab.url) return;
  const rule = matchedRule || getDistractionRule(tab.url, distractions);
  if (!rule) return;
  const cooldownMs = Math.max(1, Number(distractions.cooldownMinutes) || 10) * 60 * 1000;
  const key = rule.pattern || tab.url;
  const lastShownAt = distractionLastShown.get(key) || 0;
  if (Date.now() - lastShownAt < cooldownMs) return;
  distractionLastShown.set(key, Date.now());
  await chrome.notifications.create(`studyflow-distraction-${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icon.png',
    title: rule.label ? `StudyFlow: ${rule.label}` : 'StudyFlow reminder',
    message: distractions.message || 'This looks like distraction territory. Come back to your StudyFlow plan.'
  }).catch(() => undefined);
}

function matches(url, pattern) {
  const raw = String(pattern).trim();
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
    // Keep the original string candidate.
  }
  const escaped = raw.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  try {
    const regex = new RegExp(`^${escaped}$`, 'i');
    return [...candidates].some((candidate) => regex.test(candidate));
  } catch {
    return false;
  }
}

function handlePopupStatus(sendResponse) {
  return trueWithResponse(async (sendResponse) => {
    const token = await getToken();
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!token) {
      sendResponse({ token, connected: false, message: 'Paste the StudyFlow pairing token', currentUrl: tab?.url || '', classApproved: false, classLoggingEnabled: false, distractionMatch: false });
      return;
    }
    if (tab?.url) await evaluate();
    sendResponse({ token, currentUrl: tab?.url || '', ...lastStatus });
  }, sendResponse);
}

function handleSaveToken(token, sendResponse) {
  return trueWithResponse(async (sendResponse) => {
    const pairingToken = String(token || '').trim();
    await chrome.storage.local.set({ pairingToken });
    lastStatus = { connected: false, message: 'Token saved. Checking...', classApproved: false, classLoggingEnabled: false, distractionMatch: false };
    await evaluate();
    sendResponse({ token: pairingToken, ...lastStatus });
  }, sendResponse);
}

function handleTestReminder(sendResponse) {
  return trueWithResponse(async (sendResponse) => {
    await chrome.notifications.create(`studyflow-test-${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'StudyFlow reminder',
      message: 'Reminder notifications are working.'
    });
    sendResponse({ ok: true, connected: true, message: 'Test reminder sent' });
  }, sendResponse);
}

function handleAddCurrentSite(ruleType, sendResponse) {
  return trueWithResponse(async (sendResponse) => {
    const token = await getToken();
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!token) {
      sendResponse({ connected: false, message: 'Paste the StudyFlow pairing token first' });
      return;
    }
    if (!tab?.url || !/^https?:\/\//i.test(tab.url)) {
      sendResponse({ connected: true, message: 'Open a normal website tab first' });
      return;
    }
    const response = await fetch(`${BRIDGE}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-StudyFlow-Token': token },
      body: JSON.stringify({ type: ruleType === 'distraction' ? 'distraction' : 'class', url: tab.url, title: tab.title || '' })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      sendResponse({ connected: false, message: payload.error || 'Could not save site in StudyFlow' });
      return;
    }
    await evaluate();
    sendResponse({ token, currentUrl: tab.url, ...lastStatus, ...payload });
  }, sendResponse);
}

function trueWithResponse(work, sendResponse) {
  work(sendResponse).catch((error) => sendResponse({ ok: false, message: String(error) }));
  return true;
}

async function postEvent(type, tab, token) {
  try {
    await fetch(`${BRIDGE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-StudyFlow-Token': token },
      body: JSON.stringify({ type, url: tab.url, title: tab.title })
    });
  } catch {
    // StudyFlow may not be open. The next heartbeat retries quietly.
  }
}

async function getToken() {
  return (await chrome.storage.local.get('pairingToken')).pairingToken || '';
}
