// ============================================
// Meadow — Breeze and Light
// Aurora式ピクセルバッファで草原を描く
// 奥行き勾配 + 風の走行波 + 木漏れ日 + 草テクスチャ
// ============================================

let t = 0;
let soundStarted = false;
let appStarted = false;

// --- Web Audio API ---
let audioCtx;
let windNode, windGain;
let undertoneNode, undertoneGain;

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

// --- 時刻制御 ---
let manualHour = -1;
let lastSkyTapTime = 0;

// --- 波紋（風の輪）---
let ripples = [];

// --- グリッドドット ---
let dotSize = 6;
let flowOffX = 0;
let flowOffY = 0;
let pg;

// --- 光パッチ（木漏れ日）---
let lightPatches = [];
let numLightPatches = 12;

// --- 色テーマ: 2時間ごと × 12 ---
let colorThemes = [
  // 0:00 — Starlit Field
  { hues: [220, 175, 260, 195, 165, 240, 185, 210],
    sat: [20, 45], bri: [5, 18], light: [220, 10, 15], name: 'Starlit Field' },
  // 2:00 — Sleeping Meadow
  { hues: [200, 165, 230, 155, 210, 250, 180, 220],
    sat: [18, 42], bri: [6, 20], light: [215, 8, 18], name: 'Sleeping Meadow' },
  // 4:00 — First Light
  { hues: [280, 195, 320, 155, 250, 175, 300, 210],
    sat: [25, 50], bri: [12, 30], light: [30, 20, 35], name: 'First Light' },
  // 6:00 — Golden Dawn
  { hues: [80, 40, 120, 25, 100, 55, 90, 65],
    sat: [40, 65], bri: [22, 50], light: [35, 60, 80], name: 'Golden Dawn' },
  // 8:00 — Morning Dew
  { hues: [132, 160, 115, 172, 125, 155, 112, 148],
    sat: [45, 70], bri: [28, 58], light: [140, 30, 90], name: 'Morning Dew' },
  // 10:00 — Bright Meadow
  { hues: [128, 162, 110, 172, 120, 155, 105, 148],
    sat: [50, 75], bri: [30, 60], light: [130, 15, 95], name: 'Bright Meadow' },
  // 12:00 — High Sun
  { hues: [125, 158, 108, 168, 118, 150, 102, 142],
    sat: [48, 72], bri: [28, 58], light: [120, 10, 100], name: 'High Sun' },
  // 14:00 — Warm Breeze
  { hues: [120, 105, 145, 110, 132, 115, 142, 108],
    sat: [45, 68], bri: [28, 55], light: [110, 35, 92], name: 'Warm Breeze' },
  // 16:00 — Amber Hour
  { hues: [70, 28, 105, 18, 82, 42, 115, 55],
    sat: [42, 65], bri: [25, 50], light: [30, 55, 85], name: 'Amber Hour' },
  // 18:00 — Golden Hour
  { hues: [48, 18, 82, 8, 62, 32, 95, 52],
    sat: [40, 65], bri: [20, 45], light: [20, 70, 75], name: 'Golden Hour' },
  // 20:00 — Twilight Field
  { hues: [260, 195, 290, 175, 240, 215, 275, 225],
    sat: [30, 50], bri: [10, 28], light: [250, 15, 25], name: 'Twilight Field' },
  // 22:00 — Night Meadow
  { hues: [225, 180, 255, 165, 210, 245, 190, 218],
    sat: [22, 45], bri: [6, 20], light: [220, 10, 18], name: 'Night Meadow' },
];

// ============================================
function setup() {
  pixelDensity(1);
  createCanvas(windowWidth, windowHeight);
  noSmooth();
  colorMode(HSB, 360, 100, 100, 100);
  noStroke();

  pg = createGraphics(ceil(windowWidth / dotSize), ceil(windowHeight / dotSize));
  pg.pixelDensity(1);

  initLightPatches();
}

function initLightPatches() {
  lightPatches = [];
  numLightPatches = floor(width * height / 80000) + 5;
  for (let i = 0; i < numLightPatches; i++) {
    lightPatches.push({
      nox: random(1000),
      noy: random(1000),
      size: random(80, 250),
      intensity: random(0.3, 1.0),
    });
  }
}

// ============================================
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
  tb = tb * tb * (3 - 2 * tb);
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

  let flowX, flowY;
  if (hasCompass) {
    flowX = sin(radians(compassHeading)) * 1.5;
    flowY = cos(radians(compassHeading)) * 0.5;
  } else if (hasInteracted) {
    flowX = (mx - 0.5) * 2;
    flowY = (my - 0.5) * 1.2;
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

  // 自律ドリフト: 風が草原を駆け抜ける
  let driftSpeed = noise(t * 0.08, 100) * 0.006 + 0.002;
  let driftAngle = noise(t * 0.03, 200) * TWO_PI * 2;
  flowOffX += cos(driftAngle) * driftSpeed;
  flowOffY += sin(driftAngle) * driftSpeed;

  // 操作による追加フロー
  flowOffX += flowX * 0.002;
  flowOffY += flowY * 0.002;
  flowOffX += gustDirX * gustStrength * 0.008;
  flowOffY += gustDirY * gustStrength * 0.008;

  // --- 光パッチの現在位置を計算 ---
  let lpPositions = [];
  for (let lp of lightPatches) {
    lpPositions.push({
      x: noise(lp.nox, t * 0.025) * width,
      y: noise(lp.noy, t * 0.025) * height,
      size: lp.size,
      intensity: lp.intensity,
    });
  }

  // ==============================================
  // ピクセルバッファ描画
  // ==============================================
  let pgW = pg.width;
  let pgH = pg.height;

  let satLow = lerp(cur.sat[0], nxt.sat[0], tb);
  let satHigh = lerp(cur.sat[1], nxt.sat[1], tb);
  let briLow = lerp(cur.bri[0], nxt.bri[0], tb);
  let briHigh = lerp(cur.bri[1], nxt.bri[1], tb);
  let pointerRadius = 250;
  let prSq = pointerRadius * pointerRadius;

  pg.loadPixels();
  let pxArr = pg.pixels;

  for (let r = 0; r < pgH; r++) {
    for (let c = 0; c < pgW; c++) {
      let gx = c * dotSize;
      let gy = r * dotSize;
      let cx = gx + dotSize * 0.5;
      let cy = gy + dotSize * 0.5;

      // --- 奥行き勾配: 上=遠景, 下=手前 ---
      let depthRatio = r / pgH;

      // --- ドメインワーピング: 風の走行波を含む ---
      let warpX = noise(gx * 0.001, gy * 0.001, t * 0.03) * 400 - 200;
      let warpY = noise(gx * 0.001 + 50, gy * 0.001 + 50, t * 0.03) * 400 - 200;

      // 風の走行波: 草原を横に駆け抜ける波（Meadow固有）
      let windWave1 = Math.sin(gx * 0.003 - t * 2.0 + gy * 0.001) * 35;
      let windWave2 = Math.sin(gx * 0.005 + t * 1.3 - gy * 0.002) * 15;
      let windWave3 = Math.sin(gx * 0.001 - t * 0.8 + gy * 0.003) * 25;
      warpX += (windWave1 + windWave2 + windWave3) * (0.5 + depthRatio * 0.5);

      // 突風
      warpX += gustDirX * gustStrength * 200;
      warpY += gustDirY * gustStrength * 120;

      // === ポインタ: 草を掻き分ける（ワーピング座標を放射状に押す）===
      let partingBri = 0;
      if (hasInteracted) {
        let ddx = cx - px, ddy = cy - py;
        let dSq = ddx * ddx + ddy * ddy;
        if (dSq < prSq) {
          let dDist = Math.sqrt(dSq);
          let prox = 1 - dDist / pointerRadius;
          let pushStr = prox * prox * 180;
          // 放射状にワーピング座標を押し出す → 模様が割れる
          let angle = Math.atan2(ddy, ddx);
          warpX -= Math.cos(angle) * pushStr;
          warpY -= Math.sin(angle) * pushStr;
          // フチの部分は少し明るく（光が差し込む）
          let rimZone = pointerRadius * 0.5;
          let rimDist = Math.abs(dDist - rimZone);
          if (rimDist < rimZone * 0.6) {
            partingBri = (1 - rimDist / (rimZone * 0.6)) * prox * 12;
          }
        }
      }

      // === 長押し: 草を踏み均す（ワーピング凍結＋沈み込み）===
      let trampleDarken = 0;
      if (isHolding && holdTime > 0.3) {
        let hdx = cx - holdX, hdy = cy - holdY;
        let holdRadius = Math.min(holdTime * 80, 300);
        let hdSq = hdx * hdx + hdy * hdy;
        if (hdSq < holdRadius * holdRadius) {
          let dHold = Math.sqrt(hdSq);
          let pull = (1 - dHold / holdRadius) * Math.min(holdTime, 3);
          // ワーピングを中心に向かって縮小 → 模様が潰れる/均一化
          warpX *= (1 - pull * 0.7);
          warpY *= (1 - pull * 0.7);
          // 踏みつけた草は暗く沈む
          trampleDarken = pull * 0.6;
        }
      }

      // === 波紋: 風の突風（ワーピング座標を波で歪ませる）===
      for (let rp of ripples) {
        let rdx = cx - rp.x, rdy = cy - rp.y;
        let dR = Math.sqrt(rdx * rdx + rdy * rdy);
        let ripRad = rp.age * 350;
        let ringDist = Math.abs(dR - ripRad);
        if (ringDist < 120) {
          let fade = Math.max(0, 1 - rp.age * 0.25);
          let ripF = (1 - ringDist / 120) * fade;
          // 放射方向にワーピング座標を押す → 草が波のように倒れる
          let ripAngle = Math.atan2(rdy, rdx);
          let pushAmt = ripF * 150;
          warpX += Math.cos(ripAngle) * pushAmt;
          warpY += Math.sin(ripAngle) * pushAmt * 0.4;
        }
      }

      let wx = gx + warpX;
      let wy = gy + warpY;

      // --- 色相: パレット間をスムーズに補間 ---
      // 草テクスチャ: x方向を細かく、y方向を粗く → 縦筋っぽい質感
      let ciRaw = noise(wx * 0.001, wy * 0.0004, t * 0.05) * 8;
      let ci0 = floor(ciRaw) % 8;
      let ci1 = (ci0 + 1) % 8;
      let ciFrac = ciRaw - floor(ciRaw);
      let baseHue = lerpHue(
        lerpHue(cur.hues[ci0], nxt.hues[ci0], tb),
        lerpHue(cur.hues[ci1], nxt.hues[ci1], tb),
        ciFrac
      );

      // 3層のhueモジュレーション（異方的スケール）
      let hue1 = noise(wx * 0.0008 + flowOffX, wy * 0.0003 + flowOffY, t * 0.04) * 60 - 30;
      let hue2 = noise(wx * 0.002 + 200, wy * 0.001 + 200, t * 0.08) * 30 - 15;
      let hue3 = noise(gx * 0.0005 + 400, gy * 0.0002 + 400, t * 0.02) * 20 - 10;
      let hue = (baseHue + hue1 + hue2 + hue3 + 360) % 360;

      // --- 彩度・明度 ---
      let briNoise = noise(wx * 0.001 + 600, wy * 0.0004 + 600, t * 0.05);
      let sat = lerp(satLow, satHigh, briNoise);
      let bri = lerp(briLow, briHigh, briNoise);

      // 奥行き勾配: 手前ほど明るく鮮やかに
      bri += depthRatio * 12;
      sat += depthRatio * 8;

      // シェイク
      bri += shakeIntensity * 25;

      // --- 木漏れ日（光パッチ）---
      for (let lp of lpPositions) {
        let ldx = cx - lp.x, ldy = cy - lp.y;
        let ldSq = ldx * ldx + ldy * ldy;
        let lpRad = lp.size;
        let lpRadSq = lpRad * lpRad;
        if (ldSq < lpRadSq) {
          let proximity = 1 - Math.sqrt(ldSq / lpRadSq);
          let lpEffect = proximity * proximity * lp.intensity;
          bri += lpEffect * 15;
          sat *= (1 - lpEffect * 0.3);
          hue = (hue + lpEffect * 10) % 360;
        }
      }

      // ポインタの掻き分けフチの光
      bri += partingBri;

      // 長押しの踏み均し: 暗くなる＋彩度低下（踏まれた草）
      if (trampleDarken > 0) {
        bri *= (1 - trampleDarken * 0.5);
        sat *= (1 - trampleDarken * 0.4);
        // 踏まれた草は茶色寄りに
        hue = lerpHue(hue, 35, trampleDarken * 0.3);
      }

      bri = Math.min(bri, 95);
      sat = Math.min(sat, 100);
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

  let sr = audioCtx.sampleRate;
  let len = sr * 2;

  // ピンクノイズ → バンドパス（草のさわさわ音）
  let wBuf = audioCtx.createBuffer(1, len, sr);
  let wD = wBuf.getChannelData(0);
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
  for (let i = 0; i < len; i++) {
    let w = Math.random()*2-1;
    b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
    b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
    b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
    wD[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11; b6=w*0.115926;
  }
  windNode = audioCtx.createBufferSource();
  windNode.buffer = wBuf; windNode.loop = true;
  let wF = audioCtx.createBiquadFilter();
  wF.type='bandpass'; wF.frequency.value=600; wF.Q.value=0.4;
  windGain = audioCtx.createGain(); windGain.gain.value=0.06;
  windNode.connect(wF); wF.connect(windGain); windGain.connect(audioCtx.destination);
  windNode.start();

  // ブラウンノイズ → ローパス（深い風の低音）
  let dBuf = audioCtx.createBuffer(1, len, sr);
  let dD = dBuf.getChannelData(0);
  let last=0;
  for (let i = 0; i < len; i++) {
    let w = Math.random()*2-1;
    dD[i]=(last+(0.02*w))/1.02; last=dD[i]; dD[i]*=3.5;
  }
  undertoneNode = audioCtx.createBufferSource();
  undertoneNode.buffer = dBuf; undertoneNode.loop = true;
  let dF = audioCtx.createBiquadFilter();
  dF.type='lowpass'; dF.frequency.value=200;
  undertoneGain = audioCtx.createGain(); undertoneGain.gain.value=0.025;
  undertoneNode.connect(dF); dF.connect(undertoneGain); undertoneGain.connect(audioCtx.destination);
  undertoneNode.start();

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
    return;
  }
  hasInteracted = true;
  if (!soundStarted) initSound();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

  if (mouseY < height * 0.3) { handleTimeChange(); return; }
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
    return false;
  }
  hasInteracted = true;
  if (!soundStarted) initSound();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  isTouchDevice = true;
  if (!hasTilt) { requestOrientationPermission(); requestMotionPermission(); }

  if (touches.length === 1 && touches[0].y < height * 0.3) {
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
    let spd = sqrt(dx*dx+dy*dy);
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
    if (lastPinchDist > 0) pinchScale = constrain(pinchScale + (cd - lastPinchDist) * 0.003, 0.3, 2.5);
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
  let ax=acc.x||0, ay=acc.y||0, az=acc.z||0;
  let d = abs(ax-lastAccX)+abs(ay-lastAccY)+abs(az-lastAccZ);
  lastAccX=ax; lastAccY=ay; lastAccZ=az;
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
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  pg = createGraphics(ceil(width / dotSize), ceil(height / dotSize));
  pg.pixelDensity(1);
  initLightPatches();
}
