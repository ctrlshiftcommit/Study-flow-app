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

document.addEventListener('play', report, true);
document.addEventListener('pause', report, true);
document.addEventListener('ended', report, true);
new MutationObserver(report).observe(document.documentElement, { childList: true, subtree: true });
setInterval(report, 3000);
report();
