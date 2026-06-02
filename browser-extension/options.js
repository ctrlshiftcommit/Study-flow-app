const tokenInput = document.querySelector('#token');
const status = document.querySelector('#status');

chrome.storage.local.get('pairingToken').then(({ pairingToken }) => {
  tokenInput.value = pairingToken || '';
});

document.querySelector('#save').addEventListener('click', async () => {
  const pairingToken = tokenInput.value.trim();
  await chrome.storage.local.set({ pairingToken });
  status.textContent = 'Checking...';
  try {
    const response = await fetch('http://127.0.0.1:17384/status', {
      headers: { 'X-StudyFlow-Token': pairingToken }
    });
    status.textContent = response.ok ? 'Connected to StudyFlow' : 'Token rejected';
    status.className = response.ok ? 'ok' : 'error';
  } catch {
    status.textContent = 'StudyFlow bridge is offline';
    status.className = 'error';
  }
});
