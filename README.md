[English](README.md) | [Русский](README.ru.md)

# AniPure

AniPure is a Manifest V3 browser extension for Chromium-based browsers (Google Chrome, Microsoft Edge, Brave, Opera, Vivaldi) that provides real-time video upscaling and enhancement from 720p to 1080p, 2K, and 4K using WebGL2 shaders and Anime4K v4 neural network models.

Version: 0.1.1

---

## Architecture and Features

### 1. Neural Upscaling Pipeline
- Multi-pass execution of Anime4K v4 convolutional neural networks (Restore CNN, Upscale CNN x2, Upscale GAN x2, Upscale Denoise) on WebGL2 using RGBA16F floating-point textures.
- Intermediate texture pooling with tensor lifecycle management to minimize VRAM allocations and garbage collection overhead.
- Bitrate compression artifact suppression, deblocking, and contour edge restoration.

### 2. Adaptive Performance Profiles
- **Fast:** Single-pass Luma shader (Catmull-Rom bicubic interpolation + AMD FidelityFX Contrast Adaptive Sharpening in luminance space + debanding). Minimal GPU and CPU footprint, ideal for battery power on laptops.
- **Balanced:** Compact 4-layer CNN model designed for integrated GPUs (Intel Iris Xe, AMD Radeon Vega).
- **Quality:** Deep line reconstruction and upscaling for mid-tier discrete graphics (NVIDIA GeForce GTX 1660, RTX 3050).
- **Ultra:** Multi-pass generative model (Restore CNN Soft VL + Upscale GAN x2 M + Soft S) delivering 1440p/2160p output on high-performance GPUs (NVIDIA GeForce RTX 3060 / 4060 / 4070+).
- **Auto-Throttle:** Continuous frame render time monitoring with automatic profile step-down to prevent dropped frames.

### 3. Frame Interpolation (Optical Flow)
- GPU-accelerated motion vector estimation for increasing playback smoothness from 24 FPS to 48 or 60 FPS.
- Built-in Scene Cut Detection to disable blending during abrupt camera transitions, eliminating ghosting artifacts.

### 4. Color Grading and Post-Processing
- 6 fragment-shader color profiles:
  - Natural (original stream colors without modification);
  - Blu-ray (enhanced contrast, precise skin tone balance);
  - Vivid HDR (expanded dynamic range and saturated colors);
  - Night (warm spectrum with attenuated blue light);
  - Cinema Film (cool shadows and soft warm highlights);
  - OLED Deep (deep true blacks without shadow detail clipping).
- Anti-Flash option to attenuate sudden harsh white flashes during action scenes.
- Black Level Fix and dynamic Vibrance adjustment.

### 5. Player Integration and Independent Activation
- Minimalist popup interface supporting AMOLED Black (`#000000`) and Light themes.
- Independent per-player and per-site activation: processing is toggled explicitly on each player instance and does not bleed into other tabs or domains.
- Compact on-player overlay with top-right corner hover hotspot: appears when hovering over the control area, stays pinned during interaction and mouse clicks, and hides smoothly after a 1-second timeout once the cursor leaves.
- Before / After split-screen slider and button only appear on the player if explicitly enabled in extension settings.
- Domain, full URL, and URL path whitelist filtering.

### 6. Internationalization (i18n)
- Native bilingual support for English and Russian.
- Automatic locale detection: systems using `ru`, `be`, or `uk` receive the Russian interface; all other system languages (e.g., German, French, Spanish, Japanese, English) default to English as the priority language.
- Explicit manual language selector available under the "Sites & GPU" settings tab.
- Complete localization across all user touchpoints: extension popup, onboarding GPU benchmark, player overlays ("AniPure: ON/OFF"), split-screen labels, telemetry HUD, and system toast notifications.

---

## Browser Installation

1. Open the extensions manager in your browser:
   - Google Chrome: `chrome://extensions/`
   - Microsoft Edge: `edge://extensions/`
   - Brave: `brave://extensions/`
2. Enable **Developer mode** via the toggle switch in the top-right corner.
3. Click **Load unpacked**.
4. Select the project root folder (the directory containing `manifest.json`).
5. Upon initial installation, the hardware diagnostics page automatically opens to benchmark WebGL2 shader execution times on your GPU and recommend the optimal preset.

---

## Project Structure

```
AniPure/
├── manifest.json              # Extension manifest (Manifest V3)
├── background.js              # Background service worker (tab and settings lifecycle)
├── rules.json                 # declarativeNetRequest rules for video CORS unblocking
├── THIRD_PARTY_NOTICES.md     # Third-party licenses and model acknowledgments
├── README.md                  # Project documentation in English
├── README.ru.md               # Project documentation in Russian
├── icons/                     # Extension icons (16x16, 48x48, 128x128)
├── src/
│   ├── shared/
│   │   ├── i18n.js            # Internationalization engine (en/ru dictionaries, auto-detection)
│   │   ├── config.js          # Shared configuration, profiles, whitelist, and math utilities
│   │   └── shaders.js         # WebGL2 GLSL ES 3.00 shader source code
│   ├── shaders/
│   │   └── anime4k-models.js  # Precompiled model weights for 14 Anime4K v4 networks
│   ├── engine/
│   │   ├── benchmark.js       # GPU hardware diagnostic and benchmarking module
│   │   ├── cnn-runner.js      # Multi-pass CNN tensor execution engine
│   │   └── webgl-pipeline.js  # Rendering, texture exchange, and optical flow pipeline
│   ├── content/
│   │   ├── content.js         # Content script injected into media player frames
│   │   └── content.css        # Styles for player overlay, split-handle, and notifications
│   ├── popup/
│   │   ├── popup.html         # Settings popup markup
│   │   ├── popup.css          # Theme styles (AMOLED and Light)
│   │   └── popup.js           # Popup state management, i18n switcher, and telemetry listener
│   └── pages/
│       ├── onboarding.html    # Setup, GPU benchmark, and diagnostics page
│       ├── onboarding.css     # Diagnostics page styles
│       └── onboarding.js      # Benchmark orchestration and preset configuration
├── demo/
│   └── test-player.html       # Offline test bench with synthetic 720p 24 FPS anime stream
└── tests/
    ├── core.test.js           # Unit tests for config, models, whitelist, and i18n
    └── webgl-e2e.js           # Headless browser WebGL2 E2E test via Chrome DevTools Protocol
```

---

## Testing and Verification

### Unit Tests
Verifies Manifest V3 structure, GLSL ES 3.00 shader generation across all 14 Anime4K models, aspect ratio and dimension calculations, whitelist matching, i18n locale resolution, and benchmark classification:

```bash
node --test tests/core.test.js
```

### End-to-End Browser Tests
Launches a Chromium instance via Chrome DevTools Protocol (CDP), verifies WebGL2 initialization, validates popup layout in AMOLED and Light themes without clipping, runs real shader benchmark passes on the GPU, executes the 720p -> 1440p upscaling pipeline, and tests player overlay interactions and auto-hide timing:

```bash
node tests/webgl-e2e.js
```

### Local Test Player
To verify enhancement offline without external streaming platforms, open `demo/test-player.html` in your browser with the extension installed. The page generates a synthetic 720p 24 FPS cel-shaded anime animation suitable for testing edge sharpness, frame interpolation, and split-screen comparison.

---

## Licenses and Acknowledgments

- Anime4K neural network architectures and weights: developed by bloc97, licensed under the MIT License.
- Contrast Adaptive Sharpening (CAS) algorithm: developed by AMD FidelityFX, licensed under the MIT License.
- Full license texts are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
