'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const BASE = 'https://raw.githubusercontent.com/bloc97/Anime4K/master/glsl/';
const MODELS = {
  Restore_CNN_S: 'Restore/Anime4K_Restore_CNN_S.glsl',
  Restore_CNN_M: 'Restore/Anime4K_Restore_CNN_M.glsl',
  Restore_CNN_L: 'Restore/Anime4K_Restore_CNN_L.glsl',
  Restore_CNN_VL: 'Restore/Anime4K_Restore_CNN_VL.glsl',
  Restore_CNN_Soft_S: 'Restore/Anime4K_Restore_CNN_Soft_S.glsl',
  Restore_CNN_Soft_M: 'Restore/Anime4K_Restore_CNN_Soft_M.glsl',
  Restore_CNN_Soft_L: 'Restore/Anime4K_Restore_CNN_Soft_L.glsl',
  Restore_CNN_Soft_VL: 'Restore/Anime4K_Restore_CNN_Soft_VL.glsl',
  Upscale_CNN_x2_S: 'Upscale/Anime4K_Upscale_CNN_x2_S.glsl',
  Upscale_CNN_x2_M: 'Upscale/Anime4K_Upscale_CNN_x2_M.glsl',
  Upscale_CNN_x2_L: 'Upscale/Anime4K_Upscale_CNN_x2_L.glsl',
  Upscale_CNN_x2_VL: 'Upscale/Anime4K_Upscale_CNN_x2_VL.glsl',
  Upscale_GAN_x2_M: 'Upscale/Anime4K_Upscale_GAN_x2_M.glsl',
  Upscale_Denoise_CNN_x2_M: 'Upscale%2BDenoise/Anime4K_Upscale_Denoise_CNN_x2_M.glsl'
};

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`${url} -> HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  const bundle = {};
  let totalBytes = 0;

  for (const [key, rel] of Object.entries(MODELS)) {
    const raw = await fetchText(BASE + rel);
    const cleaned = raw
      .split(/\r?\n/)
      .filter((line) => !line.startsWith('// ') && line.trim() !== '//')
      .join('\n')
      .trim();
    bundle[key] = cleaned;
    totalBytes += cleaned.length;
    console.log(`Fetched ${key}: ${cleaned.length} bytes`);
  }

  const outPath = path.resolve(__dirname, '..', 'src', 'shaders', 'anime4k-models.js');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const outJs = [
    '// Official Anime4K v4.0 Trained CNN & GAN Shaders (MIT License, Copyright (c) 2019-2021 bloc97)',
    '// Full license notice: THIRD_PARTY_NOTICES.md',
    '(function (root) {',
    '  "use strict";',
    '  const MODELS = ' + JSON.stringify(bundle) + ';',
    '  if (typeof module !== "undefined" && module.exports) {',
    '    module.exports = MODELS;',
    '  } else {',
    '    root.LumaScaleAnime4KModels = MODELS;',
    '  }',
    '})(typeof globalThis !== "undefined" ? globalThis : window);',
    ''
  ].join('\n');

  fs.writeFileSync(outPath, outJs, 'utf8');
  console.log(`Successfully wrote ${outPath} (${Math.round(totalBytes / 1024)} KB of CNN+GAN weights)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
