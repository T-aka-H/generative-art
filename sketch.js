// ============================================
// 【新しい概念】mouseX, mouseY
// p5.js はマウスの位置を常に追跡していて、
// mouseX（横位置）, mouseY（縦位置）でいつでも取得できる
// ============================================

let t = 0;
let numWaves = 120;
let clicks = [];
let soundStarted = false;
let appStarted = false; // スタート画面 → 本編の切り替えフラグ

// --- 【新しい概念】Web Audio API ---
// ブラウザ標準の音声生成API。外部ライブラリ不要。
// AudioContext がすべての音の出発点。ノード（部品）をつないで音を作る。
let audioCtx;       // 音声コンテキスト（音の世界の入口）
let ambientNode;    // 環境音のノイズ生成ノード
let ambientGain;    // 環境音の音量ノード

// --- 【新しい概念】DeviceOrientationEvent ---
// スマートフォンの傾きを検知するブラウザAPI。
// beta = 前後の傾き（-180〜180）、gamma = 左右の傾き（-90〜90）
// 水を入れたお皿を傾けるように、波の流れを操作できる。
let tiltX = 0;     // gamma: 左右の傾き
let tiltY = 0;     // beta: 前後の傾き
let hasTilt = false;           // 傾きデータが取得できたかどうか
let permissionRequested = false; // iOS用パーミッションを要求済みか

// --- タッチ位置フォールバック ---
// 傾きセンサーが使えない場合、最後にタッチした位置で波を操作する
let lastTouchX = 0.5;  // 0〜1（画面の横位置比率）
let lastTouchY = 0.5;  // 0〜1（画面の縦位置比率）
let isTouchDevice = false;  // タッチデバイスかどうか
let tiltStatusMsg = '';     // 状態表示メッセージ
let statusShowTime = 0;     // メッセージ表示開始時刻

// --- 【新しい概念】スワイプ速度 → 風の突風 ---
// 指の移動速度を追跡し、速いスワイプを「突風」として波に反映する。
// prevTouchX/Y: 前フレームのタッチ位置、swipeVX/VY: スワイプ速度
let prevTouchX = 0;
let prevTouchY = 0;
let swipeVX = 0;        // 横方向のスワイプ速度（-1〜1、正=右）
let swipeVY = 0;        // 縦方向のスワイプ速度（-1〜1、正=下）
let gustStrength = 0;   // 突風の強さ（0〜1、時間とともに減衰）
let gustDirection = 0;  // 突風の方向（スワイプの向き）

// --- 【新しい概念】長押し → 水面を押す ---
// 指が同じ場所に留まると「水面を指で押している」効果が広がる。
// holdTime: 同じ位置に留まっている秒数、holdX/Y: 長押し位置
let holdTime = 0;       // 長押し経過時間（秒）
let holdX = 0;          // 長押しのX座標
let holdY = 0;          // 長押しのY座標
let isHolding = false;  // 指が画面に触れているか
let holdThreshold = 20; // この距離以内なら「動いていない」とみなすピクセル数

// --- 【新しい概念】DeviceMotionEvent → 振る操作 ---
// DeviceOrientationEvent が使えなくても、加速度センサー（DeviceMotionEvent）は
// 使えることがある。端末を振ると大きな波が発生する。
let shakeIntensity = 0;   // 振動の強さ（0〜1）
let lastAccX = 0;
let lastAccY = 0;
let lastAccZ = 0;

// --- ピンチ操作 → 波の激しさ ---
// 2本指の間隔の変化を追跡し、広げると波が荒く、つまむと穏やかになる
let pinchAmplitude = 1.0;  // 波の振幅倍率（0.3〜2.0）
let lastPinchDist = 0;     // 前フレームの2指間距離

// --- 【新しい概念】Geolocation API → 緯度で海の雰囲気を変える ---
// navigator.geolocation.getCurrentPosition() で端末の位置情報を取得。
// 緯度（latitude）を使って、熱帯（赤道付近）⇔ 北極圏の海を表現する。
// climateFactor: 0.0 = 北極/南極（冷たい）、1.0 = 赤道（熱帯）
let climateFactor = 0.5;  // デフォルト: 温帯
let hasLocation = false;   // 位置情報が取得できたか

// --- 【新しい概念】コンパス（方位角）→ 波の流れる向き ---
// DeviceOrientationEvent の alpha は方位角（0〜360°、北=0）。
// 端末が向いている方角に応じて波の流れる方向が変わる。
let compassHeading = 0;    // 0〜360°
let hasCompass = false;     // コンパスデータが取得できたか

// --- 空クリック → 時間帯の手動変更 ---
// 空（画面上部30%）をクリックすると時刻を2時間ずつ進める。
// manualHour が -1 のときは実際の時刻を使う。
let manualHour = -1;       // -1 = 自動（実時刻）、0〜24 = 手動設定

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  // ボタンの処理は index.html 側のスクリプトで行う
  // （p5.js 内でDOMイベントを扱うと iOS Safari で動かないことがあるため）
}

function draw() {
  // --- スタート画面（最初のタップ待ち） ---
  // appStarted が false の間はスタート画面を表示し、本編の描画はスキップ
  if (!appStarted) {
    background(0);
    fill(0, 0, 100); // HSBで白 (色相0, 彩度0, 明度100)
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(min(width, height) * 0.06);
    text('Tap to Start', width / 2, height / 2);

    return;
  }

  // --- 時刻に応じた空のグラデーション背景 ---
  // manualHour が -1 なら実際の時刻、それ以外は手動設定の時刻を使う
  let h;
  if (manualHour >= 0) {
    h = manualHour;
  } else {
    let now = new Date();
    h = now.getHours() + now.getMinutes() / 60; // 例: 14時30分 → 14.5
  }

  // 時間帯ごとの空の色を定義（[上空, 地平線]のペア）
  // 隣り合う時間帯の間を lerpColor で滑らかに補間する
  let skyColors = [
    { hour: 0,  top: [230, 40, 10],  bottom: [240, 30, 15] },  // 深夜: 濃紺
    { hour: 5,  top: [230, 40, 15],  bottom: [240, 30, 20] },  // 夜明け前: 暗い青
    { hour: 6,  top: [280, 30, 40],  bottom: [20, 60, 90] },   // 朝焼け: 紫〜オレンジ
    { hour: 7,  top: [210, 40, 70],  bottom: [35, 40, 95] },   // 早朝: 青〜黄
    { hour: 10, top: [200, 25, 95],  bottom: [180, 8, 100] },   // 午前: 白みがかった青空
    { hour: 13, top: [190, 30, 95],  bottom: [60, 10, 100] },  // 昼: 明るく白い空
    { hour: 16, top: [200, 20, 93],  bottom: [35, 15, 100] },  // 午後: 柔らかい白空
    { hour: 18, top: [270, 40, 50],  bottom: [15, 70, 95] },   // 夕焼け: 紫〜赤橙
    { hour: 19, top: [250, 50, 30],  bottom: [10, 60, 60] },   // 日没後: 藍〜暗い赤
    { hour: 21, top: [230, 40, 12],  bottom: [240, 30, 18] },  // 夜: 濃紺
    { hour: 24, top: [230, 40, 10],  bottom: [240, 30, 15] },  // 深夜（ループ用）
  ];

  // 現在時刻がどの2つの時間帯の間にあるかを探す
  let prev = skyColors[0], next = skyColors[1];
  for (let s = 0; s < skyColors.length - 1; s++) {
    if (h >= skyColors[s].hour && h < skyColors[s + 1].hour) {
      prev = skyColors[s];
      next = skyColors[s + 1];
      break;
    }
  }

  // 2つの時間帯の間をどれくらい進んだか（0〜1）
  let blend = (h - prev.hour) / (next.hour - prev.hour);

  // 上空と地平線それぞれで、前後の時間帯の色を補間する
  let skyTop = lerpColor(
    color(prev.top[0], prev.top[1], prev.top[2]),
    color(next.top[0], next.top[1], next.top[2]),
    blend
  );
  let skyBottom = lerpColor(
    color(prev.bottom[0], prev.bottom[1], prev.bottom[2]),
    color(next.bottom[0], next.bottom[1], next.bottom[2]),
    blend
  );

  // 1ピクセルずつ横線を引いて縦方向のグラデーションを作る
  for (let y = 0; y < height; y++) {
    let ratio = y / height;
    let c = lerpColor(skyTop, skyBottom, ratio);
    stroke(c);
    line(0, y, width, y);
  }

  // --- 操作入力を 0〜1 の比率に変換する ---
  // 優先順位: 1.傾きセンサー → 2.タッチ位置 → 3.マウス位置
  let mx, my;
  if (hasTilt) {
    // gamma（左右の傾き）: -30°〜+30° を 0〜1 にマッピング
    mx = constrain(map(tiltX, -30, 30, 0, 1), 0, 1);
    // beta（前後の傾き）: 0°〜60° を 0〜1 にマッピング
    my = constrain(map(tiltY, 0, 60, 0, 1), 0, 1);
  } else if (isTouchDevice) {
    // 傾きが使えないスマホ: 最後にタッチした位置で操作
    // 画面の左側タッチ → 逆流、右側 → 順流、上 → 穏やか、下 → 荒い
    mx = lastTouchX;
    my = lastTouchY;
  } else {
    mx = mouseX / width;
    my = mouseY / height;
  }

  // マウスY位置で波の振幅（高さ）を変える
  // 上にあるほど穏やか（20px）、下にあるほど荒い（80px）
  // pinchAmplitude: ピンチ操作で振幅を増減できる
  let amplitude = (15 + my * 35) * pinchAmplitude;

  // マウスX位置で波の流れる速さを変える
  // 左端: -2（逆流）、中央: 0（静止）、右端: +2（順流）
  // gustDirection: スワイプの突風が流れの向きに加算される
  // hasCompass: コンパスが有効なら方位角で波の流れを決める
  let speed;
  if (hasCompass) {
    // コンパス: 東（90°）で右に流れ、西（270°）で左に流れる
    speed = sin(radians(compassHeading)) * 3;
  } else {
    speed = (mx - 0.5) * 4;
  }
  speed += gustDirection * gustStrength * 3;

  // 振動（シェイク）による波の増幅
  // 端末を振ると一時的に波が大きくなる
  amplitude += shakeIntensity * 40;

  // 突風・振動の減衰
  gustStrength *= 0.97;
  shakeIntensity *= 0.95;

  // ピンチ振幅をゆっくり1.0に戻す（指を離した後、自然に元の状態へ）
  if (touches.length < 2) {
    pinchAmplitude = lerp(pinchAmplitude, 1.0, 0.005);
  }

  // 長押しの経過時間を更新
  if (isHolding) {
    holdTime += 0.016;
  }

  for (let i = 0; i < numWaves; i++) {

    let ratio = i / numWaves;
    // 波の基準Y位置を時間で上下させる = 手前に押し寄せて引いていく動き
    // 各層ごとに位相（i * 0.15）をずらすことで、奥から手前へ波が伝わるように見える
    let surge = sin(t * 2.5 - i * 0.15) * (10 + ratio * 20);
    let surgeNoise = noise(i * 0.1, t * 0.6) * 15;
    let baseY = height * 0.3 + ratio * height * 0.7 + surge + surgeNoise;

    // 海の色も時刻に連動させる
    // daylight: 昼(10〜16時)で1.0、夜(21〜5時)で0.0、間は滑らかに変化
    let daylight = constrain(map(h, 5, 10, 0, 1), 0, 1) - constrain(map(h, 18, 21, 0, 1), 0, 1);
    daylight = max(daylight, 0);
    // --- 緯度（climateFactor）による海の色味の変化 ---
    // climateFactor: 0=北極（暗い灰青）、0.5=温帯（通常）、1=熱帯（ターコイズ）
    // 熱帯: 色相が低め（180前後=ターコイズ）、彩度高、明るい
    // 北極: 色相が高め（230前後=紺）、彩度低、暗い
    let tropicalHue = lerp(200, 180, daylight) - ratio * 15;
    let arcticHue = lerp(230, 220, daylight) - ratio * 10;
    let hue = lerp(arcticHue, tropicalHue, climateFactor);
    let saturation = lerp(20, 35, daylight) + ratio * 30 + climateFactor * 15;
    let brightness = lerp(15, 70, daylight) + ratio * lerp(25, 30, daylight) + climateFactor * 10;
    let alpha = 70 + ratio * 25;

    fill(hue, saturation, brightness, alpha);
    noStroke();

    // --- curveVertex() を使う ---
    // vertex() は点を直線でつなぐ → ギザギザになりやすい
    // curveVertex() は点を滑らかな曲線（Catmull-Romスプライン）で結ぶ
    // 波の曲線部分と、底辺の四角形を別々に描く
    // こうすることで波線が全て curveVertex だけになり、滑らかさが保たれる

    // まず波のY座標を全て計算して配列に保存する
    let points = [];
    for (let x = -30; x <= width + 30; x += 3) {
      // sin波を控えめに、ノイズを主役にして不規則な波にする
      let wave1 = sin(x * 0.003 + t * speed + i * 0.8) * amplitude;
      let wave2 = sin(x * 0.008 + t * speed * 0.5 - i * 0.5) * (amplitude * 0.3);
      // ノイズを3層重ねて複雑な不規則さを出す
      let n1 = noise(x * 0.002, i * 0.3, t * 0.3) * 40;
      let n2 = noise(x * 0.006, i * 0.7 + 100, t * 0.5) * 20;
      let n3 = noise(x * 0.015, i * 1.2 + 200, t * 0.2) * 10;
      let n = n1 + n2 + n3;

      // --- 【新しい概念】touches[] ---
      // p5.js はタッチ中の全指の位置を touches[] 配列で追跡する。
      // 各要素に .x, .y がある。デスクトップでは空配列になる。
      // 指が画面に触れている間、最も近い指からの距離で波を盛り上げる
      let distFromPointer;
      if (touches.length > 0) {
        distFromPointer = Infinity;
        for (let touch of touches) {
          distFromPointer = min(distFromPointer, abs(x - touch.x));
        }
      } else {
        distFromPointer = abs(x - mouseX);
      }
      let ripple = max(0, 40 - distFromPointer * 0.15) * (i / numWaves);

      // --- クリック波紋の効果を合算する ---
      let clickEffect = 0;
      for (let cl of clicks) {
        // クリック位置からの距離
        let d = abs(x - cl.x);
        // 波紋の現在の半径（時間とともに広がる）
        let radius = cl.age * 500;
        // リングの幅を広く、減衰をなだらかにする
        let ring = exp(-pow(d - radius, 2) / 30000);
        // 振動をゆるやかに（周波数・速度を下げる）
        let wave = sin(d * 0.015 - cl.age * 8) * ring;
        // ゆっくり消える（0.25 → 約4秒かけて減衰）
        let fade = max(0, 1 - cl.age * 0.25);
        clickEffect += wave * 40 * fade * (i / numWaves);
      }

      // --- 長押しによる「水面を押す」効果 ---
      // 指で水面を押し続けると、押した場所を中心に波が沈み込み
      // 周囲に波紋が広がっていく。holdTime が長いほど効果が大きくなる。
      let holdEffect = 0;
      if (isHolding && holdTime > 0.3) {
        let dHold = abs(x - holdX);
        // 押している時間に応じて影響範囲が広がる
        let holdRadius = min(holdTime * 80, 300);
        // 中心は沈み込み、周囲は盛り上がる
        if (dHold < holdRadius) {
          let holdRatio = dHold / holdRadius;
          // 中心（holdRatio=0）→ -1（沈む）、縁（holdRatio=1）→ +0.5（盛り上がる）
          let holdWave = -cos(holdRatio * PI) * 0.5 - 0.5 + holdRatio * 0.5;
          let holdDepth = min(holdTime * 5, 25); // 最大25pxの深さ
          holdEffect = holdWave * holdDepth * (i / numWaves);
        }
      }

      // --- 突風（スワイプ）による波のうねり ---
      // 速いスワイプが波全体をうねらせる
      let gustEffect = 0;
      if (gustStrength > 0.05) {
        gustEffect = sin(x * 0.005 + t * gustDirection * 10) * gustStrength * 15 * (i / numWaves);
      }

      let y = baseY + wave1 + wave2 + n - ripple - clickEffect + holdEffect + gustEffect;
      points.push({ x: x, y: y });
    }

    // 波線 → 右下 → 左下 を vertex で囲んで塗りつぶす
    beginShape();
    vertex(points[0].x, height);
    curveVertex(points[0].x, points[0].y);
    for (let p of points) {
      curveVertex(p.x, p.y);
    }
    curveVertex(points[points.length - 1].x, points[points.length - 1].y);
    vertex(points[points.length - 1].x, height);
    endShape(CLOSE);

    // --- 波頭（白いハイライト）と飛沫 ---
    // 一定間隔の波にだけ描く（全層に描くと重すぎるので）
    if (i % 4 === 0 && i > 0) {
      for (let j = 1; j < points.length - 1; j++) {
        let p = points[j];
        let prevP = points[j - 1];
        // 波が上向きに変わる箇所（山の頂点付近）を検出
        // 前の点より高い（Yが小さい）かつ、次の点より高い → 山
        let nextP = points[j + 1];
        if (p.y < prevP.y && p.y < nextP.y) {
          // 波頭の白いライン（波の山に沿って薄く白を描く）
          let foam = noise(p.x * 0.01, i * 0.5, t) ;
          if (foam > 0.3) {
            let foamAlpha = (foam - 0.3) * 120 * ratio;
            fill(0, 0, 100, foamAlpha);
            noStroke();
            // 波頭に沿った細長い楕円
            ellipse(p.x, p.y - 1, random(8, 25), random(1, 3));

            // 飛沫：波頭の上にランダムに小さな粒を散らす
            if (random() < 0.3) {
              let sprayX = p.x + random(-15, 15);
              let sprayY = p.y - random(3, 12);
              let spraySize = random(1, 3);
              fill(0, 0, 100, foamAlpha * 0.7);
              circle(sprayX, sprayY, spraySize);
            }
          }
        }
      }
    }
  }

  // --- 水面のきらめき（光の反射） ---
  // 波の上に小さな光の粒を散らす
  // noise() で出現位置を制御し、時間で明滅させる
  noStroke();
  for (let k = 0; k < 30; k++) {
    // noise の入力値を大きく離すことで、各粒が画面全体に広く分散する
    let sx = noise(k * 3.7, t * 0.2) * width * 1.2 - width * 0.1;
    let sy = noise(k * 3.7 + 500, t * 0.2) * height * 0.7 + height * 0.3;

    // 海面より上（空の部分）にはきらめきを出さない
    if (sy < height * 0.35) continue;

    // 明滅: sin() でゆっくり点滅させ、noise() でランダムなタイミングにする
    let flicker = sin(t * 8 + k * 3) * 0.5 + 0.5;        // 0〜1 で点滅
    let sparkle = noise(k * 0.3, t * 2) ;                  // 0〜1 のランダム
    let alpha = flicker * sparkle * 60;

    // 時刻による光の色味（昼=白〜黄、夕=オレンジ）
    let daylight = constrain(map(h, 5, 10, 0, 1), 0, 1) - constrain(map(h, 18, 21, 0, 1), 0, 1);
    daylight = max(daylight, 0);
    let sparkHue = lerp(30, 50, daylight);  // 夜〜昼で色相を変える
    let sparkBri = lerp(40, 100, daylight); // 夜は暗く、昼は明るく

    fill(sparkHue, 15, sparkBri, alpha);
    let size = random(1, 4) + flicker * 2;
    circle(sx, sy, size);
  }

  // クリック波紋の経過時間を進める
  for (let cl of clicks) {
    cl.age += 0.016; // 約1/60秒ぶん進める
  }
  // 消えた波紋を配列から除去（age が 2.5秒 を超えたら消す）
  clicks = clicks.filter(cl => cl.age < 4);

  t += 0.008;

  // --- 状態メッセージの表示（数秒で自動的に消える） ---
  if (tiltStatusMsg && millis() - statusShowTime < 5000) {
    let msgAlpha = map(millis() - statusShowTime, 4000, 5000, 100, 0);
    msgAlpha = constrain(msgAlpha, 0, 100);
    // 背景付きで読みやすくする
    fill(0, 0, 0, msgAlpha * 0.5);
    noStroke();
    rectMode(CENTER);
    rect(width / 2, 30, textWidth(tiltStatusMsg) + 30, 30, 8);
    fill(0, 0, 100, msgAlpha);
    textSize(16);
    textAlign(CENTER, CENTER);
    text(tiltStatusMsg, width / 2, 30);
  }

  // --- 長押し中のビジュアルフィードバック ---
  // 指で押している場所に波紋のようなリングを表示
  if (isHolding && holdTime > 0.3) {
    let holdAlpha = min((holdTime - 0.3) * 80, 40);
    let holdRadius = min(holdTime * 80, 300);
    noFill();
    stroke(0, 0, 100, holdAlpha);
    strokeWeight(1.5);
    circle(holdX, holdY, holdRadius * 2);
    // 内側のリングも追加
    if (holdRadius > 60) {
      stroke(0, 0, 100, holdAlpha * 0.5);
      circle(holdX, holdY, holdRadius);
    }
    noStroke();
  }
}

// --- 音を初期化する関数（最初のクリックで1回だけ呼ばれる） ---
function initSound() {
  // AudioContext = Web Audio API の出発点。すべての音のノードはここから作る
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // === 環境音: ホワイトノイズ → ローパスフィルタ → 波の音 ===
  // ScriptProcessorNode でホワイトノイズ（ランダムな音）を生成
  let bufferSize = 4096;
  ambientNode = audioCtx.createScriptProcessor(bufferSize, 0, 1);
  ambientNode.onaudioprocess = function(e) {
    let output = e.outputBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1; // -1〜1 のランダム値 = ホワイトノイズ
    }
  };

  // ローパスフィルタ: 高い音をカット → こもった波の音に
  let filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 350;

  // 音量を控えめに
  ambientGain = audioCtx.createGain();
  ambientGain.gain.value = 0.06;

  // ノード接続: ノイズ → フィルタ → 音量 → スピーカー
  ambientNode.connect(filter);
  filter.connect(ambientGain);
  ambientGain.connect(audioCtx.destination);

  soundStarted = true;
}

// === mousePressed() : マウスをクリックした瞬間に1回だけ呼ばれる（デスクトップ用） ===
function mousePressed() {
  // スタート画面なら初期化して本編へ
  if (!appStarted) {
    appStarted = true;
    if (!soundStarted) initSound();
    requestLocation();
    return;
  }

  if (!soundStarted) initSound();

  // 空（上部30%）をクリックしたら時間帯を2時間進める
  if (mouseY < height * 0.3) {
    if (manualHour < 0) {
      let now = new Date();
      manualHour = (now.getHours() + 2) % 24;
    } else {
      manualHour = (manualHour + 2) % 24;
    }
    tiltStatusMsg = hourToLabel(manualHour);
    statusShowTime = millis();
    return;
  }

  clicks.push({ x: mouseX, age: 0 });
}

// === touchStarted() ===
// スマホで指が画面に触れた瞬間に呼ばれる。
// return false でブラウザのデフォルト動作とmousePressed()の発火を防ぐ。
function touchStarted() {
  // スタート画面なら初期化して本編へ
  if (!appStarted) {
    appStarted = true;
    isTouchDevice = true;
    if (!soundStarted) initSound();
    requestOrientationPermission();
    requestMotionPermission();
    requestLocation();
    return false;
  }

  if (!soundStarted) initSound();
  isTouchDevice = true;

  if (!hasTilt) {
    requestOrientationPermission();
    requestMotionPermission();
  }

  // 空（上部30%）をタップしたら時間帯を2時間進める
  if (touches.length === 1 && touches[0].y < height * 0.3) {
    if (manualHour < 0) {
      let now = new Date();
      manualHour = (now.getHours() + 2) % 24;
    } else {
      manualHour = (manualHour + 2) % 24;
    }
    tiltStatusMsg = hourToLabel(manualHour);
    statusShowTime = millis();
    return false;
  }

  for (let touch of touches) {
    clicks.push({ x: touch.x, age: 0 });
    lastTouchX = touch.x / width;
    lastTouchY = touch.y / height;
  }

  // 長押し検出の初期化
  if (touches.length === 1) {
    holdX = touches[0].x;
    holdY = touches[0].y;
    holdTime = 0;
    isHolding = true;
  }

  // スワイプ速度追跡の初期化
  if (touches.length > 0) {
    prevTouchX = touches[0].x;
    prevTouchY = touches[0].y;
  }

  // 2本指タッチ時: ピンチ距離の初期値を記録
  if (touches.length === 2) {
    lastPinchDist = dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y);
    isHolding = false; // 2本指時は長押し無効
  }

  return false;
}

// === 【新しい概念】touchMoved() ===
// 指が画面上を移動している間、毎フレーム呼ばれる。
// 指の軌跡に沿って小さな波紋を連続的に生成する。
// さらにスワイプ速度・ピンチ・長押し判定も行う。
function touchMoved() {
  // --- 1本指: スワイプ速度の計算 + 波紋 + 長押し判定 ---
  if (touches.length === 1) {
    let tx = touches[0].x;
    let ty = touches[0].y;

    // スワイプ速度を計算（前フレームとの差分）
    let dx = tx - prevTouchX;
    let dy = ty - prevTouchY;
    swipeVX = constrain(dx / width * 10, -1, 1);
    swipeVY = constrain(dy / height * 10, -1, 1);
    let swipeSpeed = sqrt(dx * dx + dy * dy);

    // 一定以上の速度でスワイプしたら「突風」を発生
    if (swipeSpeed > 8) {
      gustStrength = min(gustStrength + swipeSpeed * 0.003, 1.0);
      gustDirection = swipeVX > 0 ? 1 : -1;
    }

    prevTouchX = tx;
    prevTouchY = ty;

    // 長押し判定: 指が holdThreshold 以上動いたらキャンセル
    if (isHolding && dist(tx, ty, holdX, holdY) > holdThreshold) {
      isHolding = false;
      holdTime = 0;
    }

    // タッチ位置を記録（傾きが無い場合のフォールバック操作用）
    lastTouchX = tx / width;
    lastTouchY = ty / height;

    // 直前の波紋と近すぎる場合はスキップ（波紋の洪水を防ぐ）
    let tooClose = false;
    for (let cl of clicks) {
      if (abs(cl.x - tx) < 40 && cl.age < 0.1) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      clicks.push({ x: tx, age: 0 });
    }
  }

  // --- 2本指: ピンチ操作 → 波の激しさを変える ---
  if (touches.length === 2) {
    let currentDist = dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y);
    if (lastPinchDist > 0) {
      // 指を広げる → 波が荒くなる、つまむ → 穏やかになる
      let pinchDelta = (currentDist - lastPinchDist) * 0.005;
      pinchAmplitude = constrain(pinchAmplitude + pinchDelta, 0.3, 2.5);
    }
    lastPinchDist = currentDist;

    // 2本指の中点をタッチ位置として記録
    lastTouchX = (touches[0].x + touches[1].x) / 2 / width;
    lastTouchY = (touches[0].y + touches[1].y) / 2 / height;
  }

  return false; // スクロールを防止
}

// === touchEnded() ===
// 指が画面から離れた瞬間に呼ばれる。長押し状態をリセットする。
function touchEnded() {
  // 長押し終了時: 押していた場所に大きな波紋を残す
  if (isHolding && holdTime > 0.5) {
    clicks.push({ x: holdX, age: 0 });
  }
  isHolding = false;
  holdTime = 0;

  // 全指が離れたらピンチ距離をリセット
  if (touches.length === 0) {
    lastPinchDist = 0;
  }

  return false;
}

// === デバイスの傾き検知 ===
// DeviceOrientationEvent から beta（前後）と gamma（左右）を取得する
function handleOrientation(event) {
  if (event.gamma !== null && event.beta !== null) {
    // gamma: 左右の傾き（-90°〜90°）
    // beta: 前後の傾き（-180°〜180°）
    tiltX = event.gamma;
    tiltY = event.beta;
    hasTilt = true;
  }
  // alpha: 方位角（0°=北、90°=東、180°=南、270°=西）
  // コンパスの向きに応じて波の流れる方向を変える
  if (event.alpha !== null) {
    compassHeading = event.alpha;
    hasCompass = true;
  }
}

// === iOS 13以降のパーミッション対応 ===
// iOSでは、加速度センサーへのアクセスにユーザーの明示的な許可が必要。
// DeviceOrientationEvent.requestPermission() というiOS独自のAPIを使う。
// Androidやデスクトップではこのメソッドが存在しないので、直接リスナー登録する。
function requestOrientationPermission() {
  // 既に傾きデータが来ていれば何もしない
  if (hasTilt) return;

  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    // iOS 13+ : ユーザーに許可ダイアログを表示
    // requestPermission() はユーザージェスチャー（タップ）の中で呼ぶ必要がある
    if (permissionRequested) return; // iOSでは再要求しても同じ結果になる
    permissionRequested = true;

    DeviceOrientationEvent.requestPermission()
      .then(function(response) {
        if (response === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation);
          tiltStatusMsg = 'Tilt enabled';
          statusShowTime = millis();
        } else {
          tiltStatusMsg = 'Touch to control waves';
          statusShowTime = millis();
        }
      })
      .catch(function(err) {
        console.log('傾きセンサーの許可が得られませんでした:', err);
        tiltStatusMsg = 'Touch to control waves';
        statusShowTime = millis();
      });
  } else if (typeof DeviceOrientationEvent !== 'undefined') {
    // Android: 許可不要、直接リスナー登録
    if (!permissionRequested) {
      permissionRequested = true;
      window.addEventListener('deviceorientation', handleOrientation);
      // 少し待って傾きデータが来たか確認する
      setTimeout(function() {
        if (hasTilt) {
          tiltStatusMsg = 'Tilt enabled';
        } else {
          tiltStatusMsg = 'Touch to control waves';
        }
        statusShowTime = millis();
      }, 1000);
    }
  } else {
    // デバイスにセンサーが無い場合
    tiltStatusMsg = 'Touch to control waves';
    statusShowTime = millis();
  }
}

// === 【新しい概念】DeviceMotionEvent → 振る操作 ===
// DeviceOrientationEvent（傾き）とは別のAPI。こちらは加速度を検知する。
// acceleration.x/y/z に端末の加速度（m/s²）が入る。
// 急激な加速度変化 = 端末を振っている → 波を荒らす。
let motionPermissionRequested = false;

function handleMotion(event) {
  let acc = event.accelerationIncludingGravity || event.acceleration;
  if (!acc) return;

  let ax = acc.x || 0;
  let ay = acc.y || 0;
  let az = acc.z || 0;

  // 前フレームとの差分（急激な変化）を計算
  let deltaA = abs(ax - lastAccX) + abs(ay - lastAccY) + abs(az - lastAccZ);
  lastAccX = ax;
  lastAccY = ay;
  lastAccZ = az;

  // 閾値（15 m/s²以上の変化）を超えたら「振った」と判定
  if (deltaA > 15) {
    shakeIntensity = min(shakeIntensity + deltaA * 0.02, 1.0);
  }
}

// === iOS 13以降のモーションパーミッション対応 ===
// DeviceMotionEvent も requestPermission() が必要な場合がある
function requestMotionPermission() {
  if (motionPermissionRequested) return;

  if (typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function') {
    motionPermissionRequested = true;
    DeviceMotionEvent.requestPermission()
      .then(function(response) {
        if (response === 'granted') {
          window.addEventListener('devicemotion', handleMotion);
        }
      })
      .catch(function(err) {
        console.log('モーションセンサーの許可が得られませんでした:', err);
      });
  } else if (typeof DeviceMotionEvent !== 'undefined') {
    motionPermissionRequested = true;
    window.addEventListener('devicemotion', handleMotion);
  }
}

// === 時刻ラベルを返すヘルパー関数 ===
// 空をタップして時間帯を変えたとき、どの時間帯かを表示する
function hourToLabel(hour) {
  if (hour >= 5 && hour < 7) return '🌅 Dawn';
  if (hour >= 7 && hour < 10) return '🌤 Morning';
  if (hour >= 10 && hour < 16) return '☀️ Daytime';
  if (hour >= 16 && hour < 18) return '🌇 Afternoon';
  if (hour >= 18 && hour < 21) return '🌆 Sunset';
  return '🌙 Night';
}

// === 【新しい概念】Geolocation API → 位置情報の取得 ===
// navigator.geolocation.getCurrentPosition() で緯度経度を1回取得する。
// 成功したら climateFactor を計算する。失敗してもデフォルト値で動く。
function requestLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      let lat = pos.coords.latitude; // -90〜90
      let absLat = abs(lat);
      // 赤道（0°）→ 1.0、北極/南極（60°以上）→ 0.0
      climateFactor = constrain(map(absLat, 0, 60, 1, 0), 0, 1);
      hasLocation = true;

      // 緯度に応じたメッセージ
      let climateLabel;
      if (climateFactor > 0.7) climateLabel = 'Tropical waters';
      else if (climateFactor > 0.3) climateLabel = 'Temperate waters';
      else climateLabel = 'Arctic waters';
      tiltStatusMsg = climateLabel;
      statusShowTime = millis();
    },
    function(err) {
      console.log('位置情報の取得に失敗:', err.message);
    },
    { timeout: 10000 }
  );
}

// === windowResized() ===
// 画面サイズが変わったとき（スマホの回転など）にキャンバスを再調整する
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
