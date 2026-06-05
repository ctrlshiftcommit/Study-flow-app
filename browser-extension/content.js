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
  if (message?.type === 'show-class-consent') {
    showClassConsent(message);
  }
  if (message?.type === 'hide-class-consent') {
    document.querySelector('#studyflow-class-consent')?.remove();
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

function showClassConsent(payload) {
  const old = document.querySelector('#studyflow-class-consent');
  if (old) old.remove();

  const subjects = payload.subjects || [];
  const selectedSubjectId = payload.selectedSubjectId ?? null;
  const url = payload.url || location.href;
  const isReplay = payload.mode === 'replay';
  const panel = document.createElement('div');
  panel.id = 'studyflow-class-consent';
  Object.assign(panel.style, {
    position: 'fixed',
    top: '18px',
    right: '18px',
    zIndex: '2147483647',
    width: '372px',
    maxWidth: 'calc(100vw - 32px)',
    padding: '14px',
    border: '1px solid rgba(255,255,255,0.16)',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, rgba(15,12,41,0.96), rgba(48,43,99,0.94), rgba(36,36,62,0.96))',
    color: 'white',
    boxShadow: '0 20px 54px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.08)',
    backdropFilter: 'blur(16px)',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: '13px',
    lineHeight: '1.4'
  });

  const title = document.createElement('div');
  title.textContent = isReplay ? 'Resume class logging?' : 'StudyFlow class logging';
  Object.assign(title.style, { color: 'rgba(255,255,255,0.94)', fontSize: '14px', fontWeight: '700', marginBottom: '5px', letterSpacing: '0' });
  panel.appendChild(title);

  const messageEl = document.createElement('div');
  messageEl.textContent = isReplay
    ? 'This class was paused for more than 4 minutes. What do you want to do?'
    : 'Do you want to start logging this class in StudyFlow?';
  Object.assign(messageEl.style, { color: 'rgba(255,255,255,0.62)', marginBottom: '12px' });
  panel.appendChild(messageEl);

  const choiceActions = document.createElement('div');
  Object.assign(choiceActions.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginBottom: '2px' });

  const no = document.createElement('button');
  no.type = 'button';
  no.textContent = 'No';
  stylePickerButton(no);
  no.addEventListener('click', () => sendConsent('no'));

  const yes = document.createElement('button');
  yes.type = 'button';
  yes.textContent = 'Yes';
  stylePickerButton(yes, true);
  yes.addEventListener('click', () => showSubjectStep('start'));

  const resume = document.createElement('button');
  resume.type = 'button';
  resume.textContent = 'Resume previous';
  stylePickerButton(resume, true);
  resume.addEventListener('click', () => showSubjectStep('resume'));

  const startNew = document.createElement('button');
  startNew.type = 'button';
  startNew.textContent = 'Start new';
  stylePickerButton(startNew);
  startNew.addEventListener('click', () => showSubjectStep('new'));

  if (isReplay) {
    choiceActions.appendChild(resume);
    choiceActions.appendChild(startNew);
    choiceActions.appendChild(no);
    Object.assign(choiceActions.style, { flexWrap: 'wrap', justifyContent: 'stretch' });
    resume.style.flex = '1 1 100%';
    startNew.style.flex = '1 1 0';
    no.style.flex = '1 1 0';
  } else {
    choiceActions.appendChild(no);
    choiceActions.appendChild(yes);
  }
  panel.appendChild(choiceActions);

  const select = document.createElement('select');
  Object.assign(select.style, {
    width: '100%',
    minHeight: '36px',
    marginBottom: '10px',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: '8px',
    padding: '7px 9px',
    background: 'rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.92)',
    font: 'inherit'
  });
  select.style.display = 'none';
  const unassigned = document.createElement('option');
  unassigned.value = '';
  unassigned.textContent = subjects.length ? 'Select subject' : 'No subjects available';
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
  Object.assign(actions.style, { display: 'none', gap: '8px', justifyContent: 'flex-end' });

  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Back';
  stylePickerButton(back);
  back.addEventListener('click', () => {
    actions.style.display = 'none';
    select.style.display = 'none';
    choiceActions.style.display = 'flex';
    messageEl.textContent = isReplay
      ? 'This class was paused for more than 4 minutes. What do you want to do?'
      : 'Do you want to start logging this class in StudyFlow?';
  });

  const save = document.createElement('button');
  save.type = 'button';
  save.textContent = 'Start logging';
  stylePickerButton(save, true);
  save.disabled = !select.value;
  let pendingChoice = 'start';
  select.addEventListener('change', () => {
    save.disabled = !select.value;
  });
  save.addEventListener('click', () => {
    if (!select.value) return;
    save.disabled = true;
    save.textContent = 'Starting...';
    chrome.runtime.sendMessage({ type: 'class-consent-response', choice: pendingChoice, subjectId: Number(select.value), url }, (response) => {
      if (response?.connected === false) {
        save.disabled = false;
        save.textContent = 'Try again';
        messageEl.textContent = response.message || 'Could not save the subject.';
        return;
      }
      panel.remove();
    });
  });

  actions.appendChild(back);
  actions.appendChild(save);
  panel.appendChild(actions);
  document.documentElement.appendChild(panel);

  function showSubjectStep(choice) {
    pendingChoice = choice;
    choiceActions.style.display = 'none';
    select.style.display = 'block';
    actions.style.display = 'flex';
    messageEl.textContent = subjects.length
      ? 'Choose the subject for this class.'
      : 'Create a subject in StudyFlow before logging this class.';
    save.disabled = !select.value;
  }

  function sendConsent(choice) {
    chrome.runtime.sendMessage({ type: 'class-consent-response', choice, url }, () => {
      panel.remove();
    });
  }
}

function stylePickerButton(button, primary = false) {
  Object.assign(button.style, {
    minHeight: '34px',
    border: primary ? '1px solid rgba(255,140,60,0.58)' : '1px solid rgba(255,255,255,0.16)',
    borderRadius: '8px',
    padding: '7px 12px',
    background: primary ? 'linear-gradient(135deg, #ff8c3c, #ffa45f)' : 'rgba(255,255,255,0.08)',
    color: primary ? '#1f130b' : 'rgba(255,255,255,0.86)',
    cursor: 'pointer',
    font: 'inherit',
    fontWeight: primary ? '700' : '600',
    letterSpacing: '0',
    boxShadow: primary ? '0 8px 22px rgba(255,140,60,0.22)' : 'none'
  });
  button.addEventListener('mouseenter', () => {
    button.style.background = primary ? 'linear-gradient(135deg, #ffa45f, #ffb373)' : 'rgba(255,255,255,0.13)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.background = primary ? 'linear-gradient(135deg, #ff8c3c, #ffa45f)' : 'rgba(255,255,255,0.08)';
  });
}

document.addEventListener('play', report, true);
document.addEventListener('pause', report, true);
document.addEventListener('ended', report, true);
new MutationObserver(report).observe(document.documentElement, { childList: true, subtree: true });
setInterval(report, 3000);
report();
