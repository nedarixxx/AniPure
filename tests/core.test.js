'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Config = require('../src/shared/config.js');
const Shaders = require('../src/shared/shaders.js');
const Models = require('../src/shaders/anime4k-models.js');
const CnnRunner = require('../src/engine/cnn-runner.js');

test('AniPure v0.1.1 Core & Anime4K CNN Unit Tests', async (t) => {
  await t.test('TC-01: Manifest V3 structure, rules.json (CORS) and all files exist', () => {
    const rootDir = path.resolve(__dirname, '..');
    const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.content_scripts[0].all_frames, true);
    assert.ok(manifest.permissions.includes('declarativeNetRequest'));
    assert.ok(fs.existsSync(path.join(rootDir, 'rules.json')));
    assert.ok(fs.existsSync(path.join(rootDir, 'THIRD_PARTY_NOTICES.md')));
    assert.ok(fs.existsSync(path.join(rootDir, manifest.background.service_worker)));
    assert.ok(fs.existsSync(path.join(rootDir, manifest.action.default_popup)));
    assert.ok(fs.existsSync(path.join(rootDir, manifest.options_page)));
  });

  await t.test('TC-02: All 14 official Anime4K v4 CNN/VL/GAN models parse cleanly into GLSL ES 3.00 passes', () => {
    const keys = Object.keys(Models);
    assert.equal(keys.length, 14);
    for (const k of keys) {
      const passes = CnnRunner.parseMpvPasses(Models[k]);
      assert.ok(passes.length >= 4, `${k} should have >= 4 passes`);
      for (const p of passes) {
        const frag = CnnRunner.translatePassToFragShader(p);
        assert.ok(frag.includes('#version 300 es'));
        assert.ok(frag.includes('lsOutColor = hook();'));
      }
    }
    assert.ok(Shaders.LUMA_FUSED_FRAG_SHADER.includes('uIsCnnOutput'));
  });

  await t.test('TC-03: Target resolution calculation keeps aspect ratio and respects caps', () => {
    const d1080 = Config.computeTargetDimensions(1280, 720, '1080p', 1280, 720, 4096);
    assert.deepEqual(d1080, { width: 1920, height: 1080 });

    const d1440 = Config.computeTargetDimensions(1280, 720, '1440p', 1280, 720, 4096);
    assert.deepEqual(d1440, { width: 2560, height: 1440 });

    const dCap = Config.computeTargetDimensions(1280, 720, '2160p', 1280, 720, 2048);
    assert.ok(dCap.width <= 2048 && dCap.height <= 2048);
  });

  await t.test('TC-04: Benchmark classifier assigns Ultra + GAN Max for RTX 4060 and Eco for weak iGPU', () => {
    const rtx4060 = Config.classifyBenchmarkResult({
      fastMs: 0.2, balancedMs: 1.5, qualityMs: 6.5, ultraMs: 18.2, flowMs: 4.1
    });
    assert.equal(rtx4060.recommendedTier, 'ultra');
    assert.equal(rtx4060.recommendedMode, 'mode_gan');
    assert.equal(rtx4060.recommendedInterpolation, '60');

    const weakLaptop = Config.classifyBenchmarkResult({
      fastMs: 3.5, balancedMs: 38.0, qualityMs: 75.0, ultraMs: 160.0, flowMs: 45.0
    });
    assert.equal(weakLaptop.recommendedTier, 'fast');
    assert.equal(weakLaptop.recommendedMode, 'eco_fast');
    assert.equal(weakLaptop.recommendedInterpolation, 'off');

    const midLaptop = Config.classifyBenchmarkResult({
      fastMs: 1.8, balancedMs: 16.5, qualityMs: 45.0, ultraMs: 95.0, flowMs: 24.0
    });
    assert.equal(midLaptop.recommendedTier, 'balanced');
    assert.equal(midLaptop.recommendedMode, 'mode_lite');
  });

  await t.test('TC-05: Whitelist extraction and matching for page, domain, and parent path', () => {
    const pageEntry = Config.extractWhitelistEntry('https://animego.org/anime/frieren-123', 'page');
    const domEntry = Config.extractWhitelistEntry('https://animego.org/anime/frieren-123', 'domain');
    const pathEntry = Config.extractWhitelistEntry('https://animego.org/anime/frieren-123', 'path');

    assert.equal(Config.matchesWhitelist('https://sub.animego.org/watch/1', true, [domEntry]), true);
    assert.equal(Config.matchesWhitelist('https://other.org/watch/1', true, [domEntry]), false);
    assert.equal(Config.matchesWhitelist('https://animego.org/anime/other-456', true, [pathEntry]), true);
    assert.equal(Config.matchesWhitelist('https://animego.org/anime/frieren-123', true, [pageEntry]), true);
    assert.equal(Config.matchesWhitelist('https://anything.com/', false, []), true);
  });

  await t.test('TC-06: Auto-throttle steps down gracefully when render time exceeds budget', () => {
    const down1 = Config.evaluateAutoThrottle(22, 'ultra', 60);
    assert.equal(down1.shouldDowngrade, true);
    assert.equal(down1.nextTier, 'quality');
    assert.equal(down1.disableInterpolation, true);

    const ok = Config.evaluateAutoThrottle(12, 'balanced', 0);
    assert.equal(ok.shouldDowngrade, false);
  });

  await t.test('TC-07: Effective params select right CNN/GAN chain per tier & mode', () => {
    const ultraGan = Config.resolveEffectiveParams({ tier: 'ultra', mode: 'mode_gan' });
    assert.equal(ultraGan.useCnn, true);
    assert.deepEqual(ultraGan.cnnModels, ['Restore_CNN_Soft_VL', 'Upscale_GAN_x2_M', 'Restore_CNN_Soft_S']);

    const ultraBB = Config.resolveEffectiveParams({ tier: 'ultra', mode: 'mode_bb' });
    assert.deepEqual(ultraBB.cnnModels, ['Restore_CNN_Soft_VL', 'Upscale_CNN_x2_VL', 'Restore_CNN_Soft_S']);

    const laptopBB = Config.resolveEffectiveParams({ tier: 'balanced', mode: 'mode_bb' });
    assert.equal(laptopBB.useCnn, true);
    assert.deepEqual(laptopBB.cnnModels, ['Restore_CNN_Soft_S', 'Upscale_CNN_x2_S']);

    const eco = Config.resolveEffectiveParams({ tier: 'fast', mode: 'eco_fast' });
    assert.equal(eco.useCnn, false);
    assert.deepEqual(eco.cnnModels, []);
  });

  await t.test('TC-08: Color profiles and anti-flash resolve accurately', () => {
    assert.equal(Object.keys(Config.COLOR_PROFILES).length, 6);
    const cinema = Config.resolveEffectiveParams({
      tier: 'ultra',
      mode: 'mode_gan',
      colorProfile: 'cinema',
      antiFlash: true
    });
    assert.equal(cinema.colorProfileId, 'cinema');
    assert.equal(cinema.colorProfileIndex, 4);
    assert.equal(cinema.antiFlash, true);
    assert.ok(Shaders.LUMA_FUSED_FRAG_SHADER.includes('applyColorProfile'));
    assert.ok(Shaders.LUMA_FUSED_FRAG_SHADER.includes('applyAntiFlash'));
  });
});
