# StudyFlow Browser Companion Extension

This unpacked Manifest V3 extension lets StudyFlow privately log approved online class playback from Brave or another Chromium-based browser. It can also show a local notification when you visit distraction sites you configured in StudyFlow. It only talks to the local StudyFlow desktop bridge at `http://127.0.0.1:17384`.

## What It Logs

- A session starts only when the active tab matches an approved URL pattern, contains a playing video, and the tab is audible.
- The extension sends class activity events to the local StudyFlow app.
- StudyFlow stores the resulting session locally with the page URL, page title, subject, and browser-class source.
- Distraction reminders show when the active tab matches a configured distraction pattern and the reminder cooldown has elapsed.
- The extension does not upload browsing data to a remote service.

## Setup

1. Start StudyFlow.
2. Open **Browser** in the sidebar.
3. Enable the browser extension bridge.
4. Copy the pairing token from the Browser Extension page.
5. Open `brave://extensions` or `chrome://extensions`.
6. Enable **Developer mode**.
7. Choose **Load unpacked** and select this `browser-extension` folder.
8. Click the StudyFlow extension from the browser's puzzle-piece menu.
9. Paste the pairing token in the popup and choose **Save and check**.
10. In StudyFlow, add approved class URL patterns such as `https://classes.example.com/*`.
11. Add distraction reminder patterns such as `https://www.youtube.com/*`, then customize the reminder message and cooldown.

## Notes

- Approved URL rules are managed inside StudyFlow.
- Distraction reminder rules are managed inside StudyFlow.
- The pairing token is stored in browser-local extension storage.
- Rotating the token in StudyFlow requires saving the new token in the extension popup.
- Reminder sites are not counted as study sessions unless they are also listed under approved class URLs in StudyFlow.
- If the connection test fails, confirm StudyFlow is open, the bridge is enabled, and the bridge shows as online in the Browser page.
