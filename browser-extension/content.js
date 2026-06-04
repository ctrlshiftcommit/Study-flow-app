let lastPlaying = null;

function hasPlayingVideo() {
  return [...document.querySelectorAll('video')].some((video) =>
    !video.paused && !video.ended && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  );
}

function report() {
  const playing = hasPlayingVideo();
  if (playing === lastPlaying) return;
  lastPlaying = playing;
  chrome.runtime.sendMessage({ type: 'video-state', playing });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'show-studyflow-reminder') {
    showStudyFlowReminder(message.title || 'StudyFlow reminder', message.message || 'Back to your StudyFlow plan.');
  }
});

function showStudyFlowReminder(title, message) {
  const old = document.querySelector('#studyflow-reminder-banner');
  if (old) old.remove();
  const banner = document.createElement('div');
  banner.id = 'studyflow-reminder-banner';
  banner.innerHTML = `
    <div class="studyflow-reminder-title"></div>
    <div class="studyflow-reminder-message"></div>
    <button type="button" aria-label="Dismiss StudyFlow reminder">Dismiss</button>
  `;
  Object.assign(banner.style, {
    position: 'fixed',
    top: '18px',
    right: '18px',
    zIndex: '2147483647',
    width: '320px',
    padding: '14px',
    border: '1px solid rgba(255,255,255,0.22)',
    borderRadius: '14px',
    background: 'linear-gradient(135deg, #151525, #252547)',
    color: 'white',
    boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: '14px',
    lineHeight: '1.4'
  });
  const titleEl = banner.querySelector('.studyflow-reminder-title');
  const messageEl = banner.querySelector('.studyflow-reminder-message');
  const button = banner.querySelector('button');
  titleEl.textContent = title;
  messageEl.textContent = message;
  Object.assign(titleEl.style, { fontWeight: '750', marginBottom: '6px' });
  Object.assign(messageEl.style, { color: 'rgba(255,255,255,0.74)', marginBottom: '10px' });
  Object.assign(button.style, {
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '9px',
    padding: '7px 10px',
    background: 'rgba(255,255,255,0.1)',
    color: 'white',
    cursor: 'pointer'
  });
  button.addEventListener('click', () => banner.remove());
  document.documentElement.appendChild(banner);
  window.setTimeout(() => banner.remove(), 12000);
}

document.addEventListener('play', report, true);
document.addEventListener('pause', report, true);
document.addEventListener('ended', report, true);
new MutationObserver(report).observe(document.documentElement, { childList: true, subtree: true });
setInterval(report, 3000);
report();
