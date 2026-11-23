(function () {
  'use strict';

  const Config = window.AniPureConfig || window.LumaScaleConfig;
  const Benchmark = window.AniPureBenchmark || window.LumaScaleBenchmark;
  const I18n = window.AniPureI18n || window.LumaScaleI18n;
  const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  let settings = Config.mergeSettings(null);
  let lastBenchResult = null;

  const els = {
    html: document.documentElement,
    themeBtns: document.querySelectorAll('[data-theme-set]'),
    runBenchBtn: document.getElementById('runBenchBtn'),
    progressWrap: document.getElementById('progressWrap'),
    progressFill: document.getElementById('progressFill'),
    progressLabel: document.getElementById('progressLabel'),
    benchResultArea: document.getElementById('benchResultArea'),
    gpuName: document.getElementById('gpuName'),
    gpuClass: document.getElementById('gpuClass'),
    metricsGrid: document.getElementById('metricsGrid'),
    scoreFast: document.getElementById('scoreFast'),
    scoreBalanced: document.getElementById('scoreBalanced'),
    scoreQuality: document.getElementById('scoreQuality'),
    scoreUltra: document.getElementById('scoreUltra'),
    scoreFlow: document.getElementById('scoreFlow'),
    recTitle: document.getElementById('recTitle'),
    recDetails: document.getElementById('recDetails'),
    applyRecBtn: document.getElementById('applyRecBtn'),
    appliedNote: document.getElementById('appliedNote'),
    optPlayerBtn: document.getElementById('optPlayerBtn'),
    optAutoThrottle: document.getElementById('optAutoThrottle'),
    optSceneCut: document.getElementById('optSceneCut'),
    sceneCutVal: document.getElementById('sceneCutVal'),
    optFlowStr: document.getElementById('optFlowStr'),
    flowStrVal: document.getElementById('flowStrVal'),
    whitelistContainer: document.getElementById('whitelistContainer'),
    resetDefaultsBtn: document.getElementById('resetDefaultsBtn')
  };

  function persist(patch) {
    settings = Config.mergeSettings({ ...settings, ...patch });
    renderSettings();
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

  function renderSettings() {
    const lang = I18n ? I18n.resolveLanguage(settings.language) : 'ru';
    if (I18n && typeof I18n.applyTranslations === 'function') {
      I18n.applyTranslations(document, lang);
    }

    const theme = settings.theme === 'light' ? 'light' : 'amoled';
    els.html.setAttribute('data-theme', theme);
    els.themeBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.themeSet === theme);
    });

    els.optPlayerBtn.checked = settings.showPlayerButton;
    els.optAutoThrottle.checked = settings.autoThrottle;

    const cutPct = Math.round(settings.sceneCutThreshold * 100);
    els.optSceneCut.value = cutPct;
    els.sceneCutVal.textContent = cutPct + '%';

    const flowPct = Math.round(settings.interpolationStrength * 100);
    els.optFlowStr.value = flowPct;
    els.flowStrVal.textContent = flowPct + '%';

    renderWhitelist();
  }

  function renderWhitelist() {
    const lang = I18n ? I18n.resolveLanguage(settings.language) : 'ru';
    els.whitelistContainer.innerHTML = '';
    if (!settings.whitelist || settings.whitelist.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = I18n ? I18n.t('obEmptyWl', lang) : 'Список пока пуст.';
      els.whitelistContainer.appendChild(empty);
      return;
    }

    const typeLabels = lang === 'ru'
      ? { page: 'Страница', domain: 'Домен', path: 'Раздел' }
      : { page: 'Page', domain: 'Domain', path: 'Path' };
    const delText = lang === 'ru' ? 'Удалить' : 'Delete';

    settings.whitelist.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'wl-item';

      const valDiv = document.createElement('div');
      valDiv.className = 'wl-item-val';
      const typeSpan = document.createElement('span');
      typeSpan.className = 'wl-type';
      typeSpan.textContent = `[${typeLabels[item.type] || item.type}] `;
      valDiv.appendChild(typeSpan);
      valDiv.appendChild(document.createTextNode(item.value));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-sm';
      delBtn.textContent = delText;
      delBtn.addEventListener('click', () => {
        const next = settings.whitelist.filter((_, i) => i !== idx);
        persist({ whitelist: next });
      });

      row.appendChild(valDiv);
      row.appendChild(delBtn);
      els.whitelistContainer.appendChild(row);
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function renderBenchmarkResult(res) {
    if (!res) return;
    lastBenchResult = res;
    const lang = I18n ? I18n.resolveLanguage(settings.language) : 'ru';
    const msSuffix = lang === 'ru' ? ' мс' : ' ms';

    els.benchResultArea.style.display = 'block';
    els.gpuName.textContent = res.renderer || 'WebGL2 GPU';
    els.gpuClass.textContent = (res.gpuClassKey && I18n)
      ? I18n.t(res.gpuClassKey, lang)
      : (res.gpuClass || 'GPU');

    els.scoreFast.textContent = res.scores.fastMs + msSuffix;
    els.scoreBalanced.textContent = res.scores.balancedMs + msSuffix;
    els.scoreQuality.textContent = res.scores.qualityMs + msSuffix;
    els.scoreUltra.textContent = res.scores.ultraMs + msSuffix;
    els.scoreFlow.textContent = res.scores.flowMs + msSuffix;

    els.metricsGrid.querySelectorAll('.metric-cell').forEach(cell => {
      cell.classList.toggle('recommended', cell.dataset.metric === res.recommendedTier);
    });

    const tierName = I18n ? I18n.t('tier_' + res.recommendedTier, lang) : res.recommendedTier;
    const recDetailsKey = 'recDetails_' + res.recommendedTier;
    els.recTitle.textContent = (lang === 'ru' ? 'Оптимальный профиль: ' : 'Recommended Profile: ') + tierName;
    els.recDetails.textContent = I18n ? I18n.t(recDetailsKey, lang) : '';
  }

  function applyRecommendedPreset(silent) {
    if (!lastBenchResult) return;
    const lang = I18n ? I18n.resolveLanguage(settings.language) : 'ru';
    const modeObj = Config.ENHANCEMENT_MODES[lastBenchResult.recommendedMode];
    persist({
      tier: lastBenchResult.recommendedTier,
      mode: lastBenchResult.recommendedMode,
      resolution: lastBenchResult.recommendedResolution,
      interpolation: lastBenchResult.recommendedInterpolation,
      customParams: modeObj && modeObj.params ? { ...modeObj.params } : settings.customParams,
      gpuProfile: lastBenchResult,
      onboardingDone: true
    });
    if (!silent) {
      els.appliedNote.textContent = I18n
        ? I18n.t('obAppliedNote', lang)
        : 'Рекомендуемый пресет сохранён и применён.';
    }
  }

  async function executeBenchmark(autoApplyOnFirstRun) {
    const lang = I18n ? I18n.resolveLanguage(settings.language) : 'ru';
    els.runBenchBtn.disabled = true;
    els.runBenchBtn.textContent = lang === 'ru' ? 'Идёт проверка...' : 'Benchmarking...';
    els.progressWrap.style.display = 'block';
    els.progressFill.style.width = '5%';
    els.appliedNote.textContent = '';

    try {
      const result = await Benchmark.runGpuBenchmark((step, total, label) => {
        const pct = Math.round((step / total) * 100);
        els.progressFill.style.width = Math.max(8, pct) + '%';
        els.progressLabel.textContent = label;
      });

      els.progressFill.style.width = '100%';
      els.progressLabel.textContent = lang === 'ru' ? 'Проверка видеокарты завершена.' : 'GPU benchmark complete.';
      renderBenchmarkResult(result);

      if (autoApplyOnFirstRun) {
        applyRecommendedPreset(false);
      } else {
        persist({ gpuProfile: result, onboardingDone: true });
      }
    } catch (err) {
      els.progressLabel.textContent = (lang === 'ru' ? 'Ошибка тестирования: ' : 'Benchmark error: ') + err.message;
    } finally {
      els.runBenchBtn.disabled = false;
      els.runBenchBtn.textContent = lang === 'ru' ? 'Запустить тест заново' : 'Run Benchmark Again';
    }
  }

  function bindEvents() {
    els.themeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        persist({ theme: btn.dataset.themeSet });
      });
    });

    els.runBenchBtn.addEventListener('click', () => executeBenchmark(false));
    els.applyRecBtn.addEventListener('click', () => applyRecommendedPreset(false));

    els.optPlayerBtn.addEventListener('change', () => {
      persist({ showPlayerButton: els.optPlayerBtn.checked });
    });

    els.optAutoThrottle.addEventListener('change', () => {
      persist({ autoThrottle: els.optAutoThrottle.checked });
    });

    els.optSceneCut.addEventListener('input', () => {
      persist({ sceneCutThreshold: Number(els.optSceneCut.value) / 100 });
    });

    els.optFlowStr.addEventListener('input', () => {
      persist({ interpolationStrength: Number(els.optFlowStr.value) / 100 });
    });

    els.resetDefaultsBtn.addEventListener('click', () => {
      const lang = I18n ? I18n.resolveLanguage(settings.language) : 'ru';
      persist({ ...Config.DEFAULT_SETTINGS, gpuProfile: settings.gpuProfile, onboardingDone: true });
      els.appliedNote.textContent = I18n ? I18n.t('obResetNote', lang) : 'Настройки сброшены.';
    });
  }

  function init() {
    bindEvents();
    const finishInit = (saved) => {
      settings = Config.mergeSettings(saved);
      renderSettings();
      if (settings.gpuProfile) {
        renderBenchmarkResult(settings.gpuProfile);
      }
      if (!settings.onboardingDone) {
        executeBenchmark(true);
      }
    };

    if (hasChrome) {
      chrome.storage.local.get(['anipureSettings', 'lumascaleSettings'], (res) => {
        finishInit(res ? (res.anipureSettings || res.lumascaleSettings) : null);
      });
    } else {
      let saved = null;
      try {
        const raw = localStorage.getItem('anipureSettings') || localStorage.getItem('lumascaleSettings');
        saved = JSON.parse(raw || 'null');
      } catch (_) {}
      finishInit(saved);
    }
  }

  init();
})();