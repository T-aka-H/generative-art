// ============================================
// Neon5 — Trig Waves
// 3体のスケーター（Sin/Cos/Tan波形軌道）
// 波形セレクター + カラーピッカー + 衝突で波形シャッフル
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
var NUM_SKATERS = 3;
var ENTRY_TIMES = [0, 12, 24];
var WAVE_TYPES = ['sin', 'cos', 'sin2'];

// Background
var BG_R = 5, BG_G = 0, BG_B = 6;

// Collision
var COLLISION_DIST = 65;
var COLLISION_COOLDOWN = 500;
var collisionCooldowns = {};
var sparks = [];

// Wave parameters
var WAVE_AMPLITUDE = 250;
var WAVE_FREQUENCY = 0.015;

// UI
var waveUIRects = [];
var colorUIRects = [];
var eraserRect = null;
var eraserFlash = 0;

// Color system — 12 preset neon hues (30° steps)
var PRESET_COLORS = [];
var userHueIdx = [0, 8, 2]; // Red(0°), Blue(240°), Yellow(60°)
var userColors = [];

// ============================================
// Color helpers
// ============================================
function hueToNeonRGB(h) {
  var s = 0.9;
  var c = s, x = c * (1 - Math.abs((h / 60) % 2 - 1));
  var r1, g1, b1;
  if      (h < 60)  { r1 = c; g1 = x; b1 = 0; }
  else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
  else              { r1 = c; g1 = 0; b1 = x; }
  return { r: Math.round((r1 + (1 - s)) * 255), g: Math.round((g1 + (1 - s)) * 255), b: Math.round((b1 + (1 - s)) * 255) };
}

function randomNeonColor() {
  var h = random(360);
  var s = random(0.8, 1.0);
  var c = s, x = c * (1 - Math.abs((h / 60) % 2 - 1));
  var r1, g1, b1;
  if      (h < 60)  { r1 = c; g1 = x; b1 = 0; }
  else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
  else              { r1 = c; g1 = 0; b1 = x; }
  return { r: Math.round((r1 + (1 - s)) * 255), g: Math.round((g1 + (1 - s)) * 255), b: Math.round((b1 + (1 - s)) * 255) };
}

// ============================================
// Wave function
// ============================================
function waveFunc(type, phase) {
  if (type === 'sin') return Math.sin(phase);
  if (type === 'cos') return Math.cos(phase);
  // sin2: double frequency harmonic
  return Math.sin(phase * 2);
}

// ============================================
// Drawing helpers
// ============================================
function wakePath(ctx, tx, ty, hx, hy, hw, angle) {
  var pa = angle + 1.5707963;
  var cp = Math.cos(pa), sp = Math.sin(pa);
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(hx + hw * cp, hy + hw * sp);
  ctx.lineTo(hx - hw * cp, hy - hw * sp);
  ctx.closePath();
}

function drawSquare(ctx, cx, cy, r, angle) {
  var c = Math.cos(angle), s = Math.sin(angle);
  var hr = r * 0.707;
  ctx.beginPath();
  ctx.moveTo(cx + hr * (c - s), cy + hr * (s + c));
  ctx.lineTo(cx + hr * (-c - s), cy + hr * (-s + c));
  ctx.lineTo(cx + hr * (-c + s), cy + hr * (-s - c));
  ctx.lineTo(cx + hr * (c + s), cy + hr * (s - c));
  ctx.closePath();
}

// ============================================
// Setup & Init
// ============================================
function setup() {
  pixelDensity(1);
  createCanvas(windowWidth, windowHeight);
  trailPg = createGraphics(width, height);
  trailPg.pixelDensity(1);

  // Build 12 preset neon colors
  for (var i = 0; i < 12; i++) {
    PRESET_COLORS.push(hueToNeonRGB(i * 30));
  }
  for (var i = 0; i < 3; i++) userColors.push(PRESET_COLORS[userHueIdx[i]]);
  // Override initial colors to match neon series palette
  userColors[0] = { r: 255, g: 40, b: 80 };    // Red
  userColors[1] = { r: 20, g: 100, b: 255 };    // Blue
  userColors[2] = { r: 255, g: 240, b: 180 };   // Pale warm yellow

  initSkaters();
  updateUIRects();
}

function initSkaters() {
  skaters = [];
  for (var i = 0; i < NUM_SKATERS; i++) {
    var positions = [0.25, 0.5, 0.75];
    var bs = 2.5 + random(0, 1.5);
    var col = userColors[i];
    var ba = random(TWO_PI);
    skaters.push({
      x: width * positions[i], y: height * 0.5,
      prevX: width * positions[i], prevY: height * 0.5,
      ppx: width * positions[i], ppy: height * 0.5,
      baseX: width * positions[i], baseY: height * 0.5,
      baseAngle: ba,
      phase: random(TWO_PI),
      angle: ba,
      baseSpeed: bs, speed: bs,
      waveType: WAVE_TYPES[i],
      amplitude: WAVE_AMPLITUDE,
      frequency: WAVE_FREQUENCY,
      seed: 42 + i * 95,
      cr: col.r, cg: col.g, cb: col.b,
      colorSlot: i,
      entryTime: ENTRY_TIMES[i],
      active: false,
      fadeIn: 0,
      spinOffset: random(TWO_PI)
    });
  }
}

function updateUIRects() {
  waveUIRects = [];
  colorUIRects = [];
  var uiSize = 40;
  var gap = 10;
  var rightMargin = 14;
  var totalHeight = uiSize * 7 + gap * 6; // 3 wave + 3 color + 1 eraser
  var startY = (height - totalHeight) / 2;

  for (var i = 0; i < 3; i++) {
    var baseIdx = i * 2;
    waveUIRects.push({
      x: width - rightMargin - uiSize,
      y: startY + baseIdx * (uiSize + gap),
      w: uiSize, h: uiSize,
      idx: i
    });
    colorUIRects.push({
      x: width - rightMargin - uiSize,
      y: startY + (baseIdx + 1) * (uiSize + gap),
      w: uiSize, h: uiSize,
      idx: i
    });
  }

  eraserRect = {
    x: width - rightMargin - uiSize,
    y: startY + 6 * (uiSize + gap),
    w: uiSize, h: uiSize
  };
}

// ============================================
// Apply user color to skaters by slot
// ============================================
function applyColorToSkaters(slotIdx) {
  var col = userColors[slotIdx];
  for (var i = 0; i < skaters.length; i++) {
    if (skaters[i].colorSlot === slotIdx) {
      skaters[i].cr = col.r;
      skaters[i].cg = col.g;
      skaters[i].cb = col.b;
    }
  }
}

// ============================================
// Physics — wave trajectory
// ============================================
function updateSkater(idx) {
  var s = skaters[idx];
  s.ppx = s.prevX;
  s.ppy = s.prevY;
  s.prevX = s.x;
  s.prevY = s.y;

  // Base angle drift (Perlin noise)
  s.baseAngle += (noise(s.seed, t * 0.03) - 0.5) * 0.008;

  // Mouse attraction (influences baseAngle)
  var mouseElapsed = millis() - lastMouseMoveMs;
  var mouseInfluence = Math.max(0, 1 - mouseElapsed / MOUSE_ATTRACT_MS);
  if (hasInteracted && mouseInfluence > 0) {
    var px = isTouchDevice ? lastTouchX * width : mouseX;
    var py = isTouchDevice ? lastTouchY * height : mouseY;
    var dx = px - s.x, dy = py - s.y;
    var d = sqrt(dx * dx + dy * dy);
    if (d < 500) {
      var diff = atan2(dy, dx) - s.baseAngle;
      while (diff > PI) diff -= TWO_PI;
      while (diff < -PI) diff += TWO_PI;
      s.baseAngle += diff * (1 - d / 500) * 0.008 * mouseInfluence;
    }
  }

  // Hold vortex
  var holdStr = isHolding && holdTime > 0.3 ? min((holdTime - 0.3) * 2, 5) : 0;
  if (holdStr > 0) {
    var dx = holdX - s.x, dy = holdY - s.y;
    var d = sqrt(dx * dx + dy * dy);
    if (d < 350) {
      var diff = atan2(dy, dx) - s.baseAngle;
      while (diff > PI) diff -= TWO_PI;
      while (diff < -PI) diff += TWO_PI;
      s.baseAngle += diff * (1 - d / 350) * holdStr * 0.005;
    }
  }

  // Gust
  if (gustStrength > 0.1) {
    var diff = atan2(gustDirY, gustDirX) - s.baseAngle;
    while (diff > PI) diff -= TWO_PI;
    while (diff < -PI) diff += TWO_PI;
    s.baseAngle += diff * gustStrength * 0.008;
  }

  // Speed lerp back to base
  s.speed = lerp(s.speed, s.baseSpeed, 0.03);

  // Advance phase and base position
  s.phase += s.speed * s.frequency;
  s.baseX += cos(s.baseAngle) * s.speed;
  s.baseY += sin(s.baseAngle) * s.speed;

  // Compute lateral offset from wave function
  var perpAngle = s.baseAngle + HALF_PI;
  var lateralOffset = s.amplitude * waveFunc(s.waveType, s.phase) * pinchScale;

  // Final position
  s.x = s.baseX + cos(perpAngle) * lateralOffset;
  s.y = s.baseY + sin(perpAngle) * lateralOffset;

  // Screen wrap (Pac-Man style)
  var margin = 260;
  var wrapped = false;
  if (s.baseX < -margin) { var sh = width + 2 * margin; s.baseX += sh; s.x += sh; wrapped = true; }
  else if (s.baseX > width + margin) { var sh = width + 2 * margin; s.baseX -= sh; s.x -= sh; wrapped = true; }
  if (s.baseY < -margin) { var sh = height + 2 * margin; s.baseY += sh; s.y += sh; wrapped = true; }
  else if (s.baseY > height + margin) { var sh = height + 2 * margin; s.baseY -= sh; s.y -= sh; wrapped = true; }
  if (wrapped) { s.prevX = s.x; s.prevY = s.y; s.ppx = s.x; s.ppy = s.y; }

  // Movement angle for wake trail
  var mdx = s.x - s.prevX, mdy = s.y - s.prevY;
  if (mdx !== 0 || mdy !== 0) {
    s.angle = atan2(mdy, mdx);
  }
}

// ============================================
// Collisions — color change
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
        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;

        // Ripples (pre-collision colors)
        ripples.push({ x: mx, y: my, age: 0, cr: a.cr, cg: a.cg, cb: a.cb });
        ripples.push({ x: mx, y: my, age: 0.3, cr: b.cr, cg: b.cg, cb: b.cb });

        // Sparks (8 circle particles)
        for (var k = 0; k < 8; k++) {
          var src = k < 4 ? a : b;
          var sa = random(TWO_PI), spd = random(2, 6);
          sparks.push({
            x: mx, y: my,
            vx: cos(sa) * spd, vy: sin(sa) * spd,
            age: 0, cr: src.cr, cg: src.cg, cb: src.cb
          });
        }

        // Bounce base angles
        a.baseAngle = atan2(-dy, -dx) + random(-0.4, 0.4);
        b.baseAngle = atan2(dy, dx) + random(-0.4, 0.4);
        a.speed = 5.5; b.speed = 5.5;

        // Color change — advance through preset system to stay in sync with UI
        var slotA = a.colorSlot, slotB = b.colorSlot;
        userHueIdx[slotA] = (userHueIdx[slotA] + Math.floor(random(3, 8))) % 12;
        userHueIdx[slotB] = (userHueIdx[slotB] + Math.floor(random(3, 8))) % 12;
        userColors[slotA] = PRESET_COLORS[userHueIdx[slotA]];
        userColors[slotB] = PRESET_COLORS[userHueIdx[slotB]];
        a.cr = userColors[slotA].r; a.cg = userColors[slotA].g; a.cb = userColors[slotA].b;
        b.cr = userColors[slotB].r; b.cg = userColors[slotB].g; b.cb = userColors[slotB].b;
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
  }
  sparks = sparks.filter(function(sp) { return sp.age < 1.5; });

  // === Trail Canvas ===
  var tctx = trailPg.drawingContext;
  tctx.globalCompositeOperation = 'lighter';

  var trailLayers = [
    { hw: 14,  a: 0.02 },
    { hw: 7,   a: 0.05 },
    { hw: 3.5, a: 0.12 },
    { hw: 1.5, a: 0.25 }
  ];

  tctx.lineCap = 'butt';
  for (var li = 0; li < trailLayers.length; li++) {
    var lhw = trailLayers[li].hw;
    var la = trailLayers[li].a;
    for (var si = 0; si < skaters.length; si++) {
      var s = skaters[si];
      if (!s.active || s.fadeIn < 0.01) continue;
      var a = la * s.fadeIn * pulse;
      tctx.strokeStyle = 'rgba(' + s.cr + ',' + s.cg + ',' + s.cb + ',' + a + ')';
      tctx.lineWidth = lhw * 2 * pinchScale;
      // Quadratic bezier through midpoints — seamless, no overlap
      var mx0x = (s.ppx + s.prevX) * 0.5, mx0y = (s.ppy + s.prevY) * 0.5;
      var mx1x = (s.prevX + s.x) * 0.5, mx1y = (s.prevY + s.y) * 0.5;
      tctx.beginPath();
      tctx.moveTo(mx0x, mx0y);
      tctx.quadraticCurveTo(s.prevX, s.prevY, mx1x, mx1y);
      tctx.stroke();
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

  // Skater heads — multi-layer circle glow
  for (var i = 0; i < skaters.length; i++) {
    var s = skaters[i];
    if (!s.active || s.fadeIn < 0.01) continue;
    var fi = s.fadeIn;
    var sc = pinchScale;
    var colStr = s.cr + ',' + s.cg + ',' + s.cb;

    var heads = [
      { r: 28 * sc, a: 0.025 * pulse * fi },
      { r: 15 * sc, a: 0.07 * pulse * fi },
      { r: 7 * sc, a: 0.16 * pulse * fi },
      { r: 3.5 * sc, a: 0.4 * pulse * fi },
      { r: 1.8 * sc, a: 0.8 * pulse * fi }
    ];
    for (var hi = 0; hi < heads.length; hi++) {
      ctx.fillStyle = 'rgba(' + colStr + ',' + heads[hi].a + ')';
      ctx.beginPath();
      ctx.arc(s.x, s.y, heads[hi].r, 0, Math.PI * 2);
      ctx.fill();
    }
    // White core
    ctx.fillStyle = 'rgba(255,240,255,' + (pulse * fi) + ')';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 1.8 * sc, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sparks — circles
  for (var si = 0; si < sparks.length; si++) {
    var sp = sparks[si];
    var fade = Math.max(0, 1 - sp.age / 1.2);
    fade = fade * fade;
    if (fade <= 0) continue;
    ctx.fillStyle = 'rgba(' + sp.cr + ',' + sp.cg + ',' + sp.cb + ',' + (fade * 0.5) + ')';
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 3.5 * fade, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,' + (fade * 0.35) + ')';
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 1.2 * fade, 0, Math.PI * 2); ctx.fill();
  }

  // Ripples
  for (var ri = 0; ri < ripples.length; ri++) {
    var rp = ripples[ri];
    var ringR = rp.age * 350;
    var fade = Math.max(0, 1 - rp.age * 0.25);
    fade = fade * fade;
    if (fade <= 0) continue;
    var rcStr = rp.cr + ',' + rp.cg + ',' + rp.cb;
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
  drawWaveUI(ctx);
  drawColorUI(ctx);
  drawEraserUI(ctx);

  // Update ripples
  for (var ri = 0; ri < ripples.length; ri++) ripples[ri].age += 0.012;
  ripples = ripples.filter(function(rp) { return rp.age < 4; });
  t += 0.008;
}

// ============================================
// Wave icon path helper
// ============================================
function drawWaveIcon(ctx, type, cx, cy) {
  ctx.beginPath();
  if (type === 'sin') {
    for (var p = 0; p <= 20; p++) {
      var px = cx - 12 + p * 24 / 20;
      var py = cy - Math.sin(p * Math.PI * 2 / 20) * 7;
      if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  } else if (type === 'cos') {
    for (var p = 0; p <= 20; p++) {
      var px = cx - 12 + p * 24 / 20;
      var py = cy - Math.cos(p * Math.PI * 2 / 20) * 7;
      if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  } else { // sin2 — double frequency
    for (var p = 0; p <= 20; p++) {
      var px = cx - 12 + p * 24 / 20;
      var py = cy - Math.sin(p * Math.PI * 4 / 20) * 7;
      if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  }
}

// ============================================
// UI Drawing — Wave Selector
// ============================================
function drawWaveUI(ctx) {
  var pulse = 0.75 + Math.sin(t * 0.5) * 0.25;
  for (var i = 0; i < waveUIRects.length; i++) {
    var rect = waveUIRects[i];
    var skaterIdx = rect.idx;
    var col = userColors[skaterIdx];
    var cx = rect.x + rect.w / 2;
    var cy = rect.y + rect.h / 2;
    var colStr = col.r + ',' + col.g + ',' + col.b;
    var wt = skaters.length > skaterIdx ? skaters[skaterIdx].waveType : WAVE_TYPES[skaterIdx];
    var fi = (skaterIdx < skaters.length && skaters[skaterIdx].active) ? 1 : 0.3;

    ctx.globalCompositeOperation = 'lighter';
    // Neon glow wave icon (3 layers)
    var strokeLayers = [
      { w: 6, a: 0.1 * pulse * fi },
      { w: 3, a: 0.3 * pulse * fi },
      { w: 1.5, a: 0.7 * pulse * fi }
    ];
    for (var li = 0; li < strokeLayers.length; li++) {
      ctx.strokeStyle = 'rgba(' + colStr + ',' + strokeLayers[li].a + ')';
      ctx.lineWidth = strokeLayers[li].w;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      drawWaveIcon(ctx, wt, cx, cy);
      ctx.stroke();
    }
    // White core line
    ctx.strokeStyle = 'rgba(255,240,255,' + (0.6 * pulse * fi) + ')';
    ctx.lineWidth = 0.8;
    drawWaveIcon(ctx, wt, cx, cy);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ============================================
// UI Drawing — Color Picker
// ============================================
function drawColorUI(ctx) {
  var pulse = 0.75 + Math.sin(t * 0.5) * 0.25;
  for (var i = 0; i < colorUIRects.length; i++) {
    var rect = colorUIRects[i];
    var col = userColors[rect.idx];
    var cx = rect.x + rect.w / 2;
    var cy = rect.y + rect.h / 2;
    var colStr = col.r + ',' + col.g + ',' + col.b;

    var fi = (rect.idx < skaters.length && skaters[rect.idx].active) ? 1 : 0.3;

    // Neon glow circle
    ctx.globalCompositeOperation = 'lighter';
    var layers = [
      { r: 16, a: 0.06 * pulse * fi },
      { r: 11, a: 0.14 * pulse * fi },
      { r: 7,  a: 0.3 * pulse * fi },
      { r: 4,  a: 0.6 * pulse * fi },
      { r: 2,  a: 1.0 * pulse * fi }
    ];
    for (var gi = 0; gi < layers.length; gi++) {
      ctx.fillStyle = 'rgba(' + colStr + ',' + layers[gi].a + ')';
      ctx.beginPath();
      ctx.arc(cx, cy, layers[gi].r, 0, Math.PI * 2);
      ctx.fill();
    }
    // White core
    ctx.fillStyle = 'rgba(255,240,255,' + (pulse * fi) + ')';
    ctx.beginPath();
    ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ============================================
// UI Drawing — Eraser (silver neon square)
// ============================================
function drawEraserUI(ctx) {
  if (!eraserRect) return;
  var cx = eraserRect.x + eraserRect.w / 2;
  var cy = eraserRect.y + eraserRect.h / 2;
  var pulse = 0.75 + Math.sin(t * 0.5) * 0.25;

  ctx.globalCompositeOperation = 'lighter';
  var layers = [
    { r: 12, a: 0.06 * pulse },
    { r: 8,  a: 0.14 * pulse },
    { r: 5,  a: 0.3 * pulse },
    { r: 3,  a: 0.6 * pulse },
    { r: 1.5, a: 1.0 * pulse }
  ];
  for (var li = 0; li < layers.length; li++) {
    ctx.fillStyle = 'rgba(200,210,220,' + layers[li].a + ')';
    drawSquare(ctx, cx, cy, layers[li].r, -Math.PI / 4);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ============================================
// UI Hit Testing
// ============================================
function hitTestWaveUI(x, y) {
  for (var i = 0; i < waveUIRects.length; i++) {
    var r = waveUIRects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      // Cycle wave type: sin → cos → tan → sin
      var s = skaters[r.idx];
      if (s) {
        var idx = WAVE_TYPES.indexOf(s.waveType);
        s.waveType = WAVE_TYPES[(idx + 1) % 3];
      }
      return true;
    }
  }
  return false;
}

function hitTestColorUI(x, y) {
  for (var i = 0; i < colorUIRects.length; i++) {
    var r = colorUIRects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      userHueIdx[r.idx] = (userHueIdx[r.idx] + 1) % 12;
      userColors[r.idx] = PRESET_COLORS[userHueIdx[r.idx]];
      applyColorToSkaters(r.idx);
      return true;
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
    var nx = random(width * 0.15, width * 0.85);
    var ny = random(height * 0.15, height * 0.85);
    s.x = nx; s.y = ny;
    s.prevX = nx; s.prevY = ny;
    s.ppx = nx; s.ppy = ny;
    s.baseX = nx; s.baseY = ny;
    s.baseAngle = random(TWO_PI);
    s.angle = s.baseAngle;
    s.phase = random(TWO_PI);
  }
  // Ripple at tap point
  var col = randomNeonColor();
  ripples.push({ x: tapX, y: tapY, age: 0, cr: col.r, cg: col.g, cb: col.b });
}

// ============================================
// Sound
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
  if (hitTestWaveUI(mouseX, mouseY)) return;
  if (hitTestColorUI(mouseX, mouseY)) return;
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
    if (hitTestWaveUI(tx, ty)) return false;
    if (hitTestColorUI(tx, ty)) return false;
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
