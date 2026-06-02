const BRIDGE = 'http://127.0.0.1:17384';
const videoByTab = new Map();
let currentActive = null;

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'video-state' || !sender.tab?.id) return;
  videoByTab.set(sender.tab.id, Boolean(message.playing));
  void evaluate();
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
  const approved = await isApproved(tab.url, token);
  const isActive = approved && tab.audible === true && videoByTab.get(tab.id) === true;
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

async function isApproved(url, token) {
  try {
    const response = await fetch(`${BRIDGE}/rules`, { headers: { 'X-StudyFlow-Token': token } });
    if (!response.ok) return false;
    const { patterns = [] } = await response.json();
    return patterns.some((pattern) => matches(url, pattern));
  } catch {
    return false;
  }
}

function matches(url, pattern) {
  const escaped = String(pattern).trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  if (!escaped) return false;
  try {
    return new RegExp(`^${escaped}$`, 'i').test(url);
  } catch {
    return false;
  }
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
