(function (root) {
  'use strict';

  function createSyntheticAnimeCanvas(width, height, shiftX) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#2a4b7c');
    grad.addColorStop(0.55, '#6897c8');
    grad.addColorStop(1, '#d9cbb8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#f2ede6';
    ctx.beginPath();
    ctx.arc(width * 0.25 + shiftX, height * 0.32, 90, 0, Math.PI * 2);
    ctx.arc(width * 0.33 + shiftX, height * 0.29, 110, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#14171f';
    ctx.lineWidth = 4;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(80 + i * 140 + shiftX, height * 0.45);
      ctx.lineTo(160 + i * 140 + shiftX, height * 0.88);
      ctx.stroke();
    }

    ctx.fillStyle = '#e8c4a8';
    ctx.beginPath();
    ctx.arc(width * 0.52 + shiftX, height * 0.56, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.stroke();

    return c;
  }

  function compileProgram(gl, vsSrc, fsSrc) {
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  function makeTexture(gl, sourceCanvas) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (sourceCanvas) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
    }
    return tex;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function runGpuBenchmark(onProgress) {
    const report = (step, total, text) => {
      if (typeof onProgress === 'function') onProgress(step, total, text);
    };

    report(0, 5, 'Инициализация WebGL2 и нейросетевого движка Anime4K v4...');
    await sleep(60);

    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: 'high-performance'
    });

    if (!gl) {
      throw new Error('WebGL2 недоступен. Проверьте аппаратное ускорение в настройках Chrome.');
    }

    let renderer = 'WebGL2 GPU';
    let vendor = 'Unknown';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || renderer;
      vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || vendor;
    }
    const maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;

    const sh = root.LumaScaleShaders;
    const pFused = compileProgram(gl, sh.QUAD_VERTEX_SHADER, sh.LUMA_FUSED_FRAG_SHADER);
    const pInterp = compileProgram(gl, sh.QUAD_VERTEX_SHADER, sh.INTERPOLATION_FRAG_SHADER);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const cnnRunner = new root.LumaScaleCNNRunner.Anime4KCNNRunner(gl, vao);

    const srcW = 1280;
    const srcH = 720;
    const texPrev = makeTexture(gl, createSyntheticAnimeCanvas(srcW, srcH, 0));
    const texCurr = makeTexture(gl, createSyntheticAnimeCanvas(srcW, srcH, 10));
    const texMid = makeTexture(gl, null);
    gl.bindTexture(gl.TEXTURE_2D, texMid);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, srcW, srcH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fboMid = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboMid);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texMid, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const drawFused = (tex, flipY, isCnn, tw, th, outW, outH) => {
      canvas.width = outW;
      canvas.height = outH;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, outW, outH);
      gl.useProgram(pFused);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(gl.getUniformLocation(pFused, 'uTex'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texCurr);
      gl.uniform1i(gl.getUniformLocation(pFused, 'uOrigTex'), 1);
      gl.uniform1f(gl.getUniformLocation(pFused, 'uFlipY'), flipY);
      gl.uniform1f(gl.getUniformLocation(pFused, 'uOrigFlipY'), 1.0);
      gl.uniform1f(gl.getUniformLocation(pFused, 'uIsPreUpscaled'), isCnn ? 1.0 : 0.0);
      gl.uniform1f(gl.getUniformLocation(pFused, 'uIsCnnOutput'), isCnn ? 1.0 : 0.0);
      gl.uniform2f(gl.getUniformLocation(pFused, 'uTexelSize'), 1 / tw, 1 / th);
      gl.uniform2f(gl.getUniformLocation(pFused, 'uOrigTexelSize'), 1 / srcW, 1 / srcH);
      gl.uniform1f(gl.getUniformLocation(pFused, 'uCasStrength'), isCnn ? 0.36 : 0.72);
      gl.uniform1f(gl.getUniformLocation(pFused, 'uLineEnhance'), isCnn ? 0.20 : 0.55);
      gl.uniform1f(gl.getUniformLocation(pFused, 'uDebandStrength'), isCnn ? 0.0 : 0.25);
      gl.uniform1f(gl.getUniformLocation(pFused, 'uDeringStrength'), 0.75);
      gl.uniform1f(gl.getUniformLocation(pFused, 'uBlackLevelFix'), 1.0);
      gl.uniform1f(gl.getUniformLocation(pFused, 'uVibrance'), 0.05);
      gl.uniform1f(gl.getUniformLocation(pFused, 'uColorProfile'), 1.0);
      gl.uniform1f(gl.getUniformLocation(pFused, 'uAntiFlash'), 0.0);
      gl.uniform1f(gl.getUniformLocation(pFused, 'uVignette'), 0.0);
      gl.uniform1f(gl.getUniformLocation(pFused, 'uSplitScreen'), 0.0);
      gl.uniform1f(gl.getUniformLocation(pFused, 'uSplitPos'), 0.5);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const drawFlow = () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboMid);
      gl.viewport(0, 0, srcW, srcH);
      gl.useProgram(pInterp);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texPrev);
      gl.uniform1i(gl.getUniformLocation(pInterp, 'uPrevTex'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texCurr);
      gl.uniform1i(gl.getUniformLocation(pInterp, 'uCurrTex'), 1);
      gl.uniform1f(gl.getUniformLocation(pInterp, 'uFlipY'), 1.0);
      gl.uniform1f(gl.getUniformLocation(pInterp, 'uOrigFlipY'), 1.0);
      gl.uniform2f(gl.getUniformLocation(pInterp, 'uTexelSize'), 1 / srcW, 1 / srcH);
      gl.uniform1f(gl.getUniformLocation(pInterp, 'uAlpha'), 0.5);
      gl.uniform1f(gl.getUniformLocation(pInterp, 'uMotionStrength'), 0.8);
      gl.uniform1f(gl.getUniformLocation(pInterp, 'uSceneCutThreshold'), 0.16);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const runCnnStep = (models, outW, outH) => {
      if (!cnnRunner.supported) {
        drawFused(texCurr, 1.0, false, srcW, srcH, outW, outH);
        return;
      }
      const res = cnnRunner.runChain(texCurr, srcW, srcH, true, models, maxTexSize);
      drawFused(res.tex, 0.0, true, res.width, res.height, outW, outH);
      res.release();
    };

    const syncPixel = new Uint8Array(4);
    const gpuSync = () => {
      gl.finish();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPixel);
    };

    const measure = (iters, fn) => {
      // Shader compilation and GPU pipeline warmup
      for (let i = 0; i < 2; i++) fn();
      gpuSync();
      const t0 = performance.now();
      for (let i = 0; i < iters; i++) fn();
      gpuSync();
      return Number(((performance.now() - t0) / iters).toFixed(2));
    };

    report(1, 5, 'Тест 1/5: Экономный режим (1 проход, Full HD)...');
    await sleep(40);
    const fastMs = measure(12, () => drawFused(texCurr, 1.0, false, srcW, srcH, 1920, 1080));

    report(2, 5, 'Тест 2/5: Лёгкая нейросеть Anime4K S (для ноутбуков)...');
    await sleep(40);
    const balancedMs = measure(8, () => runCnnStep(['Restore_CNN_Soft_S', 'Upscale_CNN_x2_S'], 1920, 1080));

    report(3, 5, 'Тест 3/5: Нейросеть Качество CNN L (2K)...');
    await sleep(40);
    const qualityMs = measure(5, () => runCnnStep(['Restore_CNN_Soft_L', 'Upscale_CNN_x2_L'], 2560, 1440));

    report(4, 5, 'Тест 4/5: Нейросеть Ультра GAN + VL (2K максимум)...');
    await sleep(40);
    const ultraMs = measure(4, () => runCnnStep(['Restore_CNN_Soft_VL', 'Upscale_GAN_x2_M', 'Restore_CNN_Soft_S'], 2560, 1440));

    report(5, 5, 'Тест 5/5: Плавность видео 60 FPS + нейросеть...');
    await sleep(40);
    const flowMs = measure(6, () => {
      drawFlow();
      runCnnStep(['Restore_CNN_Soft_S', 'Upscale_CNN_x2_S'], 1920, 1080);
    });

    cnnRunner.destroy();
    [texPrev, texCurr, texMid].forEach(t => gl.deleteTexture(t));
    gl.deleteFramebuffer(fboMid);
    gl.deleteProgram(pFused);
    gl.deleteProgram(pInterp);
    gl.deleteBuffer(vbo);
    gl.deleteVertexArray(vao);

    const scores = { fastMs, balancedMs, qualityMs, ultraMs, flowMs };
    const conf = root.AniPureConfig || root.LumaScaleConfig;
    const classification = conf.classifyBenchmarkResult(scores);

    return {
      renderer,
      vendor,
      maxTexSize,
      cnnSupported: cnnRunner.supported,
      scores,
      ...classification,
      testedAt: new Date().toISOString()
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runGpuBenchmark };
  } else {
    root.AniPureBenchmark = { runGpuBenchmark };
    root.LumaScaleBenchmark = root.AniPureBenchmark;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
