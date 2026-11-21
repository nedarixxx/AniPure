(function (root) {
  'use strict';

  let I18n = null;
  if (typeof require !== 'undefined') {
    try {
      I18n = require('./i18n.js');
    } catch (_) {}
  }
  if (!I18n && typeof globalThis !== 'undefined' && globalThis.AniPureI18n) {
    I18n = globalThis.AniPureI18n;
  }

  const APP_META = {
    name: 'AniPure',
    version: '0.1.1'
  };

  const PERFORMANCE_TIERS = {
    fast: {
      id: 'fast',
      label: 'Быстро',
      shortDesc: 'Слабые ПК и ноутбуки от батареи',
      cnnSize: 'S',
      allowInterpolation: false,
      maxResHeight: 1080,
      defaultMode: 'eco_fast',
      budgetMs: 18
    },
    balanced: {
      id: 'balanced',
      label: 'Баланс',
      shortDesc: 'Встроенная графика (Intel Iris / Vega)',
      cnnSize: 'S',
      allowInterpolation: false,
      maxResHeight: 1080,
      defaultMode: 'mode_lite',
      budgetMs: 22
    },
    quality: {
      id: 'quality',
      label: 'Качество',
      shortDesc: 'Дискретные видеокарты среднего уровня',
      cnnSize: 'M',
      allowInterpolation: true,
      maxResHeight: 1440,
      defaultMode: 'mode_bb',
      budgetMs: 28
    },
    ultra: {
      id: 'ultra',
      label: 'Ультра',
      shortDesc: 'Мощные видеокарты (RTX 3060 / 4060 / 4070+)',
      cnnSize: 'VL',
      allowInterpolation: true,
      maxResHeight: 2160,
      defaultMode: 'mode_gan',
      budgetMs: 36
    }
  };

  const ENHANCEMENT_MODES = {
    mode_gan: {
      id: 'mode_gan',
      label: 'GAN Максимум (4K детали)',
      tag: 'GAN 2x',
      group: 'recommended',
      desc: 'Генеративная нейросеть: максимальная чёткость волос, глаз и мелких деталей из 720p',
      chains: {
        fast: ['Upscale_CNN_x2_S'],
        balanced: ['Restore_CNN_Soft_S', 'Upscale_CNN_x2_M'],
        quality: ['Restore_CNN_Soft_M', 'Upscale_GAN_x2_M'],
        ultra: ['Restore_CNN_Soft_VL', 'Upscale_GAN_x2_M', 'Restore_CNN_Soft_S']
      },
      params: {
        casStrength: 0.36,
        lineEnhance: 0.20,
        lineThinning: 0.0,
        debandStrength: 0.12,
        deringStrength: 0.72,
        blackLevelFix: true,
        vibrance: 0.05
      }
    },
    mode_bb: {
      id: 'mode_bb',
      label: 'Чёткое аниме (B+B)',
      tag: 'CNN VL',
      group: 'recommended',
      desc: 'Глубокое восстановление линий и чистые заливки без лишней жёсткости',
      chains: {
        fast: ['Upscale_CNN_x2_S'],
        balanced: ['Restore_CNN_Soft_S', 'Upscale_CNN_x2_S'],
        quality: ['Restore_CNN_Soft_L', 'Upscale_CNN_x2_L'],
        ultra: ['Restore_CNN_Soft_VL', 'Upscale_CNN_x2_VL', 'Restore_CNN_Soft_S']
      },
      params: {
        casStrength: 0.32,
        lineEnhance: 0.22,
        lineThinning: 0.0,
        debandStrength: 0.15,
        deringStrength: 0.74,
        blackLevelFix: true,
        vibrance: 0.05
      }
    },
    mode_aa: {
      id: 'mode_aa',
      label: 'Максимум контуров (A+A)',
      tag: 'GAN + VL',
      group: 'recommended',
      desc: 'Усиленная прорисовка размытых контуров для старых и мыльных релизов',
      chains: {
        fast: ['Restore_CNN_S', 'Upscale_CNN_x2_S'],
        balanced: ['Restore_CNN_S', 'Upscale_CNN_x2_S'],
        quality: ['Restore_CNN_L', 'Upscale_CNN_x2_L'],
        ultra: ['Restore_CNN_VL', 'Upscale_GAN_x2_M', 'Restore_CNN_S']
      },
      params: {
        casStrength: 0.44,
        lineEnhance: 0.30,
        lineThinning: 0.0,
        debandStrength: 0.10,
        deringStrength: 0.76,
        blackLevelFix: true,
        vibrance: 0.06
      }
    },
    mode_clean: {
      id: 'mode_clean',
      label: 'Очистка сжатия и шума',
      tag: 'Denoise',
      group: 'recommended',
      desc: 'Убирает квадраты плохого битрейта и восстанавливает чистоту кадра',
      chains: {
        fast: ['Upscale_CNN_x2_S'],
        balanced: ['Upscale_Denoise_CNN_x2_M'],
        quality: ['Restore_CNN_Soft_M', 'Upscale_Denoise_CNN_x2_M'],
        ultra: ['Restore_CNN_Soft_VL', 'Upscale_Denoise_CNN_x2_M']
      },
      params: {
        casStrength: 0.26,
        lineEnhance: 0.15,
        lineThinning: 0.0,
        debandStrength: 0.25,
        deringStrength: 0.80,
        blackLevelFix: true,
        vibrance: 0.04
      }
    },
    mode_lite: {
      id: 'mode_lite',
      label: 'Лёгкая нейросеть (ноутбук)',
      tag: 'CNN S',
      group: 'advanced',
      desc: 'Компактная 4-слойная нейросеть 2x — отличный результат на встроенной графике',
      chains: {
        fast: ['Upscale_CNN_x2_S'],
        balanced: ['Restore_CNN_Soft_S', 'Upscale_CNN_x2_S'],
        quality: ['Restore_CNN_Soft_S', 'Upscale_CNN_x2_S'],
        ultra: ['Restore_CNN_Soft_S', 'Upscale_CNN_x2_S']
      },
      params: {
        casStrength: 0.34,
        lineEnhance: 0.20,
        lineThinning: 0.0,
        debandStrength: 0.15,
        deringStrength: 0.72,
        blackLevelFix: true,
        vibrance: 0.05
      }
    },
    eco_fast: {
      id: 'eco_fast',
      label: 'Экономный (без нейросети)',
      tag: 'Eco',
      group: 'advanced',
      desc: 'Однопроходный шейдер — почти нулевая нагрузка на слабый ПК и батарею',
      chains: {
        fast: [],
        balanced: [],
        quality: [],
        ultra: []
      },
      params: {
        casStrength: 0.76,
        lineEnhance: 0.55,
        lineThinning: 0.0,
        debandStrength: 0.25,
        deringStrength: 0.65,
        blackLevelFix: true,
        vibrance: 0.06
      }
    },
    custom: {
      id: 'custom',
      label: 'Свои настройки',
      tag: 'Custom',
      group: 'custom',
      desc: 'Нейросеть выбранного уровня + точная подстройка ползунками',
      chains: {
        fast: ['Upscale_CNN_x2_S'],
        balanced: ['Restore_CNN_Soft_S', 'Upscale_CNN_x2_S'],
        quality: ['Restore_CNN_Soft_M', 'Upscale_GAN_x2_M'],
        ultra: ['Restore_CNN_Soft_VL', 'Upscale_GAN_x2_M', 'Restore_CNN_Soft_S']
      },
      params: null
    }
  };

  const OUTPUT_RESOLUTIONS = {
    auto: { id: 'auto', label: 'Авто' },
    '1080p': { id: '1080p', label: '1080p', height: 1080 },
    '1440p': { id: '1440p', label: '2K', height: 1440 },
    '2160p': { id: '2160p', label: '4K', height: 2160 }
  };

  const INTERPOLATION_MODES = {
    off: { id: 'off', label: 'Авто', targetFps: 0 },
    '48': { id: '48', label: '48 FPS', targetFps: 48 },
    '60': { id: '60', label: '60 FPS', targetFps: 60 }
  };

  const COLOR_PROFILES = {
    natural: {
      id: 'natural',
      index: 0,
      label: 'Оригинал',
      desc: 'Исходные цвета видео без цветокоррекции'
    },
    bluray: {
      id: 'bluray',
      index: 1,
      label: 'Blu-ray',
      desc: 'Чистый контраст, глубокий чёрный и точные оттенки кожи'
    },
    vivid: {
      id: 'vivid',
      index: 2,
      label: 'Сочный HDR',
      desc: 'Яркие, живые цвета и локальный контраст как на OLED'
    },
    warm_night: {
      id: 'warm_night',
      index: 3,
      label: 'Ночной',
      desc: 'Тёплый спектр без резкого синего света для вечернего просмотра'
    },
    cinema: {
      id: 'cinema',
      index: 4,
      label: 'Киноплёнка',
      desc: 'Прохладные глубокие тени и мягкие тёплые света'
    },
    oled_deep: {
      id: 'oled_deep',
      index: 5,
      label: 'OLED Тёмный',
      desc: 'Усиленная глубина теней и выразительные блики'
    }
  };

  const DEFAULT_SETTINGS = {
    enabled: true,
    language: 'auto',
    theme: 'amoled',
    tier: 'balanced',
    mode: 'mode_lite',
    resolution: '1080p',
    interpolation: 'off',
    interpolationStrength: 0.78,
    sceneCutThreshold: 0.16,
    colorProfile: 'bluray',
    antiFlash: false,
    autoThrottle: true,
    splitScreen: false,
    splitPosition: 0.5,
    showPlayerButton: true,
    showHud: false,
    whitelistEnabled: false,
    whitelist: [],
    customParams: {
      casStrength: 0.36,
      lineEnhance: 0.20,
      lineThinning: 0.0,
      debandStrength: 0.12,
      deringStrength: 0.72,
      blackLevelFix: true,
      vibrance: 0.05
    },
    gpuProfile: null,
    onboardingDone: false
  };

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function mergeSettings(raw) {
    const src = raw || {};
    const merged = {
      ...DEFAULT_SETTINGS,
      ...src,
      customParams: {
        ...DEFAULT_SETTINGS.customParams,
        ...(src.customParams || {})
      },
      whitelist: Array.isArray(src.whitelist) ? src.whitelist : []
    };
    if (merged.resolution === '2x') merged.resolution = '1440p';
    const validLanguages = ['auto', 'en', 'ru'];
    if (!validLanguages.includes(merged.language)) {
      merged.language = 'auto';
    }
    if (merged.mode === 'anime4k_ultra' || merged.mode === 'restore_deep') merged.mode = 'mode_gan';
    if (merged.mode === 'anime4k_fast' || merged.mode === 'soft_cel') merged.mode = 'mode_lite';
    if (merged.mode === 'deblock_clean') merged.mode = 'mode_clean';
    if (merged.mode === 'anime_crisp' || merged.mode === 'cas_detail') merged.mode = 'eco_fast';
    if (!ENHANCEMENT_MODES[merged.mode]) merged.mode = 'mode_gan';
    return merged;
  }

  function resolveEffectiveParams(settings) {
    const s = mergeSettings(settings);
    const tier = PERFORMANCE_TIERS[s.tier] || PERFORMANCE_TIERS.balanced;
    const mode = ENHANCEMENT_MODES[s.mode] || ENHANCEMENT_MODES.mode_gan;

    const baseParams = s.mode === 'custom' || !mode.params
      ? s.customParams
      : mode.params;

    const cnnModels = (mode.chains && mode.chains[tier.id]) ? mode.chains[tier.id] : [];
    const colorProfileObj = COLOR_PROFILES[s.colorProfile] || COLOR_PROFILES.natural;

    return {
      tierId: tier.id,
      cnnModels,
      useCnn: cnnModels.length > 0,
      casStrength: clamp(baseParams.casStrength || 0, 0, 1),
      lineEnhance: clamp(baseParams.lineEnhance || 0, 0, 1),
      lineThinning: clamp(baseParams.lineThinning || 0, 0, 0.85),
      debandStrength: clamp(baseParams.debandStrength || 0, 0, 1),
      deringStrength: clamp(baseParams.deringStrength || 0.72, 0, 1),
      blackLevelFix: Boolean(baseParams.blackLevelFix),
      vibrance: clamp(baseParams.vibrance || 0, -0.3, 0.5),
      colorProfileId: colorProfileObj.id,
      colorProfileIndex: colorProfileObj.index,
      antiFlash: Boolean(s.antiFlash),
      interpolationMode: s.interpolation || 'off',
      targetFps: (INTERPOLATION_MODES[s.interpolation] || INTERPOLATION_MODES.off).targetFps,
      interpolationStrength: clamp(s.interpolationStrength, 0.1, 1.0),
      sceneCutThreshold: clamp(s.sceneCutThreshold, 0.05, 0.45),
      budgetMs: tier.budgetMs
    };
  }

  function computeTargetDimensions(srcW, srcH, resolutionKey, displayW, displayH, maxTextureSize) {
    const sw = Math.max(1, Math.round(srcW || 1280));
    const sh = Math.max(1, Math.round(srcH || 720));
    const aspect = sw / sh;
    const texCap = maxTextureSize || 4096;

    let targetH = sh;
    if (resolutionKey === '1080p') {
      targetH = Math.max(sh, 1080);
    } else if (resolutionKey === '1440p') {
      targetH = Math.max(sh, 1440);
    } else if (resolutionKey === '2160p') {
      targetH = Math.max(sh, 2160);
    } else if (resolutionKey === '2x') {
      targetH = sh * 2;
    } else {
      const dH = Math.round(displayH || sh);
      targetH = Math.max(sh, Math.min(2160, dH));
    }

    let targetW = Math.round(targetH * aspect);
    if (targetW > texCap) {
      targetW = texCap;
      targetH = Math.round(targetW / aspect);
    }
    if (targetH > texCap) {
      targetH = texCap;
      targetW = Math.round(targetH * aspect);
    }

    return {
      width: Math.max(2, targetW),
      height: Math.max(2, targetH)
    };
  }

  function extractWhitelistEntry(rawUrl, type) {
    try {
      const u = new URL(rawUrl);
      if (type === 'page') return { type: 'page', value: u.origin + u.pathname };
      if (type === 'domain') return { type: 'domain', value: u.hostname };
      if (type === 'path') {
        const parts = u.pathname.split('/').filter(Boolean);
        parts.pop();
        const parentPath = parts.length ? '/' + parts.join('/') + '/' : '/';
        return { type: 'path', value: u.origin + parentPath };
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  function matchesWhitelist(rawUrl, whitelistEnabled, whitelist) {
    if (!whitelistEnabled) return true;
    if (!Array.isArray(whitelist) || whitelist.length === 0) return false;
    try {
      const u = new URL(rawUrl);
      const pageStr = u.origin + u.pathname;
      return whitelist.some(item => {
        if (!item || !item.value) return false;
        if (item.type === 'domain') return u.hostname === item.value || u.hostname.endsWith('.' + item.value);
        if (item.type === 'page') return pageStr === item.value;
        if (item.type === 'path') return pageStr.startsWith(item.value);
        return false;
      });
    } catch (_) {
      return false;
    }
  }

  function classifyBenchmarkResult(scores, langSetting) {
    const ultraMs = Number(scores.ultraMs || 999);
    const qualityMs = Number(scores.qualityMs || 999);
    const balancedMs = Number(scores.balancedMs || 999);
    const flowMs = Number(scores.flowMs || 999);

    let recommendedTier = 'fast';
    let recommendedMode = 'eco_fast';
    let recommendedResolution = '1080p';
    let recommendedInterpolation = 'off';
    let gpuClassKey = 'gpuClass_fast';

    // RTX 3060 / 4060 / 4070+ handle full GAN + VL Ultra smoothly within 24 FPS budget (41.6ms)
    if (ultraMs <= 34) {
      recommendedTier = 'ultra';
      recommendedMode = 'mode_gan';
      recommendedResolution = '1440p';
      recommendedInterpolation = flowMs <= 14 ? '60' : 'off';
      gpuClassKey = 'gpuClass_ultra';
    } else if (qualityMs <= 30) {
      recommendedTier = 'quality';
      recommendedMode = 'mode_bb';
      recommendedResolution = '1440p';
      recommendedInterpolation = flowMs <= 14 ? '48' : 'off';
      gpuClassKey = 'gpuClass_quality';
    } else if (balancedMs <= 30) {
      recommendedTier = 'balanced';
      recommendedMode = 'mode_lite';
      recommendedResolution = '1080p';
      recommendedInterpolation = 'off';
      gpuClassKey = 'gpuClass_balanced';
    } else {
      recommendedTier = 'fast';
      recommendedMode = 'eco_fast';
      recommendedResolution = '1080p';
      recommendedInterpolation = 'off';
      gpuClassKey = 'gpuClass_fast';
    }

    const gpuClass = (I18n && typeof I18n.t === 'function')
      ? I18n.t(gpuClassKey, langSetting)
      : (gpuClassKey === 'gpuClass_ultra' ? 'Мощная видеокарта (уровень RTX 3060 / 4060 / 4070+)' :
         gpuClassKey === 'gpuClass_quality' ? 'Средняя дискретная видеокарта' :
         gpuClassKey === 'gpuClass_balanced' ? 'Встроенная графика / ноутбук' : 'Энергоэффективная / слабая графика');

    return {
      recommendedTier,
      recommendedMode,
      recommendedResolution,
      recommendedInterpolation,
      gpuClass,
      gpuClassKey,
      canInterpolate: flowMs <= 14
    };
  }

  const TIER_ORDER = ['fast', 'balanced', 'quality', 'ultra'];

  function evaluateAutoThrottle(avgFrameMs, currentTier, targetFps) {
    const budget = targetFps >= 48 ? 15 : 36;
    const idx = TIER_ORDER.indexOf(currentTier);
    if (avgFrameMs > budget && idx > 0) {
      return {
        shouldDowngrade: true,
        nextTier: TIER_ORDER[idx - 1],
        disableInterpolation: targetFps >= 48
      };
    }
    return {
      shouldDowngrade: false,
      nextTier: currentTier,
      disableInterpolation: false
    };
  }

  const api = {
    APP_META,
    I18n,
    PERFORMANCE_TIERS,
    ENHANCEMENT_MODES,
    OUTPUT_RESOLUTIONS,
    INTERPOLATION_MODES,
    COLOR_PROFILES,
    DEFAULT_SETTINGS,
    TIER_ORDER,
    clamp,
    mergeSettings,
    resolveEffectiveParams,
    computeTargetDimensions,
    extractWhitelistEntry,
    matchesWhitelist,
    classifyBenchmarkResult,
    evaluateAutoThrottle
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.AniPureConfig = api;
    root.LumaScaleConfig = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
