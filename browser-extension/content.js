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
  if (message?.type === 'show-subject-picker') {
    showSubjectPicker(message.subjects || [], message.selectedSubjectId ?? null, message.url || location.href);
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

function showSubjectPicker(subjects, selectedSubjectId, url) {
  const old = document.querySelector('#studyflow-subject-picker');
  if (old) old.remove();

  const panel = document.createElement('div');
  panel.id = 'studyflow-subject-picker';
  Object.assign(panel.style, {
    position: 'fixed',
    top: '18px',
    right: '18px',
    zIndex: '2147483647',
    width: '360px',
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

  const title = document.createElement('div');
  title.textContent = 'Class logging started';
  Object.assign(title.style, { fontWeight: '750', marginBottom: '6px' });
  panel.appendChild(title);

  const message = document.createElement('div');
  message.textContent = subjects.length
    ? 'Select the subject to log this browser class as. Recording will keep running.'
    : 'Recording will keep running. Create a subject in StudyFlow to tag this class later.';
  Object.assign(message.style, { color: 'rgba(255,255,255,0.74)', marginBottom: '10px' });
  panel.appendChild(message);

  const select = document.createElement('select');
  Object.assign(select.style, {
    width: '100%',
    minHeight: '36px',
    marginBottom: '10px',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '9px',
    padding: '7px 9px',
    background: '#111120',
    color: 'white',
    font: 'inherit'
  });
  const unassigned = document.createElement('option');
  unassigned.value = '';
  unassigned.textContent = 'Unassigned';
  select.appendChild(unassigned);
  for (const subject of subjects) {
    const option = document.createElement('option');
    option.value = String(subject.id);
    option.textContent = subject.name;
    if (subject.id === selectedSubjectId) option.selected = true;
    select.appendChild(option);
  }
  panel.appendChild(select);

  const actions = document.createElement('div');
  Object.assign(actions.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end' });

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = 'Later';
  stylePickerButton(dismiss);
  dismiss.addEventListener('click', () => panel.remove());

  const save = document.createElement('button');
  save.type = 'button';
  save.textContent = 'Save subject';
  stylePickerButton(save, true);
  save.disabled = subjects.length === 0;
  save.addEventListener('click', () => {
    save.disabled = true;
    save.textContent = 'Saving...';
    chrome.runtime.sendMessage({ type: 'set-class-subject', subjectId: select.value ? Number(select.value) : null, url }, (response) => {
      if (response?.connected === false) {
        save.disabled = false;
        save.textContent = 'Try again';
        message.textContent = response.message || 'Could not save the subject.';
        return;
      }
      panel.remove();
    });
  });

  actions.appendChild(dismiss);
  actions.appendChild(save);
  panel.appendChild(actions);
  document.documentElement.appendChild(panel);
}

function stylePickerButton(button, primary = false) {
  Object.assign(button.style, {
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '9px',
    padding: '7px 10px',
    background: primary ? '#78dca0' : 'rgba(255,255,255,0.1)',
    color: primary ? '#10151f' : 'white',
    cursor: 'pointer',
    font: 'inherit',
    fontWeight: primary ? '700' : '500'
  });
}

document.addEventListener('play', report, true);
document.addEventListener('pause', report, true);
document.addEventListener('ended', report, true);
new MutationObserver(report).observe(document.documentElement, { childList: true, subtree: true });
setInterval(report, 3000);
report();
