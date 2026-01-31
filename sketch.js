// ============================================
// 【新しい概念】mouseX, mouseY
// p5.js はマウスの位置を常に追跡していて、
// mouseX（横位置）, mouseY（縦位置）でいつでも取得できる
// ============================================

let t = 0;
let numWaves = 12;

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
}

function draw() {
  background(220, 60, 10);

  // --- マウス位置を 0〜1 の比率に変換する ---
  // mouseX が左端なら 0、右端なら 1
  let mx = mouseX / width;
  // mouseY が上端なら 0、下端なら 1
  let my = mouseY / height;

  // マウスY位置で波の振幅（高さ）を変える
  // 上にあるほど穏やか（20px）、下にあるほど荒い（80px）
  let amplitude = 60 + my * 120;

  // マウスX位置で波の流れる速さを変える
  // 左端: -2（逆流）、中央: 0（静止）、右端: +2（順流）
  let speed = (mx - 0.5) * 4;

  for (let i = 0; i < numWaves; i++) {

    let baseY = height * 0.3 + (i / numWaves) * height * 0.7;

    let hue = 210 - i * 3;
    let saturation = 50 + i * 2;
    let brightness = 15 + i * 6;
    let alpha = 70 + i * 2;

    fill(hue, saturation, brightness, alpha);
    noStroke();

    beginShape();
    vertex(0, height);

    for (let x = 0; x <= width; x += 5) {

      // speed をかけて、マウスの横位置で流れる方向・速さを制御
      let wave1 = sin(x * 0.005 + t * speed + i * 0.8) * amplitude;
      let wave2 = sin(x * 0.012 + t * speed * 0.5 - i * 0.5) * (amplitude * 0.4);
      let n = noise(x * 0.008, i * 0.5, t * 0.4) * 80;

      // --- マウス付近で波が盛り上がる効果 ---
      // マウスと今の x 座標の距離を計算
      let distFromMouse = abs(x - mouseX);
      // 距離が近いほど大きい値（最大 40px 盛り上がる）、遠いと 0
      // max() で負の値にならないようにする
      let ripple = max(0, 40 - distFromMouse * 0.15) * (i / numWaves);

      let y = baseY + wave1 + wave2 + n - ripple;

      vertex(x, y);
    }

    vertex(width, height);
    endShape(CLOSE);
  }

  t += 0.003;
}
