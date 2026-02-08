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

// Trail canvas (single — user clears manually via eraser)
var trailPg;

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

// Collision
var COLLISION_DIST = 45;
var COLLISION_COOLDOWN = 800;
var collisionCooldowns = {};
var sparks = [];

// Neon2-style triangular trajectory
var TURN_ANGLE = TWO_THIRDS_PI; // 120° base turn
var TURN_SPEED = 0.12; // radians per frame during turn

// UI
var shapeUIRects = [];
var eraserRect = null;
var eraserFlash = 0;

// ============================================
// Shape drawing helpers
// ============================================
// Neon2-style elongated triangle wake (prev → current position)
function wakePath(ctx, tx, ty, hx, hy, hw, angle) {
  var pa = angle + 1.5707963; // angle + PI/2
  var cp = Math.cos(pa), sp = Math.sin(pa);
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(hx + hw * cp, hy + hw * sp);
  ctx.lineTo(hx - hw * cp, hy - hw * sp);
  ctx.closePath();
}

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
  trailPg = createGraphics(width, height);
  trailPg.pixelDensity(1);
  initSkaters();
  updateUIRects();
}

function initSkaters() {
  skaters = [];
  for (var i = 0; i < 3; i++) {
    var positions = [0.25, 0.5, 0.75];
    var bs = 2.0 + random(0, 1.5);
    skaters.push({
      x: width * positions[i], y: height * 0.5,
      prevX: width * positions[i], prevY: height * 0.5,
      angle: random(TWO_PI),
      curvature: 0,
      baseSpeed: bs, speed: bs,
      seed: 42 + i * 95,
      color: SKATER_COLORS[i],
      shape: SHAPE_TYPES[i],
      entryTime: ENTRY_TIMES[i],
      active: false,
      fadeIn: 0,
      spinOffset: random(TWO_PI),
      segDist: 0,
      segLen: 60 + random(80),
      turnDir: random() < 0.5 ? 1 : -1,
      turning: 0,
      turnTarget: 0
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
// Physics — shape-dependent trajectory
// 丸: 連続曲率で円軌道
// 三角: 直進→120°ターン (Neon2)
// 四角: 直進→90°ターン
// ============================================
function updateSkater(idx) {
  var s = skaters[idx];
  s.prevX = s.x;
  s.prevY = s.y;

  if (s.shape === 'circle') {
    // === Circle: continuous curvature → circular loops with drift ===
    // Base curvature ~0.04 → radius ~62px, noise reduced for clean circles
    var n1 = noise(s.seed, t * 0.04) - 0.5;
    var targetCurv = 0.04 * s.turnDir + n1 * 0.01;
    s.curvature = lerp(s.curvature, targetCurv, 0.04);
    s.angle += s.curvature;

    // Slow drift — shifts loop center across screen over time
    var drift = (noise(s.seed + 99, t * 0.008) - 0.5) * 0.008;
    s.angle += drift;

    s.speed = lerp(s.speed, s.baseSpeed, 0.05);

    // Reverse direction every 2-3 loops (~300-500px)
    s.segDist += s.speed;
    if (s.segDist > 300 + noise(s.seed + 600, t * 0.05) * 200) {
      s.segDist = 0;
      if (random() < 0.5) s.turnDir *= -1;
    }
  } else {
    // === Triangle (120°) or Square (90°): straight + sharp turns ===
    var turnAngle = s.shape === 'triangle' ? TWO_THIRDS_PI : HALF_PI;

    // Subtle wobble
    var wobble = (noise(s.seed, t * 0.08) - 0.5) * 0.012;
    s.angle += wobble;

    if (s.turning > 0) {
      var step = min(TURN_SPEED, s.turning);
      s.angle += step * s.turnDir;
      s.turning -= step;
      s.speed = lerp(s.speed, s.baseSpeed * 0.5, 0.1);
    } else {
      s.segDist += s.speed;
      s.speed = lerp(s.speed, s.baseSpeed, 0.05);
      if (s.segDist >= s.segLen) {
        s.segDist = 0;
        s.segLen = 50 + noise(s.seed + 300, t * 0.05) * 100;
        s.turnTarget = turnAngle + (noise(s.seed + 400, t * 0.1) - 0.5) * 0.5;
        s.turning = s.turnTarget;
        if (noise(s.seed + 500, t * 0.03) > 0.7) s.turnDir *= -1;
      }
    }
  }

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
      s.angle += diff * (1 - d / 500) * 0.008 * mouseInfluence;
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
      s.angle += diff * (1 - d / 350) * holdStr * 0.005;
    }
  }

  // Gust
  if (gustStrength > 0.1) {
    var diff = atan2(gustDirY, gustDirX) - s.angle;
    while (diff > PI) diff -= TWO_PI;
    while (diff < -PI) diff += TWO_PI;
    s.angle += diff * gustStrength * 0.008;
  }

  // Move
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
    // Cancel any turn and start a fresh segment toward center
    s.turning = 0;
    s.segDist = 0;
    s.segLen = 60 + random(80);
  }
}

// ============================================
// Collisions — scatter on contact
// ============================================
function checkCollisions() {
  var now = millis();
  for (var i = 0; i < skaters.length; i++) {
    if (!skaters[i].active || skaters[i].fadeIn < 0.5) continue;
    for (var j = i + 1; j < skaters.length; j++) {
      if (!skaters[j].active || skaters[j].fadeIn < 0.5) continue;
      var a = skaters[i], b = skaters[j];
      var dx = b.x - a.x, dy = b.y - a.y;
      var d = sqrt(dx * dx + dy * dy);
      var key = i * 10 + j;
      if (d < COLLISION_DIST && (!collisionCooldowns[key] || now - collisionCooldowns[key] > COLLISION_COOLDOWN)) {
        collisionCooldowns[key] = now;
        // Bounce (Neon2 style)
        a.angle = atan2(-dy, -dx) + random(-0.4, 0.4);
        b.angle = atan2(dy, dx) + random(-0.4, 0.4);
        a.speed = 5.5; b.speed = 5.5;
        a.curvature *= 0.3; b.curvature *= 0.3;
        a.turning = 0; a.segDist = 0; a.segLen = 60 + random(80);
        b.turning = 0; b.segDist = 0; b.segLen = 60 + random(80);
        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        // Ripple
        ripples.push({ x: mx, y: my, age: 0, color: a.color });
        ripples.push({ x: mx, y: my, age: 0.3, color: b.color });
        // Sparks (8 spinning shape particles)
        for (var k = 0; k < 8; k++) {
          var src = k < 4 ? a : b;
          var sa = random(TWO_PI), spd = random(2, 6);
          sparks.push({
            x: mx, y: my,
            vx: cos(sa) * spd, vy: sin(sa) * spd,
            age: 0, color: src.color, shape: src.shape,
            angle: sa, spin: random(-0.3, 0.3)
          });
        }
      }
    }
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
  checkCollisions();

  // Update sparks
  for (var si = 0; si < sparks.length; si++) {
    var sp = sparks[si];
    sp.x += sp.vx; sp.y += sp.vy;
    sp.vx *= 0.95; sp.vy *= 0.95;
    sp.age += 0.025;
    sp.angle += sp.spin;
  }
  sparks = sparks.filter(function(sp) { return sp.age < 1.5; });

  // === Trail Canvas ===
  var tctx = trailPg.drawingContext;
  tctx.globalCompositeOperation = 'lighter';

  var trailLayers = [
    { hw: 9,   a: 0.02 },
    { hw: 4.5, a: 0.05 },
    { hw: 2,   a: 0.12 },
    { hw: 0.9, a: 0.25 }
  ];

  for (var li = 0; li < trailLayers.length; li++) {
    var lhw = trailLayers[li].hw;
    var la = trailLayers[li].a;
    for (var si = 0; si < skaters.length; si++) {
      var s = skaters[si];
      if (!s.active || s.fadeIn < 0.01) continue;
      var a = la * s.fadeIn * pulse;
      var col = s.color;
      tctx.fillStyle = 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',' + a + ')';
      wakePath(tctx, s.prevX, s.prevY, s.x, s.y, lhw * pinchScale, s.angle);
      tctx.fill();
    }
  }

  // === Main Canvas ===
  var ctx = drawingContext;

  // Background
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgb(' + BG_R + ',' + BG_G + ',' + BG_B + ')';
  ctx.fillRect(0, 0, width, height);

  // Composite trail canvas
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(trailPg.canvas, 0, 0);

  // Skater heads — multi-layer glow
  for (var i = 0; i < skaters.length; i++) {
    var s = skaters[i];
    if (!s.active || s.fadeIn < 0.01) continue;
    var col = s.color;
    var fi = s.fadeIn;
    var sc = pinchScale;
    var colStr = col.r + ',' + col.g + ',' + col.b;

    var heads = [
      { r: 22 * sc, a: 0.025 * pulse * fi },
      { r: 12 * sc, a: 0.07 * pulse * fi },
      { r: 6 * sc, a: 0.16 * pulse * fi },
      { r: 3 * sc, a: 0.4 * pulse * fi },
      { r: 1.5 * sc, a: 0.8 * pulse * fi }
    ];
    for (var hi = 0; hi < heads.length; hi++) {
      ctx.fillStyle = 'rgba(' + colStr + ',' + heads[hi].a + ')';
      drawShape(ctx, s.shape, s.x, s.y, heads[hi].r, s.angle + Math.sin(t * 0.3 + s.spinOffset) * 0.15);
      ctx.fill();
    }
    // White core
    ctx.fillStyle = 'rgba(255,240,255,' + (pulse * fi) + ')';
    drawShape(ctx, s.shape, s.x, s.y, 1.2 * sc, s.angle);
    ctx.fill();
  }

  // Sparks — spinning shapes
  for (var si = 0; si < sparks.length; si++) {
    var sp = sparks[si];
    var fade = Math.max(0, 1 - sp.age / 1.2);
    fade = fade * fade;
    if (fade <= 0) continue;
    var spCol = sp.color;
    ctx.fillStyle = 'rgba(' + spCol.r + ',' + spCol.g + ',' + spCol.b + ',' + (fade * 0.5) + ')';
    drawShape(ctx, sp.shape, sp.x, sp.y, 3.5 * fade, sp.angle);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,' + (fade * 0.35) + ')';
    drawShape(ctx, sp.shape, sp.x, sp.y, 1.2 * fade, sp.angle);
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
  var pulse = 0.75 + Math.sin(t * 0.5) * 0.25;
  for (var i = 0; i < shapeUIRects.length; i++) {
    var rect = shapeUIRects[i];
    var s = skaters[rect.idx];
    if (!s) continue;

    var elapsed = appStarted ? (millis() - appStartTime) / 1000 : 0;
    var visible = elapsed >= s.entryTime - 5;
    if (!visible) continue;

    var fi = s.active ? Math.min(s.fadeIn + 0.3, 1) : 0.3;
    var cx = rect.x + rect.w / 2;
    var cy = rect.y + rect.h / 2;
    var colStr = s.color.r + ',' + s.color.g + ',' + s.color.b;
    var wobble = -Math.PI / 2 + Math.sin(t * 0.3 + s.seed) * 0.15;

    // Neon glow layers
    ctx.globalCompositeOperation = 'lighter';
    var uiHeads = [
      { r: 20, a: 0.06 * pulse * fi },
      { r: 14, a: 0.14 * pulse * fi },
      { r: 9,  a: 0.3 * pulse * fi },
      { r: 5,  a: 0.6 * pulse * fi },
      { r: 2.5, a: 1.0 * pulse * fi }
    ];
    for (var gi = 0; gi < uiHeads.length; gi++) {
      ctx.fillStyle = 'rgba(' + colStr + ',' + uiHeads[gi].a + ')';
      drawShape(ctx, s.shape, cx, cy, uiHeads[gi].r, wobble);
      ctx.fill();
    }
    // White core
    ctx.fillStyle = 'rgba(255,240,255,' + (pulse * fi) + ')';
    drawShape(ctx, s.shape, cx, cy, 1.8, wobble);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
}

function drawEraserUI(ctx) {
  if (!eraserRect) return;

  var cx = eraserRect.x + eraserRect.w / 2;
  var cy = eraserRect.y + eraserRect.h / 2;
  var pulse = 0.75 + Math.sin(t * 0.5) * 0.25;

  // Silver neon square
  ctx.globalCompositeOperation = 'lighter';
  var layers = [
    { r: 14, a: 0.06 * pulse },
    { r: 10, a: 0.14 * pulse },
    { r: 7,  a: 0.3 * pulse },
    { r: 4,  a: 0.6 * pulse },
    { r: 2,  a: 1.0 * pulse }
  ];
  for (var li = 0; li < layers.length; li++) {
    ctx.fillStyle = 'rgba(200,210,220,' + layers[li].a + ')';
    drawShape(ctx, 'square', cx, cy, layers[li].r, -Math.PI / 4);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
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
  trailPg.drawingContext.clearRect(0, 0, width, height);
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
    s.turning = 0; s.segDist = 0; s.segLen = 60 + random(80);
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
  if (trailPg) trailPg.remove();
  trailPg = createGraphics(width, height);
  trailPg.pixelDensity(1);
  updateUIRects();
}
