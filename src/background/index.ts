// Background service worker — kept minimal.
// All Claude API calls and log extraction are handled directly in the popup.
chrome.runtime.onMessage.addListener(
  (_msg, _sender, sendResponse: (r: unknown) => void) => {
    sendResponse({ ok: false });
    return false;
  }
);
