/* =========================================================================
   sound.js — مؤثّرات صوتية وموسيقى مولّدة برمجياً (WebAudio) بلا أي ملفات.
   تحكّم منفصل: موسيقى خلفية + مؤثّرات. window.Sound.
   ========================================================================= */
(() => {
  "use strict";
  let ctx = null, master = null, sfxGain = null, musicGain = null;
  let mEnabled = true, sEnabled = true; // موسيقى / مؤثّرات
  try { mEnabled = localStorage.getItem("snake2048_music") !== "0"; } catch (e) {}
  try { sEnabled = localStorage.getItem("snake2048_sfx") !== "0"; } catch (e) {}
  let musicTimer = null, mi = 0, musicMode = null; // "game" | "menu" | null

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
      sfxGain = ctx.createGain(); sfxGain.gain.value = sEnabled ? 0.55 : 0; sfxGain.connect(master);
      musicGain = ctx.createGain(); musicGain.gain.value = mEnabled ? 0.22 : 0; musicGain.connect(master);
    } catch (e) { ctx = null; }
    return ctx;
  }
  function applyGains() { if (sfxGain) sfxGain.gain.value = sEnabled ? 0.55 : 0; if (musicGain) musicGain.gain.value = mEnabled ? 0.22 : 0; }
  function resume() { try { if (ctx && ctx.state === "suspended") ctx.resume(); } catch (e) {} }
  function persist() { try { localStorage.setItem("snake2048_music", mEnabled ? "1" : "0"); localStorage.setItem("snake2048_sfx", sEnabled ? "1" : "0"); } catch (e) {} }

  function tone(freq, dur, type, gain, slideTo, delay, dest) {
    if (!ensure() || !sEnabled) return;
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.3, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || sfxGain); o.start(t0); o.stop(t0 + dur + 0.03);
  }
  function noise(dur, gain, hp) {
    if (!ensure() || !sEnabled) return;
    const t0 = ctx.currentTime, n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = gain || 0.3;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp || 700;
    src.connect(f); f.connect(g); g.connect(sfxGain); src.start(t0);
  }

  const SFX = {
    eat() { tone(520, 0.08, "triangle", 0.22, 760); },
    merge() { tone(460, 0.1, "square", 0.2, 900); tone(690, 0.12, "square", 0.16, 1150, 0.05); },
    good() { tone(523, 0.1, "triangle", 0.24, 784); tone(784, 0.13, "triangle", 0.2, 1175, 0.06); },
    bad() { tone(420, 0.18, "sawtooth", 0.22, 150); tone(300, 0.22, "square", 0.16, 120, 0.05); },
    speedp() { tone(320, 0.26, "sawtooth", 0.24, 1300); },
    magnet() { tone(150, 0.28, "sine", 0.13, 230); },
    radar() { tone(900, 0.12, "sine", 0.07, 1120); },
    boost() { tone(170, 0.16, "sawtooth", 0.16, 440); },
    kill() { tone(180, 0.12, "square", 0.3, 90); noise(0.12, 0.2, 500); tone(470, 0.1, "triangle", 0.2, 700, 0.05); },
    eaten() { tone(300, 0.5, "sawtooth", 0.3, 48); noise(0.5, 0.3, 200); },
    death() { tone(420, 0.45, "sawtooth", 0.26, 70); noise(0.38, 0.2, 320); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, "triangle", 0.26, null, i * 0.12)); },
    join() { tone(660, 0.09, "sine", 0.18, 990); },
    ui() { tone(440, 0.05, "square", 0.12, 540); },
  };

  // موسيقى: مسار للّعب ومسار للمنيو (أهدأ)
  const GAME_NOTES = [220, 262, 330, 440, 330, 262, 196, 262];
  const MENU_NOTES = [196, 247, 294, 247, 220, 175, 220, 262];
  function musicStep() {
    if (!musicMode || !mEnabled || !ensure()) return;
    const menu = musicMode === "menu", notes = menu ? MENU_NOTES : GAME_NOTES;
    const t0 = ctx.currentTime, f = notes[mi % notes.length]; mi++;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = menu ? "sine" : "triangle"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(menu ? 0.34 : 0.5, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (menu ? 0.55 : 0.42));
    o.connect(g); g.connect(musicGain); o.start(t0); o.stop(t0 + 0.6);
    if (!menu && mi % 4 === 1) {
      const b = ctx.createOscillator(), bg = ctx.createGain();
      b.type = "sine"; b.frequency.value = f / 2;
      bg.gain.setValueAtTime(0.45, t0); bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      b.connect(bg); bg.connect(musicGain); b.start(t0); b.stop(t0 + 0.52);
    }
  }
  function startTrack(mode) {
    ensure(); resume();
    if (musicMode === mode) return;
    musicMode = mode; mi = 0;
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = setInterval(musicStep, mode === "menu" ? 380 : 250);
  }
  function stopTrack() { musicMode = null; if (musicTimer) clearInterval(musicTimer); musicTimer = null; }

  // أصوات مستمرّة أثناء عمل القوى — خفيفة جداً
  const loops = {};
  const LOOP_CFG = { magnet: { f: 150, type: "sine", g: 0.007 }, radar: { f: 880, type: "sine", g: 0.005, pulse: 3 }, speed: { f: 430, type: "sine", g: 0.008 } };
  function startLoop(name) {
    if (!ensure() || !sEnabled || loops[name]) return;
    const c = LOOP_CFG[name]; if (!c) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = c.type; o.frequency.value = c.f;
    g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(c.g, ctx.currentTime + 0.12);
    o.connect(g); g.connect(sfxGain); o.start();
    let lfo = null;
    if (c.pulse) { lfo = ctx.createOscillator(); const la = ctx.createGain(); lfo.frequency.value = c.pulse; la.gain.value = c.g * 0.7; lfo.connect(la); la.connect(g.gain); lfo.start(); }
    loops[name] = { o, g, lfo };
  }
  function stopLoop(name) {
    const L = loops[name]; if (!L) return;
    try { L.g.gain.cancelScheduledValues(ctx.currentTime); L.g.gain.setValueAtTime(L.g.gain.value, ctx.currentTime); L.g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12); L.o.stop(ctx.currentTime + 0.18); if (L.lfo) L.lfo.stop(ctx.currentTime + 0.18); } catch (e) {}
    delete loops[name];
  }

  window.Sound = {
    play(name) { resume(); if (SFX[name]) SFX[name](); },
    vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} },
    startMusic() { startTrack("game"); },
    startMenu() { startTrack("menu"); },
    stopMusic() { stopTrack(); },
    loop(name, on) { resume(); if (on) startLoop(name); else stopLoop(name); },
    stopAllLoops() { for (const n in loops) stopLoop(n); },
    setMusic(on) { mEnabled = on; persist(); applyGains(); },
    setSfx(on) { sEnabled = on; persist(); applyGains(); if (!on) this.stopAllLoops(); },
    musicOn() { return mEnabled; },
    sfxOn() { return sEnabled; },
    // توافق: مفتاح صوت رئيسي
    setMuted(m) { this.setMusic(!m); this.setSfx(!m); },
    isMuted() { return !mEnabled && !sEnabled; },
    toggleMute() { const m = !this.isMuted(); this.setMuted(m); return m; },
  };
})();
