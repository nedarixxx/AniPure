(function (root) {
  'use strict';

  const CNN_VERT_SHADER = `#version 300 es
precision highp float;

in vec2 aPos;
uniform float uFlipY;
out vec2 vUv;

void main() {
  vec2 uv = aPos * 0.5 + 0.5;
  vUv = vec2(uv.x, mix(uv.y, 1.0 - uv.y, uFlipY));
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

  function parseMpvPasses(glslSource) {
    const blocks = glslSource.split(/(?=^\/\/!DESC )/m).map(s => s.trim()).filter(Boolean);
    const passes = [];

    for (const block of blocks) {
      const lines = block.split(/\r?\n/);
      let desc = '';
      const binds = [];
      let save = 'MAIN';
      let widthRef = 'MAIN';
      let scaleX = 1;
      let scaleY = 1;
      const bodyLines = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('//!DESC ')) {
          desc = trimmed.slice(8).trim();
        } else if (trimmed.startsWith('//!BIND ')) {
          const name = trimmed.slice(8).trim();
          if (name && !binds.includes(name)) binds.push(name);
        } else if (trimmed.startsWith('//!SAVE ')) {
          save = trimmed.slice(8).trim();
        } else if (trimmed.startsWith('//!WIDTH ')) {
          const expr = trimmed.slice(9).trim();
          const m = expr.match(/^(\S+)\.w(?:\s+(\d+)\s*\*)?$/);
          if (m) {
            widthRef = m[1];
            scaleX = m[2] ? parseInt(m[2], 10) : 1;
          }
        } else if (trimmed.startsWith('//!HEIGHT ')) {
          const expr = trimmed.slice(10).trim();
          const m = expr.match(/^(\S+)\.h(?:\s+(\d+)\s*\*)?$/);
          if (m) {
            scaleY = m[2] ? parseInt(m[2], 10) : 1;
          }
        } else if (trimmed.startsWith('//!')) {
          // Ignore //!HOOK, //!COMPONENTS, //!WHEN (we control invocation explicitly)
        } else {
          bodyLines.push(line);
        }
      }

      passes.push({
        desc,
        binds,
        save,
        widthRef,
        scaleX,
        scaleY,
        body: bodyLines.join('\n')
      });
    }

    return passes;
  }

  function translatePassToFragShader(pass) {
    const header = [
      '#version 300 es',
      'precision highp float;',
      'in vec2 vUv;',
      'out vec4 lsOutColor;'
    ];

    for (const b of pass.binds) {
      header.push(`uniform sampler2D u_${b};`);
      header.push(`uniform vec2 u_${b}_size;`);
      header.push(`uniform vec2 u_${b}_pt;`);
      header.push(`#define ${b}_pos vUv`);
      header.push(`#define ${b}_size u_${b}_size`);
      header.push(`#define ${b}_pt u_${b}_pt`);
      header.push(`#define ${b}_tex(p) texture(u_${b}, (p))`);
      header.push(`#define ${b}_texOff(off) texture(u_${b}, vUv + (off) * u_${b}_pt)`);
    }

    header.push(pass.body);
    header.push('void main() { lsOutColor = hook(); }');
    return header.join('\n');
  }

  class Anime4KCNNRunner {
    constructor(gl, quadVao) {
      this.gl = gl;
      this.vao = quadVao;
      this.extFloat = gl.getExtension('EXT_color_buffer_float');
      this.extHalfFloat = gl.getExtension('EXT_color_buffer_half_float');
      this.supported = Boolean(this.extFloat || this.extHalfFloat);

      this.vertShader = null;
      this.modelCache = new Map(); // modelKey -> compiled passes array
      this.pool = new Map();       // "WxH" -> array of free { tex, fbo, w, h }
      this.allSlots = [];
      this.inputCopyProg = null;

      if (this.supported) {
        this._initBase();
      }
    }

    _initBase() {
      const gl = this.gl;
      this.vertShader = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(this.vertShader, CNN_VERT_SHADER);
      gl.compileShader(this.vertShader);
      if (!gl.getShaderParameter(this.vertShader, gl.COMPILE_STATUS)) {
        throw new Error('CNN vertex shader error: ' + gl.getShaderInfoLog(this.vertShader));
      }

      // Simple copy shader to orient flipped video input cleanly into an RGBA16F MAIN tensor
      const copyFrag = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
out vec4 lsOutColor;
void main() { lsOutColor = texture(uSrc, vUv); }`;
      this.inputCopyProg = this._linkProgram(copyFrag);
    }

    _linkProgram(fragSrc) {
      const gl = this.gl;
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, fragSrc);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(fs);
        gl.deleteShader(fs);
        throw new Error('CNN frag compile error: ' + log);
      }
      const prog = gl.createProgram();
      gl.attachShader(prog, this.vertShader);
      gl.attachShader(prog, fs);
      gl.bindAttribLocation(prog, 0, 'aPos');
      gl.linkProgram(prog);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(prog);
        gl.deleteProgram(prog);
        throw new Error('CNN program link error: ' + log);
      }
      return prog;
    }

    _getCompiledModel(modelKey) {
      if (this.modelCache.has(modelKey)) {
        return this.modelCache.get(modelKey);
      }
      const registry = root.LumaScaleAnime4KModels;
      if (!registry || !registry[modelKey]) {
        throw new Error('Unknown Anime4K CNN model: ' + modelKey);
      }
      const parsed = parseMpvPasses(registry[modelKey]);
      const gl = this.gl;

      // Lifetime analysis: find the last pass index that reads each intermediate tensor
      const lastRead = {};
      parsed.forEach((p, idx) => {
        p.binds.forEach(b => {
          if (b !== 'MAIN') lastRead[b] = idx;
        });
      });

      const compiled = parsed.map((p, idx) => {
        const fragSrc = translatePassToFragShader(p);
        const prog = this._linkProgram(fragSrc);
        const uniforms = {
          uFlipY: gl.getUniformLocation(prog, 'uFlipY'),
          binds: p.binds.map(b => ({
            name: b,
            tex: gl.getUniformLocation(prog, `u_${b}`),
            size: gl.getUniformLocation(prog, `u_${b}_size`),
            pt: gl.getUniformLocation(prog, `u_${b}_pt`)
          }))
        };
        const releaseAfter = [];
        for (const [tName, endIdx] of Object.entries(lastRead)) {
          if (endIdx === idx) releaseAfter.push(tName);
        }
        return {
          ...p,
          prog,
          uniforms,
          releaseAfter
        };
      });

      this.modelCache.set(modelKey, compiled);
      return compiled;
    }

    _acquireSlot(w, h) {
      const key = `${w}x${h}`;
      const bucket = this.pool.get(key);
      if (bucket && bucket.length > 0) {
        return bucket.pop();
      }

      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);

      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      const slot = { tex, fbo, w, h, key };
      this.allSlots.push(slot);
      return slot;
    }

    _releaseSlot(slot) {
      if (!slot) return;
      if (!this.pool.has(slot.key)) this.pool.set(slot.key, []);
      this.pool.get(slot.key).push(slot);
    }

    clearPool() {
      const gl = this.gl;
      for (const s of this.allSlots) {
        gl.deleteTexture(s.tex);
        gl.deleteFramebuffer(s.fbo);
      }
      this.allSlots = [];
      this.pool.clear();
    }

    // Runs a chain of Anime4K v4 CNN models (e.g. ['Restore_CNN_Soft_L', 'Upscale_CNN_x2_L'])
    // Returns { tex, width, height, release() }
    runChain(inputTex, srcW, srcH, inputIsFlipped, modelKeys, maxTexSize) {
      if (!this.supported || !Array.isArray(modelKeys) || modelKeys.length === 0) {
        return null;
      }

      const gl = this.gl;
      const cap = maxTexSize || 4096;
      gl.bindVertexArray(this.vao);

      // Copy & orient input video frame into initial RGBA16F MAIN slot
      let mainSlot = this._acquireSlot(srcW, srcH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, mainSlot.fbo);
      gl.viewport(0, 0, srcW, srcH);
      gl.useProgram(this.inputCopyProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, inputTex);
      gl.uniform1i(gl.getUniformLocation(this.inputCopyProg, 'uSrc'), 0);
      gl.uniform1f(gl.getUniformLocation(this.inputCopyProg, 'uFlipY'), inputIsFlipped ? 1.0 : 0.0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      for (const modelKey of modelKeys) {
        const passes = this._getCompiledModel(modelKey);
        const tensors = { MAIN: mainSlot };

        for (let i = 0; i < passes.length; i++) {
          const p = passes[i];
          const ref = tensors[p.widthRef] || tensors.MAIN;
          const outW = Math.min(cap, ref.w * p.scaleX);
          const outH = Math.min(cap, ref.h * p.scaleY);

          const outSlot = this._acquireSlot(outW, outH);

          gl.bindFramebuffer(gl.FRAMEBUFFER, outSlot.fbo);
          gl.viewport(0, 0, outW, outH);
          gl.useProgram(p.prog);
          gl.uniform1f(p.uniforms.uFlipY, 0.0);

          for (let unit = 0; unit < p.uniforms.binds.length; unit++) {
            const bInfo = p.uniforms.binds[unit];
            const tSlot = tensors[bInfo.name];
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, tSlot.tex);
            gl.uniform1i(bInfo.tex, unit);
            if (bInfo.size) gl.uniform2f(bInfo.size, tSlot.w, tSlot.h);
            if (bInfo.pt) gl.uniform2f(bInfo.pt, 1.0 / tSlot.w, 1.0 / tSlot.h);
          }

          gl.drawArrays(gl.TRIANGLES, 0, 6);

          // If saving over MAIN (or existing tensor), release old slot safely AFTER draw!
          const prev = tensors[p.save];
          tensors[p.save] = outSlot;
          if (prev && prev !== outSlot) {
            this._releaseSlot(prev);
          }

          // Immediately recycle dead intermediate tensors back into the pool!
          for (const deadName of p.releaseAfter) {
            if (deadName !== 'MAIN' && tensors[deadName]) {
              this._releaseSlot(tensors[deadName]);
              delete tensors[deadName];
            }
          }
        }

        mainSlot = tensors.MAIN;
        // Safety sweep any leftover non-MAIN slots
        for (const [k, slot] of Object.entries(tensors)) {
          if (k !== 'MAIN') this._releaseSlot(slot);
        }
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return {
        tex: mainSlot.tex,
        width: mainSlot.w,
        height: mainSlot.h,
        release: () => this._releaseSlot(mainSlot)
      };
    }

    destroy() {
      const gl = this.gl;
      this.clearPool();
      for (const passes of this.modelCache.values()) {
        for (const p of passes) gl.deleteProgram(p.prog);
      }
      this.modelCache.clear();
      if (this.inputCopyProg) gl.deleteProgram(this.inputCopyProg);
      if (this.vertShader) gl.deleteShader(this.vertShader);
    }
  }

  const api = {
    parseMpvPasses,
    translatePassToFragShader,
    Anime4KCNNRunner
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LumaScaleCNNRunner = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
