// ============================================
// Clouds — Drifting Forms
// 密度フィールドで有機的な雲を描画
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

// --- ポインタ速度 ---
let prevPX = -1, prevPY = -1;
let pointerVX = 0, pointerVY = 0;

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

// --- 色テーマ: 2時間ごと ---
let colorThemes = [
  // 0:00 Midnight Nimbus — 深い青灰色、インディゴ
  { hues: [220, 235, 250, 210, 260, 200, 270, 215], sat: [30, 55], bri: [18, 50], clearBri: 4, name: 'Midnight Nimbus' },
  // 2:00 Phantom Drift — 紫青、幽玄的
  { hues: [250, 265, 280, 240, 290, 230, 300, 255], sat: [35, 58], bri: [20, 52], clearBri: 6, name: 'Phantom Drift' },
  // 4:00 First Blush — 払暁のピンク、マゼンタ
  { hues: [300, 320, 340, 290, 350, 280, 10, 310], sat: [35, 60], bri: [25, 58], clearBri: 10, name: 'First Blush' },
  // 6:00 Dawn Fire — 暖かいピンク、金、オレンジ
  { hues: [15, 30, 350, 40, 340, 50, 330, 20], sat: [45, 70], bri: [35, 68], clearBri: 18, name: 'Dawn Fire' },
  // 8:00 Morning Fleece — 柔らかい白、暖色アクセント
  { hues: [30, 45, 20, 50, 15, 60, 10, 40], sat: [15, 35], bri: [55, 85], clearBri: 35, name: 'Morning Fleece' },
  // 10:00 Silver Cumulus — 明るい白、青い影
  { hues: [210, 220, 200, 230, 190, 240, 35, 215], sat: [12, 30], bri: [60, 90], clearBri: 45, name: 'Silver Cumulus' },
  // 12:00 High Noon — 眩しい白、最小限の色
  { hues: [200, 210, 40, 195, 50, 220, 30, 205], sat: [8, 22], bri: [65, 95], clearBri: 60, name: 'High Noon' },
  // 14:00 Afternoon Drift — 暖かい白、黄色味
  { hues: [40, 50, 30, 55, 25, 60, 20, 45], sat: [12, 32], bri: [60, 88], clearBri: 48, name: 'Afternoon Drift' },
  // 16:00 Amber Veil — 黄金のグロー、暖かい影
  { hues: [30, 40, 20, 50, 10, 55, 5, 35], sat: [35, 60], bri: [45, 75], clearBri: 28, name: 'Amber Veil' },
  // 18:00 Sunset Billow — 深いオレンジ、紫、劇的
  { hues: [10, 350, 25, 340, 30, 330, 280, 15], sat: [50, 75], bri: [35, 65], clearBri: 15, name: 'Sunset Billow' },
  // 20:00 Twilight Shroud — 紫、青、薄暮
  { hues: [260, 275, 290, 250, 300, 240, 310, 265], sat: [40, 62], bri: [22, 52], clearBri: 8, name: 'Twilight Shroud' },
  // 22:00 Night Canopy — 暗い青灰、微かな紫
  { hues: [230, 245, 260, 220, 270, 215, 280, 240], sat: [32, 55], bri: [16, 45], clearBri: 4, name: 'Night Canopy' },
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

  // ポインタ速度（スムージング）
  if (prevPX < 0) { prevPX = px; prevPY = py; }
  pointerVX = (px - prevPX) * 0.4 + pointerVX * 0.6;
  pointerVY = (py - prevPY) * 0.4 + pointerVY * 0.6;
  prevPX = px; prevPY = py;
  let pointerSpeed = Math.sqrt(pointerVX * pointerVX + pointerVY * pointerVY);

  // 自律ドリフト: ゆっくり雲が漂う
  let driftSpeed = noise(t * 0.1, 100) * 0.01 + 0.002;
  let driftAngle = noise(t * 0.03, 200) * TWO_PI * 2;
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
  let clearBri = lerp(cur.clearBri, nxt.clearBri, tb);

  // ピンチによる密度スレッショルド調整
  // pinchScale>1(広げる)→閾値下がる→雲多い、pinchScale<1(縮める)→雲少ない
  let cloudThreshold = 0.65 / pinchScale;

  pg.loadPixels();
  let pxArr = pg.pixels;

  for (let r = 0; r < pgH; r++) {
    for (let c = 0; c < pgW; c++) {
      let gx = c * dotSize;
      let gy = r * dotSize;
      let cx = gx + dotSize * 0.5;
      let cy = gy + dotSize * 0.5;

      // --- ドメインワーピング: 大振幅でもこもこした雲の形に ---
      let warpX = noise(gx * 0.0008 + flowOffX, gy * 0.0008, t * 0.03) * 600 - 300;
      let warpY = noise(gx * 0.0008 + 50 + flowOffX, gy * 0.0008 + 50, t * 0.03) * 600 - 300;
      // 突風: ドメインワーピングを引き伸ばす（雲が流れる表現）
      warpX += gustDirX * gustStrength * 250;
      warpY += gustDirY * gustStrength * 150;

      // ポインタ: ワーピング座標を放射状に押し出す（雲が避ける）
      if (hasInteracted) {
        let ddx = cx - px, ddy = cy - py;
        let dSq = ddx * ddx + ddy * ddy;
        // 速度が速いほど影響範囲を広げる
        let speedBoost = Math.min(pointerSpeed * 0.15, 1.0);
        let warpPushR = 380 + speedBoost * 200;
        if (dSq < warpPushR * warpPushR && dSq > 1) {
          let dDist = Math.sqrt(dSq);
          let prox = 1 - dDist / warpPushR;
          // 呼吸する脈動: 押し出し強度がゆっくり波打つ
          let breathe = 1.0 + Math.sin(t * 0.6 + dDist * 0.01) * 0.2
                            + noise(t * 0.3, dDist * 0.005) * 0.3;
          let pushStr = prox * prox * prox * (800 + speedBoost * 600) * breathe;
          let angle = Math.atan2(ddy, ddx);
          // ノイズで押し出し方向に揺らぎを加えて有機的な形に
          let nAngle = noise(cx * 0.004 + t * 0.4, cy * 0.004 + t * 0.2) * 1.6 - 0.8;
          angle += nAngle * prox;
          warpX -= Math.cos(angle) * pushStr;
          warpY -= Math.sin(angle) * pushStr;
          // 緩やかな渦: 接線方向の力で雲がゆっくり旋回する
          let tangAngle = angle + HALF_PI;
          let swirlStr = prox * prox * 120 * (0.5 + noise(t * 0.25, 300) * 0.5);
          warpX += Math.cos(tangAngle) * swirlStr;
          warpY += Math.sin(tangAngle) * swirlStr;
          // 移動方向への追加押し出し（雲が動きに沿って流れる）
          if (pointerSpeed > 2) {
            let velPush = prox * prox * Math.min(pointerSpeed * 0.8, 25);
            warpX += pointerVX * velPush;
            warpY += pointerVY * velPush;
          }
        }
      }

      // 波紋: ワーピングも放射状に押す（クリックで雲が流れる）
      for (let rp of ripples) {
        let rdx = cx - rp.x, rdy = cy - rp.y;
        let dR = Math.sqrt(rdx * rdx + rdy * rdy);
        let ripRad = rp.age * 280;
        let fade = Math.max(0, 1 - rp.age * 0.25);
        let ringDist = Math.abs(dR - ripRad);
        if (ringDist < 120 && fade > 0) {
          let ripF = (1 - ringDist / 120) * fade;
          let ripAngle = Math.atan2(rdy, rdx);
          warpX += Math.cos(ripAngle) * ripF * 250;
          warpY += Math.sin(ripAngle) * ripF * 250;
        }
      }

      let wx = gx + warpX;
      let wy = gy + warpY;

      // --- 密度フィールド: 3層ノイズ ---
      let d1 = noise(wx * 0.0005 + flowOffX * 0.5, wy * 0.0005 + flowOffY * 0.5, t * 0.02);
      let d2 = noise(wx * 0.0015 + flowOffX, wy * 0.0015 + flowOffY, t * 0.04) * 0.5;
      let d3 = noise(wx * 0.004 + flowOffX * 1.5, wy * 0.004 + flowOffY * 1.5, t * 0.06) * 0.25;
      let rawDensity = d1 + d2 + d3;

      // 長押し: 雲を割る（渦巻き＋密度低下）
      if (isHolding && holdTime > 0.3) {
        let hdx = cx - holdX, hdy = cy - holdY;
        let holdRadius = Math.min(holdTime * 80, 350);
        let hdSq = hdx * hdx + hdy * hdy;
        if (hdSq < holdRadius * holdRadius) {
          let dHold = Math.sqrt(hdSq);
          let pull = (1 - dHold / holdRadius) * Math.min(holdTime, 3);
          rawDensity -= pull * 0.7;
          // 渦巻きワーピング
          let angle = Math.atan2(hdy, hdx) + pull * 1.5;
          let vortexR = dHold * 0.15 * pull;
          wx += Math.cos(angle) * vortexR;
          wy += Math.sin(angle) * vortexR;
        }
      }

      // 波紋: 衝撃波（中心=晴れ間、リング=圧縮雲）
      for (let rp of ripples) {
        let rdx = cx - rp.x, rdy = cy - rp.y;
        let dR = Math.sqrt(rdx * rdx + rdy * rdy);
        let ripRad = rp.age * 250;
        let fade = Math.max(0, 1 - rp.age * 0.3);
        // 中心の晴れ間（衝撃波の内側）
        if (dR < ripRad * 0.5 && ripRad > 10) {
          let clearF = (1 - dR / (ripRad * 0.5)) * fade * 0.6;
          rawDensity -= clearF;
        }
        // 圧縮リング（衝撃波の前面）
        let ringDist = Math.abs(dR - ripRad);
        if (ringDist < 70) {
          let ringF = (1 - ringDist / 70) * fade;
          rawDensity += ringF * 0.45;
        }
      }

      // smoothstep で雲のエッジを作る
      let edge0 = cloudThreshold - 0.3;
      let edge1 = cloudThreshold + 0.3;
      let stVal = (rawDensity - edge0) / (edge1 - edge0);
      stVal = stVal < 0 ? 0 : (stVal > 1 ? 1 : stVal);
      let density = stVal * stVal * (3 - 2 * stVal);

      // ポインタ: 密度を有機的に減衰（空気の存在感を表現）
      if (hasInteracted) {
        let ddx = cx - px, ddy = cy - py;
        let dSq = ddx * ddx + ddy * ddy;
        let turbR = 320 + Math.min(pointerSpeed * 0.12, 1.0) * 120;
        if (dSq < turbR * turbR) {
          let dDist = Math.sqrt(dSq);
          let prox = 1 - dDist / turbR;
          // ノイズで減衰境界を歪ませて有機的な輪郭に（時間変動で呼吸）
          let edgeNoise = noise(cx * 0.006 + t * 0.35, cy * 0.006 + t * 0.2, t * 0.15);
          let shaped = prox * (edgeNoise * 0.6 + 0.4);
          // 動いているほど減衰を強める
          let moveBoost = Math.min(pointerSpeed * 0.06, 0.3);
          // 脈動する減衰: 止まっていても空気が揺らめく
          let pulse = 0.5 + Math.sin(t * 0.8 + dDist * 0.015) * 0.08;
          density *= (1 - shaped * shaped * (pulse + moveBoost));
        }
      }

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
      let hue1 = noise(wx * 0.0005 + flowOffX, wy * 0.0012 + flowOffY, t * 0.04) * 60 - 30;
      let hue2 = noise(wx * 0.002 + 200, wy * 0.002 + 200, t * 0.08) * 30 - 15;
      let hue3 = noise(gx * 0.0004 + 400, gy * 0.0004 + 400, t * 0.02) * 20 - 10;
      let hue = (baseHue + hue1 + hue2 + hue3 + 360) % 360;

      // --- 彩度・明度: 密度で制御 ---
      let briNoise = noise(wx * 0.0007 + 600, wy * 0.0015 + 600, t * 0.05);
      let sat = lerp(satLow, satHigh, briNoise);
      let bri = lerp(briLow, briHigh, briNoise);

      // 密度による色の変調
      bri = lerp(clearBri, bri, density);
      sat = lerp(sat * 0.3, sat, density);

      // 雲の芯（高密度）は脱彩度＋増輝度で白っぽく
      if (density > 0.7) {
        let coreFactor = (density - 0.7) / 0.3;
        sat *= (1 - coreFactor * 0.5);
        bri += coreFactor * 12;
      }

      bri += shakeIntensity * 25;

      bri = Math.min(bri, 98);
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

  // ピンクノイズ → バンドパス300Hz（高空の柔らかい風）
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
  wF.type='bandpass'; wF.frequency.value=300; wF.Q.value=0.3;
  windGain = audioCtx.createGain(); windGain.gain.value=0.04;
  windNode.connect(wF); wF.connect(windGain); windGain.connect(audioCtx.destination);
  windNode.start();

  // ブラウンノイズ → ローパス180Hz（大気の低い唸り）
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
  dF.type='lowpass'; dF.frequency.value=180;
  driftGain = audioCtx.createGain(); driftGain.gain.value=0.025;
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
}
