(function () {
  'use strict';

  const Config = window.AniPureConfig || window.LumaScaleConfig;
  const PipelineClass = window.WebGLVideoPipeline;
  if (!Config || !PipelineClass) return;

  let currentSettings = Config.mergeSettings(null);
  const attachedVideos = new Map(); // video -> controller

  function isAllowedOnThisPage(settings) {
    return Config.matchesWhitelist(window.location.href, settings.whitelistEnabled, settings.whitelist);
  }

  function findAllVideos(rootNode, result) {
    const out = result || [];
    if (!rootNode) return out;
    if (rootNode.querySelectorAll) {
      rootNode.querySelectorAll('video').forEach(v => out.push(v));
      rootNode.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) {
          findAllVideos(el.shadowRoot, out);
        }
      });
    }
    return out;
  }

  class VideoEnhancerController {
    constructor(video) {
      this.video = video;
      this.host = video.parentElement;
      this.playerRoot = video.closest('.html5-video-player, [class*="player"], .video-js') || this.host;
      this.pipeline = null;
      this.canvas = null;
      this.controlsEl = null;
      this.hudEl = null;
      this.splitHandleEl = null;
      this.splitLeftLabel = null;
      this.splitRightLabel = null;
      this.toastEl = null;
      this.resizeObserver = null;
      this.lastTelemetry = null;
      this.active = false;
      this.playerActive = false;
      this.corsWarned = false;
      this._overlayHideTimer = null;
      this._isPointerOverControls = false;
      this._isPointerInHotspot = false;
      this._moveTargets = [];

      if (!this.host) return;

      const hostStyle = window.getComputedStyle(this.host);
      if (hostStyle.position === 'static') {
        this.host.style.position = 'relative';
      }
      this.host.classList.add('anipure-host', 'lumascale-host');

      if (this.playerRoot && this.playerRoot !== this.host) {
        const rootStyle = window.getComputedStyle(this.playerRoot);
        if (rootStyle.position === 'static') {
          this.playerRoot.style.position = 'relative';
        }
      }

      this._createElements();
      this._bindEvents();
      this.applySettings(currentSettings);
    }

    _createElements() {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'anipure-canvas lumascale-canvas ls-hidden';
      if (this.video.nextSibling) {
        this.host.insertBefore(this.canvas, this.video.nextSibling);
      } else {
        this.host.appendChild(this.canvas);
      }

      // Overlay controls on player
      this.controlsEl = document.createElement('div');
      this.controlsEl.className = 'anipure-overlay-controls lumascale-overlay-controls';
      this.controlsEl.innerHTML = `
        <button type="button" class="anipure-pill-btn lumascale-pill-btn" data-act="toggle" title="Включить или выключить улучшение">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7">
            <path d="M2 14V2h4M14 2v4M14 2h-4M6 10l8-8"/>
          </svg>
          <span class="ls-toggle-text">AniPure: ВЫКЛ</span>
        </button>
        <button type="button" class="anipure-pill-btn lumascale-pill-btn ls-hidden" data-act="split" title="Сравнение До / После">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
            <rect x="2" y="3" width="12" height="10" rx="1.5"/>
            <line x1="8" y1="3" x2="8" y2="13"/>
          </svg>
          <span>До / После</span>
        </button>
      `;
      (this.playerRoot || this.host).appendChild(this.controlsEl);

      this.hudEl = document.createElement('div');
      this.hudEl.className = 'anipure-hud lumascale-hud ls-hidden';
      (this.playerRoot || this.host).appendChild(this.hudEl);

      // Draggable split-screen divider (strictly hidden unless splitScreen is ON)
      this.splitHandleEl = document.createElement('div');
      this.splitHandleEl.className = 'anipure-split-handle lumascale-split-handle ls-hidden';
      this.splitHandleEl.innerHTML = `
        <div class="anipure-split-knob lumascale-split-knob">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M5 4L2 8l3 4M11 4l3 4-3 4"/>
          </svg>
        </div>
      `;
      this.host.appendChild(this.splitHandleEl);

      this.splitLeftLabel = document.createElement('div');
      this.splitLeftLabel.className = 'anipure-split-label lumascale-split-label ls-hidden';
      this.splitLeftLabel.textContent = 'Оригинал 720p';
      this.splitLeftLabel.style.left = '12px';
      this.host.appendChild(this.splitLeftLabel);

      this.splitRightLabel = document.createElement('div');
      this.splitRightLabel.className = 'anipure-split-label lumascale-split-label ls-hidden';
      this.splitRightLabel.textContent = 'AniPure';
      this.splitRightLabel.style.right = '12px';
      this.host.appendChild(this.splitRightLabel);
    }

    _bindEvents() {
      // Prevent player interaction (pause/seek) when clicking overlay controls
      this.controlsEl.addEventListener('mousedown', (e) => e.stopPropagation());
      this.controlsEl.addEventListener('mouseup', (e) => e.stopPropagation());
      this.controlsEl.addEventListener('click', (e) => e.stopPropagation());

      const toggleBtn = this.controlsEl.querySelector('[data-act="toggle"]');
      const splitBtn = this.controlsEl.querySelector('[data-act="split"]');

      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (typeof toggleBtn.blur === 'function') toggleBtn.blur();
        this.playerActive = !this.playerActive;
        this._updatePlayerState();
        if (this.controlsEl) this.controlsEl.classList.add('ls-visible');
      });

      splitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (typeof splitBtn.blur === 'function') splitBtn.blur();
        savePartialSettings({ splitScreen: !currentSettings.splitScreen });
        if (this.controlsEl) this.controlsEl.classList.add('ls-visible');
      });

      // Drag split-screen handle
      let dragging = false;
      const updateSplitFromClientX = (clientX) => {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width) return;
        const pos = Config.clamp((clientX - rect.left) / rect.width, 0.05, 0.95);
        currentSettings.splitPosition = pos;
        this._syncSplitHandlePosition();
        if (this.pipeline) {
          this.pipeline.updateSettings(currentSettings);
        }
      };

      this.splitHandleEl.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        dragging = true;
      });
      window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        updateSplitFromClientX(e.clientX);
      });
      window.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        savePartialSettings({ splitPosition: currentSettings.splitPosition });
      });

      // Sync canvas geometry whenever video resizes or enters fullscreen
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this._syncGeometry());
        this.resizeObserver.observe(this.video);
        this.resizeObserver.observe(this.host);
      }

      this.video.addEventListener('loadedmetadata', () => this._syncGeometry());
      this.video.addEventListener('play', () => {
        this._syncGeometry();
        if (this.active && this.pipeline) this.pipeline.start();
      });
      this.video.addEventListener('seeked', () => {
        if (this.active && this.pipeline) {
          this.pipeline.refreshCurrentFrame();
        }
      });
      document.addEventListener('fullscreenchange', () => {
        setTimeout(() => this._syncGeometry(), 80);
      });

      // Direct hover on controls: stays visible while hovering, cancels any hide timer
      this.controlsEl.addEventListener('mouseenter', () => {
        this._isPointerOverControls = true;
        this._cancelHideTimer();
        this.controlsEl.classList.add('ls-visible');
      });
      this.controlsEl.addEventListener('mousemove', (e) => {
        e.stopPropagation();
        this._isPointerOverControls = true;
        this._cancelHideTimer();
        this.controlsEl.classList.add('ls-visible');
      });
      this.controlsEl.addEventListener('mouseleave', () => {
        this._isPointerOverControls = false;
        this._checkPointerLeave();
      });

      // Corner trigger detection on player:
      // When cursor hovers over the top-right area where AniPure is located, show it.
      // While pointer is in the hotspot or over buttons, it stays visible indefinitely.
      // When pointer leaves, it smoothly hides after exactly 1 second.
      const handlePlayerMove = (e) => {
        if (this._isPointerOverControls) {
          this._cancelHideTimer();
          return;
        }
        const root = this.playerRoot || this.host;
        if (!root || !this.controlsEl) return;
        const rect = root.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const inCornerZone = (e.clientX >= rect.right - 240) &&
                             (e.clientX <= rect.right + 10) &&
                             (e.clientY >= rect.top - 10) &&
                             (e.clientY <= rect.top + 60);

        if (inCornerZone) {
          this._isPointerInHotspot = true;
          this._cancelHideTimer();
          this.controlsEl.classList.add('ls-visible');
        } else {
          if (this._isPointerInHotspot) {
            this._isPointerInHotspot = false;
            this._checkPointerLeave();
          }
        }
      };

      const handlePlayerLeave = () => {
        this._isPointerInHotspot = false;
        this._checkPointerLeave();
      };

      const targets = new Set([this.playerRoot, this.host].filter(Boolean));
      this._moveTargets = Array.from(targets);
      this._moveTargets.forEach(el => {
        el.addEventListener('mousemove', handlePlayerMove, { passive: true });
        el.addEventListener('pointermove', handlePlayerMove, { passive: true });
        el.addEventListener('mouseleave', handlePlayerLeave, { passive: true });
      });

      document.addEventListener('mouseleave', () => {
        this._isPointerOverControls = false;
        this._isPointerInHotspot = false;
        this._checkPointerLeave();
      });
    }

    _cancelHideTimer() {
      if (this._overlayHideTimer) {
        clearTimeout(this._overlayHideTimer);
        this._overlayHideTimer = null;
      }
    }

    _checkPointerLeave() {
      if (this._isPointerOverControls || this._isPointerInHotspot) {
        return;
      }
      this._scheduleHideOverlay(1000);
    }

    _showOverlay() {
      if (!this.controlsEl) return;
      this.controlsEl.classList.add('ls-visible');
    }

    _scheduleHideOverlay(delay = 1000) {
      if (this._isPointerOverControls || this._isPointerInHotspot) {
        return;
      }
      this._cancelHideTimer();
      this._overlayHideTimer = setTimeout(() => {
        if (this._isPointerOverControls || this._isPointerInHotspot) {
          return;
        }
        if (this.controlsEl && this.controlsEl.matches(':hover')) {
          return;
        }
        if (this.controlsEl) {
          this.controlsEl.classList.remove('ls-visible');
        }
        this._overlayHideTimer = null;
      }, delay);
    }

    _syncGeometry() {
      if (!this.video || !this.host || !this.canvas) return;
      if (!this.active) {
        this.canvas.classList.add('ls-hidden');
        return;
      }
      const vRect = this.video.getBoundingClientRect();
      const hRect = this.host.getBoundingClientRect();
      if (vRect.width < 80 || vRect.height < 60) {
        this.canvas.classList.add('ls-hidden');
        return;
      }

      // Compute exact rendered video rectangle inside element (respecting aspect ratio letterbox)
      const sw = this.video.videoWidth || vRect.width;
      const sh = this.video.videoHeight || vRect.height;
      const vAspect = sw / sh;
      const boxAspect = vRect.width / vRect.height;

      let drawW = vRect.width;
      let drawH = vRect.height;
      let offsetX = vRect.left - hRect.left;
      let offsetY = vRect.top - hRect.top;

      if (Math.abs(vAspect - boxAspect) > 0.01) {
        if (vAspect > boxAspect) {
          drawH = vRect.width / vAspect;
          offsetY += (vRect.height - drawH) * 0.5;
        } else {
          drawW = vRect.height * vAspect;
          offsetX += (vRect.width - drawW) * 0.5;
        }
      }

      this.canvas.style.left = offsetX + 'px';
      this.canvas.style.top = offsetY + 'px';
      this.canvas.style.width = drawW + 'px';
      this.canvas.style.height = drawH + 'px';
      this._syncSplitHandlePosition();
    }

    _syncSplitHandlePosition() {
      if (!this.splitHandleEl || !this.canvas) return;
      const leftPx = parseFloat(this.canvas.style.left || '0');
      const widthPx = parseFloat(this.canvas.style.width || '0');
      if (!widthPx) return;
      const x = leftPx + widthPx * currentSettings.splitPosition;
      this.splitHandleEl.style.left = x + 'px';
    }

    _showToast(message) {
      if (!this.host) return;
      if (this.toastEl) this.toastEl.remove();
      const el = document.createElement('div');
      el.className = 'anipure-toast lumascale-toast';
      el.textContent = message;
      this.host.appendChild(el);
      this.toastEl = el;
      setTimeout(() => {
        if (this.toastEl === el) {
          el.remove();
          this.toastEl = null;
        }
      }, 3600);
    }

    applySettings(settings) {
      currentSettings = settings;
      // In demo / test-bench mode, settings.enabled directly controls playerActive for automated testing
      if (!isExtensionContextValid() && typeof settings.enabled === 'boolean') {
        this.playerActive = Boolean(settings.enabled);
      }
      this._updatePlayerState();
    }

    _updatePlayerState() {
      const allowed = isAllowedOnThisPage(currentSettings);
      const shouldRun = Boolean(this.playerActive && currentSettings.enabled && allowed);
      this.active = shouldRun;

      this.controlsEl.classList.toggle('ls-hidden', !currentSettings.showPlayerButton);
      const toggleBtn = this.controlsEl.querySelector('[data-act="toggle"]');
      const splitBtn = this.controlsEl.querySelector('[data-act="split"]');
      toggleBtn.classList.toggle('ls-active', shouldRun);
      toggleBtn.querySelector('.ls-toggle-text').textContent = shouldRun ? 'AniPure: ВКЛ' : 'AniPure: ВЫКЛ';

      // The Before/After function must NOT appear in the player unless activated in settings first
      const splitAllowed = Boolean(shouldRun && currentSettings.splitScreen);
      splitBtn.classList.toggle('ls-hidden', !splitAllowed);
      splitBtn.classList.toggle('ls-active', splitAllowed);

      this.splitHandleEl.classList.toggle('ls-hidden', !splitAllowed);
      this.splitLeftLabel.classList.toggle('ls-hidden', !splitAllowed);
      this.splitRightLabel.classList.toggle('ls-hidden', !splitAllowed);
      this.hudEl.classList.toggle('ls-hidden', !(shouldRun && currentSettings.showHud));

      const modeObj = Config.ENHANCEMENT_MODES[currentSettings.mode];
      this.splitRightLabel.textContent = modeObj ? modeObj.label : 'AniPure';

      if (shouldRun) {
        this._syncGeometry();
        this.canvas.classList.remove('ls-hidden');
        if (!this.pipeline) {
          try {
            this.pipeline = new PipelineClass(this.video, this.canvas, currentSettings, {
              onTelemetry: (t) => {
                this.lastTelemetry = t;
                this._renderHud(t);
              },
              onCorsBlocked: () => {
                this.canvas.classList.add('ls-hidden');
                if (!this.corsWarned) {
                  this.corsWarned = true;
                  this._showToast('AniPure: видео защищено CORS/DRM на этом домене');
                }
              },
              onAutoThrottle: (info) => {
                const patch = { tier: info.nextTier };
                if (info.disableInterpolation) patch.interpolation = 'off';
                const tierLabel = (Config.PERFORMANCE_TIERS[info.nextTier] || {}).label || info.nextTier;
                this._showToast('Авто-оптимизация: переключено на «' + tierLabel + '» для плавности');
                savePartialSettings(patch);
              }
            });
            this.pipeline.start();
          } catch (err) {
            this.canvas.classList.add('ls-hidden');
            this._showToast('AniPure: ошибка WebGL2 — ' + err.message);
          }
        } else {
          this.pipeline.updateSettings(currentSettings);
          this.pipeline.start();
        }
      } else {
        this.canvas.classList.add('ls-hidden');
        if (this.pipeline) {
          this.pipeline.stop();
        }
      }
    }

    _renderHud(t) {
      if (!this.hudEl || !t) return;
      const tierLabel = (Config.PERFORMANCE_TIERS[t.tier] || {}).label || t.tier;
      const flowTag = t.interpolation && t.interpolation !== 'off' ? ` | ${t.interpolation} FPS` : '';
      const fpsText = t.paused ? 'Пауза' : `${t.outputFps} FPS`;
      const msText = t.renderMs < 0.1 ? '< 0.1 мс' : `${t.renderMs.toFixed(1)} мс`;
      this.hudEl.textContent = `${t.srcWidth}x${t.srcHeight} -> ${t.outWidth}x${t.outHeight} | ${msText} | ${fpsText} | ${tierLabel}${flowTag}`;
    }

    destroy() {
      this._cancelHideTimer();
      if (this.resizeObserver) this.resizeObserver.disconnect();
      if (this.pipeline) this.pipeline.destroy();
      [this.canvas, this.controlsEl, this.hudEl, this.splitHandleEl, this.splitLeftLabel, this.splitRightLabel, this.toastEl]
        .forEach(el => { if (el && el.parentNode) el.parentNode.removeChild(el); });
    }
  }

  function scanAndAttach() {
    const videos = findAllVideos(document);
    videos.forEach(v => {
      if (!attachedVideos.has(v)) {
        const rect = v.getBoundingClientRect();
        // Attach once video has reasonable player size or metadata
        if (rect.width >= 120 || v.videoWidth >= 120 || v.readyState >= 1) {
          attachedVideos.set(v, new VideoEnhancerController(v));
        } else {
          v.addEventListener('loadedmetadata', () => {
            if (!attachedVideos.has(v)) {
              attachedVideos.set(v, new VideoEnhancerController(v));
            }
          }, { once: true });
        }
      }
    });

    // Prune removed videos
    for (const [v, ctrl] of attachedVideos.entries()) {
      if (!document.contains(v) && !v.isConnected) {
        ctrl.destroy();
        attachedVideos.delete(v);
      }
    }
  }

  function applySettingsToAll(newSettings) {
    currentSettings = Config.mergeSettings(newSettings);
    attachedVideos.forEach(ctrl => ctrl.applySettings(currentSettings));
  }

  function isExtensionContextValid() {
    try {
      return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function savePartialSettings(patch) {
    const updated = Config.mergeSettings({ ...currentSettings, ...patch });
    applySettingsToAll(updated);
    if (!isExtensionContextValid()) return;
    try {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          anipureSettings: updated,
          lumascaleSettings: updated
        });
      }
      chrome.runtime.sendMessage({ type: 'BROADCAST_SETTINGS', settings: updated }).catch(() => {});
    } catch (_) {
      // Extension was reloaded while this tab remained open — ignore cleanly
    }
  }

  // Load initial settings
  if (isExtensionContextValid() && chrome.storage && chrome.storage.local) {
    try {
      chrome.storage.local.get(['anipureSettings', 'lumascaleSettings'], (res) => {
        if (!isExtensionContextValid()) return;
        const s = res ? (res.anipureSettings || res.lumascaleSettings) : null;
        applySettingsToAll(s);
        scanAndAttach();
      });

      chrome.storage.onChanged.addListener((changes, area) => {
        if (!isExtensionContextValid()) return;
        if (area === 'local') {
          if (changes.anipureSettings) {
            applySettingsToAll(changes.anipureSettings.newValue);
          } else if (changes.lumascaleSettings) {
            applySettingsToAll(changes.lumascaleSettings.newValue);
          }
        }
      });

      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (!msg || !msg.type || !isExtensionContextValid()) return false;
        if (msg.type === 'SETTINGS_UPDATED') {
          applySettingsToAll(msg.settings);
          sendResponse({ ok: true });
          return false;
        }
        if (msg.type === 'GET_TELEMETRY') {
          let best = null;
          for (const ctrl of attachedVideos.values()) {
            if (ctrl.lastTelemetry) {
              best = ctrl.lastTelemetry;
              break;
            } else if (ctrl.pipeline) {
              best = ctrl.pipeline.getTelemetry();
              break;
            }
          }
          sendResponse({
            videoCount: attachedVideos.size,
            telemetry: best,
            url: window.location.href
          });
          return false;
        }
        return false;
      });
    } catch (_) {}
  } else {
    // Standalone demo page mode
    window.AniPureContentApi = {
      applySettings: applySettingsToAll,
      getSettings: () => currentSettings,
      getTelemetry: () => {
        for (const ctrl of attachedVideos.values()) {
          if (ctrl.pipeline) return ctrl.pipeline.getTelemetry();
        }
        return null;
      },
      rescan: scanAndAttach
    };
    window.LumaScaleContentApi = window.AniPureContentApi;
    scanAndAttach();
  }

  const mo = new MutationObserver(() => scanAndAttach());
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  const scanTimer = setInterval(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime && !isExtensionContextValid()) {
      clearInterval(scanTimer);
      mo.disconnect();
      return;
    }
    scanAndAttach();
  }, 2500);
})();
