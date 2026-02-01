// ============================================
// Aurora — Wavesシリーズ第2弾
// 無数の星と溶け合う色彩の抽象世界
// ============================================

let t = 0;
let soundStarted = false;
let appStarted = false;

// --- Web Audio API ---
let audioCtx;
let windNode, windGain;
let driftNode, driftGain;

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

// --- 波紋 ---
let ripples = [];

// --- 星 ---
let stars = [];
let numStars = 600;

// --- グリッドドット ---
let dotSize = 6;
let flowOffX = 0;
let flowOffY = 0;
let pg;

// --- 色テーマ: 2時間ごと ---
let colorThemes = [
  { hues: [240, 260, 280, 220, 300, 180, 320, 200], sat: [50, 72], bri: [25, 55], name: 'Midnight Indigo' },
  { hues: [270, 290, 310, 250, 330, 200, 350, 230], sat: [55, 75], bri: [28, 58], name: 'Violet Dream' },
  { hues: [310, 330, 350, 290, 340, 20, 280, 5],    sat: [45, 68], bri: [32, 62], name: 'Rose Dawn' },
  { hues: [20, 35, 50, 10, 45, 60, 0, 80],          sat: [55, 80], bri: [40, 70], name: 'Golden Light' },
  { hues: [80, 100, 120, 60, 140, 40, 160, 90],     sat: [50, 72], bri: [35, 65], name: 'Emerald Morning' },
  { hues: [160, 180, 190, 150, 200, 130, 210, 170],  sat: [45, 68], bri: [40, 70], name: 'Crystal Teal' },
  { hues: [180, 200, 40, 160, 60, 220, 30, 300],     sat: [28, 52], bri: [60, 88], name: 'White Prism' },
  { hues: [200, 220, 260, 190, 240, 280, 170, 300],  sat: [42, 65], bri: [45, 72], name: 'Sky Lavender' },
  { hues: [350, 10, 25, 340, 15, 40, 330, 50],       sat: [50, 72], bri: [45, 72], name: 'Warm Salmon' },
  { hues: [5, 20, 350, 30, 340, 45, 320, 55],        sat: [55, 80], bri: [35, 62], name: 'Amber Dusk' },
  { hues: [120, 150, 230, 100, 250, 80, 270, 140],   sat: [50, 75], bri: [28, 58], name: 'Aurora Green' },
  { hues: [230, 250, 270, 210, 290, 190, 310, 220],  sat: [50, 72], bri: [20, 48], name: 'Night Veil' },
];

function setup() {
  pixelDensity(1);
  createCanvas(windowWidth, windowHeight);
  noSmooth();
  colorMode(HSB, 360, 100, 100, 100);
  rectMode(CENTER);
  noStroke();

  pg = createGraphics(ceil(windowWidth / dotSize), ceil(windowHeight / dotSize));
  pg.pixelDensity(1);

  initStars();
}

function initStars() {
  stars = [];
  for (let i = 0; i < numStars; i++) {
    stars.push({
      x: random(width),
      y: random(height),
      size: random(0.5, 2.5),
      noiseOff: random(1000),
      baseAlpha: random(20, 80),
      hue: random(360),
      sat: random(0, 25),
      bri: random(85, 100),
    });
  }
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

  // 自律ドリフト: ゆっくり色模様が漂う
  let driftSpeed = noise(t * 0.1, 100) * 0.008 + 0.001;
  let driftAngle = noise(t * 0.04, 200) * TWO_PI * 2;
  flowOffX += cos(driftAngle) * driftSpeed;
  flowOffY += sin(driftAngle) * driftSpeed;

  // 操作による追加フロー
  flowOffX += flowX * 0.002;
  flowOffY += flowY * 0.002;
  flowOffX += gustDirX * gustStrength * 0.008;
  flowOffY += gustDirY * gustStrength * 0.008;

  // ==============================================
  // グリッドドット: ピクセルバッファで高速描画
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

      // --- ドメインワーピング: 大きく歪ませてオーロラのカーテン ---
      let warpX = noise(gx * 0.001, gy * 0.001, t * 0.05) * 500 - 250;
      let warpY = noise(gx * 0.001 + 50, gy * 0.001 + 50, t * 0.05) * 500 - 250;
      let wx = gx + warpX;
      let wy = gy + warpY;

      // --- 色相: パレット間をスムーズに補間 ---
      let ciRaw = noise(wx * 0.0007, wy * 0.0007, t * 0.06) * 8;
      let ci0 = floor(ciRaw) % 8;
      let ci1 = (ci0 + 1) % 8;
      let ciFrac = ciRaw - floor(ciRaw);
      let baseHue = lerpHue(
        lerpHue(cur.hues[ci0], nxt.hues[ci0], tb),
        lerpHue(cur.hues[ci1], nxt.hues[ci1], tb),
        ciFrac
      );
      let hue1 = noise(wx * 0.0005 + flowOffX, wy * 0.0012 + flowOffY, t * 0.04) * 100 - 50;
      let hue2 = noise(wx * 0.002 + 200, wy * 0.002 + 200, t * 0.1) * 60 - 30;
      let hue3 = noise(gx * 0.0004 + 400, gy * 0.0004 + 400, t * 0.02) * 40 - 20;
      let hue = (baseHue + hue1 + hue2 + hue3 + 360) % 360;

      // --- 彩度・明度 ---
      let briNoise = noise(wx * 0.0007 + 600, wy * 0.0015 + 600, t * 0.07);
      let sat = lerp(satLow, satHigh, briNoise);
      let bri = lerp(briLow, briHigh, briNoise);

      bri += shakeIntensity * 25;

      // ポインタ近くは色相シフト + 明るく（距離の2乗で判定して高速化）
      if (hasInteracted) {
        let ddx = cx - px, ddy = cy - py;
        let dSq = ddx * ddx + ddy * ddy;
        if (dSq < prSq) {
          let prox = 1 - Math.sqrt(dSq) / pointerRadius;
          hue = (hue + prox * 40) % 360;
          bri += prox * 15;
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
        let ripRad = rp.age * 300;
        let ringDist = Math.abs(dR - ripRad);
        if (ringDist < 80) {
          let ripF = (1 - ringDist / 80) * Math.max(0, 1 - rp.age * 0.25);
          hue = (hue + ripF * 40) % 360;
          bri += ripF * 10;
        }
      }

      bri = Math.min(bri, 95);
      let idx = (r * pgW + c) * 4;
      hsbToRgb(hue, sat, bri, pxArr, idx);
    }
  }

  pg.updatePixels();
  drawingContext.imageSmoothingEnabled = false;
  image(pg, 0, 0, width, height);

  // ==============================================
  // 星の描画（時刻連動）
  // ==============================================
  rectMode(CENTER);

  // 夜は明るく、昼は控えめ
  let hNorm = ((h % 24) + 24) % 24;
  let nightBri;
  if (hNorm < 5) nightBri = 1.0;
  else if (hNorm < 8) nightBri = lerp(1.0, 0.12, (hNorm - 5) / 3);
  else if (hNorm < 17) nightBri = 0.12;
  else if (hNorm < 20) nightBri = lerp(0.12, 1.0, (hNorm - 17) / 3);
  else nightBri = 1.0;

  for (let s of stars) {
    let twinkle = noise(s.noiseOff, t * 0.4) * 0.7 + 0.3;
    let a = s.baseAlpha * twinkle * nightBri;
    let starHue = lerpHue(s.hue, lerpHue(cur.hues[0], nxt.hues[0], tb), 0.15);
    let ss = s.size * (0.8 + twinkle * 0.4);
    fill(starHue, s.sat, s.bri, min(a, 100));
    rect(s.x, s.y, ss, ss);
  }

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

  // ピンクノイズ → バンドパス（風）
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
  wF.type='bandpass'; wF.frequency.value=400; wF.Q.value=0.5;
  windGain = audioCtx.createGain(); windGain.gain.value=0.05;
  windNode.connect(wF); wF.connect(windGain); windGain.connect(audioCtx.destination);
  windNode.start();

  // ブラウンノイズ → ローパス（ドリフト）
  let dBuf = audioCtx.createBuffer(1, len, sr);
  let dD = dBuf.getChannelData(0);
  let last=0;
  for (let i = 0; i < len; i++) {
    let w = Math.random()*2-1;
    dD[i]=(last+(0.02*w))/1.02; last=dD[i]; dD[i]*=3.5;
  }
  driftNode = audioCtx.createBufferSource();
  driftNode.buffer = dBuf; driftNode.loop = true;
  let dF = audioCtx.createBiquadFilter();
  dF.type='lowpass'; dF.frequency.value=250;
  driftGain = audioCtx.createGain(); driftGain.gain.value=0.03;
  driftNode.connect(dF); dF.connect(driftGain); driftGain.connect(audioCtx.destination);
  driftNode.start();

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
  initStars();
}
