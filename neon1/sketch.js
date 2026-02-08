// ============================================
// Neon — Figure Skaters
// 赤と青がぶつかると黄色い子が生まれる
// 子は10回ぶつかると赤か青に成長する
// 軌跡履歴方式 — 毎フレーム再描画で確実に消える
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
var manualHour = 18, lastTapTime = 0; // 18 = Sunset Drive
var ripples = [];

var INITIAL_SKATERS = 22;
var MAX_SKATERS = 30;
var skaters = [];

// Trail canvases — double-buffer with periodic swap (no ghost residue)
var trailPgA, trailPgB;
var activeTrail = 0;
var swapFrameCount = 0;
var SWAP_INTERVAL = 1500; // swap every 25 seconds at 60fps (safety clear)
var FADE_ALPHA = 0.02; // 5/255 in 8-bit — clears alpha=1 ghosts properly
var FADE_EVERY = 29; // fade every ~0.48 sec × ~42 steps = ~20 sec trail
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

// Child skater color (golden yellow neon)
var CHILD_R = 255, CHILD_G = 245, CHILD_B = 200;

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
    skaters.push({
      x: sx, y: sy, prevX: sx, prevY: sy,
      angle: ang, curvature: 0,
      baseSpeed: bs, speed: bs,
      seed: 42 + i * 137,
      type: i % 2 === 0 ? 'primary' : 'secondary',
      collisionCount: 0,
      entryTime: ENTRY_TIMES[i],
      active: false,
      fadeIn: 0
    });
  }
}

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

  // Mouse attraction (fades after a few seconds)
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

  // Avoidance of other skaters (gentle — allows passing through)
  for (var j = 0; j < skaters.length; j++) {
    if (j === idx || !skaters[j].active) continue;
    var dx = skaters[j].x - s.x, dy = skaters[j].y - s.y;
    var d = sqrt(dx * dx + dy * dy);
    if (d > 0 && d < 70) {
      var away = atan2(-dy, -dx);
      var diff = away - s.angle;
      while (diff > PI) diff -= TWO_PI;
      while (diff < -PI) diff += TWO_PI;
      s.curvature += diff * Math.pow((70 - d) / 70, 2) * 0.008;
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

        // Sparks
        for (var k = 0; k < 8; k++) {
          var sa = random(TWO_PI), spd = random(2, 6);
          sparks.push({
            x: mx, y: my,
            vx: cos(sa) * spd, vy: sin(sa) * spd,
            age: 0, type: k < 4 ? a.type : b.type
          });
        }

        // Primary + Secondary collision → spawn child (50% chance)
        if (((a.type === 'primary' && b.type === 'secondary') ||
            (a.type === 'secondary' && b.type === 'primary')) && random() < 0.5) {
          newChildren.push({ x: mx, y: my });
        }

        // Increment child collision count → evolve at 10
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
                age: 0, type: a.type
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
                age: 0, type: b.type
              });
            }
          }
        }
      }
    }
  }

  // Remove oldest skaters if at capacity
  while (skaters.length >= MAX_SKATERS && newChildren.length > 0) {
    // Find oldest non-initial skater (child or evolved child)
    var oldestIdx = -1;
    for (var i = 0; i < skaters.length; i++) {
      if (skaters[i].entryTime === 0 && skaters[i].active && i >= INITIAL_SKATERS) {
        oldestIdx = i; break;
      }
    }
    if (oldestIdx === -1) {
      // Fall back: remove oldest active skater beyond initial set
      for (var i = INITIAL_SKATERS; i < skaters.length; i++) {
        if (skaters[i].active) { oldestIdx = i; break; }
      }
    }
    if (oldestIdx >= 0) skaters.splice(oldestIdx, 1);
    else break;
  }

  // Spawn children
  for (var c = 0; c < newChildren.length; c++) {
    if (skaters.length >= MAX_SKATERS) break;
    var cp = newChildren[c];
    var ang = random(TWO_PI);
    var bs = 2.0 + random(0, 1.5);
    skaters.push({
      x: cp.x, y: cp.y, prevX: cp.x, prevY: cp.y,
      angle: ang, curvature: 0,
      baseSpeed: bs, speed: bs,
      seed: 42 + skaters.length * 137 + millis() * 0.001,
      type: 'child',
      collisionCount: 0,
      entryTime: 0,
      active: true,
      fadeIn: 0
    });
  }
}

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

  // === Trail Canvases (double-buffer, destination-out fade) ===
  var tctxA = trailPgA.drawingContext;
  var tctxB = trailPgB.drawingContext;

  // Fade both canvases — only every FADE_EVERY frames to achieve slow decay
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

  // Draw new segments on active canvas only
  var tctx = activeTrail === 0 ? tctxA : tctxB;
  tctx.globalCompositeOperation = 'lighter';
  tctx.lineCap = 'round';
  tctx.lineJoin = 'round';

  var trailLayers = [
    { w: 14, a: 0.02 },
    { w: 7, a: 0.05 },
    { w: 3, a: 0.12 },
    { w: 1.5, a: 0.25 }
  ];

  for (var li = 0; li < trailLayers.length; li++) {
    tctx.lineWidth = trailLayers[li].w;
    var lb = trailLayers[li].a;
    for (var si = 0; si < skaters.length; si++) {
      var s = skaters[si];
      if (!s.active || s.fadeIn < 0.01) continue;
      var cr, cg, cb;
      if (s.type === 'child') { cr = CHILD_R; cg = CHILD_G; cb = CHILD_B; }
      else if (s.type === 'primary') { cr = Math.round(priR); cg = Math.round(priG); cb = Math.round(priB); }
      else { cr = Math.round(secR); cg = Math.round(secG); cb = Math.round(secB); }
      var a = lb * s.fadeIn * pulse;
      tctx.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + a + ')';
      tctx.beginPath();
      tctx.moveTo(s.prevX, s.prevY);
      tctx.lineTo(s.x, s.y);
      tctx.stroke();
    }
  }

  // Swap buffers periodically — old buffer continues fading, then gets hard-cleared
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
  ctx.fillStyle = 'rgb(' + Math.round(bgR) + ',' + Math.round(bgG) + ',' + Math.round(bgB) + ')';
  ctx.fillRect(0, 0, width, height);

  // Composite both trail canvases
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(trailPgA.canvas, 0, 0);
  ctx.drawImage(trailPgB.canvas, 0, 0);

  // Skater heads
  for (var i = 0; i < skaters.length; i++) {
    var s = skaters[i];
    if (!s.active || s.fadeIn < 0.01) continue;
    var cr, cg, cb;
    if (s.type === 'child') { cr = CHILD_R; cg = CHILD_G; cb = CHILD_B; }
    else if (s.type === 'primary') { cr = Math.round(priR); cg = Math.round(priG); cb = Math.round(priB); }
    else { cr = Math.round(secR); cg = Math.round(secG); cb = Math.round(secB); }
    var fi = s.fadeIn;
    var col = cr + ',' + cg + ',' + cb;

    var heads = [
      { r: 20, a: 0.025 * pulse * fi }, { r: 10, a: 0.07 * pulse * fi },
      { r: 5, a: 0.16 * pulse * fi },   { r: 2.5, a: 0.4 * pulse * fi },
      { r: 1.2, a: 0.8 * pulse * fi }
    ];
    for (var hi = 0; hi < heads.length; hi++) {
      ctx.fillStyle = 'rgba(' + col + ',' + heads[hi].a + ')';
      ctx.beginPath(); ctx.arc(s.x, s.y, heads[hi].r * pinchScale, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,240,255,' + (pulse * fi) + ')';
    ctx.beginPath(); ctx.arc(s.x, s.y, 1.2 * pinchScale, 0, Math.PI * 2); ctx.fill();
  }

  // Sparks
  for (var si = 0; si < sparks.length; si++) {
    var sp = sparks[si];
    var fade = Math.max(0, 1 - sp.age / 1.2);
    fade = fade * fade;
    if (fade <= 0) continue;
    var cr, cg, cb;
    if (sp.type === 'child') { cr = CHILD_R; cg = CHILD_G; cb = CHILD_B; }
    else if (sp.type === 'primary') { cr = Math.round(priR); cg = Math.round(priG); cb = Math.round(priB); }
    else { cr = Math.round(secR); cg = Math.round(secG); cb = Math.round(secB); }
    ctx.fillStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (fade * 0.5) + ')';
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 2.5 * fade, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,' + (fade * 0.35) + ')';
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 1 * fade, 0, Math.PI * 2); ctx.fill();
  }

  // Ripples
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
    var rl = [{ w: 12, a: 0.025 * fade }, { w: 4, a: 0.08 * fade }, { w: 1.2, a: 0.25 * fade }];
    for (var li = 0; li < rl.length; li++) {
      ctx.strokeStyle = 'rgba(' + col + ',' + rl[li].a + ')';
      ctx.lineWidth = rl[li].w;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, ringR, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // Hold aura
  var holdStrength = isHolding && holdTime > 0.3 ? min((holdTime - 0.3) * 2, 5) : 0;
  if (holdStrength > 0) {
    var auraR = min(holdTime * 60, 250);
    var mc = Math.round(priR * 0.5 + secR * 0.5) + ',' + Math.round(priG * 0.5 + secG * 0.5) + ',' + Math.round(priB * 0.5 + secB * 0.5);
    for (var r = auraR; r > 0; r -= 12) {
      ctx.fillStyle = 'rgba(' + mc + ',' + ((1 - r / auraR) * min(holdTime * 3, 15) / 255) + ')';
      ctx.beginPath(); ctx.arc(holdX, holdY, r, 0, Math.PI * 2); ctx.fill();
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
// Mouse / Touch
// ============================================
function mousePressed() {
  if (!appStarted) { appStarted = true; appStartTime = millis(); if (!soundStarted) initSound(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); return; }
  hasInteracted = true; lastMouseMoveMs = millis();
  if (!soundStarted) initSound(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  handleThemeChange();
  ripples.push({ x: mouseX, y: mouseY, age: 0, useSecondary: ripples.length % 2 === 0 });
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
    ripples.push({ x: touches[i].x, y: touches[i].y, age: 0, useSecondary: ripples.length % 2 === 0 });
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
