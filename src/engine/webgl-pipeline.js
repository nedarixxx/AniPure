(function (root) {
  'use strict';

  class WebGLVideoPipeline {
    constructor(videoEl, canvasEl, settings, callbacks) {
      this.video = videoEl;
      this.canvas = canvasEl;
      this.settings = root.LumaScaleConfig.mergeSettings(settings);
      this.callbacks = callbacks || {};

      this.gl = null;
      this.programs = {};
      this.vao = null;
      this.textures = {};
      this.fbos = {};
      this.cnnRunner = null;

      this.srcW = 0;
      this.srcH = 0;
      this.outW = 0;
      this.outH = 0;
      this.maxTexSize = 4096;

      this.running = false;
      this.destroyed = false;
      this.corsBlocked = false;

      // Frame tracking & optical flow timing
      this.hasPrevFrame = false;
      this.lastVideoTime = -1;
      this.lastFrameTimestamp = 0;
      this.estimatedVideoIntervalMs = 41.67;
      this.lastDrawTimestamp = 0;
      this.rafId = null;
      this.rvfcId = null;

      // Telemetry
      this.avgRenderMs = 0;
      this.renderedFramesInSec = 0;
      this.fpsWindowStart = performance.now();
      this.currentOutputFps = 0;
      this.sourceVideoFps = 24;
      this.sourceFramesInSec = 0;
      this.sourceFpsWindowStart = performance.now();
      this.overBudgetStreak = 0;
      this.gpuRenderer = 'WebGL2';

      this._initGL();
    }

    _initGL() {
      const tier = this.settings.tier;
      const gl = this.canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
        desynchronized: true,
        powerPreference: (tier === 'ultra' || tier === 'quality') ? 'high-performance' : 'default'
      });

      if (!gl) {
        throw new Error('WebGL2 не поддерживается этим браузером или видеокартой.');
      }

      this.gl = gl;
      this.maxTexSize = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096);

      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        this.gpuRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || 'WebGL2 GPU';
      }

      const sh = root.LumaScaleShaders;
      this.programs.fused = this._createProgram(sh.QUAD_VERTEX_SHADER, sh.LUMA_FUSED_FRAG_SHADER);
      this.programs.interp = this._createProgram(sh.QUAD_VERTEX_SHADER, sh.INTERPOLATION_FRAG_SHADER);

      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,  1, -1, -1,  1,
        -1,  1,  1, -1,  1,  1
      ]), gl.STATIC_DRAW);

      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      this.vao = vao;
      this.quadBuffer = buf;

      this.textures.curr = this._createTexture();
      this.textures.prev = this._createTexture();
      this.textures.interp = this._createTexture();
      this.fbos.interp = gl.createFramebuffer();

      if (root.LumaScaleCNNRunner && root.LumaScaleAnime4KModels) {
        this.cnnRunner = new root.LumaScaleCNNRunner.Anime4KCNNRunner(gl, this.vao);
      }
    }

    _compileShader(type, src) {
      const gl = this.gl;
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error('Ошибка компиляции шейдера: ' + log);
      }
      return sh;
    }

    _createProgram(vsSrc, fsSrc) {
      const gl = this.gl;
      const vs = this._compileShader(gl.VERTEX_SHADER, vsSrc);
      const fs = this._compileShader(gl.FRAGMENT_SHADER, fsSrc);
      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.bindAttribLocation(prog, 0, 'aPos');
      gl.linkProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(prog);
        gl.deleteProgram(prog);
        throw new Error('Ошибка линковки программы: ' + log);
      }
      return prog;
    }

    _createTexture() {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return tex;
    }

    _ensureDimensions() {
      const sw = this.video.videoWidth;
      const sh = this.video.videoHeight;
      if (!sw || !sh) return false;

      const rect = this.video.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const dispW = Math.round(rect.width * dpr);
      const dispH = Math.round(rect.height * dpr);

      const dims = root.LumaScaleConfig.computeTargetDimensions(
        sw, sh, this.settings.resolution, dispW, dispH, this.maxTexSize
      );

      if (sw !== this.srcW || sh !== this.srcH) {
        this.srcW = sw;
        this.srcH = sh;
        this.hasPrevFrame = false;
        this._allocFboTexture(this.textures.interp, this.fbos.interp, sw, sh);
        if (this.cnnRunner) this.cnnRunner.clearPool();
      }

      if (dims.width !== this.outW || dims.height !== this.outH) {
        this.outW = dims.width;
        this.outH = dims.height;
        this.canvas.width = dims.width;
        this.canvas.height = dims.height;
      }

      return true;
    }

    _allocFboTexture(tex, fbo, w, h) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    refreshCurrentFrame() {
      if (!this.running || this.destroyed) return;
      if (this._captureNewVideoFrame(performance.now())) {
        this.renderFrame(1.0, false);
      }
    }

    captureCleanScreenshot() {
      if (!this.gl || this.destroyed || !this.hasPrevFrame || this.corsBlocked) {
        return Promise.reject(new Error('Видеопоток недоступен'));
      }
      this.renderFrame(1.0, false);
      return new Promise((resolve, reject) => {
        this.canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Не удалось сформировать изображение'));
        }, 'image/png');
      });
    }

    updateSettings(newSettings) {
      const prevInterp = this.settings.interpolation;
      this.settings = root.LumaScaleConfig.mergeSettings(newSettings);
      this.overBudgetStreak = 0;

      if (this.running) {
        const nextInterp = this.settings.interpolation;
        if (prevInterp !== nextInterp) {
          this._restartLoop();
        } else {
          this.renderFrame(1.0, false);
        }
      }
    }

    start() {
      if (this.running || this.destroyed) return;
      this.running = true;
      this._startLoops();
    }

    stop() {
      this.running = false;
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      if (this.rvfcId !== null && typeof this.video.cancelVideoFrameCallback === 'function') {
        this.video.cancelVideoFrameCallback(this.rvfcId);
        this.rvfcId = null;
      }
    }

    _restartLoop() {
      this.stop();
      this.running = true;
      this._startLoops();
    }

    _startLoops() {
      const eff = root.LumaScaleConfig.resolveEffectiveParams(this.settings);
      const useRvfc = typeof this.video.requestVideoFrameCallback === 'function';

      if (useRvfc) {
        const onVideoFrame = (now) => {
          if (!this.running || this.destroyed) return;
          this._captureNewVideoFrame(now);
          if (eff.targetFps === 0) {
            this.renderFrame(1.0, false);
          }
          this.rvfcId = this.video.requestVideoFrameCallback(onVideoFrame);
        };
        this.rvfcId = this.video.requestVideoFrameCallback(onVideoFrame);
      }

      if (eff.targetFps > 0 || !useRvfc) {
        const onRaf = (now) => {
          if (!this.running || this.destroyed) return;

          if (!useRvfc) {
            if (this.video.currentTime !== this.lastVideoTime) {
              this.lastVideoTime = this.video.currentTime;
              this._captureNewVideoFrame(now);
              if (eff.targetFps === 0) {
                this.renderFrame(1.0, false);
              }
            }
          }

          if (eff.targetFps > 0 && !this.video.paused && this.hasPrevFrame) {
            const minFrameDelta = 1000 / eff.targetFps;
            if (now - this.lastDrawTimestamp >= minFrameDelta * 0.88) {
              const elapsed = now - this.lastFrameTimestamp;
              const alpha = root.LumaScaleConfig.clamp(elapsed / Math.max(16, this.estimatedVideoIntervalMs), 0.0, 1.0);
              this.renderFrame(alpha, true);
              this.lastDrawTimestamp = now;
            }
          }

          this.rafId = requestAnimationFrame(onRaf);
        };
        this.rafId = requestAnimationFrame(onRaf);
      }

      if (this.video.readyState >= 2) {
        this._captureNewVideoFrame(performance.now());
        this.renderFrame(1.0, false);
      }
    }

    _captureNewVideoFrame(now) {
      if (!this.video || this.video.readyState < 2) return false;
      if (!this._ensureDimensions()) return false;

      if (this.lastFrameTimestamp > 0) {
        const dt = now - this.lastFrameTimestamp;
        if (dt >= 12 && dt <= 120) {
          this.estimatedVideoIntervalMs = this.estimatedVideoIntervalMs * 0.8 + dt * 0.2;
        }
      }
      this.lastFrameTimestamp = now;

      this.sourceFramesInSec++;
      if (now - this.sourceFpsWindowStart >= 1000) {
        this.sourceVideoFps = Math.round((this.sourceFramesInSec * 1000) / (now - this.sourceFpsWindowStart));
        this.sourceFramesInSec = 0;
        this.sourceFpsWindowStart = now;
      }

      const gl = this.gl;
      if (this.hasPrevFrame) {
        const tmp = this.textures.prev;
        this.textures.prev = this.textures.curr;
        this.textures.curr = tmp;
      }

      try {
        gl.bindTexture(gl.TEXTURE_2D, this.textures.curr);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
        if (!this.hasPrevFrame) {
          gl.bindTexture(gl.TEXTURE_2D, this.textures.prev);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
          this.hasPrevFrame = true;
        }
        this.corsBlocked = false;
        return true;
      } catch (err) {
        if (err && err.name === 'SecurityError') {
          this.corsBlocked = true;
          if (this.callbacks.onCorsBlocked) this.callbacks.onCorsBlocked();
        }
        return false;
      }
    }

    renderFrame(alpha, useInterpolation) {
      if (!this.gl || this.destroyed || !this.hasPrevFrame || this.corsBlocked) return;
      if (!this._ensureDimensions()) return;

      const t0 = performance.now();
      const gl = this.gl;
      const eff = root.LumaScaleConfig.resolveEffectiveParams(this.settings);
      const srcTexel = [1.0 / this.srcW, 1.0 / this.srcH];

      gl.bindVertexArray(this.vao);

      // Step 0: Optional Motion-Compensated Frame Interpolation (24 -> 48/60 FPS)
      let workingTex = this.textures.curr;
      let workingIsFlipped = true;

      if (useInterpolation && eff.targetFps > 0 && alpha < 0.98) {
        const prog = this.programs.interp;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.interp);
        gl.viewport(0, 0, this.srcW, this.srcH);
        gl.useProgram(prog);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.textures.prev);
        gl.uniform1i(gl.getUniformLocation(prog, 'uPrevTex'), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.textures.curr);
        gl.uniform1i(gl.getUniformLocation(prog, 'uCurrTex'), 1);

        gl.uniform1f(gl.getUniformLocation(prog, 'uFlipY'), 1.0);
        gl.uniform1f(gl.getUniformLocation(prog, 'uOrigFlipY'), 1.0);
        gl.uniform2f(gl.getUniformLocation(prog, 'uTexelSize'), srcTexel[0], srcTexel[1]);
        gl.uniform1f(gl.getUniformLocation(prog, 'uAlpha'), alpha);
        gl.uniform1f(gl.getUniformLocation(prog, 'uMotionStrength'), eff.interpolationStrength);
        gl.uniform1f(gl.getUniformLocation(prog, 'uSceneCutThreshold'), eff.sceneCutThreshold);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        workingTex = this.textures.interp;
        workingIsFlipped = false;
      }

      const origForSplitTex = workingTex;
      const origIsFlipped = workingIsFlipped;

      // Step 1: Real Trained Anime4K v4 CNN Neural Super-Resolution (RGBA16F)
      let cnnResult = null;
      let finalTex = workingTex;
      let finalFlipY = workingIsFlipped ? 1.0 : 0.0;
      let finalTexelW = srcTexel[0];
      let finalTexelH = srcTexel[1];
      let isCnn = false;

      if (eff.useCnn && this.cnnRunner && this.cnnRunner.supported) {
        cnnResult = this.cnnRunner.runChain(
          workingTex,
          this.srcW,
          this.srcH,
          workingIsFlipped,
          eff.cnnModels,
          this.maxTexSize
        );
        if (cnnResult) {
          finalTex = cnnResult.tex;
          finalFlipY = 0.0;
          finalTexelW = 1.0 / cnnResult.width;
          finalTexelH = 1.0 / cnnResult.height;
          isCnn = true;
        }
      }

      // Step 2: Final Output Pass (Clamp Highlights + optional CAS/Black/Vibrance + Split-Screen)
      const fProg = this.programs.fused;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.outW, this.outH);
      gl.useProgram(fProg);
      gl.bindVertexArray(this.vao);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, finalTex);
      gl.uniform1i(gl.getUniformLocation(fProg, 'uTex'), 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, origForSplitTex);
      gl.uniform1i(gl.getUniformLocation(fProg, 'uOrigTex'), 1);

      gl.uniform1f(gl.getUniformLocation(fProg, 'uFlipY'), finalFlipY);
      gl.uniform1f(gl.getUniformLocation(fProg, 'uOrigFlipY'), origIsFlipped ? 1.0 : 0.0);
      gl.uniform1f(gl.getUniformLocation(fProg, 'uIsPreUpscaled'), isCnn ? 1.0 : 0.0);
      gl.uniform1f(gl.getUniformLocation(fProg, 'uIsCnnOutput'), isCnn ? 1.0 : 0.0);
      gl.uniform2f(gl.getUniformLocation(fProg, 'uTexelSize'), finalTexelW, finalTexelH);
      gl.uniform2f(gl.getUniformLocation(fProg, 'uOrigTexelSize'), srcTexel[0], srcTexel[1]);
      gl.uniform1f(gl.getUniformLocation(fProg, 'uCasStrength'), eff.casStrength);
      gl.uniform1f(gl.getUniformLocation(fProg, 'uLineEnhance'), eff.lineEnhance);
      gl.uniform1f(gl.getUniformLocation(fProg, 'uDebandStrength'), isCnn ? 0.0 : eff.debandStrength);
      gl.uniform1f(gl.getUniformLocation(fProg, 'uDeringStrength'), eff.deringStrength);
      gl.uniform1f(gl.getUniformLocation(fProg, 'uBlackLevelFix'), eff.blackLevelFix ? 1.0 : 0.0);
      gl.uniform1f(gl.getUniformLocation(fProg, 'uVibrance'), eff.vibrance);
      gl.uniform1f(gl.getUniformLocation(fProg, 'uColorProfile'), eff.colorProfileIndex);
      gl.uniform1f(gl.getUniformLocation(fProg, 'uAntiFlash'), eff.antiFlash ? 1.0 : 0.0);
      gl.uniform1f(gl.getUniformLocation(fProg, 'uVignette'), eff.vignette || 0.0);
      gl.uniform1f(gl.getUniformLocation(fProg, 'uSplitScreen'), this.settings.splitScreen ? 1.0 : 0.0);
      gl.uniform1f(gl.getUniformLocation(fProg, 'uSplitPos'), this.settings.splitPosition);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);

      if (cnnResult) cnnResult.release();

      // Telemetry
      const dt = performance.now() - t0;
      this.avgRenderMs = this.avgRenderMs === 0 ? dt : this.avgRenderMs * 0.85 + dt * 0.15;

      const now = performance.now();
      this.renderedFramesInSec++;
      if (now - this.fpsWindowStart >= 1000) {
        this.currentOutputFps = Math.round((this.renderedFramesInSec * 1000) / (now - this.fpsWindowStart));
        this.renderedFramesInSec = 0;
        this.fpsWindowStart = now;

        if (this.callbacks.onTelemetry) {
          this.callbacks.onTelemetry(this.getTelemetry());
        }

        if (this.settings.autoThrottle && !this.video.paused) {
          const check = root.LumaScaleConfig.evaluateAutoThrottle(
            this.avgRenderMs,
            this.settings.tier,
            eff.targetFps
          );
          if (check.shouldDowngrade) {
            this.overBudgetStreak++;
            if (this.overBudgetStreak >= 3 && this.callbacks.onAutoThrottle) {
              this.overBudgetStreak = 0;
              this.callbacks.onAutoThrottle(check);
            }
          } else {
            this.overBudgetStreak = 0;
          }
        }
      }
    }

    getTelemetry() {
      return {
        srcWidth: this.srcW,
        srcHeight: this.srcH,
        outWidth: this.outW,
        outHeight: this.outH,
        renderMs: Number(this.avgRenderMs.toFixed(2)),
        outputFps: this.currentOutputFps,
        sourceFps: this.sourceVideoFps,
        paused: Boolean(this.video && this.video.paused),
        tier: this.settings.tier,
        mode: this.settings.mode,
        interpolation: this.settings.interpolation,
        cnnActive: Boolean(this.cnnRunner && this.cnnRunner.supported),
        gpuRenderer: this.gpuRenderer,
        corsBlocked: this.corsBlocked
      };
    }

    destroy() {
      this.stop();
      this.destroyed = true;
      if (this.cnnRunner) {
        this.cnnRunner.destroy();
        this.cnnRunner = null;
      }
      if (this.gl) {
        const gl = this.gl;
        Object.values(this.textures).forEach(t => gl.deleteTexture(t));
        Object.values(this.fbos).forEach(f => gl.deleteFramebuffer(f));
        Object.values(this.programs).forEach(p => gl.deleteProgram(p));
        if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
        if (this.vao) gl.deleteVertexArray(this.vao);
      }
      this.gl = null;
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WebGLVideoPipeline };
  } else {
    root.WebGLVideoPipeline = WebGLVideoPipeline;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
