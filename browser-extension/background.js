const BRIDGE = 'http://127.0.0.1:17384';
const GRACE_MS = 240_000;

const videoByTab = new Map();
const distractionLastShown = new Map();
const declinedSiteKeys = new Set();

let lastStatus = emptyStatus('Not checked yet');
let classSession = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'video-state' && sender.tab?.id) {
    videoByTab.set(sender.tab.id, Boolean(message.playing));
    void evaluate();
    return;
  }
  if (message?.type === 'class-consent-response') return handleClassConsent(message, sendResponse);
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
  if (classSession?.tabId === tabId) void endClassSession();
  void evaluate();
});
setInterval(() => void evaluate(true), 5000);

async function evaluate(heartbeat = false) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const token = await getToken();
  if (!token || !tab?.id || !tab.url) {
    lastStatus = emptyStatus(token ? 'Current tab unavailable' : 'Paste the StudyFlow pairing token');
    return;
  }

  if (classSession && tab.id !== classSession.tabId && !classSession.sessionStarted) {
    await hideClassPrompt(classSession.tabId);
    classSession = null;
  }

  const rules = await getRules(token);
  const bridgeStatus = await getBridgeStatus(token);
  if (!classSession && bridgeStatus.activeSessionId && bridgeStatus.activeUrl) {
    const trackedTab = await findTabForUrl(bridgeStatus.activeUrl);
    if (trackedTab?.id) {
      classSession = {
        tabId: trackedTab.id,
        url: bridgeStatus.activeUrl,
        title: trackedTab.title || '',
        subjectId: bridgeStatus.activeSubjectId ?? null,
        subjects: rules.subjects || [],
        state: bridgeStatus.recordingState || 'paused-expired',
        sessionStarted: true,
        promptShown: false
      };
    }
  }
  const matchedClassRule = getClassRule(tab.url, rules.classRules, rules.patterns);
  const approved = Boolean(matchedClassRule);
  const distractionRule = getDistractionRule(tab.url, rules.distractions);
  const ruleSubjectId = matchedClassRule?.subjectId ?? null;
  const activeSubjectId = classSession?.subjectId ?? bridgeStatus.activeSubjectId ?? ruleSubjectId;
  const activeSubject = (rules.subjects || []).find((subject) => subject.id === activeSubjectId);

  updateLastStatus({
    connected: rules.connected,
    message: rules.message,
    currentUrl: tab.url,
    classApproved: approved,
    classLoggingEnabled: Boolean(rules.classLoggingEnabled),
    distractionMatch: Boolean(distractionRule),
    recordingState: localRecordingState(bridgeStatus),
    classSubjectId: activeSubjectId ?? null,
    classSubjectName: activeSubject?.name || '',
    subjects: rules.subjects || []
  });

  await maybeShowDistractionReminder(tab, rules.distractions, distractionRule);

  if (classSession?.sessionStarted) {
    await evaluateStartedSession(token, rules, bridgeStatus, heartbeat);
    return;
  }

  const sameClass = classSession && classSession.tabId === tab.id && classSession.url === tab.url;
  if (!rules.classLoggingEnabled || !approved) {
    if (sameClass && classSession.sessionStarted) await endClassSession();
    if (sameClass) classSession = null;
    updateLastStatus({ recordingState: bridgeStatus.recordingState || 'idle' });
    return;
  }

  const playing = tab.audible === true && videoByTab.get(tab.id) === true;
  const context = {
    tabId: tab.id,
    url: tab.url,
    title: tab.title || '',
    subjectId: ruleSubjectId,
    subjects: rules.subjects || []
  };

  if (declinedSiteKeys.has(siteKey(tab.url))) {
    if (!classSession || !sameClass) classSession = { ...context, state: 'declined', sessionStarted: false, promptShown: false };
    updateLastStatus({ recordingState: 'declined' });
    return;
  }

  if (!sameClass) {
    if (classSession?.tabId) await hideClassPrompt(classSession.tabId);
    classSession = null;
  }

  if (playing) {
    if (!classSession) {
      classSession = { ...context, state: 'prompting', sessionStarted: false, promptShown: true };
      await showClassPrompt(tab, classSession, 'initial');
      updateLastStatus({ recordingState: 'prompting' });
      return;
    }

    if (classSession.state === 'recording') {
      if (heartbeat) await postEvent('class-heartbeat', classSession, token);
      updateLastStatus({ recordingState: 'recording' });
      return;
    }

    if (classSession.state === 'grace-paused') {
      classSession.state = 'recording';
      classSession.pauseStartedAt = null;
      await postEvent('class-heartbeat', classSession, token);
      updateLastStatus({ recordingState: 'recording' });
      return;
    }

    if (classSession.state === 'paused-expired') {
      if (!classSession.promptShown) {
        classSession.promptShown = true;
        await showClassPrompt(tab, classSession, 'replay');
      }
      updateLastStatus({ recordingState: 'paused-expired' });
      return;
    }

    if (classSession.state === 'idle') {
      classSession.state = 'prompting';
      classSession.promptShown = true;
      await showClassPrompt(tab, classSession, 'initial');
      updateLastStatus({ recordingState: 'prompting' });
      return;
    }
  }

  if (!classSession) {
    updateLastStatus({ recordingState: bridgeStatus.recordingState || 'idle' });
    return;
  }

  if (classSession.state === 'recording') {
    classSession.state = 'grace-paused';
    classSession.pauseStartedAt = Date.now();
    await postEvent('class-pause-grace', classSession, token, { graceExpired: false });
    updateLastStatus({ recordingState: 'grace-paused' });
    return;
  }

  if (classSession.state === 'grace-paused') {
    const pauseStartedAt = classSession.pauseStartedAt || Date.now();
    if (Date.now() - pauseStartedAt <= GRACE_MS) {
      if (heartbeat) await postEvent('class-heartbeat', classSession, token);
      updateLastStatus({ recordingState: 'grace-paused' });
      return;
    }
    classSession.state = 'paused-expired';
    classSession.promptShown = false;
    await postEvent('class-pause-grace', classSession, token, {
      graceExpired: true,
      countedUntil: pauseStartedAt + GRACE_MS
    });
    updateLastStatus({ recordingState: 'paused-expired' });
    return;
  }

  if (classSession.state === 'prompting' && !classSession.sessionStarted) {
    updateLastStatus({ recordingState: 'prompting' });
  }
}

async function evaluateStartedSession(token, rules, bridgeStatus, heartbeat) {
  const trackedTab = await getTab(classSession.tabId);
  if (!trackedTab?.url) {
    await endClassSession();
    return;
  }

  const matchedClassRule = getClassRule(trackedTab.url, rules.classRules, rules.patterns);
  if (!rules.classLoggingEnabled || !matchedClassRule || trackedTab.url !== classSession.url) {
    await endClassSession();
    return;
  }

  classSession.title = trackedTab.title || classSession.title;
  const trackedPlaying = trackedTab.audible === true && videoByTab.get(trackedTab.id) === true;

  if (trackedPlaying) {
    if (classSession.state === 'recording') {
      if (heartbeat) await postEvent('class-heartbeat', classSession, token);
      updateLastStatus({ recordingState: 'recording' });
      return;
    }

    if (classSession.state === 'grace-paused') {
      classSession.state = 'recording';
      classSession.pauseStartedAt = null;
      await postEvent('class-heartbeat', classSession, token);
      updateLastStatus({ recordingState: 'recording' });
      return;
    }

    if (classSession.state === 'paused-expired') {
      if (!classSession.promptShown) {
        classSession.promptShown = true;
        await showClassPrompt(trackedTab, classSession, 'replay');
      }
      updateLastStatus({ recordingState: 'paused-expired' });
      return;
    }
  }

  if (classSession.state === 'recording') {
    classSession.state = 'grace-paused';
    classSession.pauseStartedAt = Date.now();
    await postEvent('class-pause-grace', classSession, token, { graceExpired: false });
    updateLastStatus({ recordingState: 'grace-paused' });
    return;
  }

  if (classSession.state === 'grace-paused') {
    const pauseStartedAt = classSession.pauseStartedAt || Date.now();
    if (Date.now() - pauseStartedAt <= GRACE_MS) {
      if (heartbeat) await postEvent('class-heartbeat', classSession, token);
      updateLastStatus({ recordingState: 'grace-paused' });
      return;
    }
    classSession.state = 'paused-expired';
    classSession.promptShown = false;
    await postEvent('class-pause-grace', classSession, token, {
      graceExpired: true,
      countedUntil: pauseStartedAt + GRACE_MS
    });
    updateLastStatus({ recordingState: 'paused-expired' });
    return;
  }

  updateLastStatus({ recordingState: bridgeStatus.recordingState || classSession.state || 'idle' });
}

function handleClassConsent(message, sendResponse) {
  return trueWithResponse(async (sendResponse) => {
    const token = await getToken();
    if (!token) {
      sendResponse({ connected: false, message: 'Paste the StudyFlow pairing token first' });
      return;
    }
    if (!classSession || !message.url || classSession.url !== message.url) {
      sendResponse({ connected: false, message: 'Class prompt is no longer active.' });
      return;
    }

    if (message.choice === 'no') {
      declinedSiteKeys.add(siteKey(classSession.url));
      if (classSession.sessionStarted) await postEvent('class-ended', classSession, token);
      classSession = { ...classSession, state: 'declined', sessionStarted: false, promptShown: false };
      updateLastStatus({ recordingState: 'declined' });
      sendResponse({ connected: true, message: 'Class logging skipped', recordingState: 'declined' });
      return;
    }

    const subjectId = Number(message.subjectId);
    if (!Number.isFinite(subjectId) || subjectId <= 0) {
      sendResponse({ connected: false, message: 'Choose a subject before starting logging.' });
      return;
    }

    const shouldStartNew = message.choice === 'new';
    const shouldResume = message.choice === 'resume' && classSession.sessionStarted;
    if (shouldStartNew && classSession.sessionStarted) await postEvent('class-ended', classSession, token);

    classSession.subjectId = subjectId;
    classSession.state = 'recording';
    classSession.sessionStarted = true;
    classSession.promptShown = false;
    classSession.pauseStartedAt = null;
    await postEvent('class-start', classSession, token, { subjectId, mode: shouldResume ? 'resume' : 'new' });
    updateLastStatus({ recordingState: 'recording', classSubjectId: subjectId });
    sendResponse({ connected: true, message: 'Class logging started', recordingState: 'recording', classSubjectId: subjectId });
  }, sendResponse);
}

async function endClassSession() {
  const token = await getToken();
  if (token && classSession?.sessionStarted) await postEvent('class-ended', classSession, token);
  classSession = null;
  updateLastStatus({ recordingState: 'idle' });
}

async function getTab(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

async function findTabForUrl(url) {
  const tabs = await chrome.tabs.query({});
  return tabs.find((tab) => tab.url === url) || tabs.find((tab) => tab.url && matchesSameBrowserUrl(tab.url, url)) || null;
}

async function getRules(token) {
  try {
    const response = await fetch(`${BRIDGE}/rules`, { headers: { 'X-StudyFlow-Token': token } });
    if (!response.ok) return { connected: false, message: response.status === 401 ? 'Token rejected' : 'StudyFlow bridge rejected rules', classLoggingEnabled: false, classRules: [], patterns: [], subjects: [], distractions: null };
    const { classLoggingEnabled = false, classRules = [], patterns = [], subjects = [], distractions = null } = await response.json();
    return { connected: true, message: 'Connected to StudyFlow', classLoggingEnabled, classRules, patterns, subjects, distractions };
  } catch {
    return { connected: false, message: 'StudyFlow bridge is offline', classLoggingEnabled: false, classRules: [], patterns: [], subjects: [], distractions: null };
  }
}

async function getBridgeStatus(token) {
  try {
    const response = await fetch(`${BRIDGE}/status`, { headers: { 'X-StudyFlow-Token': token } });
    if (!response.ok) return {};
    return await response.json();
  } catch {
    return {};
  }
}

function getClassRule(url, classRules = [], fallbackPatterns = []) {
  const matchedRule = (classRules || []).find((rule) => matches(url, rule.pattern));
  if (matchedRule) return matchedRule;
  const matchedPattern = (fallbackPatterns || []).find((pattern) => matches(url, pattern));
  return matchedPattern ? { pattern: matchedPattern, subjectId: null } : null;
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
  await showInPageReminder(tab.id, rule.label ? `StudyFlow: ${rule.label}` : 'StudyFlow reminder', distractions.message || 'This looks like distraction territory. Come back to your StudyFlow plan.');
}

async function showInPageReminder(tabId, title, message) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'show-studyflow-reminder', title, message });
  } catch {
    // Some browser pages do not allow content scripts.
  }
}

async function showClassPrompt(tab, session, mode) {
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'show-class-consent',
      mode,
      subjects: session.subjects || [],
      selectedSubjectId: session.subjectId ?? null,
      url: session.url,
      title: session.title
    });
  } catch {
    // Some browser pages do not allow content scripts.
  }
}

async function hideClassPrompt(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'hide-class-consent' });
  } catch {
    // Some browser pages do not allow content scripts.
  }
}


function handlePopupStatus(sendResponse) {
  return trueWithResponse(async (sendResponse) => {
    const token = await getToken();
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!token) {
      sendResponse({ token, connected: false, message: 'Paste the StudyFlow pairing token', currentUrl: tab?.url || '', classApproved: false, classLoggingEnabled: false, distractionMatch: false, recordingState: 'idle' });
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
    lastStatus = emptyStatus('Token saved. Checking...');
    await evaluate();
    sendResponse({ token: pairingToken, ...lastStatus });
  }, sendResponse);
}

function handleTestReminder(sendResponse) {
  return trueWithResponse(async (sendResponse) => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await chrome.notifications.create(`studyflow-test-${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'StudyFlow reminder',
      message: 'Reminder notifications are working.'
    });
    if (tab?.id) await showInPageReminder(tab.id, 'StudyFlow reminder', 'Reminder banner is working on this page.');
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

async function postEvent(type, tab, token, extra = {}) {
  try {
    await fetch(`${BRIDGE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-StudyFlow-Token': token },
      body: JSON.stringify({ type, url: tab.url, title: tab.title, ...extra })
    });
  } catch {
    // StudyFlow may not be open. The next heartbeat retries quietly.
  }
}

function updateLastStatus(patch) {
  const recordingState = patch.recordingState || lastStatus.recordingState || 'idle';
  lastStatus = {
    ...lastStatus,
    ...patch,
    recordingState,
    recording: recordingState === 'recording' || recordingState === 'grace-paused'
  };
}

function localRecordingState(bridgeStatus) {
  if (classSession?.state) return classSession.state;
  return bridgeStatus?.recordingState || 'idle';
}

function emptyStatus(message) {
  return {
    connected: false,
    message,
    classApproved: false,
    classLoggingEnabled: false,
    distractionMatch: false,
    recording: false,
    recordingState: 'idle',
    classSubjectId: null,
    classSubjectName: '',
    subjects: []
  };
}

function matches(url, pattern) {
  const raw = String(pattern).trim();
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

function baseDomainFor(host) {
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
}

function siteKey(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return String(url || '');
  }
}

function matchesSameBrowserUrl(left, right) {
  try {
    const first = new URL(left);
    const second = new URL(right);
    return first.hostname.replace(/^www\./, '') === second.hostname.replace(/^www\./, '') && first.pathname === second.pathname;
  } catch {
    return left === right;
  }
}

function trueWithResponse(work, sendResponse) {
  work(sendResponse).catch((error) => sendResponse({ ok: false, message: String(error) }));
  return true;
}

async function getToken() {
  return (await chrome.storage.local.get('pairingToken')).pairingToken || '';
}
