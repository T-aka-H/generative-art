// ============================================
// Snow — Falling Light
// パーティクルシステムによる幻想的な降雪
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

// --- スワイプ（風） ---
let prevTouchX = 0;
let prevTouchY = 0;
let gustStrength = 0;
let gustDirX = 0;
let gustDirY = 0;

// --- 長押し（溶ける） ---
let holdTime = 0;
let holdX = 0;
let holdY = 0;
let isHolding = false;
let holdThreshold = 20;

// --- シェイク（吹雪） ---
let shakeIntensity = 0;
let lastAccX = 0;
let lastAccY = 0;
let lastAccZ = 0;

// --- ピンチ（密度） ---
let pinchScale = 1.0;
let lastPinchDist = 0;

// --- コンパス ---
let compassHeading = 0;
let hasCompass = false;

// --- 時刻制御 ---
let manualHour = -1;
let lastSkyTapTime = 0;

// (bokehGfx removed — using Canvas2D radial gradients instead)

// --- パーティクル ---
let particles = [];
let baseCounts = [100, 60, 30]; // far, mid, near

// --- 風 ---
let windForce = 0;
let windTarget = 0;

// --- 降雪揺らぎ ---
let flurryIntensity = 1.0; // 1.0=ベースライン（最少）、上方向に揺れる

// --- 色テーマ: 2時間ごと ---
let colorThemes = [
  // 0:00 Midnight Snow
  { bgTop: [230, 15, 3], bgBot: [225, 20, 8], snow: [220, 8, 95], accent: 220, name: 'Midnight Snow' },
  // 2:00 Silent Night
  { bgTop: [240, 20, 4], bgBot: [250, 25, 10], snow: [270, 10, 93], accent: 260, name: 'Silent Night' },
  // 4:00 Predawn Frost
  { bgTop: [255, 22, 5], bgBot: [280, 18, 12], snow: [310, 8, 94], accent: 300, name: 'Predawn Frost' },
  // 6:00 Dawn Crystal
  { bgTop: [280, 20, 10], bgBot: [340, 25, 18], snow: [30, 12, 96], accent: 35, name: 'Dawn Crystal' },
  // 8:00 Morning Flurry
  { bgTop: [215, 15, 18], bgBot: [210, 12, 28], snow: [210, 5, 98], accent: 200, name: 'Morning Flurry' },
  // 10:00 Winter Sun
  { bgTop: [210, 10, 28], bgBot: [205, 8, 38], snow: [40, 8, 98], accent: 45, name: 'Winter Sun' },
  // 12:00 Bright Powder
  { bgTop: [210, 6, 40], bgBot: [200, 5, 52], snow: [50, 5, 100], accent: 50, name: 'Bright Powder' },
  // 14:00 Afternoon Drift
  { bgTop: [215, 8, 35], bgBot: [210, 6, 45], snow: [210, 4, 98], accent: 210, name: 'Afternoon Drift' },
  // 16:00 Golden Flake
  { bgTop: [220, 12, 22], bgBot: [30, 18, 28], snow: [40, 15, 97], accent: 40, name: 'Golden Flake' },
  // 18:00 Twilight Crystal
  { bgTop: [270, 25, 12], bgBot: [20, 20, 18], snow: [25, 12, 95], accent: 25, name: 'Twilight Crystal' },
  // 20:00 Evening Snow
  { bgTop: [240, 22, 6], bgBot: [260, 20, 12], snow: [230, 10, 93], accent: 240, name: 'Evening Snow' },
  // 22:00 Deep Winter
  { bgTop: [235, 18, 3], bgBot: [230, 22, 7], snow: [225, 8, 92], accent: 230, name: 'Deep Winter' },
];

function setup() {
  pixelDensity(1);
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  noStroke();

  initParticles();
}

function initParticles() {
  particles = [];
  let layers = [
    { count: baseCounts[0], sizeMin: 8, sizeMax: 22, speedMin: 0.8, speedMax: 1.8, alphaMin: 25, alphaMax: 50, drift: 0.4 },
    { count: baseCounts[1], sizeMin: 22, sizeMax: 55, speedMin: 0.4, speedMax: 1.0, alphaMin: 15, alphaMax: 35, drift: 0.7 },
    { count: baseCounts[2], sizeMin: 55, sizeMax: 140, speedMin: 0.15, speedMax: 0.45, alphaMin: 6, alphaMax: 18, drift: 1.2 },
  ];

  for (let li = 0; li < 3; li++) {
    let L = layers[li];
    for (let i = 0; i < L.count; i++) {
      particles.push(createParticle(L, li));
    }
  }
}

function createParticle(L, layer, fromTop) {
  let sz = random(L.sizeMin, L.sizeMax);
  return {
    x: random(-sz, width + sz),
    y: fromTop ? random(-sz * 2, -sz) : random(-sz, height + sz),
    size: sz,
    baseSize: sz,
    speed: random(L.speedMin, L.speedMax),
    drift: L.drift,
    driftPhase: random(TWO_PI),
    driftSpeed: random(0.3, 0.8),
    alpha: random(L.alphaMin, L.alphaMax),
    baseAlpha: random(L.alphaMin, L.alphaMax),
    hueShift: random(-20, 20),
    layer: layer,
    vx: 0,
    vy: 0,
    melting: 0,
    sizePhase: random(1000),
    sizeSpeed: random(0.008, 0.025),
    focused: random() < 0.2,
  };
}

function draw() {
  if (!appStarted) {
    background(0, 0, 3);
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

  // --- 背景グラデーション ---
  drawBackground(cur, nxt, tb);

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

  // 風
  if (hasCompass) {
    windTarget = sin(radians(compassHeading)) * 1.5;
  } else if (hasInteracted) {
    windTarget = (mx - 0.5) * 0.8;
  }
  windTarget += gustDirX * gustStrength * 2.5;
  windForce = lerp(windForce, windTarget, 0.02);

  // 減衰
  gustStrength *= 0.96;
  shakeIntensity *= 0.93;
  if (touches.length < 2) pinchScale = lerp(pinchScale, 1.0, 0.005);
  if (isHolding) holdTime += 0.016;

  // ポインタ位置
  let px = mx * width;
  let py = my * height;

  // 雪のカラー（テーマ補間）
  let snowH = lerp(cur.snow[0], nxt.snow[0], tb);
  let snowS = lerp(cur.snow[1], nxt.snow[1], tb);
  let snowB = lerp(cur.snow[2], nxt.snow[2], tb);

  // --- パーティクル更新 & 描画 ---
  let layerDefs = [
    { sizeMin: 8, sizeMax: 22, speedMin: 0.8, speedMax: 1.8, alphaMin: 25, alphaMax: 50, drift: 0.4 },
    { sizeMin: 22, sizeMax: 55, speedMin: 0.4, speedMax: 1.0, alphaMin: 15, alphaMax: 35, drift: 0.7 },
    { sizeMin: 55, sizeMax: 140, speedMin: 0.15, speedMax: 0.45, alphaMin: 6, alphaMax: 18, drift: 1.2 },
  ];

  // --- 降雪量の揺らぎ（ベースラインが最少、上方向にのみ変動）---
  let slowWave = noise(t * 0.15, 0) * 0.6;          // ゆっくりした大きなうねり
  let midWave = noise(t * 0.5, 100) * 0.3;           // 中くらいの変動
  let surgePre = noise(t * 0.8, 200);                 // 突然の吹雪の種
  let surge = surgePre > 0.75 ? (surgePre - 0.75) * 4.0 * 1.5 : 0; // 閾値超えで急増
  flurryIntensity = 1.0 + slowWave + midWave + surge + shakeIntensity * 1.5;

  // パーティクル数を揺らぎに応じて調整
  let targetCounts = [
    Math.round(baseCounts[0] * flurryIntensity),
    Math.round(baseCounts[1] * flurryIntensity),
    Math.round(baseCounts[2] * flurryIntensity),
  ];
  for (let li = 0; li < 3; li++) {
    let current = 0;
    for (let p of particles) { if (p.layer === li) current++; }
    let target = targetCounts[li];
    if (current < target) {
      let toAdd = Math.min(target - current, 3); // 1フレームで最大3個ずつ追加（滑らかに）
      for (let i = 0; i < toAdd; i++) {
        particles.push(createParticle(layerDefs[li], li, true));
      }
    } else if (current > target) {
      // 超過分は即削除せず、画面外に出た時に自然消滅させる（フラグ付け）
      let toMark = current - target;
      for (let i = particles.length - 1; i >= 0 && toMark > 0; i--) {
        if (particles[i].layer === li && !particles[i].dying) {
          particles[i].dying = true;
          toMark--;
        }
      }
    }
  }

  // 吹雪モード: シェイクで一時的にスピードアップ
  let speedMult = 1 + shakeIntensity * 4;

  // 描画（遠→近の順） — Canvas2D直接描画でGPUアクセラレーション活用
  let ctx = drawingContext;
  for (let p of particles) {
    // --- サイズ揺らぎ: ノイズで呼吸するように膨縮 ---
    let sizeNoise = noise(p.sizePhase + t * p.sizeSpeed);
    // 0.7〜1.4倍の範囲で揺れる（小さくなりすぎず、たまに大きく膨らむ）
    let sizeMod = 0.7 + sizeNoise * 0.7;
    let currentBaseSize = p.baseSize * sizeMod;
    if (p.melting <= 0) {
      p.size = currentBaseSize;
    }

    // --- 物理更新 ---
    // 重力
    p.vy = p.speed * speedMult;
    // 横揺れ
    p.vx = sin(t * p.driftSpeed + p.driftPhase) * p.drift;
    // 風
    let layerWindMult = 0.3 + p.layer * 0.35;
    p.vx += windForce * layerWindMult * 2;

    // ポインタ: 近くの雪を押しのける
    if (hasInteracted) {
      let ddx = p.x - px;
      let ddy = p.y - py;
      let dSq = ddx * ddx + ddy * ddy;
      let pushRadius = 180 + p.layer * 50;
      let prSq = pushRadius * pushRadius;
      if (dSq < prSq && dSq > 1) {
        let d = Math.sqrt(dSq);
        let prox = 1 - d / pushRadius;
        let force = prox * prox * (2.5 + p.layer * 1.5);
        p.x += (ddx / d) * force * 12;
        p.y += (ddy / d) * force * 8;
      }
    }

    // 長押し: 暖かい光で溶ける
    if (isHolding && holdTime > 0.3) {
      let hdx = p.x - holdX;
      let hdy = p.y - holdY;
      let hdSq = hdx * hdx + hdy * hdy;
      let meltRadius = min(holdTime * 60, 250);
      if (hdSq < meltRadius * meltRadius) {
        let hd = Math.sqrt(hdSq);
        let pull = (1 - hd / meltRadius) * min(holdTime * 0.5, 1.5);
        p.melting = min(p.melting + pull * 0.02, 1);
        p.size = currentBaseSize * (1 - p.melting * 0.7);
        p.alpha = p.baseAlpha * (1 - p.melting * 0.8);
      }
    }

    // 位置更新
    p.x += p.vx;
    p.y += p.vy;

    // 溶けた雪の回復
    if (p.melting > 0 && !(isHolding && holdTime > 0.3)) {
      p.melting = max(0, p.melting - 0.003);
      p.size = currentBaseSize * (1 - p.melting * 0.7);
      p.alpha = p.baseAlpha * (1 - p.melting * 0.8);
    }

    // 画面外リセット
    if (p.y > height + p.size) {
      if (p.dying) { p._remove = true; continue; }
      let L = layerDefs[p.layer];
      let np = createParticle(L, p.layer, true);
      p.x = np.x; p.y = np.y; p.size = np.size; p.baseSize = np.baseSize;
      p.speed = np.speed; p.alpha = np.alpha; p.baseAlpha = np.baseAlpha;
      p.hueShift = np.hueShift; p.melting = 0;
      p.driftPhase = np.driftPhase; p.driftSpeed = np.driftSpeed;
      p.sizePhase = np.sizePhase; p.sizeSpeed = np.sizeSpeed;
    }
    if (p.x > width + p.size * 2) { p.x = -p.size; }
    if (p.x < -p.size * 2) { p.x = width + p.size; }

    // --- 描画 ---
    let pH = (snowH + p.hueShift + 360) % 360;
    let pS = snowS;
    let pB = snowB;
    let pA = p.alpha;

    // 溶けている雪は暖色に
    if (p.melting > 0.1) {
      pH = lerpHue(pH, 30, p.melting * 0.4);
      pS += p.melting * 15;
    }

    let _rgb = hsbToRgb(pH, pS, pB);
    let _r = p.size * 0.5;
    let _pre = _rgb[0] + ',' + _rgb[1] + ',' + _rgb[2];
    let _g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, _r);
    if (p.focused) {
      let _a = pA * 0.004;
      _g.addColorStop(0, 'rgba(' + _pre + ',' + _a + ')');
      _g.addColorStop(0.6, 'rgba(' + _pre + ',' + (_a * 0.7) + ')');
      _g.addColorStop(0.85, 'rgba(' + _pre + ',' + (_a * 0.25) + ')');
      _g.addColorStop(1, 'rgba(' + _pre + ',0)');
    } else {
      let _a = pA * 0.0022;
      _g.addColorStop(0, 'rgba(' + _pre + ',' + _a + ')');
      _g.addColorStop(0.5, 'rgba(' + _pre + ',' + (_a * 0.3) + ')');
      _g.addColorStop(1, 'rgba(' + _pre + ',0)');
    }
    ctx.fillStyle = _g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, _r, 0, 6.2832);
    ctx.fill();
  }

  // dying で画面外に出たパーティクルを除去
  particles = particles.filter(p => !p._remove);

  // --- 長押し: 暖かいオーラ ---
  if (isHolding && holdTime > 0.3) {
    let auraR = min(holdTime * 60, 250);
    let auraA = min(holdTime * 8, 15) / 100;
    let accentH = lerp(cur.accent, nxt.accent, tb);
    let aRgb = hsbToRgb(accentH, 30, 80);
    let aGrad = ctx.createRadialGradient(holdX, holdY, 0, holdX, holdY, auraR);
    aGrad.addColorStop(0, 'rgba(' + aRgb[0] + ',' + aRgb[1] + ',' + aRgb[2] + ',' + auraA + ')');
    aGrad.addColorStop(1, 'rgba(' + aRgb[0] + ',' + aRgb[1] + ',' + aRgb[2] + ',0)');
    ctx.fillStyle = aGrad;
    ctx.beginPath();
    ctx.arc(holdX, holdY, auraR, 0, 6.2832);
    ctx.fill();
  }

  t += 0.01;

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
    rectMode(CORNER);
  }
}

// ============================================
// 背景グラデーション
// ============================================
function drawBackground(cur, nxt, tb) {
  let topH = lerp(cur.bgTop[0], nxt.bgTop[0], tb);
  let topS = lerp(cur.bgTop[1], nxt.bgTop[1], tb);
  let topB = lerp(cur.bgTop[2], nxt.bgTop[2], tb);
  let botH = lerp(cur.bgBot[0], nxt.bgBot[0], tb);
  let botS = lerp(cur.bgBot[1], nxt.bgBot[1], tb);
  let botB = lerp(cur.bgBot[2], nxt.bgBot[2], tb);

  let ctx = drawingContext;
  let topRgb = hsbToRgb(topH, topS, topB);
  let botRgb = hsbToRgb(botH, botS, botB);
  let grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, 'rgb(' + topRgb[0] + ',' + topRgb[1] + ',' + topRgb[2] + ')');
  grad.addColorStop(1, 'rgb(' + botRgb[0] + ',' + botRgb[1] + ',' + botRgb[2] + ')');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

// ============================================
function lerpHue(h1, h2, amt) {
  let diff = h2 - h1;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return (h1 + diff * amt + 360) % 360;
}

function hsbToRgb(h, s, b) {
  h = ((h % 360) + 360) % 360;
  s /= 100; b /= 100;
  let c = b * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = b - c;
  let r, g, bl;
  if (h < 60) { r=c; g=x; bl=0; }
  else if (h < 120) { r=x; g=c; bl=0; }
  else if (h < 180) { r=0; g=c; bl=x; }
  else if (h < 240) { r=0; g=x; bl=c; }
  else if (h < 300) { r=x; g=0; bl=c; }
  else { r=c; g=0; bl=x; }
  return [Math.round((r+m)*255), Math.round((g+m)*255), Math.round((bl+m)*255)];
}

// ============================================
// サウンド
// ============================================
function initSound() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  let sr = audioCtx.sampleRate;
  let len = sr * 2;

  // ピンクノイズ → ハイパス 800Hz → バンドパス 2000Hz（澄んだ冬の風）
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
  let hp = audioCtx.createBiquadFilter();
  hp.type='highpass'; hp.frequency.value=800;
  let bp = audioCtx.createBiquadFilter();
  bp.type='bandpass'; bp.frequency.value=2000; bp.Q.value=0.3;
  windGain = audioCtx.createGain(); windGain.gain.value=0.03;
  windNode.connect(hp); hp.connect(bp); bp.connect(windGain); windGain.connect(audioCtx.destination);
  windNode.start();

  // ブラウンノイズ → ローパス 150Hz（深い静けさ）
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
  dF.type='lowpass'; dF.frequency.value=150;
  driftGain = audioCtx.createGain(); driftGain.gain.value=0.02;
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
  burstAt(mouseX, mouseY);
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
    burstAt(touch.x, touch.y);
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
  }
  if (touches.length === 2) {
    let cd = dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y);
    if (lastPinchDist > 0) {
      let delta = (cd - lastPinchDist) * 0.003;
      pinchScale = constrain(pinchScale + delta, 0.4, 2.5);
      // ピンチで降雪密度調整
      adjustDensity(pinchScale);
    }
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
// タップで舞い上がり
// ============================================
function burstAt(bx, by) {
  let burstRadius = 350;
  for (let p of particles) {
    let ddx = p.x - bx;
    let ddy = p.y - by;
    let dSq = ddx * ddx + ddy * ddy;
    if (dSq < burstRadius * burstRadius && dSq > 1) {
      let d = Math.sqrt(dSq);
      let prox = 1 - d / burstRadius;
      let force = prox * prox * (3 + p.layer * 2);
      let angle = Math.atan2(ddy, ddx);
      // ランダムな散乱角を加えて自然に飛び散る
      angle += (random() - 0.5) * 0.6;
      p.x += Math.cos(angle) * force * 40;
      p.y += Math.sin(angle) * force * 40 - force * 20; // 強い上方向バイアス
    }
  }
}

// ピンチで密度のベースラインを調整（flurryがさらに上乗せされる）
function adjustDensity(scale) {
  baseCounts[0] = Math.round(100 * scale);
  baseCounts[1] = Math.round(60 * scale);
  baseCounts[2] = Math.round(30 * scale);
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
  initParticles();
}
