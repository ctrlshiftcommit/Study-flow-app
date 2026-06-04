const tokenInput = document.querySelector('#token');
const statusText = document.querySelector('#status');
const dot = document.querySelector('#dot');
const currentTab = document.querySelector('#current-tab');
const classState = document.querySelector('#class-state');
const reminderState = document.querySelector('#reminder-state');

document.querySelector('#save').addEventListener('click', async () => {
  setStatus({ connected: false, message: 'Saving token...' });
  const response = await chrome.runtime.sendMessage({ type: 'save-token', token: tokenInput.value });
  render(response);
});

document.querySelector('#test').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'test-reminder' });
});

chrome.runtime.sendMessage({ type: 'popup-status' }).then(render).catch((error) => {
  setStatus({ connected: false, message: String(error) });
});

function render(response = {}) {
  tokenInput.value = response.token || tokenInput.value || '';
  setStatus(response);
  currentTab.textContent = response.currentUrl || 'Current tab unavailable';
  classState.textContent = response.classApproved ? 'Approved tab' : 'Not approved';
  reminderState.textContent = response.distractionMatch ? 'Will remind' : 'No match';
}

function setStatus(response = {}) {
  statusText.textContent = response.message || (response.connected ? 'Connected' : 'Not connected');
  dot.classList.toggle('ok', Boolean(response.connected));
}
