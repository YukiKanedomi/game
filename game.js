/* STRETCH - メインゲーム（Canvas 2D / Vanilla JS）
 * 仕様: 仕様書.md / 設計原則: 面白いゲームを作るための指針.md
 *
 * 核 = チャージ&リリース「伸びる棒で橋渡し」(Stick Hero型)。
 *  押す→棒が伸びる / 離す→倒れて橋になる / 次の足場に届けば前進・外せば落下で終了。
 *  足場中央の「パーフェクトゾーン」に倒すとコンボ倍率上昇（リスク&リターン §1）。
 *
 * 描画は drawXXX() に分離し、後で Gemini アセットへ差し替え可能（§13）。
 *  → assets/ に PNG を置くと自動でスプライト描画に切り替わる（Assets参照）。
 */
(function () {
  'use strict';

  // ============================================================
  // アセット（任意）：あれば画像、なければ図形でプレースホルダ描画
  //   ASSET SWAP POINT — assets/ に hero_idle.png 等を置くだけで反映
  // ============================================================
  const Assets = {
    imgs: {},
    manifest: {
      hero_idle: 'assets/hero_idle.png',
      hero_walk: 'assets/hero_walk.png',
      hero_cheer: 'assets/hero_cheer.png',
      hero_fall: 'assets/hero_fall.png',
      pillar: 'assets/pillar.png',
      marker: 'assets/marker.png',
    },
    load() {
      for (const key in this.manifest) {
        const im = new Image();
        im.onload = () => { this.imgs[key] = im; };
        im.onerror = () => { /* 無ければ図形描画にフォールバック */ };
        im.src = this.manifest[key];
      }
    },
    get(key) { return this.imgs[key] || null; },
  };
  Assets.load();

  // ============================================================
  // セットアップ
  // ============================================================
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const elScore = document.getElementById('score');
  const elBest = document.getElementById('best');
  const elCombo = document.getElementById('combo');
  const elHud = document.getElementById('hud');
  const elTutorial = document.getElementById('tutorial');
  const elTitle = document.getElementById('title');
  const elGameover = document.getElementById('gameover');
  const elResultScore = document.getElementById('result-score');
  const elResultBest = document.getElementById('result-best-val');
  const elBestTitle = document.getElementById('best-title-val');
  const elNewBest = document.getElementById('newbest');
  const elMute = document.getElementById('mute');

  let W = 0, H = 0, DPR = 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    layout();
  }

  // 画面サイズ依存のレイアウト値（リサイズで再計算）
  let topY, heroR, anchorX, perfectHalf, growSpeed, walkSpeed;
  function layout() {
    topY = H * 0.60;                       // 足場上面＝主人公の足元
    heroR = Math.max(16, Math.min(W, H) * 0.052);
    anchorX = W * 0.28;                     // 現在足場の右端を置く画面X
    perfectHalf = Math.max(6, W * 0.014);  // パーフェクト判定の半幅
    growSpeed = W * 0.80;                  // 棒の伸長速度 px/s
    walkSpeed = W * 0.62;                  // 歩行速度 px/s
  }
  window.addEventListener('resize', resize);

  // ============================================================
  // ゲーム状態
  // ============================================================
  const PHASE = { TITLE: 'title', PLAY: 'play', OVER: 'over' };
  const ST = { READY: 'ready', CHARGING: 'charging', FLIPPING: 'flipping',
               WALKING: 'walking', SCROLLING: 'scrolling', FALLING: 'falling' };

  let phase = PHASE.TITLE;
  let state = ST.READY;

  let platforms = [];   // {x(左端,world), w}
  let curIdx = 0;       // 主人公が立っている足場
  let cameraX = 0, targetCameraX = 0;

  let stickLen = 0;
  let flipT = 0;        // 倒れアニメ進捗(0..1)
  const FLIP_DUR = 0.22;

  let heroX = 0, heroY = 0;     // world座標（足元基準）
  let heroVY = 0, heroRot = 0;
  let heroPose = 'idle';
  let walkTargetX = 0;
  let pendingSuccess = false, pendingPerfect = false;

  let score = 0, combo = 0;
  let best = parseInt(localStorage.getItem('stretch_best') || '0', 10);

  let firstRun = true;          // チュートリアル表示用

  // 演出
  let hitStop = 0;
  let shakeT = 0, shakeMag = 0;
  let particles = [];

  // ============================================================
  // 乱数・難易度（§9：ランダムは「場面の多様性」に・公平に）
  // ============================================================
  function rand(a, b) { return a + Math.random() * (b - a); }

  function widthFor(level) {
    let base = W * 0.16 - level * W * 0.006;
    base = Math.max(base, W * 0.075);
    return rand(base * 0.8, base);
  }
  function gapFor(level) {
    const gMin = W * 0.12 + level * W * 0.004;
    let gMax = W * 0.22 + level * W * 0.013;
    gMax = Math.min(gMax, W * 0.62);
    return rand(gMin, Math.max(gMin + 1, gMax));
  }

  function genAfter(p, level) {
    const gap = gapFor(level);
    const w = widthFor(level);
    return { x: p.x + p.w + gap, w };
  }

  function ensureAhead() {
    while (platforms.length < curIdx + 3) {
      const last = platforms[platforms.length - 1];
      platforms.push(genAfter(last, platforms.length));
    }
  }

  // ============================================================
  // ラン初期化（仕様§4：タップ1回ですぐ本編）
  // ============================================================
  function startRun() {
    score = 0; combo = 0;
    cameraX = 0; targetCameraX = 0;
    stickLen = 0; flipT = 0;
    particles = [];
    heroVY = 0; heroRot = 0;
    state = ST.READY;
    heroPose = 'idle';

    const w0 = W * 0.18;
    platforms = [{ x: anchorX - w0, w: w0 }];  // 右端=anchorX, cameraX=0
    curIdx = 0;
    ensureAhead();
    placeHeroOnCurrent();

    phase = PHASE.PLAY;
    elTitle.classList.add('hidden');
    elGameover.classList.add('hidden');
    elHud.classList.remove('hidden');
    updateScoreUI();
    elBest.textContent = 'BEST ' + best;

    if (firstRun) elTutorial.classList.remove('hidden');
    else elTutorial.classList.add('hidden');
  }

  function placeHeroOnCurrent() {
    const p = platforms[curIdx];
    heroX = p.x + p.w - heroR * 1.1;  // 足場の右寄りに立つ
    heroY = topY;
  }

  function pivotWorldX() { const p = platforms[curIdx]; return p.x + p.w; }

  // ============================================================
  // 入力（§10：画面どこを押してもOK・片手1本）
  // ============================================================
  function onDown() {
    Sound.init();
    if (phase === PHASE.TITLE) { startRun(); return; }
    if (phase === PHASE.OVER) {
      if (overCooldown <= 0) startRun();
      return;
    }
    if (phase === PHASE.PLAY && state === ST.READY) {
      state = ST.CHARGING;
      stickLen = 0;
      heroPose = 'idle';
      Sound.startCharge();
    }
  }

  function onUp() {
    if (phase === PHASE.PLAY && state === ST.CHARGING) {
      state = ST.FLIPPING;
      flipT = 0;
      Sound.stopCharge();
      Sound.flip();
      // 着地判定を確定（§10）
      const tip = pivotWorldX() + stickLen;
      const next = platforms[curIdx + 1];
      pendingSuccess = (tip >= next.x && tip <= next.x + next.w);
      const center = next.x + next.w / 2;
      pendingPerfect = pendingSuccess && Math.abs(tip - center) <= perfectHalf;
    }
  }

  // pointer系で統一（touch/mouse）
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); onDown(); });
  window.addEventListener('pointerup', (e) => { onUp(); });
  // オーバーレイ上のタップも拾う
  elTitle.addEventListener('pointerdown', (e) => { e.preventDefault(); onDown(); });
  elGameover.addEventListener('pointerdown', (e) => { e.preventDefault(); onDown(); });

  elMute.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    Sound.init();
    const muted = Sound.toggleMute();
    elMute.textContent = muted ? '🔇' : '🔊';
  });
  elMute.textContent = Sound.muted ? '🔇' : '🔊';

  function vibrate(ms) { if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } }

  // ============================================================
  // 更新
  // ============================================================
  let overCooldown = 0;

  function update(dt) {
    // 演出タイマーはヒットストップ中も進める
    if (shakeT > 0) shakeT -= dt;
    if (overCooldown > 0) overCooldown -= dt;
    updateParticles(dt);

    if (hitStop > 0) { hitStop -= dt; return; }  // §6：大事なところは止める
    if (phase !== PHASE.PLAY) return;

    switch (state) {
      case ST.CHARGING: {
        stickLen += growSpeed * dt;
        Sound.updateCharge(stickLen / (W * 0.4));
        break;
      }
      case ST.FLIPPING: {
        flipT += dt / FLIP_DUR;
        if (flipT >= 1) {
          flipT = 1;
          Sound.land();
          state = ST.WALKING;
          heroPose = 'walk';
          const tip = pivotWorldX() + stickLen;
          if (pendingSuccess) {
            walkTargetX = platforms[curIdx + 1].x + platforms[curIdx + 1].w - heroR * 1.1;
          } else {
            walkTargetX = tip - heroR * 0.2;  // 棒の先端まで歩いて落ちる
          }
        }
        break;
      }
      case ST.WALKING: {
        heroX += walkSpeed * dt;
        if (heroX >= walkTargetX) {
          heroX = walkTargetX;
          if (pendingSuccess) onCross();
          else startFall();
        }
        break;
      }
      case ST.SCROLLING: {
        cameraX += (targetCameraX - cameraX) * Math.min(1, dt * 10);
        heroX = platforms[curIdx].x + platforms[curIdx].w - heroR * 1.1;
        if (Math.abs(targetCameraX - cameraX) < 0.5) {
          cameraX = targetCameraX;
          stickLen = 0; flipT = 0;
          heroPose = 'idle';
          state = ST.READY;
        }
        break;
      }
      case ST.FALLING: {
        heroVY += H * 3.2 * dt;
        heroY += heroVY * dt;
        heroRot += dt * 6;
        if (heroY - heroR > H + cameraOffsetForFall()) gameOver();
        break;
      }
    }
  }
  function cameraOffsetForFall() { return H * 0.6; }

  function onCross() {
    score += 1;
    if (pendingPerfect) {
      combo += 1;
      score += combo;                       // パーフェクトボーナス（§5）
      hitStop = 0.07;                       // ヒットストップ（§6）
      shakeT = 0.18; shakeMag = W * 0.012;
      vibrate(18);
      heroPose = 'cheer';
      Sound.perfect(combo);
      spawnSparkle(pivotWorldX() + stickLen, topY);
      if (combo >= 2) showCombo();
    } else {
      combo = 0;
      hideCombo();
    }
    updateScoreUI();

    // 次へ：足場を進めてカメラスクロール
    curIdx += 1;
    ensureAhead();
    if (firstRun) { firstRun = false; elTutorial.classList.add('hidden'); }
    targetCameraX = platforms[curIdx].x + platforms[curIdx].w - anchorX;
    state = ST.SCROLLING;
  }

  function startFall() {
    state = ST.FALLING;
    heroPose = 'fall';
    heroVY = -H * 0.15;          // 一瞬の溜め
    shakeT = 0.25; shakeMag = W * 0.016;
    vibrate(40);
    Sound.fall();
  }

  function gameOver() {
    phase = PHASE.OVER;
    overCooldown = 0.45;         // 誤タップ即リスタ防止（が、ほぼ即再開：§2）
    const isBest = score > best;
    if (isBest) { best = score; localStorage.setItem('stretch_best', String(best)); }
    elResultScore.textContent = score;
    elResultBest.textContent = best;
    elBest.textContent = 'BEST ' + best;
    elNewBest.classList.toggle('hidden', !isBest);
    elHud.classList.add('hidden');
    elGameover.classList.remove('hidden');
    if (isBest) { Sound.best(); spawnConfetti(); }
  }

  // ============================================================
  // UI更新
  // ============================================================
  function updateScoreUI() {
    elScore.textContent = score;
    if (combo >= 2) showCombo(); else hideCombo();
  }
  function showCombo() {
    elCombo.textContent = 'COMBO ×' + combo;
    elCombo.classList.remove('hidden');
    elCombo.classList.add('pop');
    setTimeout(() => elCombo.classList.remove('pop'), 120);
  }
  function hideCombo() { elCombo.classList.add('hidden'); }

  // ============================================================
  // パーティクル（§6：おおげさなフィードバック）
  // ============================================================
  function spawnSparkle(wx, wy) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(W * 0.15, W * 0.5);
      particles.push({ x: wx, y: wy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - W * 0.1,
        life: rand(0.4, 0.8), t: 0, col: ['#FFCE1F', '#4FD0B0', '#FF5A6E', '#fff'][i % 4], r: rand(3, 6) });
    }
  }
  function spawnConfetti() {
    for (let i = 0; i < 60; i++) {
      particles.push({ x: rand(0, W) + cameraX, y: -rand(0, H * 0.3), vx: rand(-W*0.1, W*0.1),
        vy: rand(W * 0.2, W * 0.6), life: rand(1.2, 2.2), t: 0,
        col: ['#FFCE1F', '#4FD0B0', '#FF5A6E', '#7FB4E6', '#fff'][i % 5], r: rand(4, 8), conf: true });
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.conf) p.vy += H * 1.2 * dt; else p.vy += H * 0.8 * dt;
      if (p.t >= p.life) particles.splice(i, 1);
    }
  }

  // ============================================================
  // 描画（drawXXX に分離：ASSET SWAP POINT）
  // ============================================================
  function sx(worldX) { return worldX - cameraX; }

  function render() {
    ctx.clearRect(0, 0, W, H);

    // 画面シェイク（§6）
    let ox = 0, oy = 0;
    if (shakeT > 0) { ox = rand(-shakeMag, shakeMag); oy = rand(-shakeMag, shakeMag); }
    ctx.save();
    ctx.translate(ox, oy);

    drawBackground();

    // 足場（現在＋先の数枚）
    for (let i = Math.max(0, curIdx - 1); i < platforms.length; i++) {
      const p = platforms[i];
      const screenLeft = sx(p.x);
      if (screenLeft > W + 50 || screenLeft + p.w < -50) continue;
      drawPillar(screenLeft, p.w);
      // 次に渡る足場の中央にパーフェクトマーカー（§11：判定を明示）
      if (i === curIdx + 1) drawMarker(screenLeft + p.w / 2);
    }

    // 棒（チャージ中・倒れ中・着地後）
    if (phase === PHASE.PLAY && (state === ST.CHARGING || state === ST.FLIPPING ||
        state === ST.WALKING || state === ST.FALLING)) {
      drawStick();
    }

    // 主人公
    if (phase !== PHASE.TITLE) {
      drawHero(sx(heroX), heroY);
    } else {
      // タイトルでも飾りで立たせる
      drawHero(anchorX, topY);
    }

    drawParticles();

    ctx.restore();
  }

  // --- 背景：空グラデ＋雲（ゆるいパララックス §2の世界観：空・浮き柱） ---
  let clouds = null;
  function drawBackground() {
    if (!clouds) {
      clouds = [];
      for (let i = 0; i < 6; i++) clouds.push({ x: rand(0, W * 2), y: rand(H * 0.05, H * 0.5), s: rand(0.6, 1.4) });
    }
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#9FCBEF');
    g.addColorStop(1, '#7FB4E6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const c of clouds) {
      const px = ((c.x - cameraX * 0.25) % (W + 200) + (W + 200)) % (W + 200) - 100;
      drawCloud(px, c.y, W * 0.10 * c.s);
    }
  }
  function drawCloud(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x + r * 0.9, y + r * 0.1, r * 0.75, 0, Math.PI * 2);
    ctx.arc(x - r * 0.9, y + r * 0.15, r * 0.7, 0, Math.PI * 2);
    ctx.arc(x, y + r * 0.4, r * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- 足場（コーラルの柱＋ミントの草地頂部）---
  function drawPillar(left, w) {
    const img = Assets.get('pillar');
    const pillarH = H * 0.55;
    if (img) {
      // ASSET SWAP: 画像があれば上に合わせて描画（簡易ストレッチ）
      const ih = w * (img.height / img.width);
      ctx.drawImage(img, left, topY - ih * 0.18, w, ih);
      return;
    }
    // --- 図形プレースホルダ ---
    const grassH = Math.max(8, w * 0.16);
    // 本体（コーラル、下は丸く）
    ctx.fillStyle = '#FF7A4D';
    roundedBottomRect(left, topY, w, pillarH, w * 0.18);
    ctx.fill();
    ctx.strokeStyle = '#1E1E1E';
    ctx.lineWidth = Math.max(2, w * 0.03);
    roundedBottomRect(left, topY, w, pillarH, w * 0.18);
    ctx.stroke();
    // 縦シェーディング
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(left + w * 0.62, topY + grassH, w * 0.18, pillarH * 0.7);
    // 草地（ミント）
    ctx.fillStyle = '#4FD0B0';
    ctx.beginPath();
    ctx.moveTo(left, topY + grassH);
    ctx.lineTo(left, topY + grassH * 0.4);
    ctx.quadraticCurveTo(left + w * 0.5, topY - grassH * 0.5, left + w, topY + grassH * 0.4);
    ctx.lineTo(left + w, topY + grassH);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1E1E1E';
    ctx.lineWidth = Math.max(2, w * 0.025);
    ctx.stroke();
  }

  function roundedBottomRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.closePath();
  }

  // --- パーフェクトマーカー ---
  function drawMarker(cx) {
    const img = Assets.get('marker');
    const s = perfectHalf * 1.6;
    if (img) { ctx.drawImage(img, cx - s, topY - s * 2.2, s * 2, s * 2); return; }
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);
    ctx.save();
    ctx.translate(cx, topY - s * 0.4);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#FFCE1F';
    ctx.globalAlpha = 0.6 + pulse * 0.4;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeStyle = '#1E1E1E';
    ctx.lineWidth = 2;
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }

  // --- 棒 ---
  function drawStick() {
    const pivotX = sx(pivotWorldX());
    const pivotY = topY;
    let theta;
    if (state === ST.CHARGING) theta = 0;                 // 真上
    else if (state === ST.FLIPPING) theta = (Math.PI / 2) * flipT;
    else theta = Math.PI / 2;                             // 横倒し（橋）
    // 失敗で歩き切ったら棒も落ちる演出
    let extra = 0;
    if (state === ST.FALLING && !pendingSuccess) extra = Math.min(Math.PI / 2, heroRot * 0.5);
    const ang = theta + extra;
    const tipX = pivotX + stickLen * Math.sin(ang);
    const tipY = pivotY - stickLen * Math.cos(ang);
    ctx.strokeStyle = '#1E1E1E';
    ctx.lineWidth = Math.max(4, W * 0.012);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
  }

  // --- 主人公（黄色の丸マスコット）---
  //  ASSET SWAP POINT: assets/hero_<pose>.png があればスプライト描画
  function drawHero(cx, feetY) {
    const r = heroR;
    const img = Assets.get('hero_' + heroPose) || Assets.get('hero_idle');
    if (img) {
      const w = r * 2.8, h = w * (img.height / img.width);
      ctx.save();
      ctx.translate(cx, feetY - h * 0.5);
      if (heroPose === 'fall') ctx.rotate(heroRot);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
      return;
    }
    drawHeroShape(cx, feetY, r, heroPose);
  }

  function drawHeroShape(cx, feetY, r, pose) {
    const legLen = r * 0.5;
    const bodyCy = feetY - legLen - r;
    const lw = Math.max(2, r * 0.13);

    ctx.save();
    if (pose === 'fall') {
      ctx.translate(cx, bodyCy);
      ctx.rotate(heroRot);
      ctx.translate(-cx, -bodyCy);
    }

    ctx.strokeStyle = '#1E1E1E';
    ctx.fillStyle = '#1E1E1E';
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';

    // 脚
    const legY = bodyCy + r * 0.9;
    if (pose === 'walk') {
      line(cx - r * 0.3, legY, cx - r * 0.55, legY + legLen * 1.3);
      line(cx + r * 0.3, legY, cx + r * 0.6, legY + legLen * 0.7);
    } else if (pose === 'cheer') {
      line(cx - r * 0.28, legY, cx - r * 0.4, legY + legLen);
      line(cx + r * 0.28, legY, cx + r * 0.4, legY + legLen);
    } else {
      line(cx - r * 0.3, legY, cx - r * 0.35, legY + legLen);
      line(cx + r * 0.3, legY, cx + r * 0.35, legY + legLen);
    }

    // 腕
    if (pose === 'cheer' || pose === 'fall') {
      line(cx - r * 0.85, bodyCy, cx - r * 1.25, bodyCy - r * 0.7);
      line(cx + r * 0.85, bodyCy, cx + r * 1.25, bodyCy - r * 0.7);
    } else if (pose === 'walk') {
      line(cx - r * 0.85, bodyCy + r * 0.1, cx - r * 1.15, bodyCy + r * 0.5);
      line(cx + r * 0.85, bodyCy + r * 0.1, cx + r * 1.2, bodyCy - r * 0.2);
    } else {
      line(cx - r * 0.85, bodyCy + r * 0.1, cx - r * 1.15, bodyCy + r * 0.45);
      line(cx + r * 0.85, bodyCy + r * 0.1, cx + r * 1.15, bodyCy + r * 0.45);
    }

    // ボディ（黄色＋軽いシェーディング）
    const g = ctx.createRadialGradient(cx - r * 0.35, bodyCy - r * 0.35, r * 0.2, cx, bodyCy, r * 1.2);
    g.addColorStop(0, '#FFE07A');
    g.addColorStop(1, '#FFCE1F');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, bodyCy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1E1E1E';
    ctx.lineWidth = Math.max(2, r * 0.14);
    ctx.stroke();

    // 照れほっぺ
    ctx.fillStyle = 'rgba(255,140,90,0.55)';
    ctx.beginPath(); ctx.ellipse(cx - r * 0.5, bodyCy + r * 0.18, r * 0.2, r * 0.13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + r * 0.5, bodyCy + r * 0.18, r * 0.2, r * 0.13, 0, 0, Math.PI * 2); ctx.fill();

    // 目
    ctx.fillStyle = '#1E1E1E';
    const eyeOpen = (pose !== 'cheer');
    if (eyeOpen) {
      dot(cx - r * 0.3, bodyCy - r * 0.05, r * 0.11);
      dot(cx + r * 0.3, bodyCy - r * 0.05, r * 0.11);
    } else {
      // ^ ^ の喜び目
      ctx.lineWidth = Math.max(2, r * 0.09);
      arcUp(cx - r * 0.3, bodyCy - r * 0.02, r * 0.16);
      arcUp(cx + r * 0.3, bodyCy - r * 0.02, r * 0.16);
    }

    // 口
    ctx.strokeStyle = '#1E1E1E';
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.beginPath();
    if (pose === 'fall') { // o
      ctx.arc(cx, bodyCy + r * 0.32, r * 0.12, 0, Math.PI * 2);
    } else {
      ctx.arc(cx, bodyCy + r * 0.18, r * 0.18, 0.15 * Math.PI, 0.85 * Math.PI);
    }
    ctx.stroke();

    ctx.restore();

    function line(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    function dot(x, y, rr) { ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill(); }
    function arcUp(x, y, rr) { ctx.beginPath(); ctx.arc(x, y + rr, rr, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke(); }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.col;
      if (p.conf) {
        ctx.save(); ctx.translate(sx(p.x), p.y); ctx.rotate(p.t * 8);
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(sx(p.x), p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ============================================================
  // メインループ（§8：60fps）
  // ============================================================
  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;   // タブ復帰などの大ジャンプ防止
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // 起動
  resize();
  elBestTitle.textContent = best;
  requestAnimationFrame(loop);
})();
