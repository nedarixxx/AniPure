(function () {
  'use strict';

  function resolveLanguage(setting, testLocale) {
    if (setting === 'ru' || setting === 'en') {
      return setting;
    }
    const nav = (testLocale || (typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage)) || '').toLowerCase();
    if (nav.startsWith('ru') || nav.startsWith('be') || nav.startsWith('uk')) {
      return 'ru';
    }
    return 'en';
  }

  const TRANSLATIONS = {
    en: {
      // General & Header
      brandShort: 'AniPure',
      brandSubtitle: 'Anime & Video AI Upscaler',
      powerOn: 'ON',
      powerOff: 'OFF',
      themeAmoled: 'AMOLED',
      themeLight: 'Light',
      waitingSignal: 'Waiting for video stream...',
      activeSignal: '{fps} FPS | {res} | {tier}',
      quickSplit: 'Before / After',
      reset: 'Reset',

      // Tabs
      tabPicture: 'Enhance',
      tabTune: 'Color & Screen',
      tabSites: 'Sites & GPU',

      // Performance Tiers
      tierTitle: 'Performance Profile',
      tier_fast: 'Fast',
      tier_balanced: 'Balanced',
      tier_quality: 'Quality',
      tier_ultra: 'Ultra',
      tierHint_fast: 'Single-pass Catmull-Rom shader + AMD CAS. Minimal GPU load, ideal for laptop battery.',
      tierHint_balanced: '4-layer CNN model. Optimal balance for integrated GPUs (Intel Iris Xe, AMD Vega).',
      tierHint_quality: 'Deep line reconstruction + CNN upscaling for mid-tier GPUs (GTX 1660, RTX 3050).',
      tierHint_ultra: 'Multi-pass Anime4K GAN Max neural network for high-end GPUs (RTX 3060 / 4060 / 4070+).',

      // Enhancement Models
      modeTitle: 'Enhancement Model',
      mode_gan_title: 'GAN Maximum (4K Details)',
      mode_gan_desc: 'Generative neural network for upscaling to 1440p / 4K',
      mode_bb_title: 'Anime4K v4.0.1 (Crisp Lines)',
      mode_bb_desc: 'Classic mode: line restoration and thinning without oversharpening',
      mode_aa_title: 'Maximum Contours (A+A)',
      mode_aa_desc: 'Enhanced reconstruction of blurry lines for legacy releases',
      mode_lite_title: 'CNN Restore (Soft)',
      mode_lite_desc: 'Balanced detail and speed for integrated and laptop GPUs',
      mode_clean_title: 'Deblocking (Artifact Removal)',
      mode_clean_desc: 'Removes bitrate compression artifacts, blocking, and streaming noise',
      mode_eco_title: 'Eco Fast (CAS + Deband)',
      mode_eco_desc: 'No neural networks, Catmull-Rom + CAS with zero heating',
      mode_custom_title: 'Custom',
      mode_custom_desc: 'Manual parameter adjustment via sliders on Tab 2',

      // Resolutions
      resTitle: 'Target Resolution',
      res_native: 'Native',
      res_1080p: '1080p',
      res_1440p: '2K 1440p',
      res_2160p: '4K 2160p',
      resHint: 'Upscaling beyond screen resolution automatically uses hardware anti-aliasing.',

      // Interpolation
      interpTitle: 'Frame Interpolation (Optical Flow)',
      interp_off: 'Off',
      interp_48: '48 FPS (x2)',
      interp_60: '60 FPS',
      interpHint: 'Optical flow estimation on GPU. Automatically pauses on scene cuts to avoid artifacts.',

      // Color Profiles
      colorTitle: 'Color Profiles',
      cp_natural: 'Natural',
      cp_natural_desc: 'Original video colors without alteration',
      cp_bluray: 'Blu-ray',
      cp_bluray_desc: 'High contrast and accurate studio midtone balance',
      cp_vivid: 'Vivid HDR',
      cp_vivid_desc: 'Expanded dynamic range and rich vibrant colors',
      cp_warm: 'Night',
      cp_warm_desc: 'Warm color spectrum with reduced blue strain for evening viewing',
      cp_cinema: 'Cinema Film',
      cp_cinema_desc: 'Cool deep shadows and soft warm highlights with film look',
      cp_oled_deep: 'OLED',
      cp_oled_deep_desc: 'Deep true blacks without clipping shadow details',

      // Options
      optPlayerBtn: 'On-Player Controls (Auto-hide)',
      optSplitScreen: 'Before / After Split-Screen (In-Player)',
      optAntiFlash: 'Anti-Flash (Soft Light at Night)',
      optBlackFix: 'Deep Black Level Fix',
      optHud: 'On-Screen Telemetry HUD',
      optThrottle: 'Auto-Throttle on GPU Overload',

      // Fine-tuning sliders
      slidersTitle: 'Fine-Tuning',
      sliderCas: 'Edge Sharpness (CAS)',
      sliderLine: 'Line Refinement (CNN)',
      sliderDering: 'Deringing / Denoise',
      sliderVibrance: 'Dynamic Vibrance',

      // Language & Whitelist
      langTitle: 'Language / Язык',
      lang_auto: 'Auto',
      lang_en: 'English',
      lang_ru: 'Русский',
      wlTitle: 'Where AniPure Runs',
      wl_all: 'All Websites',
      wl_only: 'Whitelist Only',
      currentTab: 'Current Tab',
      addDomain: '+ Domain',
      addPage: '+ Page',
      addPath: '+ Path',
      wlEmpty: 'The whitelist is empty. Add domains or paths using the buttons above.',
      wlActiveOnThisPage: 'Active on this page',
      wlBlockedOnThisPage: 'Disabled on this page (not in whitelist)',

      // GPU & Benchmark in Popup
      gpuTitle: 'Your Graphics Card',
      gpuNotTested: 'GPU benchmark has not been run yet',
      openBenchmark: 'Run GPU Benchmark & Settings',

      // Player Overlay & Controls
      playerOn: 'AniPure: ON',
      playerOff: 'AniPure: OFF',
      splitBtn: 'Before / After',
      origLabel: 'Original 720p',
      playerToggleTitle: 'Toggle AniPure enhancement on this player',
      playerSplitTitle: 'Before / After comparison split-screen',
      toastCors: 'AniPure: video is protected by CORS/DRM on this domain',
      toastWebglErr: 'AniPure: WebGL2 error — {err}',
      toastThrottle: 'Auto-optimization: switched to "{tier}" for smooth playback',
      hudPause: 'Paused',

      // Onboarding & Diagnostics
      obTitle: 'AniPure — Setup & GPU Diagnostics',
      obSubtitle: 'Benchmarking real WebGL2 Anime4K v4 CNN neural shaders to determine GPU performance and choose the optimal profile.',
      obRunBench: 'Run GPU Benchmark',
      obRunning: 'Benchmarking shaders on your GPU...',
      obBenchHeading: 'GPU Benchmark Results',
      obRecTitle: 'Recommended Profile:',
      obApply: 'Apply Settings & Finish',
      obFastLabel: 'Fast Shader (CAS):',
      obBalancedLabel: 'Balanced CNN (4 Layers):',
      obQualityLabel: 'Quality CNN (Restore Soft):',
      obUltraLabel: 'Ultra GAN (GAN Max 4K):',
      obFlowLabel: 'Optical Flow (Motion):',
      obAdvTitle: 'Behavior & Video Smoothness',
      obAdvDesc: 'Changes are saved automatically and immediately applied to all open players.',
      obOptPlayerBtnTitle: 'Player Controls Overlay',
      obOptPlayerBtnSub: 'Shows compact toggle and Before / After split-screen on player hover',
      obOptThrottleTitle: 'Anti-Lag Protection',
      obOptThrottleSub: 'Automatically lowers settings if GPU is overloaded to keep playback smooth',
      obOptSceneCutTitle: 'Scene Cut Detection (48 / 60 FPS)',
      obOptSceneCutSub: 'Pauses interpolation on sudden camera cuts to eliminate artifacts',
      obOptFlowStrTitle: 'Motion Smoothing Strength (48 / 60 FPS)',
      obOptFlowStrSub: 'Controls optical flow blending intensity between frames',
      obWlTitle: 'Website Whitelist',
      obWlDesc: 'When whitelist is enabled in popup, enhancement only runs on these addresses.',
      obResetBtn: 'Reset All Settings',
      obEmptyWl: 'Whitelist is currently empty. Add sites via the extension popup.',
      obAppliedNote: 'Recommended profile applied successfully. Open any player to test.',
      obResetNote: 'Settings reset to default values.',
      gpuClass_ultra: 'High-Performance GPU (RTX 3060 / 4060 / 4070+)',
      gpuClass_quality: 'Mid-Tier Discrete GPU (GTX 1660 / RTX 3050)',
      gpuClass_balanced: 'Integrated Graphics / Modern Laptop (Iris Xe / Vega)',
      gpuClass_fast: 'Power-Saving / Entry-Level Graphics',
      recDetails_ultra: 'Mode: GAN Maximum (4K Details) · Resolution: 2K · Interpolation: 60 FPS',
      recDetails_quality: 'Mode: Anime4K v4.0.1 (Crisp Lines) · Resolution: 2K · Interpolation: 48 FPS',
      recDetails_balanced: 'Mode: CNN Restore (Soft) · Resolution: 1080p · Interpolation: Off',
      recDetails_fast: 'Mode: Eco Fast (CAS + Deband) · Resolution: 1080p · Interpolation: Off'
    },

    ru: {
      // General & Header
      brandShort: 'AniPure',
      brandSubtitle: 'Нейросетевой видео-апскейлер',
      powerOn: 'ВКЛ',
      powerOff: 'ВЫКЛ',
      themeAmoled: 'AMOLED',
      themeLight: 'Светлая',
      waitingSignal: 'Ожидание видеопотока...',
      activeSignal: '{fps} FPS | {res} | {tier}',
      quickSplit: 'До / После',
      reset: 'Сбросить',

      // Tabs
      tabPicture: 'Картинка',
      tabTune: 'Цвет и экран',
      tabSites: 'Сайты и ПК',

      // Performance Tiers
      tierTitle: 'Профиль мощности',
      tier_fast: 'Быстро',
      tier_balanced: 'Баланс',
      tier_quality: 'Качество',
      tier_ultra: 'Ультра',
      tierHint_fast: 'Однопроходный шейдер Catmull-Rom + AMD CAS. Минимальная нагрузка, идеален для батареи ноутбука.',
      tierHint_balanced: '4-слойная CNN-модель. Оптимальный баланс для встроенных GPU (Intel Iris Xe, AMD Vega).',
      tierHint_quality: 'Глубокое восстановление линий + CNN-апскейл для видеокарт уровня GTX 1660 / RTX 3050.',
      tierHint_ultra: 'Многопроходная нейросеть Anime4K GAN Max для мощных видеокарт (RTX 3060 / 4060 / 4070+).',

      // Enhancement Models
      modeTitle: 'Алгоритм улучшения',
      mode_gan_title: 'GAN Максимум (4K детали)',
      mode_gan_desc: 'Генеративная нейросеть для апскейла 1080p -> 1440p / 4K',
      mode_bb_title: 'Anime4K v4.0.1 (Чёткие контуры)',
      mode_bb_desc: 'Классический режим: утоньшение и восстановление контуров без перешарпа',
      mode_aa_title: 'Максимум контуров (A+A)',
      mode_aa_desc: 'Усиленная прорисовка размытых контуров для старых и мыльных релизов',
      mode_lite_title: 'Восстановление CNN (Мягкое)',
      mode_lite_desc: 'Баланс детальности и скорости для встроенной графики и ноутбуков',
      mode_clean_title: 'Деблокинг (Очистка сжатия)',
      mode_clean_desc: 'Устранение артефактов битрейта, блочности и мыла онлайн-плееров',
      mode_eco_title: 'Эко Быстро (CAS + Дебандинг)',
      mode_eco_desc: 'Без нейросетей, Catmull-Rom + CAS с нулевым нагревом',
      mode_custom_title: 'Пользовательский',
      mode_custom_desc: 'Параметры настроены вручную ползунками на вкладке 2',

      // Resolutions
      resTitle: 'Выходное разрешение',
      res_native: 'Оригинал',
      res_1080p: '1080p',
      res_1440p: '2K 1440p',
      res_2160p: '4K 2160p',
      resHint: 'При апскейле выше разрешения экрана автоматически применяется аппаратное сглаживание.',

      // Interpolation
      interpTitle: 'Интерполяция кадров (Optical Flow)',
      interp_off: 'Выкл',
      interp_48: '48 FPS (x2)',
      interp_60: '60 FPS',
      interpHint: 'Расчет векторов движения на GPU. Автоматически отключается при склейках планов, избегая смазывания.',

      // Color Profiles
      colorTitle: 'Цветовые профили',
      cp_natural: 'Оригинал',
      cp_natural_desc: 'Оригинальные цвета видеопотока без коррекции',
      cp_bluray: 'Blu-ray',
      cp_bluray_desc: 'Точная контрастность и баланс полутонов студийного диска',
      cp_vivid: 'Сочный HDR',
      cp_vivid_desc: 'Глубокий динамический диапазон и выразительные яркие цвета',
      cp_warm: 'Ночной',
      cp_warm_desc: 'Снижение синего спектра и мягкие теплые тона для вечернего просмотра',
      cp_cinema: 'Киноплёнка',
      cp_cinema_desc: 'Прохладные глубокие тени и мягкие тёплые света с плёночной фактурой',
      cp_oled_deep: 'OLED',
      cp_oled_deep_desc: 'Усиленная глубина теней и глубокий чёрный цвет без клиппинга деталей',

      // Options
      optPlayerBtn: 'Кнопка на плеере (автоскрытие)',
      optSplitScreen: 'Сравнение «До / После» (шторка в плеере)',
      optAntiFlash: 'Анти-вспышка (мягкий свет ночью)',
      optBlackFix: 'Глубокий чёрный цвет',
      optHud: 'Показатели работы поверх видео',
      optThrottle: 'Защита от лагов на слабых ПК',

      // Fine-tuning sliders
      slidersTitle: 'Подстройка картинки',
      sliderCas: 'Резкость контуров (CAS)',
      sliderLine: 'Чёткость линий (CNN)',
      sliderDering: 'Устранение артефактов',
      sliderVibrance: 'Динамическая сочность',

      // Language & Whitelist
      langTitle: 'Язык интерфейса',
      lang_auto: 'Авто',
      lang_en: 'English',
      lang_ru: 'Русский',
      wlTitle: 'Где работает расширение',
      wl_all: 'На всех сайтах',
      wl_only: 'Только из списка',
      currentTab: 'Текущая вкладка',
      addDomain: '+ Домен',
      addPage: '+ Страница',
      addPath: '+ Раздел',
      wlEmpty: 'Список пуст. Добавьте сайт кнопками выше.',
      wlActiveOnThisPage: 'Работает на этой странице',
      wlBlockedOnThisPage: 'Отключено на этой странице (нет в списке)',

      // GPU & Benchmark in Popup
      gpuTitle: 'Ваша видеокарта',
      gpuNotTested: 'Тест видеокарты ещё не запускался',
      openBenchmark: 'Открыть тест видеокарты и настройки',

      // Player Overlay & Controls
      playerOn: 'AniPure: ВКЛ',
      playerOff: 'AniPure: ВЫКЛ',
      splitBtn: 'До / После',
      origLabel: 'Оригинал 720p',
      playerToggleTitle: 'Включить или выключить улучшение на этом плеере',
      playerSplitTitle: 'Сравнение До / После (интерактивная шторка)',
      toastCors: 'AniPure: видео защищено CORS/DRM на этом домене',
      toastWebglErr: 'AniPure: ошибка WebGL2 — {err}',
      toastThrottle: 'Авто-оптимизация: переключено на «{tier}» для плавности',
      hudPause: 'Пауза',

      // Onboarding & Diagnostics
      obTitle: 'AniPure — Настройка и диагностика GPU',
      obSubtitle: 'Тестирование реальных шейдеров нейросетей Anime4K v4 CNN на WebGL2 для выбора оптимального профиля под вашу видеокарту.',
      obRunBench: 'Запустить тест GPU',
      obRunning: 'Тестирование шейдеров на видеокарте...',
      obBenchHeading: 'Результаты аппаратного теста',
      obRecTitle: 'Оптимальный профиль:',
      obApply: 'Применить настройки и продолжить',
      obFastLabel: 'Быстрый шейдер (CAS):',
      obBalancedLabel: 'Баланс CNN (4 слоя):',
      obQualityLabel: 'Качество CNN (Restore Soft):',
      obUltraLabel: 'Ультра GAN (GAN Max 4K):',
      obFlowLabel: 'Optical Flow (Плавность):',
      obAdvTitle: 'Поведение и плавность видео',
      obAdvDesc: 'Изменения сохраняются автоматически и сразу применяются ко всем открытым плеерам.',
      obOptPlayerBtnTitle: 'Кнопка управления поверх видеоплеера',
      obOptPlayerBtnSub: 'Показывает компактную панель включения и шторку «До / После» при наведении на видео',
      obOptThrottleTitle: 'Защита от лагов',
      obOptThrottleSub: 'Если видеокарта не успевает, расширение само снизит нагрузку, чтобы видео не тормозило',
      obOptSceneCutTitle: 'Защита от двоения на склейках (для 48 / 60 FPS)',
      obOptSceneCutSub: 'Отключает смешивание при резкой смене сцены в аниме',
      obOptFlowStrTitle: 'Сила сглаживания движения (48 / 60 FPS)',
      obOptFlowStrSub: 'Насколько плавно дорисовывать движение между кадрами',
      obWlTitle: 'Белый список сайтов',
      obWlDesc: 'Когда белый список включён в окне расширения, улучшение запускается только на этих адресах.',
      obResetBtn: 'Сбросить все настройки',
      obEmptyWl: 'Список пока пуст. Добавьте нужный сайт через всплывающее окно расширения.',
      obAppliedNote: 'Рекомендуемый пресет сохранён и применён. Можете открыть любой плеер и проверить результат.',
      obResetNote: 'Настройки сброшены на значения по умолчанию.',
      gpuClass_ultra: 'Мощная видеокарта (уровень RTX 3060 / 4060 / 4070+)',
      gpuClass_quality: 'Средняя дискретная видеокарта (GTX 1660 / RTX 3050)',
      gpuClass_balanced: 'Встроенная графика / ноутбук (Iris Xe / Vega)',
      gpuClass_fast: 'Энергоэффективная / слабая графика',
      recDetails_ultra: 'Режим: GAN Максимум (4K детали) · Разрешение: 2K · Интерполяция: 60 FPS',
      recDetails_quality: 'Режим: Anime4K v4.0.1 (Чёткие контуры) · Разрешение: 2K · Интерполяция: 48 FPS',
      recDetails_balanced: 'Режим: Восстановление CNN (Мягкое) · Разрешение: 1080p · Интерполяция: Выкл',
      recDetails_fast: 'Режим: Эко Быстро (CAS + Дебандинг) · Разрешение: 1080p · Интерполяция: Выкл'
    }
  };

  function t(key, langSetting, params) {
    const lang = resolveLanguage(langSetting);
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
    let text = dict[key] || TRANSLATIONS.en[key] || key;
    if (params && typeof params === 'object') {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp('\\{' + k + '\\}', 'g'), String(v));
      }
    }
    return text;
  }

  function applyTranslations(root, langSetting) {
    const el = root || (typeof document !== 'undefined' ? document : null);
    if (!el) return;
    const lang = resolveLanguage(langSetting);

    el.querySelectorAll('[data-i18n]').forEach(node => {
      const key = node.getAttribute('data-i18n');
      if (key) {
        node.textContent = t(key, lang);
      }
    });

    el.querySelectorAll('[data-i18n-title]').forEach(node => {
      const key = node.getAttribute('data-i18n-title');
      if (key) {
        node.title = t(key, lang);
      }
    });

    el.querySelectorAll('[data-i18n-placeholder]').forEach(node => {
      const key = node.getAttribute('data-i18n-placeholder');
      if (key) {
        node.placeholder = t(key, lang);
      }
    });

    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = lang;
    }
  }

  const AniPureI18n = {
    resolveLanguage,
    TRANSLATIONS,
    t,
    applyTranslations
  };

  if (typeof window !== 'undefined') {
    window.AniPureI18n = AniPureI18n;
    window.LumaScaleI18n = AniPureI18n;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AniPureI18n;
  }
})();
