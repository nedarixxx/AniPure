(function () {
  'use strict';

  const Config = window.AniPureConfig || window.LumaScaleConfig;
  const Benchmark = window.AniPureBenchmark || window.LumaScaleBenchmark;
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
    els.whitelistContainer.innerHTML = '';
    if (!settings.whitelist || settings.whitelist.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Список пока пуст. Добавьте нужный сайт через всплывающее окно расширения.';
      els.whitelistContainer.appendChild(empty);
      return;
    }

    const typeLabels = { page: 'Страница', domain: 'Домен', path: 'Раздел' };
    settings.whitelist.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'wl-item';
      row.innerHTML = `
        <div class="wl-item-val">
          <span class="wl-type">[${typeLabels[item.type] || item.type}]</span>${escapeHtml(item.value)}
        </div>
        <button type="button" class="btn btn-sm" data-remove-idx="${idx}">Удалить</button>
      `;
      row.querySelector('[data-remove-idx]').addEventListener('click', () => {
        const next = settings.whitelist.filter((_, i) => i !== idx);
        persist({ whitelist: next });
      });
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
    els.benchResultArea.style.display = 'block';
    els.gpuName.textContent = res.renderer || 'WebGL2 GPU';
    els.gpuClass.textContent = res.gpuClass || 'Определено';

    els.scoreFast.textContent = res.scores.fastMs + ' мс';
    els.scoreBalanced.textContent = res.scores.balancedMs + ' мс';
    els.scoreQuality.textContent = res.scores.qualityMs + ' мс';
    els.scoreUltra.textContent = res.scores.ultraMs + ' мс';
    els.scoreFlow.textContent = res.scores.flowMs + ' мс';

    els.metricsGrid.querySelectorAll('.metric-cell').forEach(cell => {
      cell.classList.toggle('recommended', cell.dataset.metric === res.recommendedTier);
    });

    const tierObj = Config.PERFORMANCE_TIERS[res.recommendedTier] || Config.PERFORMANCE_TIERS.balanced;
    const modeObj = Config.ENHANCEMENT_MODES[res.recommendedMode] || Config.ENHANCEMENT_MODES.anime_crisp;
    const resObj = Config.OUTPUT_RESOLUTIONS[res.recommendedResolution] || Config.OUTPUT_RESOLUTIONS['1080p'];
    const interpObj = Config.INTERPOLATION_MODES[res.recommendedInterpolation] || Config.INTERPOLATION_MODES.off;

    els.recTitle.textContent = `Оптимальный профиль: ${tierObj.label}`;
    els.recDetails.textContent = `Режим: ${modeObj.label} · Разрешение: ${resObj.label} · Интерполяция: ${interpObj.label}`;
  }

  function applyRecommendedPreset(silent) {
    if (!lastBenchResult) return;
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
      els.appliedNote.textContent = 'Рекомендуемый пресет сохранён и применён. Можете открыть любой плеер и проверить результат.';
    }
  }

  async function executeBenchmark(autoApplyOnFirstRun) {
    els.runBenchBtn.disabled = true;
    els.runBenchBtn.textContent = 'Идёт проверка...';
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
      els.progressLabel.textContent = 'Проверка видеокарты завершена.';
      renderBenchmarkResult(result);

      if (autoApplyOnFirstRun) {
        applyRecommendedPreset(false);
      } else {
        persist({ gpuProfile: result, onboardingDone: true });
      }
    } catch (err) {
      els.progressLabel.textContent = 'Ошибка тестирования: ' + err.message;
    } finally {
      els.runBenchBtn.disabled = false;
      els.runBenchBtn.textContent = 'Запустить тест заново';
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
      persist({ ...Config.DEFAULT_SETTINGS, gpuProfile: settings.gpuProfile, onboardingDone: true });
      els.appliedNote.textContent = 'Настройки сброшены на значения по умолчанию.';
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
      // First install -> automatically benchmark GPU and select best preset!
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
