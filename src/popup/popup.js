(function () {
  'use strict';

  const Config = window.AniPureConfig || window.LumaScaleConfig;
  const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  let settings = Config.mergeSettings(null);
  let activeTab = null;

  const els = {
    html: document.documentElement,
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    powerToggleBtn: document.getElementById('powerToggleBtn'),
    powerText: document.getElementById('powerText'),
    telemetryDot: document.getElementById('telemetryDot'),
    telemetryText: document.getElementById('telemetryText'),
    quickSplitBtn: document.getElementById('quickSplitBtn'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    mainContent: document.getElementById('mainContent'),
    gpuBadge: document.getElementById('gpuBadge'),
    tierRail: document.getElementById('tierRail'),
    tierHint: document.getElementById('tierHint'),
    modeList: document.getElementById('modeList'),
    resRail: document.getElementById('resRail'),
    interpRail: document.getElementById('interpRail'),
    colorGrid: document.getElementById('colorGrid'),
    colorProfileDesc: document.getElementById('colorProfileDesc'),
    optShowPlayerButton: document.getElementById('optShowPlayerButton'),
    optAntiFlash: document.getElementById('optAntiFlash'),
    optHud: document.getElementById('optHud'),
    optThrottle: document.getElementById('optThrottle'),
    checkBlackFix: document.getElementById('checkBlackFix'),
    resetSlidersBtn: document.getElementById('resetSlidersBtn'),
    rangeCas: document.getElementById('rangeCas'),
    rangeLine: document.getElementById('rangeLine'),
    rangeDering: document.getElementById('rangeDering'),
    rangeVibrance: document.getElementById('rangeVibrance'),
    valCas: document.getElementById('valCas'),
    valLine: document.getElementById('valLine'),
    valDering: document.getElementById('valDering'),
    valVibrance: document.getElementById('valVibrance'),
    wlModeRail: document.getElementById('wlModeRail'),
    currentSiteHost: document.getElementById('currentSiteHost'),
    wlAddDomain: document.getElementById('wlAddDomain'),
    wlAddPage: document.getElementById('wlAddPage'),
    wlAddPath: document.getElementById('wlAddPath'),
    wlStatus: document.getElementById('wlStatus'),
    wlList: document.getElementById('wlList'),
    gpuSummaryLine: document.getElementById('gpuSummaryLine'),
    openSettingsBtn: document.getElementById('openSettingsBtn')
  };

  function persist(patch) {
    settings = Config.mergeSettings({
      ...settings,
      ...patch,
      customParams: {
        ...settings.customParams,
        ...(patch.customParams || {})
      }
    });
    renderUI();

    if (hasChrome) {
      chrome.storage.local.set({
        anipureSettings: settings,
        lumascaleSettings: settings
      });
      chrome.runtime.sendMessage({ type: 'BROADCAST_SETTINGS', settings }).catch(() => {});
    } else {
      try {
        localStorage.setItem('anipureSettings', JSON.stringify(settings));
        localStorage.setItem('lumascaleSettings', JSON.stringify(settings));
      } catch (_) {}
    }
  }

  function applyTheme(theme) {
    const t = theme === 'light' ? 'light' : 'amoled';
    els.html.setAttribute('data-theme', t);
    els.themeToggleBtn.textContent = t === 'amoled' ? 'Светлая' : 'AMOLED';
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function renderUI() {
    applyTheme(settings.theme);

    // Master power
    els.powerToggleBtn.classList.toggle('on', settings.enabled);
    els.powerText.textContent = settings.enabled ? 'ВКЛ' : 'ВЫКЛ';
    els.mainContent.classList.toggle('dimmed', !settings.enabled);
    els.quickSplitBtn.classList.toggle('active', settings.enabled && settings.splitScreen);

    // Tier rail
    els.tierRail.querySelectorAll('.seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tier === settings.tier);
    });
    const tierInfo = Config.PERFORMANCE_TIERS[settings.tier] || Config.PERFORMANCE_TIERS.balanced;
    els.tierHint.textContent = tierInfo.shortDesc;

    if (settings.gpuProfile && settings.gpuProfile.recommendedTier) {
      const rec = Config.PERFORMANCE_TIERS[settings.gpuProfile.recommendedTier];
      els.gpuBadge.textContent = rec ? ('Реком.: ' + rec.label) : '';
      els.gpuSummaryLine.textContent = `${settings.gpuProfile.renderer || 'WebGL2'} · Реком.: ${rec ? rec.label : ''}`;
    } else {
      els.gpuBadge.textContent = '';
      els.gpuSummaryLine.textContent = 'Нажмите ниже, чтобы проверить видеокарту';
    }

    // Mode radio cards
    els.modeList.querySelectorAll('.mode-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === settings.mode);
    });

    // Resolution & Interpolation rails
    els.resRail.querySelectorAll('.seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.res === settings.resolution);
    });
    els.interpRail.querySelectorAll('.seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.interp === settings.interpolation);
    });

    // Tab 2 Color Profiles & Sliders
    els.colorGrid.querySelectorAll('.color-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.color === settings.colorProfile);
    });
    const cpObj = Config.COLOR_PROFILES[settings.colorProfile] || Config.COLOR_PROFILES.natural;
    els.colorProfileDesc.textContent = cpObj.desc;

    if (els.optShowPlayerButton) {
      els.optShowPlayerButton.checked = settings.showPlayerButton !== false;
    }
    els.optAntiFlash.checked = settings.antiFlash;
    els.optHud.checked = settings.showHud;
    els.optThrottle.checked = settings.autoThrottle;

    const activeParams = settings.mode === 'custom'
      ? settings.customParams
      : ((Config.ENHANCEMENT_MODES[settings.mode] || {}).params || settings.customParams);

    const casPct = Math.round((activeParams.casStrength || 0) * 100);
    const linePct = Math.round((activeParams.lineEnhance || 0) * 100);
    const deringPct = Math.round((activeParams.deringStrength || 0) * 100);
    const vibPct = Math.round((activeParams.vibrance || 0) * 100);

    els.rangeCas.value = casPct;
    els.valCas.textContent = casPct + '%';
    els.rangeLine.value = linePct;
    els.valLine.textContent = linePct + '%';
    els.rangeDering.value = deringPct;
    els.valDering.textContent = deringPct + '%';
    els.rangeVibrance.value = vibPct;
    els.valVibrance.textContent = (vibPct > 0 ? '+' : '') + vibPct + '%';
    els.checkBlackFix.checked = Boolean(activeParams.blackLevelFix);

    // Tab 3 Whitelist
    els.wlModeRail.querySelectorAll('.seg-btn').forEach(btn => {
      const isOnly = btn.dataset.wl === 'only';
      btn.classList.toggle('active', settings.whitelistEnabled === isOnly);
    });

    if (activeTab && activeTab.url) {
      try {
        els.currentSiteHost.textContent = new URL(activeTab.url).hostname || activeTab.url;
      } catch (_) {
        els.currentSiteHost.textContent = 'Служебная вкладка';
      }
    }

    renderWhitelistRows();
  }

  function renderWhitelistRows() {
    els.wlList.innerHTML = '';
    if (!settings.whitelist || settings.whitelist.length === 0) {
      if (!els.wlStatus.dataset.pinnedMsg) {
        els.wlStatus.textContent = settings.whitelistEnabled
          ? 'Список пуст — добавьте сайт выше'
          : 'Сейчас работает на всех сайтах';
      }
      return;
    }

    if (!els.wlStatus.dataset.pinnedMsg) {
      els.wlStatus.textContent = `Сохранено правил: ${settings.whitelist.length}`;
    }

    settings.whitelist.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'wl-row';
      row.innerHTML = `
        <span class="wl-row-text">${escapeHtml(item.value)}</span>
        <button type="button" class="wl-del" title="Удалить">×</button>
      `;
      row.querySelector('.wl-del').addEventListener('click', () => {
        persist({ whitelist: settings.whitelist.filter((_, i) => i !== idx) });
      });
      els.wlList.appendChild(row);
    });
  }

  function addWhitelist(type) {
    const url = activeTab && activeTab.url ? activeTab.url : window.location.href;
    const entry = Config.extractWhitelistEntry(url, type);
    if (!entry) {
      showWlNote('Невозможно добавить служебную вкладку');
      return;
    }
    if (settings.whitelist.some(w => w.type === entry.type && w.value === entry.value)) {
      showWlNote('Уже в списке: ' + entry.value);
      return;
    }
    persist({ whitelistEnabled: true, whitelist: [...settings.whitelist, entry] });
    showWlNote('Добавлено: ' + entry.value);
  }

  function showWlNote(text) {
    els.wlStatus.textContent = text;
    els.wlStatus.dataset.pinnedMsg = '1';
    setTimeout(() => {
      delete els.wlStatus.dataset.pinnedMsg;
      renderWhitelistRows();
    }, 2200);
  }

  function bindEvents() {
    // Tabs
    els.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        els.tabBtns.forEach(b => b.classList.toggle('active', b === btn));
        els.tabPanes.forEach(p => p.classList.toggle('active', p.id === 'tab-' + target));
      });
    });

    els.themeToggleBtn.addEventListener('click', () => {
      persist({ theme: settings.theme === 'amoled' ? 'light' : 'amoled' });
    });

    els.powerToggleBtn.addEventListener('click', () => {
      persist({ enabled: !settings.enabled });
    });

    els.quickSplitBtn.addEventListener('click', () => {
      persist({ splitScreen: !settings.splitScreen });
    });

    // Tier rail
    els.tierRail.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tierId = btn.dataset.tier;
        const tier = Config.PERFORMANCE_TIERS[tierId];
        const patch = { tier: tierId };
        if (tier && settings.mode !== 'custom' && tier.defaultMode) {
          patch.mode = tier.defaultMode;
          const m = Config.ENHANCEMENT_MODES[tier.defaultMode];
          if (m && m.params) patch.customParams = { ...m.params };
        }
        if (tier && !tier.allowInterpolation && settings.interpolation !== 'off') {
          patch.interpolation = 'off';
        }
        persist(patch);
      });
    });

    // Mode radio list
    els.modeList.querySelectorAll('.mode-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = btn.dataset.mode;
        const modeObj = Config.ENHANCEMENT_MODES[m];
        persist({
          mode: m,
          customParams: modeObj && modeObj.params ? { ...modeObj.params } : settings.customParams
        });
      });
    });

    // Resolution & Interpolation rails
    els.resRail.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => persist({ resolution: btn.dataset.res }));
    });
    els.interpRail.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => persist({ interpolation: btn.dataset.interp }));
    });

    // Tab 2 Color Profiles & Options
    els.colorGrid.querySelectorAll('.color-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        persist({ colorProfile: btn.dataset.color });
      });
    });

    if (els.optShowPlayerButton) {
      els.optShowPlayerButton.addEventListener('change', () => persist({ showPlayerButton: els.optShowPlayerButton.checked }));
    }
    els.optAntiFlash.addEventListener('change', () => persist({ antiFlash: els.optAntiFlash.checked }));
    els.optHud.addEventListener('change', () => persist({ showHud: els.optHud.checked }));
    els.optThrottle.addEventListener('change', () => persist({ autoThrottle: els.optThrottle.checked }));

    const bindSlider = (el, key, scale) => {
      el.addEventListener('input', () => {
        const base = settings.mode === 'custom'
          ? settings.customParams
          : ((Config.ENHANCEMENT_MODES[settings.mode] || {}).params || settings.customParams);
        persist({
          mode: 'custom',
          customParams: { ...base, [key]: Number(el.value) / scale }
        });
      });
    };

    bindSlider(els.rangeCas, 'casStrength', 100);
    bindSlider(els.rangeLine, 'lineEnhance', 100);
    bindSlider(els.rangeDering, 'deringStrength', 100);
    bindSlider(els.rangeVibrance, 'vibrance', 100);

    els.checkBlackFix.addEventListener('change', () => {
      const base = settings.mode === 'custom'
        ? settings.customParams
        : ((Config.ENHANCEMENT_MODES[settings.mode] || {}).params || settings.customParams);
      persist({
        mode: 'custom',
        customParams: { ...base, blackLevelFix: els.checkBlackFix.checked }
      });
    });

    els.resetSlidersBtn.addEventListener('click', () => {
      const tier = Config.PERFORMANCE_TIERS[settings.tier] || Config.PERFORMANCE_TIERS.ultra;
      const defMode = tier.defaultMode || 'mode_gan';
      const m = Config.ENHANCEMENT_MODES[defMode];
      persist({
        mode: defMode,
        colorProfile: 'bluray',
        antiFlash: false,
        customParams: m && m.params ? { ...m.params } : Config.DEFAULT_SETTINGS.customParams
      });
    });

    // Tab 3 Whitelist & Benchmark
    els.wlModeRail.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        persist({ whitelistEnabled: btn.dataset.wl === 'only' });
      });
    });
    els.wlAddDomain.addEventListener('click', () => addWhitelist('domain'));
    els.wlAddPage.addEventListener('click', () => addWhitelist('page'));
    els.wlAddPath.addEventListener('click', () => addWhitelist('path'));

    els.openSettingsBtn.addEventListener('click', () => {
      if (hasChrome && chrome.runtime && chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open('../pages/onboarding.html', '_blank');
      }
    });
  }

  function pollTelemetry() {
    if (!hasChrome || !activeTab || !activeTab.id) return;
    chrome.tabs.sendMessage(activeTab.id, { type: 'GET_TELEMETRY' }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.telemetry) {
        els.telemetryDot.classList.remove('live');
        els.telemetryText.textContent = 'Видео на вкладке не обнаружено';
        return;
      }
      const t = resp.telemetry;
      if (t.corsBlocked) {
        els.telemetryDot.classList.remove('live');
        els.telemetryText.textContent = 'Плеер ограничен DRM/CORS';
        return;
      }
      els.telemetryDot.classList.add('live');
      const fpsStr = t.paused ? 'Пауза' : `${t.outputFps} FPS`;
      const modeObj = Config.ENHANCEMENT_MODES[t.mode];
      const tag = modeObj && modeObj.tag ? ` · ${modeObj.tag}` : '';
      els.telemetryText.textContent = `${t.srcWidth}x${t.srcHeight} -> ${t.outWidth}x${t.outHeight} · ${fpsStr}${tag}`;
    });
  }

  function init() {
    bindEvents();
    if (hasChrome) {
      chrome.storage.local.get(['anipureSettings', 'lumascaleSettings'], (res) => {
        const s = res ? (res.anipureSettings || res.lumascaleSettings) : null;
        settings = Config.mergeSettings(s);
        renderUI();
      });
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        activeTab = tabs && tabs[0] ? tabs[0] : null;
        renderUI();
        pollTelemetry();
        setInterval(pollTelemetry, 1200);
      });
    } else {
      try {
        const raw = localStorage.getItem('anipureSettings') || localStorage.getItem('lumascaleSettings');
        const saved = JSON.parse(raw || 'null');
        settings = Config.mergeSettings(saved);
      } catch (_) {}
      renderUI();
    }
  }

  init();
})();
