// ============================================
// Waves — 全画面ドットモザイクによる抽象的な海
// Auroraと同じピクセルバッファアーキテクチャで
// 波の動きを色の流れとして表現する
// ============================================

let t = 0;
let soundStarted = false;
let appStarted = false;

// --- Web Audio API ---
let audioCtx;
let ambientNode, ambientGain;

// --- デバイスセンサー ---
let tiltX = 0;
let tiltY = 0;
let hasTilt = false;
let permissionRequested = false;

// --- タッチ/マウス ---
let lastTouchX = 0.5;
let lastTouchY = 0.5;
let isTouchDevice = false;
let hasInteracted = false;
let tiltStatusMsg = '';
let statusShowTime = 0;

// --- スワイプ ---
let prevTouchX = 0;
let prevTouchY = 0;
let gustStrength = 0;
let gustDirX = 0;
let gustDirY = 0;

// --- 長押し ---
let holdTime = 0;
let holdX = 0;
let holdY = 0;
let isHolding = false;
let holdThreshold = 20;

// --- シェイク ---
let shakeIntensity = 0;
let lastAccX = 0;
let lastAccY = 0;
let lastAccZ = 0;

// --- ピンチ ---
let pinchScale = 1.0;
let lastPinchDist = 0;

// --- コンパス ---
let compassHeading = 0;
let hasCompass = false;

// --- 位置情報 ---
let climateFactor = 0.5;
let hasLocation = false;

// --- 時刻制御 ---
let manualHour = -1;
let lastSkyTapTime = 0;

// --- 波紋 ---
let ripples = [];

// --- グリッドドット ---
let dotSize = 6;
let flowOffX = 0;
let flowOffY = 0;
let pg;

// --- 海の色テーマ: 2時間ごと ---
let colorThemes = [
  // 0:00 Deep Ocean — 深い紺・藍
  { hues: [220, 230, 240, 210, 250, 200, 235, 215], sat: [50, 70], bri: [12, 32], name: 'Deep Ocean' },
  // 2:00 Midnight Current — 深い青紫・暗いシアン
  { hues: [230, 245, 260, 220, 215, 250, 240, 210], sat: [48, 68], bri: [14, 35], name: 'Midnight Current' },
  // 4:00 Pre-Dawn Depths — 暗いティール・ほのかなローズ
  { hues: [210, 225, 240, 200, 280, 195, 250, 310], sat: [40, 62], bri: [18, 40], name: 'Pre-Dawn Depths' },
  // 6:00 Dawn Tide — 暖かいローズゴールドの光が深い青に
  { hues: [200, 220, 15, 210, 350, 230, 25, 240], sat: [45, 72], bri: [25, 55], name: 'Dawn Tide' },
  // 8:00 Morning Shallows — ターコイズ・明るいティール
  { hues: [175, 185, 195, 170, 200, 165, 190, 180], sat: [50, 75], bri: [35, 65], name: 'Morning Shallows' },
  // 10:00 Crystal Waters — 透明なシアン・アクア
  { hues: [180, 190, 170, 185, 195, 175, 200, 165], sat: [45, 70], bri: [45, 75], name: 'Crystal Waters' },
  // 12:00 Sunlit Surface — 明るい白シアン・プリズム
  { hues: [185, 195, 175, 190, 40, 200, 170, 60], sat: [30, 55], bri: [55, 85], name: 'Sunlit Surface' },
  // 14:00 Afternoon Lagoon — 暖かいティール・グリーンブルー
  { hues: [180, 190, 170, 195, 165, 200, 175, 185], sat: [45, 70], bri: [40, 70], name: 'Afternoon Lagoon' },
  // 16:00 Golden Hour — 暖かいシアン・琥珀の反射
  { hues: [190, 200, 30, 185, 25, 210, 40, 180], sat: [48, 72], bri: [35, 65], name: 'Golden Hour' },
  // 18:00 Sunset Reef — コーラル・琥珀・深い紫青
  { hues: [10, 220, 350, 200, 25, 240, 5, 210], sat: [55, 78], bri: [28, 58], name: 'Sunset Reef' },
  // 20:00 Twilight Depths — 深いティール・バイオレット
  { hues: [200, 220, 250, 195, 240, 210, 260, 205], sat: [50, 72], bri: [18, 45], name: 'Twilight Depths' },
  // 22:00 Night Sea — 深い紺・暗いティール
  { hues: [220, 235, 210, 240, 225, 205, 245, 215], sat: [50, 70], bri: [12, 35], name: 'Night Sea' },
];

function setup() {
  pixelDensity(1);
  createCanvas(windowWidth, windowHeight);
  noSmooth();
  colorMode(HSB, 360, 100, 100, 100);
  noStroke();

  pg = createGraphics(ceil(windowWidth / dotSize), ceil(windowHeight / dotSize));
  pg.pixelDensity(1);
}

function draw() {
  if (!appStarted) {
    background(0);
    fill(0, 0, 100);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(min(width, height) * 0.06);
    text('Tap to Start', width / 2, height / 2);
    return;
  }

  // --- 時刻 ---
  let h;
  if (manualHour >= 0) {
    h = manualHour;
  } else {
    let now = new Date();
    h = now.getHours() + now.getMinutes() / 60;
  }

  // --- テーマ補間 ---
  let ti = floor(h / 2) % 12;
  let ni = (ti + 1) % 12;
  let tb = (h / 2 - floor(h / 2));
  tb = tb * tb * (3 - 2 * tb); // smoothstep
  let cur = colorThemes[ti];
  let nxt = colorThemes[ni];

  // --- 操作入力 ---
  let mx, my;
  if (hasTilt) {
    mx = constrain(map(tiltX, -30, 30, 0, 1), 0, 1);
    my = constrain(map(tiltY, 0, 60, 0, 1), 0, 1);
  } else if (isTouchDevice) {
    mx = lastTouchX;
    my = lastTouchY;
  } else if (mouseX === 0 && mouseY === 0) {
    mx = 0.5;
    my = 0.5;
  } else {
    mx = mouseX / width;
    my = mouseY / height;
  }

  // 波の流れ方向
  let flowX, flowY;
  if (hasCompass) {
    flowX = sin(radians(compassHeading)) * 2;
    flowY = cos(radians(compassHeading)) * 0.3;
  } else if (hasInteracted) {
    flowX = (mx - 0.5) * 3;
    flowY = (my - 0.5) * 0.5;
  } else {
    flowX = 0;
    flowY = 0;
  }
  flowX += gustDirX * gustStrength * 3;
  flowY += gustDirY * gustStrength * 3;

  // 減衰
  gustStrength *= 0.96;
  shakeIntensity *= 0.93;
  if (touches.length < 2) pinchScale = lerp(pinchScale, 1.0, 0.005);
  if (isHolding) holdTime += 0.016;

  // ポインタ位置
  let px = mx * width;
  let py = my * height;

  // 自律ドリフト: 波が常に流れ続ける（水平方向を強調）
  let driftSpeed = noise(t * 0.08, 100) * 0.012 + 0.003;
  let driftAngle = noise(t * 0.03, 200) * PI * 0.6 - PI * 0.3; // 主に水平方向
  flowOffX += cos(driftAngle) * driftSpeed;
  flowOffY += sin(driftAngle) * driftSpeed * 0.3;

  // 操作による追加フロー
  flowOffX += flowX * 0.003;
  flowOffY += flowY * 0.001;
  flowOffX += gustDirX * gustStrength * 0.01;
  flowOffY += gustDirY * gustStrength * 0.005;

  // ==============================================
  // グリッドドット: 波高フィールドで海面を描画
  // ==============================================
  let pgW = pg.width;
  let pgH = pg.height;

  let satLow = lerp(cur.sat[0], nxt.sat[0], tb);
  let satHigh = lerp(cur.sat[1], nxt.sat[1], tb);
  let briLow = lerp(cur.bri[0], nxt.bri[0], tb);
  let briHigh = lerp(cur.bri[1], nxt.bri[1], tb);
  let pointerRadius = 250;
  let prSq = pointerRadius * pointerRadius;

  // climateFactor による色相シフト
  let climateHueShift = (climateFactor - 0.5) * -20;

  // 日照
  let hNorm = ((h % 24) + 24) % 24;
  let daylight = 0;
  if (hNorm >= 6 && hNorm <= 18) {
    daylight = sin((hNorm - 6) / 12 * PI);
  }

  // 波の速度パラメータ
  let waveSpeed = flowOffX * 50;
  let ampScale = pinchScale;

  pg.loadPixels();
  let pxArr = pg.pixels;

  for (let r = 0; r < pgH; r++) {
    for (let c = 0; c < pgW; c++) {
      let gx = c * dotSize;
      let gy = r * dotSize;
      let cx = gx + dotSize * 0.5;
      let cy = gy + dotSize * 0.5;

      // 深さの比率 (0=水面, 1=深海)
      let depthRatio = gy / (pgH * dotSize);

      // --- 波高フィールド: 重ねたsin波 + ノイズで海面のうねり ---
      // 大きなうねり（低周波）
      let w1 = sin(gx * 0.004 + t * 0.8 + waveSpeed + gy * 0.001) * 1.0 * ampScale;
      let w2 = sin(gx * 0.007 - t * 0.5 + waveSpeed * 0.7 + gy * 0.002) * 0.6 * ampScale;
      // 中くらいの波
      let w3 = sin(gx * 0.015 + t * 1.2 + waveSpeed * 1.3 - gy * 0.003) * 0.3 * ampScale;
      let w4 = sin(gx * 0.025 + t * 0.9 + waveSpeed * 0.5 + gy * 0.005) * 0.15 * ampScale;
      // ノイズで不規則さ
      let wn = noise(gx * 0.003 + flowOffX * 5, gy * 0.005 + flowOffY, t * 0.3) * 0.8 - 0.4;
      // 奥（上）は波が小さく、手前（下）は大きく
      let depthAmp = 0.4 + depthRatio * 0.6;
      let waveH = (w1 + w2 + w3 + w4 + wn) * depthAmp; // -1 〜 +1 程度

      // --- 色相: テーマパレットから波高で選択 ---
      // 波高を0〜1にマッピングしてパレットインデックスに
      let ciNorm = (waveH + 1.5) * 0.33; // おおよそ 0〜1
      ciNorm += noise(gx * 0.001 + 300, gy * 0.002 + 300, t * 0.05) * 0.3;
      let ciRaw = ciNorm * 8;
      let ci0 = floor(ciRaw) % 8;
      if (ci0 < 0) ci0 += 8;
      let ci1 = (ci0 + 1) % 8;
      let ciFrac = ciRaw - floor(ciRaw);
      let baseHue = lerpHue(
        lerpHue(cur.hues[ci0], nxt.hues[ci0], tb),
        lerpHue(cur.hues[ci1], nxt.hues[ci1], tb),
        ciFrac
      );

      // 深さで色相シフト（深いほど青寄り）
      let hue = (baseHue + depthRatio * 20 + climateHueShift + 360) % 360;

      // --- 明度: 波の山は明るく、谷は暗い ---
      let waveNorm = (waveH + 1.5) / 3.0; // 0〜1
      let baseBri = lerp(briLow, briHigh, waveNorm);
      // 深さによる減衰
      baseBri *= lerp(1.3, 0.5, depthRatio);

      // --- 彩度 ---
      let sat = lerp(satLow, satHigh, 0.5 + waveH * 0.2);
      sat += depthRatio * 15;
      sat += climateFactor * 8;

      let bri = baseBri + climateFactor * 5;
      bri += shakeIntensity * 30;

      // --- 波頭の泡: 波の山 + 浅い場所で白く光る ---
      if (waveH > 0.6 && depthRatio < 0.7) {
        let foamStr = (waveH - 0.6) * 2.0 * (1 - depthRatio);
        let foamN = noise(gx * 0.008 + t * 2, gy * 0.008, t * 0.3);
        foamStr *= foamN;
        sat *= (1 - foamStr * 0.8);
        bri += foamStr * 30;
      }

      // --- 水面のきらめき ---
      if (depthRatio < 0.45 && daylight > 0.1) {
        let sparkle = noise(gx * 0.012 + t * 4, gy * 0.012 + t * 3, t * 0.8);
        if (sparkle > 0.8) {
          let sparkStr = (sparkle - 0.8) * 5.0 * daylight * (1 - depthRatio * 2.2);
          sat *= (1 - sparkStr * 0.6);
          bri += sparkStr * 25;
        }
      }

      // ポインタ近くは色相シフト + 明るく
      if (hasInteracted) {
        let ddx = cx - px, ddy = cy - py;
        let dSq = ddx * ddx + ddy * ddy;
        if (dSq < prSq) {
          let prox = 1 - Math.sqrt(dSq) / pointerRadius;
          hue = (hue + prox * 30) % 360;
          bri += prox * 12;
        }
      }

      // 長押し
      if (isHolding && holdTime > 0.3) {
        let hdx = cx - holdX, hdy = cy - holdY;
        let holdRadius = min(holdTime * 80, 300);
        let hdSq = hdx * hdx + hdy * hdy;
        if (hdSq < holdRadius * holdRadius) {
          let dHold = Math.sqrt(hdSq);
          let pull = (1 - dHold / holdRadius) * min(holdTime, 3);
          hue = (hue + pull * 20) % 360;
          bri += pull * 8;
        }
      }

      // 波紋
      for (let rp of ripples) {
        let rdx = cx - rp.x, rdy = cy - rp.y;
        let dR = Math.sqrt(rdx * rdx + rdy * rdy);
        let ripRad = rp.age * 350;
        let ringDist = Math.abs(dR - ripRad);
        if (ringDist < 80) {
          let ripF = (1 - ringDist / 80) * Math.max(0, 1 - rp.age * 0.25);
          hue = (hue + ripF * 30) % 360;
          bri += ripF * 12;
        }
      }

      bri = Math.min(Math.max(bri, 0), 95);
      sat = Math.min(Math.max(sat, 0), 100);
      let idx = (r * pgW + c) * 4;
      hsbToRgb(hue, sat, bri, pxArr, idx);
    }
  }

  pg.updatePixels();
  drawingContext.imageSmoothingEnabled = false;
  image(pg, 0, 0, width, height);

  // --- 波紋更新 ---
  for (let r of ripples) r.age += 0.012;
  ripples = ripples.filter(r => r.age < 4);

  t += 0.008;

  // --- ステータスメッセージ ---
  if (tiltStatusMsg && millis() - statusShowTime < 5000) {
    let msgAlpha = map(millis() - statusShowTime, 4000, 5000, 100, 0);
    msgAlpha = constrain(msgAlpha, 0, 100);
    fill(0, 0, 0, msgAlpha * 0.5);
    noStroke();
    rectMode(CENTER);
    rect(width / 2, 30, textWidth(tiltStatusMsg) + 30, 30, 8);
    fill(0, 0, 100, msgAlpha);
    textSize(16);
    textAlign(CENTER, CENTER);
    text(tiltStatusMsg, width / 2, 30);
  }
}

// ============================================
function lerpHue(h1, h2, amt) {
  let diff = h2 - h1;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return (h1 + diff * amt + 360) % 360;
}

// HSB(h:0-360, s:0-100, b:0-100) → RGBA をピクセル配列に直接書き込み
function hsbToRgb(h, s, b, arr, idx) {
  h = ((h % 360) + 360) % 360;
  s *= 0.01;
  b *= 0.01;
  let c = b * s;
  let x = c * (1 - Math.abs((h / 60) % 2 - 1));
  let m = b - c;
  let r1, g1, b1;
  if (h < 60)       { r1 = c; g1 = x; b1 = 0; }
  else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
  else              { r1 = c; g1 = 0; b1 = x; }
  arr[idx]     = (r1 + m) * 255;
  arr[idx + 1] = (g1 + m) * 255;
  arr[idx + 2] = (b1 + m) * 255;
  arr[idx + 3] = 255;
}

// ============================================
// サウンド
// ============================================
function initSound() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  let sampleRate = audioCtx.sampleRate;
  let bufferLength = sampleRate * 2;
  let noiseBuffer = audioCtx.createBuffer(1, bufferLength, sampleRate);
  let data = noiseBuffer.getChannelData(0);

  // ブラウンノイズ（波の音に近い低音ノイズ）
  let lastOut = 0;
  for (let i = 0; i < bufferLength; i++) {
    let white = Math.random() * 2 - 1;
    data[i] = (lastOut + (0.02 * white)) / 1.02;
    lastOut = data[i];
    data[i] *= 3.5;
  }

  ambientNode = audioCtx.createBufferSource();
  ambientNode.buffer = noiseBuffer;
  ambientNode.loop = true;

  let filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 350;

  ambientGain = audioCtx.createGain();
  ambientGain.gain.value = 0.08;

  ambientNode.connect(filter);
  filter.connect(ambientGain);
  ambientGain.connect(audioCtx.destination);
  ambientNode.start();

  soundStarted = true;
}

document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible' && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
});

// ============================================
// マウス
// ============================================
function mousePressed() {
  if (!appStarted) {
    appStarted = true;
    if (!soundStarted) initSound();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    requestLocation();
    return;
  }
  hasInteracted = true;
  if (!soundStarted) initSound();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

  if (mouseY < height * 0.12) { handleTimeChange(); return; }
  ripples.push({ x: mouseX, y: mouseY, age: 0 });
}

function mouseMoved() {
  if (appStarted) hasInteracted = true;
}

// ============================================
// タッチ
// ============================================
function touchStarted() {
  if (!appStarted) {
    appStarted = true; isTouchDevice = true;
    if (!soundStarted) initSound();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    requestOrientationPermission(); requestMotionPermission();
    requestLocation();
    return false;
  }
  hasInteracted = true;
  if (!soundStarted) initSound();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  isTouchDevice = true;
  if (!hasTilt) { requestOrientationPermission(); requestMotionPermission(); }

  if (touches.length === 1 && touches[0].y < height * 0.12) {
    handleTimeChange(); return false;
  }

  for (let touch of touches) {
    ripples.push({ x: touch.x, y: touch.y, age: 0 });
    lastTouchX = touch.x / width;
    lastTouchY = touch.y / height;
  }

  if (touches.length === 1) {
    holdX = touches[0].x; holdY = touches[0].y;
    holdTime = 0; isHolding = true;
  }
  if (touches.length > 0) { prevTouchX = touches[0].x; prevTouchY = touches[0].y; }
  if (touches.length === 2) {
    lastPinchDist = dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y);
    isHolding = false;
  }
  return false;
}

function touchMoved() {
  if (touches.length === 1) {
    let tx = touches[0].x, ty = touches[0].y;
    let dx = tx - prevTouchX, dy = ty - prevTouchY;
    let spd = sqrt(dx * dx + dy * dy);
    if (spd > 8) {
      gustStrength = min(gustStrength + spd * 0.004, 1.0);
      gustDirX = dx > 0 ? 1 : -1;
      gustDirY = dy > 0 ? 1 : -1;
    }
    prevTouchX = tx; prevTouchY = ty;
    if (isHolding && dist(tx, ty, holdX, holdY) > holdThreshold) { isHolding = false; holdTime = 0; }
    lastTouchX = tx / width; lastTouchY = ty / height;

    let tooClose = false;
    for (let r of ripples) { if (dist(r.x, r.y, tx, ty) < 60 && r.age < 0.1) { tooClose = true; break; } }
    if (!tooClose) ripples.push({ x: tx, y: ty, age: 0 });
  }
  if (touches.length === 2) {
    let cd = dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y);
    if (lastPinchDist > 0) pinchScale = constrain(pinchScale + (cd - lastPinchDist) * 0.003, 0.4, 2.5);
    lastPinchDist = cd;
    lastTouchX = (touches[0].x + touches[1].x) / 2 / width;
    lastTouchY = (touches[0].y + touches[1].y) / 2 / height;
  }
  return false;
}

function touchEnded() {
  isHolding = false; holdTime = 0;
  if (touches.length === 0) lastPinchDist = 0;
  return false;
}

// ============================================
// 時刻変更
// ============================================
function handleTimeChange() {
  let now_ms = millis();
  if (now_ms - lastSkyTapTime < 400) {
    manualHour = -1;
    tiltStatusMsg = 'Back to real time';
    statusShowTime = millis(); lastSkyTapTime = 0;
  } else {
    if (manualHour < 0) { let now = new Date(); manualHour = (now.getHours() + 2) % 24; }
    else { manualHour = (manualHour + 2) % 24; }
    tiltStatusMsg = colorThemes[floor(manualHour / 2) % 12].name;
    statusShowTime = millis(); lastSkyTapTime = now_ms;
  }
}

// ============================================
// デバイスセンサー
// ============================================
function handleOrientation(event) {
  if (event.gamma !== null && event.beta !== null) { tiltX = event.gamma; tiltY = event.beta; hasTilt = true; }
  if (event.alpha !== null) { compassHeading = event.alpha; hasCompass = true; }
}

function requestOrientationPermission() {
  if (hasTilt) return;
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    if (permissionRequested) return; permissionRequested = true;
    DeviceOrientationEvent.requestPermission().then(function(r) {
      if (r === 'granted') { window.addEventListener('deviceorientation', handleOrientation); tiltStatusMsg = 'Tilt enabled'; }
      else { tiltStatusMsg = 'Touch to interact'; }
      statusShowTime = millis();
    }).catch(function() { tiltStatusMsg = 'Touch to interact'; statusShowTime = millis(); });
  } else if (typeof DeviceOrientationEvent !== 'undefined') {
    if (!permissionRequested) {
      permissionRequested = true;
      window.addEventListener('deviceorientation', handleOrientation);
      setTimeout(function() { tiltStatusMsg = hasTilt ? 'Tilt enabled' : 'Touch to interact'; statusShowTime = millis(); }, 1000);
    }
  } else { tiltStatusMsg = 'Touch to interact'; statusShowTime = millis(); }
}

let motionPermissionRequested = false;
function handleMotion(event) {
  let acc = event.accelerationIncludingGravity || event.acceleration;
  if (!acc) return;
  let ax = acc.x || 0, ay = acc.y || 0, az = acc.z || 0;
  let d = abs(ax - lastAccX) + abs(ay - lastAccY) + abs(az - lastAccZ);
  lastAccX = ax; lastAccY = ay; lastAccZ = az;
  if (d > 15) shakeIntensity = min(shakeIntensity + d * 0.02, 1.0);
}

function requestMotionPermission() {
  if (motionPermissionRequested) return;
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    motionPermissionRequested = true;
    DeviceMotionEvent.requestPermission().then(function(r) { if (r === 'granted') window.addEventListener('devicemotion', handleMotion); }).catch(function(){});
  } else if (typeof DeviceMotionEvent !== 'undefined') { motionPermissionRequested = true; window.addEventListener('devicemotion', handleMotion); }
}

// ============================================
// 位置情報
// ============================================
function requestLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      let lat = pos.coords.latitude;
      let absLat = abs(lat);
      climateFactor = constrain(map(absLat, 0, 60, 1, 0), 0, 1);
      hasLocation = true;
      let climateLabel;
      if (climateFactor > 0.7) climateLabel = 'Tropical waters';
      else if (climateFactor > 0.3) climateLabel = 'Temperate waters';
      else climateLabel = 'Arctic waters';
      tiltStatusMsg = climateLabel;
      statusShowTime = millis();
    },
    function(err) {
      console.log('位置情報の取得に失敗:', err.message);
    },
    { timeout: 10000 }
  );
}

// ============================================
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  pg = createGraphics(ceil(width / dotSize), ceil(height / dotSize));
  pg.pixelDensity(1);
}
