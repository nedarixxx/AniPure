(function (root) {
  'use strict';

  const QUAD_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 aPos;
uniform float uFlipY;
uniform float uOrigFlipY;
out vec2 vUv;
out vec2 vOrigUv;
out vec2 vScreenUv;

void main() {
  vec2 uv = aPos * 0.5 + 0.5;
  vUv = vec2(uv.x, mix(uv.y, 1.0 - uv.y, uFlipY));
  vOrigUv = vec2(uv.x, mix(uv.y, 1.0 - uv.y, uOrigFlipY));
  vScreenUv = vec2(uv.x, 1.0 - uv.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

  // Anime4K Pass 1 (at Target Resolution outW x outH):
  // Catmull-Rom 5-tap Bicubic Upscale + Bilateral De-block/De-band + Anime4K Darken Lines + Luma in .a
  const ANIME4K_PREPARE_FRAG_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uSrcTexelSize;
uniform float uDebandStrength;
uniform float uLineDarken;

out vec4 fragColor;

float getLuma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 sampleBicubic5Tap(sampler2D tex, vec2 uv, vec2 texelSize) {
  vec2 texSize = 1.0 / texelSize;
  vec2 samplePos = uv * texSize;
  vec2 tc1 = floor(samplePos - 0.5) + 0.5;
  vec2 f = samplePos - tc1;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;

  vec2 w0 = f2 - 0.5 * (f3 + f);
  vec2 w1 = 1.5 * f3 - 2.5 * f2 + 1.0;
  vec2 w3 = 0.5 * (f3 - f2);
  vec2 w2 = 1.0 - w0 - w1 - w3;

  vec2 w12 = w1 + w2;
  vec2 offset12 = w2 / max(w12, vec2(0.0001));

  vec2 tc0  = (tc1 - 1.0) * texelSize;
  vec2 tc3  = (tc1 + 2.0) * texelSize;
  vec2 tc12 = (tc1 + offset12) * texelSize;

  vec3 s0 = texture(tex, vec2(tc12.x, tc0.y)).rgb  * (w12.x * w0.y);
  vec3 s1 = texture(tex, vec2(tc0.x,  tc12.y)).rgb * (w0.x  * w12.y);
  vec3 s2 = texture(tex, vec2(tc12.x, tc12.y)).rgb * (w12.x * w12.y);
  vec3 s3 = texture(tex, vec2(tc3.x,  tc12.y)).rgb * (w3.x  * w12.y);
  vec3 s4 = texture(tex, vec2(tc12.x, tc3.y)).rgb  * (w12.x * w3.y);

  float norm = (w12.x * w0.y) + (w0.x * w12.y) + (w12.x * w12.y) + (w3.x * w12.y) + (w12.x * w3.y);
  return clamp((s0 + s1 + s2 + s3 + s4) / max(norm, 0.0001), 0.0, 1.0);
}

void main() {
  vec2 tx = uSrcTexelSize;
  vec3 c = sampleBicubic5Tap(uTex, vUv, tx);
  float lC = getLuma(c);

  // 1. Bilateral De-blocking & De-banding on source grid before line reconstruction
  if (uDebandStrength > 0.01) {
    vec2 wide = tx * 2.0;
    vec3 w1 = texture(uTex, vUv + vec2( wide.x,  wide.y)).rgb;
    vec3 w2 = texture(uTex, vUv + vec2(-wide.x,  wide.y)).rgb;
    vec3 w3 = texture(uTex, vUv + vec2( wide.x, -wide.y)).rgb;
    vec3 w4 = texture(uTex, vUv + vec2(-wide.x, -wide.y)).rgb;

    float thresh = mix(0.025, 0.085, uDebandStrength);
    float k1 = smoothstep(thresh, 0.0, abs(getLuma(w1) - lC));
    float k2 = smoothstep(thresh, 0.0, abs(getLuma(w2) - lC));
    float k3 = smoothstep(thresh, 0.0, abs(getLuma(w3) - lC));
    float k4 = smoothstep(thresh, 0.0, abs(getLuma(w4) - lC));

    vec3 smoothed = (c + w1 * k1 + w2 * k2 + w3 * k3 + w4 * k4) / (1.0 + k1 + k2 + k3 + k4);
    c = mix(c, smoothed, uDebandStrength * 0.72);
    lC = getLuma(c);
  }

  // 2. Anime4K Darken Lines (Difference-of-Gaussians ink emphasis)
  if (uLineDarken > 0.01) {
    vec2 d = tx * 1.15;
    float blurL = (
      getLuma(texture(uTex, vUv + vec2(-d.x, -d.y)).rgb) +
      getLuma(texture(uTex, vUv + vec2( 0.0, -d.y)).rgb) * 2.0 +
      getLuma(texture(uTex, vUv + vec2( d.x, -d.y)).rgb) +
      getLuma(texture(uTex, vUv + vec2(-d.x,  0.0)).rgb) * 2.0 +
      lC * 4.0 +
      getLuma(texture(uTex, vUv + vec2( d.x,  0.0)).rgb) * 2.0 +
      getLuma(texture(uTex, vUv + vec2(-d.x,  d.y)).rgb) +
      getLuma(texture(uTex, vUv + vec2( 0.0,  d.y)).rgb) * 2.0 +
      getLuma(texture(uTex, vUv + vec2( d.x,  d.y)).rgb)
    ) / 16.0;

    // Darken pixels that are darker than their local neighborhood (blurry anime outlines)
    float diff = max(0.0, blurL - lC);
    float darkenAmt = clamp(diff * uLineDarken * 2.4, 0.0, 0.35);
    c = clamp(c - vec3(darkenAmt), 0.0, 1.0);
    lC = getLuma(c);
  }

  fragColor = vec4(c, lC);
}
`;

  // Anime4K Pass 2 (at Target Resolution outW x outH):
  // Bloc97 8-Directional PushColor — thins blurry 720p dark outlines into HD/2K ink lines
  const ANIME4K_PUSH_COLOR_FRAG_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexelSize;
uniform float uStrength;

out vec4 fragColor;

float min3(float a, float b, float c) { return min(a, min(b, c)); }
float max3(float a, float b, float c) { return max(a, max(b, c)); }

vec4 pushIfBrighter(vec4 mc, vec4 a, vec4 b, vec4 c, float str) {
  vec4 avg = (a + b + c) / 3.0;
  return mix(mc, avg, str);
}

void main() {
  vec2 d = uTexelSize;
  vec4 tl = texture(uTex, vUv + vec2(-d.x, -d.y));
  vec4 tc = texture(uTex, vUv + vec2( 0.0, -d.y));
  vec4 tr = texture(uTex, vUv + vec2( d.x, -d.y));
  vec4 ml = texture(uTex, vUv + vec2(-d.x,  0.0));
  vec4 mc = texture(uTex, vUv);
  vec4 mr = texture(uTex, vUv + vec2( d.x,  0.0));
  vec4 bl = texture(uTex, vUv + vec2(-d.x,  d.y));
  vec4 bc = texture(uTex, vUv + vec2( 0.0,  d.y));
  vec4 br = texture(uTex, vUv + vec2( d.x,  d.y));

  vec4 lightest = mc;
  float s = clamp(uStrength, 0.0, 0.85);

  // Top & Bottom
  float maxDark = max3(bl.a, bc.a, br.a);
  float minLight = min3(tl.a, tc.a, tr.a);
  if (minLight > mc.a && minLight > maxDark) {
    lightest = pushIfBrighter(lightest, tl, tc, tr, s);
  } else {
    maxDark = max3(tl.a, tc.a, tr.a);
    minLight = min3(bl.a, bc.a, br.a);
    if (minLight > mc.a && minLight > maxDark) {
      lightest = pushIfBrighter(lightest, bl, bc, br, s);
    }
  }

  // Diagonal 1 (TR vs BL)
  maxDark = max3(mc.a, ml.a, bc.a);
  minLight = min3(tc.a, tr.a, mr.a);
  if (minLight > maxDark) {
    lightest = pushIfBrighter(lightest, tc, tr, mr, s);
  } else {
    maxDark = max3(mc.a, tc.a, mr.a);
    minLight = min3(ml.a, bl.a, bc.a);
    if (minLight > maxDark) {
      lightest = pushIfBrighter(lightest, ml, bl, bc, s);
    }
  }

  // Left & Right
  maxDark = max3(tl.a, ml.a, bl.a);
  minLight = min3(tr.a, mr.a, br.a);
  if (minLight > mc.a && minLight > maxDark) {
    lightest = pushIfBrighter(lightest, tr, mr, br, s);
  } else {
    maxDark = max3(tr.a, mr.a, br.a);
    minLight = min3(tl.a, ml.a, bl.a);
    if (minLight > mc.a && minLight > maxDark) {
      lightest = pushIfBrighter(lightest, tl, ml, bl, s);
    }
  }

  // Diagonal 2 (TL vs BR)
  maxDark = max3(mc.a, tc.a, ml.a);
  minLight = min3(bc.a, br.a, mr.a);
  if (minLight > maxDark) {
    lightest = pushIfBrighter(lightest, bc, br, mr, s);
  } else {
    maxDark = max3(mc.a, bc.a, mr.a);
    minLight = min3(tl.a, tc.a, ml.a);
    if (minLight > maxDark) {
      lightest = pushIfBrighter(lightest, tl, tc, ml, s);
    }
  }

  float newLuma = dot(lightest.rgb, vec3(0.2126, 0.7152, 0.0722));
  fragColor = vec4(lightest.rgb, newLuma);
}
`;

  // Anime4K Pass 3 (at Target Resolution outW x outH):
  // Compute Sobel Gradient Magnitude into .a (inverted so higher sharpness = lower alpha, bloc97 convention)
  const ANIME4K_GRADIENT_FRAG_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexelSize;

out vec4 fragColor;

float getLuma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec2 d = uTexelSize;
  vec3 mc = texture(uTex, vUv).rgb;

  float tl = getLuma(texture(uTex, vUv + vec2(-d.x, -d.y)).rgb);
  float tc = getLuma(texture(uTex, vUv + vec2( 0.0, -d.y)).rgb);
  float tr = getLuma(texture(uTex, vUv + vec2( d.x, -d.y)).rgb);
  float ml = getLuma(texture(uTex, vUv + vec2(-d.x,  0.0)).rgb);
  float mr = getLuma(texture(uTex, vUv + vec2( d.x,  0.0)).rgb);
  float bl = getLuma(texture(uTex, vUv + vec2(-d.x,  d.y)).rgb);
  float bc = getLuma(texture(uTex, vUv + vec2( 0.0,  d.y)).rgb);
  float br = getLuma(texture(uTex, vUv + vec2( d.x,  d.y)).rgb);

  float gx = (-tl - 2.0 * ml - bl) + (tr + 2.0 * mr + br);
  float gy = (-tl - 2.0 * tc - tr) + (bl + 2.0 * bc + br);
  float grad = clamp(sqrt(gx * gx + gy * gy), 0.0, 1.0);

  fragColor = vec4(mc, 1.0 - grad);
}
`;

  // Anime4K Pass 4 (at Target Resolution outW x outH):
  // Bloc97 8-Directional PushGrad — collapses blurry edge ramps into sharp lines and clamps highlights
  const ANIME4K_PUSH_GRAD_FRAG_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexelSize;
uniform float uStrength;

out vec4 fragColor;

float min3(float a, float b, float c) { return min(a, min(b, c)); }
float max3(float a, float b, float c) { return max(a, max(b, c)); }

vec4 pushGrad(vec4 mc, vec4 a, vec4 b, vec4 c, float str) {
  vec4 avg = (a + b + c) / 3.0;
  return mix(mc, avg, str);
}

void main() {
  vec2 d = uTexelSize;
  vec4 tl = texture(uTex, vUv + vec2(-d.x, -d.y));
  vec4 tc = texture(uTex, vUv + vec2( 0.0, -d.y));
  vec4 tr = texture(uTex, vUv + vec2( d.x, -d.y));
  vec4 ml = texture(uTex, vUv + vec2(-d.x,  0.0));
  vec4 mc = texture(uTex, vUv);
  vec4 mr = texture(uTex, vUv + vec2( d.x,  0.0));
  vec4 bl = texture(uTex, vUv + vec2(-d.x,  d.y));
  vec4 bc = texture(uTex, vUv + vec2( 0.0,  d.y));
  vec4 br = texture(uTex, vUv + vec2( d.x,  d.y));

  vec4 res = mc;
  float s = clamp(uStrength, 0.0, 0.95);

  // Top & Bottom (lower .a means stronger edge gradient -> pull toward sharper side)
  float maxG = max3(bl.a, bc.a, br.a);
  float minG = min3(tl.a, tc.a, tr.a);
  if (minG < mc.a && minG < maxG) {
    res = pushGrad(res, tl, tc, tr, s);
  } else {
    maxG = max3(tl.a, tc.a, tr.a);
    minG = min3(bl.a, bc.a, br.a);
    if (minG < mc.a && minG < maxG) {
      res = pushGrad(res, bl, bc, br, s);
    }
  }

  // Diagonal 1 (TR vs BL)
  maxG = max3(mc.a, ml.a, bc.a);
  minG = min3(tc.a, tr.a, mr.a);
  if (minG < maxG) {
    res = pushGrad(res, tc, tr, mr, s);
  } else {
    maxG = max3(mc.a, tc.a, mr.a);
    minG = min3(ml.a, bl.a, bc.a);
    if (minG < maxG) {
      res = pushGrad(res, ml, bl, bc, s);
    }
  }

  // Left & Right
  maxG = max3(tl.a, ml.a, bl.a);
  minG = min3(tr.a, mr.a, br.a);
  if (minG < mc.a && minG < maxG) {
    res = pushGrad(res, tr, mr, br, s);
  } else {
    maxG = max3(tr.a, mr.a, br.a);
    minG = min3(tl.a, ml.a, bl.a);
    if (minG < mc.a && minG < maxG) {
      res = pushGrad(res, tl, ml, bl, s);
    }
  }

  // Diagonal 2 (TL vs BR)
  maxG = max3(mc.a, tc.a, ml.a);
  minG = min3(bc.a, br.a, mr.a);
  if (minG < maxG) {
    res = pushGrad(res, bc, br, mr, s);
  } else {
    maxG = max3(mc.a, bc.a, mr.a);
    minG = min3(tl.a, tc.a, ml.a);
    if (minG < maxG) {
      res = pushGrad(res, tl, tc, ml, s);
    }
  }

  // Clamp Highlights (prevents bright ringing halos around reconstructed dark lines)
  vec3 maxLocal = max(mc.rgb, max(max(tc.rgb, bc.rgb), max(ml.rgb, mr.rgb)));
  vec3 minLocal = min(mc.rgb, min(min(tc.rgb, bc.rgb), min(ml.rgb, mr.rgb)));
  res.rgb = clamp(res.rgb, minLocal, maxLocal);

  float newLuma = dot(res.rgb, vec3(0.2126, 0.7152, 0.0722));
  fragColor = vec4(res.rgb, newLuma);
}
`;

  // Final Output Pass (also serves as single-pass shader for lightweight mode):
  // Bicubic (when single-pass) + True Luma AMD FidelityFX CAS + Anti-Ringing + Deep Black + Vibrance + Split-Screen
  const LUMA_FUSED_FRAG_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
in vec2 vOrigUv;
in vec2 vScreenUv;
uniform sampler2D uTex;
uniform sampler2D uOrigTex;
uniform vec2 uTexelSize;
uniform vec2 uOrigTexelSize;

uniform float uIsPreUpscaled;
uniform float uIsCnnOutput;
uniform float uCasStrength;
uniform float uLineEnhance;
uniform float uDebandStrength;
uniform float uDeringStrength;
uniform float uBlackLevelFix;
uniform float uVibrance;
uniform float uColorProfile;
uniform float uAntiFlash;
uniform float uSplitScreen;
uniform float uSplitPos;

out vec4 fragColor;

float getLuma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 sampleBicubic5Tap(sampler2D tex, vec2 uv, vec2 texelSize) {
  vec2 texSize = 1.0 / texelSize;
  vec2 samplePos = uv * texSize;
  vec2 tc1 = floor(samplePos - 0.5) + 0.5;
  vec2 f = samplePos - tc1;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;

  vec2 w0 = f2 - 0.5 * (f3 + f);
  vec2 w1 = 1.5 * f3 - 2.5 * f2 + 1.0;
  vec2 w3 = 0.5 * (f3 - f2);
  vec2 w2 = 1.0 - w0 - w1 - w3;

  vec2 w12 = w1 + w2;
  vec2 offset12 = w2 / max(w12, vec2(0.0001));

  vec2 tc0  = (tc1 - 1.0) * texelSize;
  vec2 tc3  = (tc1 + 2.0) * texelSize;
  vec2 tc12 = (tc1 + offset12) * texelSize;

  vec3 s0 = texture(tex, vec2(tc12.x, tc0.y)).rgb  * (w12.x * w0.y);
  vec3 s1 = texture(tex, vec2(tc0.x,  tc12.y)).rgb * (w0.x  * w12.y);
  vec3 s2 = texture(tex, vec2(tc12.x, tc12.y)).rgb * (w12.x * w12.y);
  vec3 s3 = texture(tex, vec2(tc3.x,  tc12.y)).rgb * (w3.x  * w12.y);
  vec3 s4 = texture(tex, vec2(tc12.x, tc3.y)).rgb  * (w12.x * w3.y);

  float norm = (w12.x * w0.y) + (w0.x * w12.y) + (w12.x * w12.y) + (w3.x * w12.y) + (w12.x * w3.y);
  return clamp((s0 + s1 + s2 + s3 + s4) / max(norm, 0.0001), 0.0, 1.0);
}

vec3 applyVibrance(vec3 c, float amt) {
  float maxC = max(c.r, max(c.g, c.b));
  float minC = min(c.r, min(c.g, c.b));
  float sat = maxC - minC;
  float avg = (c.r + c.g + c.b) / 3.0;
  return clamp(mix(vec3(avg), c, 1.0 + amt * (1.0 - sat)), 0.0, 1.0);
}

// 6 Cinema & Anime Color Grading Profiles (LUT-grade math on GPU)
vec3 applyColorProfile(vec3 c, float profileIdx) {
  int idx = int(profileIdx + 0.5);
  if (idx <= 0) {
    return c; // 0: Natural (original)
  }
  if (idx == 1) {
    // 1: Blu-ray Master — crisp S-curve contrast + clean shadows + subtle natural vibrance
    vec3 sCurve = c * c * (3.0 - 2.0 * c);
    vec3 outC = mix(c, sCurve, 0.24);
    return applyVibrance(outC, 0.07);
  }
  if (idx == 2) {
    // 2: Vivid HDR — punchy anime colors + lifted midtone clarity without clipping faces
    vec3 sCurve = c * c * (3.0 - 2.0 * c);
    vec3 outC = mix(c, sCurve, 0.34);
    outC = pow(max(outC, vec3(0.0)), vec3(0.96));
    return applyVibrance(outC, 0.24);
  }
  if (idx == 3) {
    // 3: Warm Night — eye-friendly warm temperature (reduced blue glare) + soft highlight roll-off
    vec3 warm = c * vec3(1.05, 0.99, 0.85);
    float l = getLuma(warm);
    if (l > 0.78) {
      float softL = 0.78 + (l - 0.78) * 0.55;
      warm *= (softL / max(l, 0.001));
    }
    return clamp(warm, 0.0, 1.0);
  }
  if (idx == 4) {
    // 4: Cinema (Teal shadows & warm amber highlights)
    float l = getLuma(c);
    vec3 tint = mix(vec3(0.92, 0.99, 1.06), vec3(1.06, 1.01, 0.93), smoothstep(0.15, 0.82, l));
    vec3 sCurve = c * c * (3.0 - 2.0 * c);
    vec3 outC = mix(c, sCurve, 0.28) * tint;
    return clamp(outC, 0.0, 1.0);
  }
  // 5: OLED Deep — rich obsidian blacks + crisp mid-high pop
  float l = getLuma(c);
  vec3 deep = pow(max(c, vec3(0.0)), vec3(mix(1.16, 0.96, smoothstep(0.08, 0.72, l))));
  return applyVibrance(deep, 0.12);
}

vec3 applyAntiFlash(vec3 c) {
  if (uAntiFlash < 0.5) return c;
  float l = getLuma(c);
  if (l > 0.82) {
    float targetL = 0.82 + (l - 0.82) * 0.32;
    return clamp(c * (targetL / max(l, 0.001)), 0.0, 1.0);
  }
  return c;
}

void main() {
  // Split screen before/after comparison (raw original video on the left)
  if (uSplitScreen > 0.5 && vUv.x < uSplitPos) {
    vec3 orig = texture(uOrigTex, vOrigUv).rgb;
    fragColor = vec4(orig, 1.0);
    return;
  }

  vec2 tx = uTexelSize;

  // Fast clean CNN/GAN output path
  if (uIsCnnOutput > 0.5) {
    vec3 cnn = clamp(texture(uTex, vUv).rgb, 0.0, 1.0);

    // Anime4K Clamp Highlights (prevents bright halo overshoot around dark reconstructed lines)
    if (uDeringStrength > 0.05) {
      vec2 otx = tx * 2.0;
      float oMax = getLuma(texture(uOrigTex, vOrigUv).rgb);
      oMax = max(oMax, getLuma(texture(uOrigTex, vOrigUv + vec2( otx.x, 0.0)).rgb));
      oMax = max(oMax, getLuma(texture(uOrigTex, vOrigUv + vec2(-otx.x, 0.0)).rgb));
      oMax = max(oMax, getLuma(texture(uOrigTex, vOrigUv + vec2(0.0,  otx.y)).rgb));
      oMax = max(oMax, getLuma(texture(uOrigTex, vOrigUv + vec2(0.0, -otx.y)).rgb));
      float curL = getLuma(cnn);
      float clampedL = min(curL, oMax + mix(0.14, 0.04, uDeringStrength));
      cnn = clamp(cnn - vec3(curL - clampedL), 0.0, 1.0);
    }

    // Optional clean CAS micro-detail polish on top of CNN/GAN
    if (uCasStrength > 0.04) {
      float lC = getLuma(cnn);
      float lN = getLuma(texture(uTex, vUv + vec2(0.0, -tx.y)).rgb);
      float lS = getLuma(texture(uTex, vUv + vec2(0.0,  tx.y)).rgb);
      float lE = getLuma(texture(uTex, vUv + vec2( tx.x, 0.0)).rgb);
      float lW = getLuma(texture(uTex, vUv + vec2(-tx.x, 0.0)).rgb);
      float minL = min(min(min(lN, lS), min(lE, lW)), lC);
      float maxL = max(max(max(lN, lS), max(lE, lW)), lC);
      float amp = sqrt(clamp(min(minL, 1.0 - maxL) / max(maxL, 0.001), 0.0, 1.0));
      float w = amp * (-1.0 / mix(9.0, 4.8, uCasStrength));
      float casL = (lC + w * (lN + lS + lE + lW)) / (1.0 + 4.0 * w);
      casL = clamp(casL, minL - 0.015, maxL + 0.015);
      cnn = clamp(cnn + vec3((casL - lC) * 0.72), 0.0, 1.0);
    }

    if (uBlackLevelFix > 0.5) {
      cnn = clamp((cnn - vec3(0.025)) * 1.052, 0.0, 1.0);
    }

    cnn = applyColorProfile(cnn, uColorProfile);

    if (abs(uVibrance) > 0.005) {
      cnn = applyVibrance(cnn, uVibrance);
    }

    cnn = applyAntiFlash(cnn);
    fragColor = vec4(cnn, 1.0);
    return;
  }

  vec3 cRaw = texture(uTex, vUv).rgb;
  vec3 cCenter = uIsPreUpscaled > 0.5 ? cRaw : sampleBicubic5Tap(uTex, vUv, tx);

  vec3 n  = texture(uTex, vUv + vec2(0.0, -tx.y)).rgb;
  vec3 s  = texture(uTex, vUv + vec2(0.0,  tx.y)).rgb;
  vec3 e  = texture(uTex, vUv + vec2( tx.x, 0.0)).rgb;
  vec3 w  = texture(uTex, vUv + vec2(-tx.x, 0.0)).rgb;
  vec3 nw = texture(uTex, vUv + vec2(-tx.x, -tx.y)).rgb;
  vec3 ne = texture(uTex, vUv + vec2( tx.x, -tx.y)).rgb;
  vec3 sw = texture(uTex, vUv + vec2(-tx.x,  tx.y)).rgb;
  vec3 se = texture(uTex, vUv + vec2( tx.x,  tx.y)).rgb;

  vec3 min3 = min(min(min(n, s), min(e, w)), cRaw);
  vec3 max3 = max(max(max(n, s), max(e, w)), cRaw);
  vec3 baseColor = uIsPreUpscaled > 0.5
    ? cCenter
    : mix(cCenter, clamp(cCenter, min3, max3), mix(0.25, 0.80, uDeringStrength));

  float lC  = getLuma(baseColor);
  float lN  = getLuma(n);
  float lS  = getLuma(s);
  float lE  = getLuma(e);
  float lW  = getLuma(w);
  float lNW = getLuma(nw);
  float lNE = getLuma(ne);
  float lSW = getLuma(sw);
  float lSE = getLuma(se);

  // Inline fast de-banding for 1-pass Eco/Balanced mode
  if (uDebandStrength > 0.01) {
    float maxDiff = max(max(abs(lN - lC), abs(lS - lC)), max(abs(lE - lC), abs(lW - lC)));
    float flatMask = smoothstep(0.05, 0.008, maxDiff);
    vec3 avgCross = (n + s + e + w + baseColor * 2.0) / 6.0;
    baseColor = mix(baseColor, avgCross, flatMask * uDebandStrength * 0.50);
    lC = getLuma(baseColor);
  }

  // AMD FidelityFX CAS in Luma space + Anti-Ringing Clamp
  float minCross = min(min(min(lN, lS), min(lE, lW)), lC);
  float maxCross = max(max(max(lN, lS), max(lE, lW)), lC);
  float minRing  = min(minCross, min(min(lNW, lNE), min(lSW, lSE)));
  float maxRing  = max(maxCross, max(max(lNW, lNE), max(lSW, lSE)));
  float minSoft  = (minCross + minRing) * 0.5;
  float maxSoft  = (maxCross + maxRing) * 0.5;

  float ampL = clamp(min(minSoft, 1.0 - maxSoft) / max(maxSoft, 0.001), 0.0, 1.0);
  ampL = sqrt(ampL);

  float peak = -1.0 / mix(8.0, 4.15, uCasStrength);
  float weight = ampL * peak;
  float casLuma = (lC + weight * (lN + lS + lE + lW)) / (1.0 + 4.0 * weight);

  float localAvg = (lN + lS + lE + lW + lNW + lNE + lSW + lSE) * 0.125;
  float detailBoost = (lC - localAvg) * (0.95 * uCasStrength) * ampL;
  float sharpLuma = casLuma + detailBoost;

  float haloMargin = mix(0.055, 0.004, uDeringStrength);
  float targetLuma = clamp(sharpLuma, minRing - haloMargin, maxRing + haloMargin);

  // Additional dark-line crisp pass for 1-pass mode (or subtle finish on Anime4K)
  if (uLineEnhance > 0.01) {
    float gx = (lNE + 2.0 * lE + lSE) - (lNW + 2.0 * lW + lSW);
    float gy = (lSW + 2.0 * lS + lSE) - (lNW + 2.0 * lN + lNE);
    float edgeMag = length(vec2(gx, gy));

    float crossMean = (lN + lS + lE + lW) * 0.25;
    float isDarkStroke = clamp((crossMean - lC) * 5.5, 0.0, 1.0);
    float lineFactor = smoothstep(0.06, 0.35, edgeMag) * isDarkStroke;
    float scaleMul = uIsPreUpscaled > 0.5 ? 0.18 : 0.34;
    targetLuma -= lineFactor * uLineEnhance * scaleMul;
  }

  float lumaDelta = clamp(targetLuma, 0.0, 1.0) - lC;
  vec3 enhanced = clamp(baseColor + vec3(lumaDelta), 0.0, 1.0);

  if (uBlackLevelFix > 0.5) {
    enhanced = clamp((enhanced - vec3(0.042)) * 1.088, 0.0, 1.0);
  }

  enhanced = applyColorProfile(enhanced, uColorProfile);

  if (abs(uVibrance) > 0.005) {
    enhanced = applyVibrance(enhanced, uVibrance);
  }

  enhanced = applyAntiFlash(enhanced);
  fragColor = vec4(enhanced, 1.0);
}
`;

  // Optical Flow Motion-Compensated Frame Interpolation (24 -> 48/60 FPS for powerful GPUs)
  const INTERPOLATION_FRAG_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uPrevTex;
uniform sampler2D uCurrTex;
uniform vec2 uTexelSize;
uniform float uAlpha;
uniform float uMotionStrength;
uniform float uSceneCutThreshold;

out vec4 fragColor;

float getLuma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec3 prevC = texture(uPrevTex, vUv).rgb;
  vec3 currC = texture(uCurrTex, vUv).rgb;

  float cutDiff = 0.0;
  cutDiff += abs(getLuma(texture(uPrevTex, vec2(0.25, 0.25)).rgb) - getLuma(texture(uCurrTex, vec2(0.25, 0.25)).rgb));
  cutDiff += abs(getLuma(texture(uPrevTex, vec2(0.75, 0.25)).rgb) - getLuma(texture(uCurrTex, vec2(0.75, 0.25)).rgb));
  cutDiff += abs(getLuma(texture(uPrevTex, vec2(0.50, 0.50)).rgb) - getLuma(texture(uCurrTex, vec2(0.50, 0.50)).rgb));
  cutDiff += abs(getLuma(texture(uPrevTex, vec2(0.25, 0.75)).rgb) - getLuma(texture(uCurrTex, vec2(0.25, 0.75)).rgb));
  cutDiff += abs(getLuma(texture(uPrevTex, vec2(0.75, 0.75)).rgb) - getLuma(texture(uCurrTex, vec2(0.75, 0.75)).rgb));
  cutDiff *= 0.2;

  if (cutDiff > uSceneCutThreshold) {
    fragColor = vec4(uAlpha < 0.5 ? prevC : currC, 1.0);
    return;
  }

  vec2 stepSz = uTexelSize * 2.5;
  float pL = getLuma(prevC);
  float cL = getLuma(currC);
  float it = cL - pL;

  if (abs(it) < 0.012) {
    fragColor = vec4(mix(prevC, currC, uAlpha), 1.0);
    return;
  }

  float lE = (getLuma(texture(uPrevTex, vUv + vec2(stepSz.x, 0.0)).rgb) + getLuma(texture(uCurrTex, vUv + vec2(stepSz.x, 0.0)).rgb)) * 0.5;
  float lW = (getLuma(texture(uPrevTex, vUv - vec2(stepSz.x, 0.0)).rgb) + getLuma(texture(uCurrTex, vUv - vec2(stepSz.x, 0.0)).rgb)) * 0.5;
  float lS = (getLuma(texture(uPrevTex, vUv + vec2(0.0, stepSz.y)).rgb) + getLuma(texture(uCurrTex, vUv + vec2(0.0, stepSz.y)).rgb)) * 0.5;
  float lN = (getLuma(texture(uPrevTex, vUv - vec2(0.0, stepSz.y)).rgb) + getLuma(texture(uCurrTex, vUv - vec2(0.0, stepSz.y)).rgb)) * 0.5;

  float ix = (lE - lW) * 0.5;
  float iy = (lS - lN) * 0.5;

  float gradSq = ix * ix + iy * iy + 0.008;
  vec2 flow = -vec2(ix, iy) * (it / gradSq) * stepSz * 1.8 * uMotionStrength;

  float maxRadius = length(uTexelSize) * 14.0;
  float flowLen = length(flow);
  if (flowLen > maxRadius) {
    flow *= (maxRadius / flowLen);
  }

  vec2 uvPrev = clamp(vUv - flow * uAlpha, vec2(0.001), vec2(0.999));
  vec2 uvCurr = clamp(vUv + flow * (1.0 - uAlpha), vec2(0.001), vec2(0.999));

  vec3 warpedPrev = texture(uPrevTex, uvPrev).rgb;
  vec3 warpedCurr = texture(uCurrTex, uvCurr).rgb;

  float warpErr = abs(getLuma(warpedPrev) - getLuma(warpedCurr));
  float trust = smoothstep(0.32, 0.06, warpErr);

  vec3 motionBlend = mix(warpedPrev, warpedCurr, uAlpha);
  vec3 linearBlend = mix(prevC, currC, uAlpha);
  vec3 finalRgb = mix(linearBlend, motionBlend, trust * uMotionStrength);

  fragColor = vec4(clamp(finalRgb, 0.0, 1.0), 1.0);
}
`;

  const api = {
    QUAD_VERTEX_SHADER,
    ANIME4K_PREPARE_FRAG_SHADER,
    ANIME4K_PUSH_COLOR_FRAG_SHADER,
    ANIME4K_GRADIENT_FRAG_SHADER,
    ANIME4K_PUSH_GRAD_FRAG_SHADER,
    LUMA_FUSED_FRAG_SHADER,
    INTERPOLATION_FRAG_SHADER
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LumaScaleShaders = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
