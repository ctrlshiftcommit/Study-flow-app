const tokenInput = document.querySelector('#token');
const statusText = document.querySelector('#status');
const dot = document.querySelector('#dot');
const currentTab = document.querySelector('#current-tab');
const classState = document.querySelector('#class-state');
const loggingState = document.querySelector('#logging-state');
const reminderState = document.querySelector('#reminder-state');

document.querySelector('#save').addEventListener('click', async () => {
  setStatus({ connected: false, message: 'Saving token...' });
  const response = await chrome.runtime.sendMessage({ type: 'save-token', token: tokenInput.value });
  render(response);
});

document.querySelector('#test').addEventListener('click', async () => {
  setStatus({ connected: true, message: 'Sending test reminder...' });
  const response = await chrome.runtime.sendMessage({ type: 'test-reminder' });
  setStatus(response);
});

document.querySelector('#add-class').addEventListener('click', async () => {
  setStatus({ connected: false, message: 'Approving this whole site...' });
  const response = await chrome.runtime.sendMessage({ type: 'add-current-site', ruleType: 'class' });
  render(response);
});

document.querySelector('#add-reminder').addEventListener('click', async () => {
  setStatus({ connected: false, message: 'Adding reminder rule...' });
  const response = await chrome.runtime.sendMessage({ type: 'add-current-site', ruleType: 'distraction' });
  render(response);
});

chrome.runtime.sendMessage({ type: 'popup-status' }).then(render).catch((error) => {
  setStatus({ connected: false, message: String(error) });
});

function render(response = {}) {
  tokenInput.value = response.token || tokenInput.value || '';
  setStatus(response);
  currentTab.textContent = response.currentUrl || 'Current tab unavailable';
  classState.textContent = response.classApproved ? 'Approved site' : 'Not in approved URLs';
  loggingState.textContent = response.classLoggingEnabled ? 'Enabled' : 'Off in StudyFlow';
  reminderState.textContent = response.distractionMatch ? 'Will remind' : 'No match';
}

function setStatus(response = {}) {
  statusText.textContent = response.message || (response.connected ? 'Connected' : 'Not connected');
  dot.classList.toggle('ok', Boolean(response.connected));
}
