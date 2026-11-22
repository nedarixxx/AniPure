'use strict';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/pages/onboarding.html')
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;

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
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_SCREENSHOT' }).catch(() => {});
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'TRIGGER_SKIP_OP') {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_SKIP_OP' }).catch(() => {});
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
