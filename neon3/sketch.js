// ============================================
// Neon3 — Shape Shifting
// 3体のスケーター（赤・青・淡黄）
// 丸・三角・四角を切り替えながら描く
// ============================================

var t = 0;
var soundStarted = false;
var appStarted = false;
var appStartTime = 0;

var audioCtx, windNode, windGain, driftNode, driftGain;
var lastTouchX = 0.5, lastTouchY = 0.5;
var isTouchDevice = false, hasInteracted = false;
var prevTouchX = 0, prevTouchY = 0;
var gustStrength = 0, gustDirX = 0, gustDirY = 0;
var holdTime = 0, holdX = 0, holdY = 0, isHolding = false, holdThreshold = 20;
var pinchScale = 1.0, lastPinchDist = 0;
var ripples = [];
var lastMouseMoveMs = 0;
var MOUSE_ATTRACT_MS = 3000;

// Trail canvases — double-buffer
var trailPgA, trailPgB;
var activeTrail = 0;
var swapFrameCount = 0;
var SWAP_INTERVAL = 1500;
var FADE_ALPHA = 0.02;
var FADE_EVERY = 29;
var fadeFrameCount = 0;

// Skaters
var skaters = [];
var ENTRY_TIMES = [0, 20, 40];

// Fixed colors
var SKATER_COLORS = [
  { r: 255, g: 40, b: 80 },    // Red
  { r: 20, g: 100, b: 255 },   // Blue
  { r: 255, g: 240, b: 180 }   // Pale warm yellow
];

// Shapes
var SHAPE_TYPES = ['circle', 'triangle', 'square'];
var TWO_THIRDS_PI = 2.0943951;

// Background (fixed Sunset Drive theme)
var BG_R = 5, BG_G = 0, BG_B = 6;

// UI
var shapeUIRects = [];
var eraserRect = null;
var eraserFlash = 0;

// ============================================
// Shape drawing helpers
// ============================================
function drawShape(ctx, shape, cx, cy, r, angle) {
  if (shape === 'circle') {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  } else if (shape === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    ctx.lineTo(cx + r * Math.cos(angle + TWO_THIRDS_PI), cy + r * Math.sin(angle + TWO_THIRDS_PI));
    ctx.lineTo(cx + r * Math.cos(angle - TWO_THIRDS_PI), cy + r * Math.sin(angle - TWO_THIRDS_PI));
    ctx.closePath();
  } else {
    // square
    var c = Math.cos(angle), s = Math.sin(angle);
    var hr = r * 0.707; // r / sqrt(2) for inscribed square
    ctx.beginPath();
    ctx.moveTo(cx + hr * (c - s), cy + hr * (s + c));
    ctx.lineTo(cx + hr * (-c - s), cy + hr * (-s + c));
    ctx.lineTo(cx + hr * (-c + s), cy + hr * (-s - c));
    ctx.lineTo(cx + hr * (c + s), cy + hr * (s - c));
    ctx.closePath();
  }
}

// ============================================
// Setup & Init
// ============================================
function setup() {
  pixelDensity(1);
  createCanvas(windowWidth, windowHeight);
  trailPgA = createGraphics(width, height);
  trailPgA.pixelDensity(1);
  trailPgB = createGraphics(width, height);
  trailPgB.pixelDensity(1);
  initSkaters();
  updateUIRects();
}

function initSkaters() {
  skaters = [];
  for (var i = 0; i < 3; i++) {
    var positions = [0.25, 0.5, 0.75];
    skaters.push({
      x: width * positions[i], y: height * 0.5,
      prevX: width * positions[i], prevY: height * 0.5,
      angle: random(TWO_PI),
      curvature: 0,
      baseSpeed: 2.5, speed: 2.5,
      seed: 42 + i * 95,
      color: SKATER_COLORS[i],
      shape: SHAPE_TYPES[i],
      entryTime: ENTRY_TIMES[i],
      active: false,
      fadeIn: 0
    });
  }
}

function updateUIRects() {
  shapeUIRects = [];
  var uiSize = 50;
  var gap = 16;
  var rightMargin = 16;
  var totalHeight = uiSize * 3 + gap * 2;
  var startY = (height - totalHeight) / 2;

  for (var i = 0; i < 3; i++) {
    shapeUIRects.push({
      x: width - rightMargin - uiSize,
      y: startY + i * (uiSize + gap),
      w: uiSize, h: uiSize,
      idx: i
    });
  }

  // Eraser below shape selectors
  eraserRect = {
    x: width - rightMargin - uiSize,
    y: startY + 3 * (uiSize + gap),
    w: uiSize, h: uiSize
  };
}

// ============================================
// Physics (Neon1-style smooth curves)
// ============================================
function updateSkater(idx) {
  var s = skaters[idx];
  s.prevX = s.x;
  s.prevY = s.y;

  var n1 = noise(s.seed, t * 0.06) - 0.5;
  var n2 = noise(s.seed + 100, t * 0.2) - 0.5;
  var targetCurv = n1 * 0.06 + n2 * 0.025;

  var loopN = noise(s.seed + 200, t * 0.1);
  if (loopN > 0.82) targetCurv += (loopN - 0.82) * 4 * 0.09 * (n1 > 0 ? 1 : -1);

  s.curvature = lerp(s.curvature, targetCurv, 0.03);

  // Mouse attraction
  var mouseElapsed = millis() - lastMouseMoveMs;
  var mouseInfluence = Math.max(0, 1 - mouseElapsed / MOUSE_ATTRACT_MS);
  if (hasInteracted && mouseInfluence > 0) {
    var px = isTouchDevice ? lastTouchX * width : mouseX;
    var py = isTouchDevice ? lastTouchY * height : mouseY;
    var dx = px - s.x, dy = py - s.y;
    var d = sqrt(dx * dx + dy * dy);
    if (d < 500) {
      var diff = atan2(dy, dx) - s.angle;
      while (diff > PI) diff -= TWO_PI;
      while (diff < -PI) diff += TWO_PI;
      s.curvature += diff * (1 - d / 500) * 0.012 * mouseInfluence;
    }
  }

  // Hold vortex
  var holdStr = isHolding && holdTime > 0.3 ? min((holdTime - 0.3) * 2, 5) : 0;
  if (holdStr > 0) {
    var dx = holdX - s.x, dy = holdY - s.y;
    var d = sqrt(dx * dx + dy * dy);
    if (d < 350) {
      var diff = atan2(dy, dx) - s.angle;
      while (diff > PI) diff -= TWO_PI;
      while (diff < -PI) diff += TWO_PI;
      s.curvature += diff * (1 - d / 350) * holdStr * 0.006;
      s.curvature += (1 - d / 350) * holdStr * 0.004;
    }
  }

  // Gust
  if (gustStrength > 0.1) {
    var diff = atan2(gustDirY, gustDirX) - s.angle;
    while (diff > PI) diff -= TWO_PI;
    while (diff < -PI) diff += TWO_PI;
    s.curvature += diff * gustStrength * 0.012;
  }

  s.angle += s.curvature;

  var targetSpeed = s.baseSpeed - abs(s.curvature) * 15;
  s.speed = lerp(s.speed, max(1.2, min(4.5, targetSpeed)), 0.05);
  s.x += cos(s.angle) * s.speed;
  s.y += sin(s.angle) * s.speed;

  // Edge steering
  var ex = abs(s.x - width / 2) / (width / 2);
  var ey = abs(s.y - height / 2) / (height / 2);
  var edge = max(ex, ey);
  if (edge > 0.85) {
    var diff = atan2(height / 2 - s.y, width / 2 - s.x) - s.angle;
    while (diff > PI) diff -= TWO_PI;
    while (diff < -PI) diff += TWO_PI;
    s.angle += diff * (edge - 0.85) * 0.3;
  }
}

// ============================================
// Draw
// ============================================
function draw() {
  if (!appStarted) {
    background(0); fill(255); noStroke();
    textAlign(CENTER, CENTER); textSize(min(width, height) * 0.06);
    text('Tap to Start', width / 2, height / 2);
    return;
  }

  var now = millis();

  // Activate skaters
  var elapsed = (now - appStartTime) / 1000;
  for (var i = 0; i < skaters.length; i++) {
    if (!skaters[i].active && elapsed >= skaters[i].entryTime) {
      skaters[i].active = true;
    }
    if (skaters[i].active && skaters[i].fadeIn < 1) {
      skaters[i].fadeIn = min(1, skaters[i].fadeIn + 0.008);
    }
  }

  gustStrength *= 0.96;
  if (touches.length < 2) pinchScale = lerp(pinchScale, 1.0, 0.005);
  if (isHolding) holdTime += 0.016;
  var pulse = 0.75 + Math.sin(t * 0.5) * 0.25;

  // Update skaters
  for (var i = 0; i < skaters.length; i++) {
    if (skaters[i].active) updateSkater(i);
  }

  // === Trail Canvases ===
  var tctxA = trailPgA.drawingContext;
  var tctxB = trailPgB.drawingContext;

  fadeFrameCount++;
  if (fadeFrameCount >= FADE_EVERY) {
    fadeFrameCount = 0;
    tctxA.globalCompositeOperation = 'destination-out';
    tctxA.fillStyle = 'rgba(0,0,0,' + FADE_ALPHA + ')';
    tctxA.fillRect(0, 0, width, height);
    tctxB.globalCompositeOperation = 'destination-out';
    tctxB.fillStyle = 'rgba(0,0,0,' + FADE_ALPHA + ')';
    tctxB.fillRect(0, 0, width, height);
  }

  // Draw trail segments
  var tctx = activeTrail === 0 ? tctxA : tctxB;
  tctx.globalCompositeOperation = 'lighter';

  var trailLayers = [
    { size: 14, a: 0.02 },
    { size: 7, a: 0.05 },
    { size: 3, a: 0.12 },
    { size: 1.5, a: 0.25 }
  ];

  for (var li = 0; li < trailLayers.length; li++) {
    var ls = trailLayers[li].size;
    var la = trailLayers[li].a;
    for (var si = 0; si < skaters.length; si++) {
      var s = skaters[si];
      if (!s.active || s.fadeIn < 0.01) continue;
      var a = la * s.fadeIn * pulse;
      var col = s.color;
      tctx.fillStyle = 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',' + a + ')';
      drawShape(tctx, s.shape, s.x, s.y, ls * pinchScale, s.angle);
      tctx.fill();
    }
  }

  // Swap buffers
  swapFrameCount++;
  if (swapFrameCount >= SWAP_INTERVAL) {
    swapFrameCount = 0;
    activeTrail = 1 - activeTrail;
    var clearCtx = activeTrail === 0 ? tctxA : tctxB;
    clearCtx.clearRect(0, 0, width, height);
  }

  // === Main Canvas ===
  var ctx = drawingContext;

  // Background
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgb(' + BG_R + ',' + BG_G + ',' + BG_B + ')';
  ctx.fillRect(0, 0, width, height);

  // Composite trail canvases
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(trailPgA.canvas, 0, 0);
  ctx.drawImage(trailPgB.canvas, 0, 0);

  // Skater heads — multi-layer glow
  for (var i = 0; i < skaters.length; i++) {
    var s = skaters[i];
    if (!s.active || s.fadeIn < 0.01) continue;
    var col = s.color;
    var fi = s.fadeIn;
    var sc = pinchScale;
    var colStr = col.r + ',' + col.g + ',' + col.b;

    var heads = [
      { r: 20 * sc, a: 0.025 * pulse * fi },
      { r: 10 * sc, a: 0.07 * pulse * fi },
      { r: 5 * sc, a: 0.16 * pulse * fi },
      { r: 2.5 * sc, a: 0.4 * pulse * fi },
      { r: 1.2 * sc, a: 0.8 * pulse * fi }
    ];
    for (var hi = 0; hi < heads.length; hi++) {
      ctx.fillStyle = 'rgba(' + colStr + ',' + heads[hi].a + ')';
      drawShape(ctx, s.shape, s.x, s.y, heads[hi].r, s.angle + Math.sin(t * 0.3 + s.seed) * 0.15);
      ctx.fill();
    }
    // White core
    ctx.fillStyle = 'rgba(255,240,255,' + (pulse * fi) + ')';
    drawShape(ctx, s.shape, s.x, s.y, 1.2 * sc, s.angle);
    ctx.fill();
  }

  // Ripples
  for (var ri = 0; ri < ripples.length; ri++) {
    var rp = ripples[ri];
    var ringR = rp.age * 350;
    var fade = Math.max(0, 1 - rp.age * 0.25);
    fade = fade * fade;
    if (fade <= 0) continue;
    var rc = rp.color;
    var rcStr = rc.r + ',' + rc.g + ',' + rc.b;
    var rl = [{ w: 12, a: 0.025 * fade }, { w: 4, a: 0.08 * fade }, { w: 1.2, a: 0.25 * fade }];
    for (var li = 0; li < rl.length; li++) {
      ctx.strokeStyle = 'rgba(' + rcStr + ',' + rl[li].a + ')';
      ctx.lineWidth = rl[li].w;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, ringR, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // Hold aura
  var holdStrength = isHolding && holdTime > 0.3 ? min((holdTime - 0.3) * 2, 5) : 0;
  if (holdStrength > 0) {
    var auraR = min(holdTime * 60, 250);
    for (var r = auraR; r > 0; r -= 12) {
      ctx.fillStyle = 'rgba(180,120,220,' + ((1 - r / auraR) * min(holdTime * 3, 15) / 255) + ')';
      ctx.beginPath(); ctx.arc(holdX, holdY, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Eraser flash
  if (eraserFlash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + (eraserFlash * 0.15) + ')';
    ctx.fillRect(0, 0, width, height);
    eraserFlash = Math.max(0, eraserFlash - 0.03);
  }

  ctx.globalCompositeOperation = 'source-over';

  // Draw UI
  drawShapeUI(ctx);
  drawEraserUI(ctx);

  // Update ripples
  for (var ri = 0; ri < ripples.length; ri++) ripples[ri].age += 0.012;
  ripples = ripples.filter(function(rp) { return rp.age < 4; });
  t += 0.008;
}

// ============================================
// UI Drawing
// ============================================
function drawShapeUI(ctx) {
  for (var i = 0; i < shapeUIRects.length; i++) {
    var rect = shapeUIRects[i];
    var s = skaters[rect.idx];
    if (!s) continue;

    // Only show if skater is active or about to be
    var elapsed = appStarted ? (millis() - appStartTime) / 1000 : 0;
    var visible = elapsed >= s.entryTime - 5; // show 5 seconds before entry
    if (!visible) continue;

    var uiAlpha = s.active ? Math.min(s.fadeIn + 0.3, 1) : 0.3;

    // Background
    ctx.fillStyle = 'rgba(10,10,20,' + (0.5 * uiAlpha) + ')';
    ctx.beginPath(); ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 8); ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(' + s.color.r + ',' + s.color.g + ',' + s.color.b + ',' + (0.6 * uiAlpha) + ')';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Shape icon
    var cx = rect.x + rect.w / 2;
    var cy = rect.y + rect.h / 2;
    ctx.fillStyle = 'rgba(' + s.color.r + ',' + s.color.g + ',' + s.color.b + ',' + (0.85 * uiAlpha) + ')';
    drawShape(ctx, s.shape, cx, cy, 12, -Math.PI / 2); // point up
    ctx.fill();
  }
}

function drawEraserUI(ctx) {
  if (!eraserRect) return;

  var uiAlpha = 0.7;
  // Background
  ctx.fillStyle = 'rgba(10,10,20,' + (0.5 * uiAlpha) + ')';
  ctx.beginPath(); ctx.roundRect(eraserRect.x, eraserRect.y, eraserRect.w, eraserRect.h, 8); ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(255,255,255,' + (0.25 * uiAlpha) + ')';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // X icon
  var padding = 16;
  ctx.strokeStyle = 'rgba(255,255,255,' + (0.6 * uiAlpha) + ')';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(eraserRect.x + padding, eraserRect.y + padding);
  ctx.lineTo(eraserRect.x + eraserRect.w - padding, eraserRect.y + eraserRect.h - padding);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(eraserRect.x + eraserRect.w - padding, eraserRect.y + padding);
  ctx.lineTo(eraserRect.x + padding, eraserRect.y + eraserRect.h - padding);
  ctx.stroke();
}

// ============================================
// UI Hit Testing
// ============================================
function hitTestShapeUI(x, y) {
  for (var i = 0; i < shapeUIRects.length; i++) {
    var r = shapeUIRects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      var s = skaters[r.idx];
      if (s && s.active) {
        var ci = SHAPE_TYPES.indexOf(s.shape);
        s.shape = SHAPE_TYPES[(ci + 1) % SHAPE_TYPES.length];
        return true;
      }
    }
  }
  return false;
}

function hitTestEraser(x, y) {
  if (!eraserRect) return false;
  if (x >= eraserRect.x && x <= eraserRect.x + eraserRect.w &&
      y >= eraserRect.y && y <= eraserRect.y + eraserRect.h) {
    clearTrails();
    return true;
  }
  return false;
}

function clearTrails() {
  trailPgA.drawingContext.clearRect(0, 0, width, height);
  trailPgB.drawingContext.clearRect(0, 0, width, height);
  swapFrameCount = 0;
  fadeFrameCount = 0;
  eraserFlash = 1;
}

// ============================================
// Scatter
// ============================================
function scatterSkaters(tapX, tapY) {
  for (var i = 0; i < skaters.length; i++) {
    var s = skaters[i];
    if (!s.active) continue;
    s.x = random(width * 0.15, width * 0.85);
    s.y = random(height * 0.15, height * 0.85);
    s.prevX = s.x;
    s.prevY = s.y;
    s.angle = random(TWO_PI);
    s.curvature = 0;
    s.fadeIn = 0.3;
  }
  // Ripple at tap point
  var rc = SKATER_COLORS[floor(random(3))];
  ripples.push({ x: tapX, y: tapY, age: 0, color: rc });
}

// ============================================
// Sound (same as Neon1)
// ============================================
function initSound() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  var sr = audioCtx.sampleRate, len = sr * 2;
  var wBuf = audioCtx.createBuffer(1, len, sr), wD = wBuf.getChannelData(0);
  for (var i = 0; i < len; i++) wD[i] = Math.random() * 2 - 1;
  windNode = audioCtx.createBufferSource(); windNode.buffer = wBuf; windNode.loop = true;
  var bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 120; bp.Q.value = 8;
  windGain = audioCtx.createGain(); windGain.gain.value = 0.015;
  windNode.connect(bp); bp.connect(windGain); windGain.connect(audioCtx.destination); windNode.start();
  var dBuf = audioCtx.createBuffer(1, len, sr), dD = dBuf.getChannelData(0), last = 0;
  for (var i = 0; i < len; i++) { var w = Math.random() * 2 - 1; dD[i] = (last + 0.02 * w) / 1.02; last = dD[i]; dD[i] *= 3.5; }
  driftNode = audioCtx.createBufferSource(); driftNode.buffer = dBuf; driftNode.loop = true;
  var dF = audioCtx.createBiquadFilter(); dF.type = 'lowpass'; dF.frequency.value = 80;
  driftGain = audioCtx.createGain(); driftGain.gain.value = 0.02;
  driftNode.connect(dF); dF.connect(driftGain); driftGain.connect(audioCtx.destination); driftNode.start();
  soundStarted = true;
}
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible' && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
});

// ============================================
// Mouse / Touch
// ============================================
function mousePressed() {
  if (!appStarted) { appStarted = true; appStartTime = millis(); if (!soundStarted) initSound(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); return; }
  hasInteracted = true; lastMouseMoveMs = millis();
  if (!soundStarted) initSound(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

  // UI first
  if (hitTestShapeUI(mouseX, mouseY)) return;
  if (hitTestEraser(mouseX, mouseY)) return;

  // Scatter
  scatterSkaters(mouseX, mouseY);
}
function mouseMoved() {
  if (appStarted) { hasInteracted = true; lastMouseMoveMs = millis(); }
}

function touchStarted() {
  if (!appStarted) { appStarted = true; appStartTime = millis(); isTouchDevice = true; if (!soundStarted) initSound(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); return false; }
  hasInteracted = true; lastMouseMoveMs = millis();
  if (!soundStarted) initSound(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  isTouchDevice = true;

  if (touches.length > 0) {
    var tx = touches[0].x, ty = touches[0].y;

    // UI first
    if (hitTestShapeUI(tx, ty)) return false;
    if (hitTestEraser(tx, ty)) return false;

    // Scatter
    scatterSkaters(tx, ty);
    lastTouchX = tx / width; lastTouchY = ty / height;
  }

  if (touches.length === 1) { holdX = touches[0].x; holdY = touches[0].y; holdTime = 0; isHolding = true; }
  if (touches.length > 0) { prevTouchX = touches[0].x; prevTouchY = touches[0].y; }
  if (touches.length === 2) { lastPinchDist = dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y); isHolding = false; }
  return false;
}

function touchMoved() {
  lastMouseMoveMs = millis();
  if (touches.length === 1) {
    var tx = touches[0].x, ty = touches[0].y, dx = tx - prevTouchX, dy = ty - prevTouchY;
    var spd = sqrt(dx * dx + dy * dy);
    if (spd > 8) { gustStrength = min(gustStrength + spd * 0.004, 1.0); gustDirX = dx > 0 ? 1 : -1; gustDirY = dy > 0 ? 1 : -1; }
    prevTouchX = tx; prevTouchY = ty;
    if (isHolding && dist(tx, ty, holdX, holdY) > holdThreshold) { isHolding = false; holdTime = 0; }
    lastTouchX = tx / width; lastTouchY = ty / height;
  }
  if (touches.length === 2) {
    var cd = dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y);
    if (lastPinchDist > 0) pinchScale = constrain(pinchScale + (cd - lastPinchDist) * 0.003, 0.4, 2.5);
    lastPinchDist = cd;
    lastTouchX = (touches[0].x + touches[1].x) / 2 / width; lastTouchY = (touches[0].y + touches[1].y) / 2 / height;
  }
  return false;
}
function touchEnded() { isHolding = false; holdTime = 0; if (touches.length === 0) lastPinchDist = 0; return false; }

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (trailPgA) trailPgA.remove();
  if (trailPgB) trailPgB.remove();
  trailPgA = createGraphics(width, height);
  trailPgA.pixelDensity(1);
  trailPgB = createGraphics(width, height);
  trailPgB.pixelDensity(1);
  activeTrail = 0;
  swapFrameCount = 0;
  updateUIRects();
}
