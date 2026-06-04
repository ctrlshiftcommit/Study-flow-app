# StudyFlow Browser Class Logging Extension

This unpacked Manifest V3 extension lets StudyFlow privately log approved online class playback from Brave or another Chromium-based browser. It only talks to the local StudyFlow desktop bridge at `http://127.0.0.1:17384`.

## What It Logs

- A session starts only when the active tab matches an approved URL pattern, contains a playing video, and the tab is audible.
- The extension sends class activity events to the local StudyFlow app.
- StudyFlow stores the resulting session locally with the page URL, page title, subject, and browser-class source.
- The extension does not upload browsing data to a remote service.

## Setup

1. Start StudyFlow.
2. Open **Settings**.
3. Enable **Browser Class Logging**.
4. Copy the pairing token from the Browser Class Logging settings panel.
5. Open `brave://extensions` or `chrome://extensions`.
6. Enable **Developer mode**.
7. Choose **Load unpacked** and select this `browser-extension` folder.
8. Open the extension options page.
9. Paste the pairing token and choose **Save and test connection**.
10. In StudyFlow Settings, add approved class URL patterns such as `https://classes.example.com/*`.

## Notes

- Approved URL rules are managed inside StudyFlow.
- The pairing token is stored in browser-local extension storage.
- Rotating the token in StudyFlow requires saving the new token in the extension options page.
- If the connection test fails, confirm StudyFlow is open, browser logging is enabled, and the bridge shows as online in Settings.
