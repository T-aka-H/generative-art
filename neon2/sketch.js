// ============================================
// Neon2 — Triangle Geometry
// 全ての描画要素を三角形のみで構成
// 物理・衝突・サウンドはNeon1と同一
// ============================================

var t = 0;
var soundStarted = false;
var appStarted = false;
var appStartTime = 0;

var audioCtx, windNode, windGain, driftNode, driftGain;
var lastTouchX = 0.5, lastTouchY = 0.5;
var isTouchDevice = false, hasInteracted = false;
var tiltStatusMsg = '', statusShowTime = 0;
var prevTouchX = 0, prevTouchY = 0;
var gustStrength = 0, gustDirX = 0, gustDirY = 0;
var holdTime = 0, holdX = 0, holdY = 0, isHolding = false, holdThreshold = 20;
var pinchScale = 1.0, lastPinchDist = 0;
var manualHour = 18, lastTapTime = 0;
var ripples = [];

var INITIAL_SKATERS = 22;
var MAX_SKATERS = 30;
var skaters = [];

// Trail canvases — double-buffer with periodic swap (no ghost residue)
var trailPgA, trailPgB;
var activeTrail = 0;
var swapFrameCount = 0;
var SWAP_INTERVAL = 4200;
var FADE_ALPHA = 0.02;
var FADE_EVERY = 86;
var fadeFrameCount = 0;

var sparks = [];
var collisionCooldowns = {};
var COLLISION_COOLDOWN = 800;

var lastMouseMoveMs = 0;
var MOUSE_ATTRACT_MS = 3000;

var ENTRY_TIMES = [
  0, 0, 8, 14, 20, 26, 32, 38, 44, 50, 56,
  62, 68, 74, 80, 88, 96, 104, 112, 120, 130, 140
];

var TWO_THIRDS_PI = 2.0943951; // 2*PI/3

// Random vivid neon color (HSV with S=0.8-1.0, V=1.0 → RGB)
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

var colorThemes = [
  { bg: [2, 0, 8], primary: [255, 20, 100], secondary: [0, 180, 255], name: 'Midnight Neon' },
  { bg: [3, 0, 10], primary: [255, 0, 180], secondary: [40, 80, 255], name: 'Deep Synth' },
  { bg: [4, 0, 8], primary: [255, 60, 120], secondary: [120, 60, 255], name: 'Rose Circuit' },
  { bg: [5, 1, 8], primary: [255, 80, 140], secondary: [160, 120, 255], name: 'Dawn Signal' },
  { bg: [3, 0, 6], primary: [255, 40, 200], secondary: [60, 160, 255], name: 'Fuchsia Sky' },
  { bg: [2, 2, 6], primary: [255, 100, 180], secondary: [0, 220, 220], name: 'Pink Teal' },
  { bg: [4, 2, 6], primary: [255, 140, 200], secondary: [120, 200, 255], name: 'Soft Pulse' },
  { bg: [4, 0, 6], primary: [255, 50, 120], secondary: [0, 240, 240], name: 'Hot Wire' },
  { bg: [4, 0, 8], primary: [240, 20, 160], secondary: [20, 100, 255], name: 'Magenta Grid' },
  { bg: [5, 0, 6], primary: [255, 30, 80], secondary: [20, 100, 255], name: 'Sunset Drive' },
  { bg: [3, 0, 8], primary: [220, 0, 180], secondary: [0, 120, 255], name: 'Night Drive' },
  { bg: [2, 0, 6], primary: [200, 20, 200], secondary: [30, 60, 220], name: 'Violet Dream' },
];

// ============================================
// Triangle helpers
// ============================================
function triPath(ctx, cx, cy, r, angle) {
  ctx.beginPath();
  ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  ctx.lineTo(cx + r * Math.cos(angle + TWO_THIRDS_PI), cy + r * Math.sin(angle + TWO_THIRDS_PI));
  ctx.lineTo(cx + r * Math.cos(angle - TWO_THIRDS_PI), cy + r * Math.sin(angle - TWO_THIRDS_PI));
  ctx.closePath();
}

function wakePath(ctx, tx, ty, hx, hy, hw, angle) {
  var pa = angle + 1.5707963;
  var cp = Math.cos(pa), sp = Math.sin(pa);
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(hx + hw * cp, hy + hw * sp);
  ctx.lineTo(hx - hw * cp, hy - hw * sp);
  ctx.closePath();
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
}

function initSkaters() {
  skaters = [];
  for (var i = 0; i < INITIAL_SKATERS; i++) {
    var ang = random(TWO_PI);
    var sx, sy;
    if (i < 2) {
      sx = i === 0 ? width * 0.35 : width * 0.65;
      sy = height * 0.5;
    } else {
      var side = (i - 2) % 4;
      if (side === 0)      { sx = -10; sy = random(height * 0.15, height * 0.85); ang = random(-0.4, 0.4); }
      else if (side === 1) { sx = width + 10; sy = random(height * 0.15, height * 0.85); ang = PI + random(-0.4, 0.4); }
      else if (side === 2) { sx = random(width * 0.15, width * 0.85); sy = -10; ang = HALF_PI + random(-0.4, 0.4); }
      else                 { sx = random(width * 0.15, width * 0.85); sy = height + 10; ang = -HALF_PI + random(-0.4, 0.4); }
    }
    var bs = 2.0 + random(0, 1.5);
    var segLen = 60 + random(80);
    var nc = randomNeonColor();
    skaters.push({
      x: sx, y: sy, prevX: sx, prevY: sy,
      angle: ang, curvature: 0,
      baseSpeed: bs, speed: bs,
      seed: 42 + i * 137,
      type: i % 2 === 0 ? 'primary' : 'secondary',
      cr: nc.r, cg: nc.g, cb: nc.b,
      collisionCount: 0,
      entryTime: ENTRY_TIMES[i],
      active: false,
      fadeIn: 0,
      spinOffset: random(TWO_PI),
      segDist: 0,
      segLen: segLen,
      turnDir: random() < 0.5 ? 1 : -1,
      turning: 0,
      turnTarget: 0
    });
  }
}

// ============================================
// Physics — triangular trajectory
// 直進→~120°ターン→直進→... のサイクル + 揺らぎ
// ============================================
var TURN_ANGLE = TWO_THIRDS_PI; // 120° base turn
var TURN_SPEED = 0.12; // radians per frame during turn

function updateSkater(idx) {
  var s = skaters[idx];
  s.prevX = s.x;
  s.prevY = s.y;

  // Noise-based wobble (subtle, keeps paths organic)
  var wobble = (noise(s.seed, t * 0.08) - 0.5) * 0.012;
  s.angle += wobble;

  // Triangle trajectory: straight segments with sharp turns
  if (s.turning > 0) {
    // Currently executing a turn
    var step = min(TURN_SPEED, s.turning);
    s.angle += step * s.turnDir;
    s.turning -= step;
    s.speed = lerp(s.speed, s.baseSpeed * 0.5, 0.1); // slow during turn
  } else {
    // Straight segment
    s.segDist += s.speed;
    s.speed = lerp(s.speed, s.baseSpeed, 0.05);
    if (s.segDist >= s.segLen) {
      // Start a new turn
      s.segDist = 0;
      s.segLen = 50 + noise(s.seed + 300, t * 0.05) * 100;
      // ~120° turn with variation (100°-140°)
      s.turnTarget = TURN_ANGLE + (noise(s.seed + 400, t * 0.1) - 0.5) * 0.7;
      s.turning = s.turnTarget;
      // Occasionally flip turn direction for variety
      if (noise(s.seed + 500, t * 0.03) > 0.7) s.turnDir *= -1;
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

  // Avoidance
  for (var j = 0; j < skaters.length; j++) {
    if (j === idx || !skaters[j].active) continue;
    var dx = skaters[j].x - s.x, dy = skaters[j].y - s.y;
    var d = sqrt(dx * dx + dy * dy);
    if (d > 0 && d < 60) {
      var away = atan2(-dy, -dx);
      var diff = away - s.angle;
      while (diff > PI) diff -= TWO_PI;
      while (diff < -PI) diff += TWO_PI;
      s.angle += diff * Math.pow((60 - d) / 60, 2) * 0.006;
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
    // Cancel any turn and start a fresh straight segment toward center
    s.turning = 0;
    s.segDist = 0;
    s.segLen = 60 + random(80);
  }
}

// ============================================
// Collisions (spark creation adds angle/spin)
// ============================================
function checkCollisions() {
  var now = millis();
  var newChildren = [];
  for (var i = 0; i < skaters.length; i++) {
    if (!skaters[i].active || skaters[i].fadeIn < 0.5) continue;
    for (var j = i + 1; j < skaters.length; j++) {
      if (!skaters[j].active || skaters[j].fadeIn < 0.5) continue;
      var a = skaters[i], b = skaters[j];
      var dx = b.x - a.x, dy = b.y - a.y;
      var d = sqrt(dx * dx + dy * dy);
      var key = i * 100 + j;
      if (d < 24 && (!collisionCooldowns[key] || now - collisionCooldowns[key] > COLLISION_COOLDOWN) && random() < 0.5) {
        collisionCooldowns[key] = now;
        a.angle = atan2(-dy, -dx) + random(-0.4, 0.4);
        b.angle = atan2(dy, dx) + random(-0.4, 0.4);
        a.speed = 5.5; b.speed = 5.5;
        a.curvature *= 0.3; b.curvature *= 0.3;
        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;

        // Sparks use pre-collision colors
        for (var k = 0; k < 8; k++) {
          var src = k < 4 ? a : b;
          var sa = random(TWO_PI), spd = random(2, 6);
          sparks.push({
            x: mx, y: my,
            vx: cos(sa) * spd, vy: sin(sa) * spd,
            age: 0, cr: src.cr, cg: src.cg, cb: src.cb,
            angle: sa, spin: random(-0.3, 0.3)
          });
        }

        // Change both skaters to new random neon colors
        var ncA = randomNeonColor(), ncB = randomNeonColor();
        a.cr = ncA.r; a.cg = ncA.g; a.cb = ncA.b;
        b.cr = ncB.r; b.cg = ncB.g; b.cb = ncB.b;

        if (((a.type === 'primary' && b.type === 'secondary') ||
            (a.type === 'secondary' && b.type === 'primary')) && random() < 0.5) {
          newChildren.push({ x: mx, y: my });
        }

        if (a.type === 'child') {
          a.collisionCount++;
          if (a.collisionCount >= 10) {
            a.type = random() < 0.5 ? 'primary' : 'secondary';
            a.collisionCount = 0;
            for (var k = 0; k < 12; k++) {
              var sa = random(TWO_PI), spd = random(3, 7);
              sparks.push({
                x: a.x, y: a.y,
                vx: cos(sa) * spd, vy: sin(sa) * spd,
                age: 0, cr: a.cr, cg: a.cg, cb: a.cb,
                angle: sa, spin: random(-0.3, 0.3)
              });
            }
          }
        }
        if (b.type === 'child') {
          b.collisionCount++;
          if (b.collisionCount >= 10) {
            b.type = random() < 0.5 ? 'primary' : 'secondary';
            b.collisionCount = 0;
            for (var k = 0; k < 12; k++) {
              var sa = random(TWO_PI), spd = random(3, 7);
              sparks.push({
                x: b.x, y: b.y,
                vx: cos(sa) * spd, vy: sin(sa) * spd,
                age: 0, cr: b.cr, cg: b.cg, cb: b.cb,
                angle: sa, spin: random(-0.3, 0.3)
              });
            }
          }
        }
      }
    }
  }

  while (skaters.length >= MAX_SKATERS && newChildren.length > 0) {
    var oldestIdx = -1;
    for (var i = 0; i < skaters.length; i++) {
      if (skaters[i].entryTime === 0 && skaters[i].active && i >= INITIAL_SKATERS) {
        oldestIdx = i; break;
      }
    }
    if (oldestIdx === -1) {
      for (var i = INITIAL_SKATERS; i < skaters.length; i++) {
        if (skaters[i].active) { oldestIdx = i; break; }
      }
    }
    if (oldestIdx >= 0) skaters.splice(oldestIdx, 1);
    else break;
  }

  for (var c = 0; c < newChildren.length; c++) {
    if (skaters.length >= MAX_SKATERS) break;
    var cp = newChildren[c];
    var ang = random(TWO_PI);
    var bs = 2.0 + random(0, 1.5);
    var segLen = 60 + random(80);
    var nc = randomNeonColor();
    skaters.push({
      x: cp.x, y: cp.y, prevX: cp.x, prevY: cp.y,
      angle: ang, curvature: 0,
      baseSpeed: bs, speed: bs,
      seed: 42 + skaters.length * 137 + millis() * 0.001,
      type: 'child',
      cr: nc.r, cg: nc.g, cb: nc.b,
      collisionCount: 0,
      entryTime: 0,
      active: true,
      fadeIn: 0,
      spinOffset: random(TWO_PI),
      segDist: 0,
      segLen: segLen,
      turnDir: random() < 0.5 ? 1 : -1,
      turning: 0,
      turnTarget: 0
    });
  }
}

// ============================================
// Draw — all rendering uses triangles only
// ============================================
function draw() {
  if (!appStarted) {
    background(0); fill(255); noStroke();
    textAlign(CENTER, CENTER); textSize(min(width, height) * 0.06);
    text('Tap to Start', width / 2, height / 2);
    return;
  }

  var now = millis();

  var elapsed = (now - appStartTime) / 1000;
  for (var i = 0; i < skaters.length; i++) {
    if (!skaters[i].active && elapsed >= skaters[i].entryTime) {
      skaters[i].active = true;
    }
    if (skaters[i].active && skaters[i].fadeIn < 1) {
      skaters[i].fadeIn = min(1, skaters[i].fadeIn + 0.008);
    }
  }

  // Color theme
  var h;
  if (manualHour >= 0) { h = manualHour; }
  else { var d = new Date(); h = d.getHours() + d.getMinutes() / 60; }
  var ti = floor(h / 2) % 12, ni = (ti + 1) % 12;
  var tb = (h / 2 - floor(h / 2)); tb = tb * tb * (3 - 2 * tb);
  var cur = colorThemes[ti], nxt = colorThemes[ni];
  var bgR = lerp(cur.bg[0], nxt.bg[0], tb);
  var bgG = lerp(cur.bg[1], nxt.bg[1], tb);
  var bgB = lerp(cur.bg[2], nxt.bg[2], tb);
  var priR = lerp(cur.primary[0], nxt.primary[0], tb);
  var priG = lerp(cur.primary[1], nxt.primary[1], tb);
  var priB = lerp(cur.primary[2], nxt.primary[2], tb);
  var secR = lerp(cur.secondary[0], nxt.secondary[0], tb);
  var secG = lerp(cur.secondary[1], nxt.secondary[1], tb);
  var secB = lerp(cur.secondary[2], nxt.secondary[2], tb);

  gustStrength *= 0.96;
  if (touches.length < 2) pinchScale = lerp(pinchScale, 1.0, 0.005);
  if (isHolding) holdTime += 0.016;
  var pulse = 0.75 + Math.sin(t * 0.5) * 0.25;

  for (var i = 0; i < skaters.length; i++) {
    if (skaters[i].active) updateSkater(i);
  }
  checkCollisions();

  // Update sparks (with spin)
  for (var si = 0; si < sparks.length; si++) {
    var sp = sparks[si];
    sp.x += sp.vx; sp.y += sp.vy;
    sp.vx *= 0.95; sp.vy *= 0.95;
    sp.age += 0.025;
    sp.angle += sp.spin;
  }
  sparks = sparks.filter(function(sp) { return sp.age < 1.5; });

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

  // Draw trail segments as wake triangles
  var tctx = activeTrail === 0 ? tctxA : tctxB;
  tctx.globalCompositeOperation = 'lighter';

  var trailLayers = [
    { hw: 7,   a: 0.02 },
    { hw: 3.5, a: 0.05 },
    { hw: 1.5, a: 0.12 },
    { hw: 0.7, a: 0.25 }
  ];

  for (var li = 0; li < trailLayers.length; li++) {
    var lhw = trailLayers[li].hw;
    var lb = trailLayers[li].a;
    for (var si = 0; si < skaters.length; si++) {
      var s = skaters[si];
      if (!s.active || s.fadeIn < 0.01) continue;
      var a = lb * s.fadeIn * pulse;
      tctx.fillStyle = 'rgba(' + s.cr + ',' + s.cg + ',' + s.cb + ',' + a + ')';
      wakePath(tctx, s.prevX, s.prevY, s.x, s.y, lhw, s.angle);
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

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgb(' + Math.round(bgR) + ',' + Math.round(bgG) + ',' + Math.round(bgB) + ')';
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(trailPgA.canvas, 0, 0);
  ctx.drawImage(trailPgB.canvas, 0, 0);

  // Skater heads — concentric triangles pointing in movement direction
  for (var i = 0; i < skaters.length; i++) {
    var s = skaters[i];
    if (!s.active || s.fadeIn < 0.01) continue;
    var fi = s.fadeIn;
    var col = s.cr + ',' + s.cg + ',' + s.cb;
    var headAngle = s.angle + Math.sin(t * 0.3 + s.spinOffset) * 0.15;
    var sc = pinchScale;

    var heads = [
      { r: 22 * sc, a: 0.025 * pulse * fi },
      { r: 12 * sc, a: 0.07 * pulse * fi },
      { r: 6 * sc, a: 0.16 * pulse * fi },
      { r: 3 * sc, a: 0.4 * pulse * fi },
      { r: 1.5 * sc, a: 0.8 * pulse * fi }
    ];
    for (var hi = 0; hi < heads.length; hi++) {
      ctx.fillStyle = 'rgba(' + col + ',' + heads[hi].a + ')';
      triPath(ctx, s.x, s.y, heads[hi].r, headAngle);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,240,255,' + (pulse * fi) + ')';
    triPath(ctx, s.x, s.y, 1.5 * sc, headAngle);
    ctx.fill();
  }

  // Sparks — spinning triangles
  for (var si = 0; si < sparks.length; si++) {
    var sp = sparks[si];
    var fade = Math.max(0, 1 - sp.age / 1.2);
    fade = fade * fade;
    if (fade <= 0) continue;
    ctx.fillStyle = 'rgba(' + sp.cr + ',' + sp.cg + ',' + sp.cb + ',' + (fade * 0.5) + ')';
    triPath(ctx, sp.x, sp.y, 3.5 * fade, sp.angle);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,' + (fade * 0.35) + ')';
    triPath(ctx, sp.x, sp.y, 1.2 * fade, sp.angle);
    ctx.fill();
  }

  // Ripples — expanding rotating triangles
  for (var ri = 0; ri < ripples.length; ri++) {
    var rp = ripples[ri];
    var ringR = rp.age * 350;
    var fade = Math.max(0, 1 - rp.age * 0.25);
    fade = fade * fade;
    if (fade <= 0) continue;
    var cr = rp.useSecondary ? Math.round(secR) : Math.round(priR);
    var cg = rp.useSecondary ? Math.round(secG) : Math.round(priG);
    var cb = rp.useSecondary ? Math.round(secB) : Math.round(priB);
    var col = cr + ',' + cg + ',' + cb;
    var rAngle = rp.angle + rp.age * 0.8;
    var rl = [{ w: 12, a: 0.025 * fade }, { w: 4, a: 0.08 * fade }, { w: 1.2, a: 0.25 * fade }];
    for (var li = 0; li < rl.length; li++) {
      ctx.strokeStyle = 'rgba(' + col + ',' + rl[li].a + ')';
      ctx.lineWidth = rl[li].w;
      triPath(ctx, rp.x, rp.y, ringR, rAngle);
      ctx.stroke();
    }
  }

  // Hold aura — concentric rotating triangles
  var holdStrength = isHolding && holdTime > 0.3 ? min((holdTime - 0.3) * 2, 5) : 0;
  if (holdStrength > 0) {
    var auraR = min(holdTime * 60, 250);
    var mc = Math.round(priR * 0.5 + secR * 0.5) + ',' + Math.round(priG * 0.5 + secG * 0.5) + ',' + Math.round(priB * 0.5 + secB * 0.5);
    var auraAngle = t * 0.2;
    for (var r = auraR; r > 0; r -= 14) {
      var layerAngle = auraAngle + (auraR - r) * 0.02;
      ctx.fillStyle = 'rgba(' + mc + ',' + ((1 - r / auraR) * min(holdTime * 3, 15) / 255) + ')';
      triPath(ctx, holdX, holdY, r, layerAngle);
      ctx.fill();
    }
  }

  ctx.globalCompositeOperation = 'source-over';

  // Update ripples
  for (var ri = 0; ri < ripples.length; ri++) ripples[ri].age += 0.012;
  ripples = ripples.filter(function(rp) { return rp.age < 4; });
  t += 0.008;

  // Status message
  if (tiltStatusMsg && now - statusShowTime < 5000) {
    var a = constrain(map(now - statusShowTime, 4000, 5000, 255, 0), 0, 255);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '16px -apple-system, sans-serif';
    var tw = ctx.measureText(tiltStatusMsg).width;
    ctx.fillStyle = 'rgba(0,0,0,' + (a / 255 * 0.5) + ')';
    ctx.beginPath(); ctx.roundRect(width / 2 - tw / 2 - 15, 15, tw + 30, 30, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,' + (a / 255) + ')';
    ctx.fillText(tiltStatusMsg, width / 2, 30);
  }
}

// ============================================
// Theme change
// ============================================
function handleThemeChange() {
  var now_ms = millis();
  if (now_ms - lastTapTime < 400) {
    manualHour = -1;
    tiltStatusMsg = 'Back to real time';
    statusShowTime = millis(); lastTapTime = 0;
  } else {
    if (manualHour < 0) { var now = new Date(); manualHour = (now.getHours() + 2) % 24; }
    else { manualHour = (manualHour + 2) % 24; }
    tiltStatusMsg = colorThemes[floor(manualHour / 2) % 12].name;
    statusShowTime = millis(); lastTapTime = now_ms;
  }
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
// Mouse / Touch (ripple creation adds angle)
// ============================================
function mousePressed() {
  if (!appStarted) { appStarted = true; appStartTime = millis(); if (!soundStarted) initSound(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); return; }
  hasInteracted = true; lastMouseMoveMs = millis();
  if (!soundStarted) initSound(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  handleThemeChange();
  ripples.push({ x: mouseX, y: mouseY, age: 0, useSecondary: ripples.length % 2 === 0, angle: random(TWO_PI) });
}
function mouseMoved() {
  if (appStarted) { hasInteracted = true; lastMouseMoveMs = millis(); }
}

function touchStarted() {
  if (!appStarted) { appStarted = true; appStartTime = millis(); isTouchDevice = true; if (!soundStarted) initSound(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); return false; }
  hasInteracted = true; lastMouseMoveMs = millis();
  if (!soundStarted) initSound(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  isTouchDevice = true;
  handleThemeChange();
  for (var i = 0; i < touches.length; i++) {
    ripples.push({ x: touches[i].x, y: touches[i].y, age: 0, useSecondary: ripples.length % 2 === 0, angle: random(TWO_PI) });
    lastTouchX = touches[i].x / width; lastTouchY = touches[i].y / height;
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
}
