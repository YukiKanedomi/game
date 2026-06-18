/* STRETCH - サウンドエンジン（Web Audioでシンセ生成 / 仕様§7）
 * 外部音源ファイルなし＝ロード待ちゼロ（§8）。
 * 「音はフィクション」＝現実音でなく"気持ちいい音"を作る（§7）。
 */
(function (global) {
  'use strict';

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.muted = (localStorage.getItem('stretch_mute') === '1');
      this.chargeOsc = null;
      this.chargeGain = null;
    }

    /* 初回のユーザー操作で初期化＆resume（モバイルの自動再生制限対策） */
    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
    }

    setMuted(m) {
      this.muted = m;
      localStorage.setItem('stretch_mute', m ? '1' : '0');
      if (this.master) {
        this.master.gain.cancelScheduledValues(this.ctx.currentTime);
        this.master.gain.value = m ? 0 : 0.9;
      }
    }
    toggleMute() { this.setMuted(!this.muted); return this.muted; }

    _now() { return this.ctx ? this.ctx.currentTime : 0; }

    /* 単発トーン */
    tone(freq, dur, type = 'sine', gain = 0.3, when = 0, freqEnd = null) {
      if (!this.ctx) return;
      const t0 = this._now() + when;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    /* 短いノイズ（着地のコツッ・落下のザッ） */
    noise(dur, gain = 0.25, when = 0, hp = 800) {
      if (!this.ctx) return;
      const t0 = this._now() + when;
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
      const g = this.ctx.createGain(); g.gain.value = gain;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t0);
    }

    /* チャージ中：押している間ピッチが上がるサイン波（緊張感） */
    startCharge() {
      if (!this.ctx || this.chargeOsc) return;
      const t0 = this._now();
      this.chargeOsc = this.ctx.createOscillator();
      this.chargeGain = this.ctx.createGain();
      this.chargeOsc.type = 'sine';
      this.chargeOsc.frequency.setValueAtTime(220, t0);
      this.chargeGain.gain.setValueAtTime(0.0001, t0);
      this.chargeGain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.05);
      this.chargeOsc.connect(this.chargeGain); this.chargeGain.connect(this.master);
      this.chargeOsc.start(t0);
    }
    updateCharge(progress) { // progress 0..1+
      if (!this.chargeOsc) return;
      const f = 220 + Math.min(progress, 2) * 520;
      this.chargeOsc.frequency.setTargetAtTime(f, this._now(), 0.02);
    }
    stopCharge() {
      if (!this.chargeOsc) return;
      const t0 = this._now();
      this.chargeGain.gain.cancelScheduledValues(t0);
      this.chargeGain.gain.setValueAtTime(this.chargeGain.gain.value, t0);
      this.chargeGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
      this.chargeOsc.stop(t0 + 0.07);
      this.chargeOsc = null; this.chargeGain = null;
    }

    /* 棒を倒す「パタン」 */
    flip() { this.tone(420, 0.12, 'triangle', 0.25, 0, 180); }

    /* 着地成功「コツッ」 */
    land() { this.tone(520, 0.07, 'square', 0.2); this.noise(0.05, 0.12, 0, 1200); }

    /* パーフェクト：コンボが上がるほど高く・派手に（§5/§6） */
    perfect(combo) {
      const base = 660;
      const steps = [0, 4, 7, 12]; // アルペジオ
      steps.forEach((s, i) => {
        const semis = s + Math.min(combo - 1, 7); // コンボでキーが上がる
        this.tone(base * Math.pow(2, semis / 12), 0.16, 'triangle', 0.26, i * 0.045);
      });
    }

    /* 落下（失敗）：下降音＋ザッ */
    fall() {
      this.tone(330, 0.5, 'sawtooth', 0.22, 0, 70);
      this.noise(0.3, 0.18, 0.02, 400);
    }

    /* 自己ベスト更新ファンファーレ（§5/§12） */
    best() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.28, i * 0.1));
    }
  }

  global.Sound = new SoundEngine();
})(window);
