'use strict';

const activePlayerFrames = new Map(); // tabId -> frameId

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/pages/onboarding.html')
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  activePlayerFrames.delete(tabId);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  const tabId = sender.tab ? sender.tab.id : null;
  const frameId = typeof sender.frameId === 'number' ? sender.frameId : null;

  if (msg.type === 'PLAYER_INTERACTION' && tabId && frameId !== null) {
    activePlayerFrames.set(tabId, frameId);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'OPEN_ONBOARDING') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/pages/onboarding.html')
    });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'BROADCAST_SETTINGS') {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'SETTINGS_UPDATED',
            settings: msg.settings
          }).catch(() => {});
        }
      });
    });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'TRIGGER_SCREENSHOT') {
    if (tabId) {
      const targetFrame = activePlayerFrames.get(tabId);
      if (typeof targetFrame === 'number') {
        chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_SCREENSHOT' }, { frameId: targetFrame })
          .then((res) => {
            if (!res || !res.ok) {
              chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_SCREENSHOT' }).catch(() => {});
            }
          })
          .catch(() => {
            chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_SCREENSHOT' }).catch(() => {});
          });
      } else {
        chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_SCREENSHOT' }).catch(() => {});
      }
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'TRIGGER_SKIP_OP') {
    if (tabId) {
      const targetFrame = activePlayerFrames.get(tabId);
      if (typeof targetFrame === 'number') {
        chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_SKIP_OP' }, { frameId: targetFrame })
          .then((res) => {
            if (!res || !res.ok) {
              chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_SKIP_OP' }).catch(() => {});
            }
          })
          .catch(() => {
            chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_SKIP_OP' }).catch(() => {});
          });
      } else {
        chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_SKIP_OP' }).catch(() => {});
      }
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
