/* =========================================================================
   particles.js — خلفية نجوم/جسيمات نيون (بصري فقط، مستقل عن منطق اللعبة)
   ترسم على #bg-stars خلف الـCanvas الرئيسي، وتتوقف عند فقدان التركيز.
   ========================================================================= */
(() => {
  "use strict";
  const cv = document.getElementById("bg-stars");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  let W = 0, H = 0, DPR = 1, stars = [], running = true, raf = 0;
  const COLORS = ["0,212,255", "155,89,182", "243,156,18", "255,0,110"];
  const COUNT = 130;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function seed() {
    stars = [];
    for (let i = 0; i < COUNT; i++) {
      stars.push({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.6 + 0.4,
        vy: Math.random() * 8 + 3,
        a: Math.random() * 0.5 + 0.2,
        tw: Math.random() * Math.PI * 2,
        c: COLORS[(Math.random() * COLORS.length) | 0],
      });
    }
  }
  let last = 0;
  function loop(t) {
    if (!running) return;
    const dt = Math.min((t - last) / 1000, 0.05); last = t;
    ctx.clearRect(0, 0, W, H);
    for (const s of stars) {
      s.y += s.vy * dt; s.tw += dt * 2.5;
      if (s.y > H + 4) { s.y = -4; s.x = Math.random() * W; }
      const alpha = s.a * (0.6 + 0.4 * Math.sin(s.tw));
      ctx.beginPath();
      ctx.fillStyle = `rgba(${s.c},${alpha})`;
      ctx.shadowColor = `rgba(${s.c},${alpha})`;
      ctx.shadowBlur = 6;
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    raf = requestAnimationFrame(loop);
  }
  function start() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(loop); } }
  function stop() { running = false; cancelAnimationFrame(raf); }

  addEventListener("resize", () => { resize(); seed(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else start(); });

  resize(); seed();
  last = performance.now(); raf = requestAnimationFrame(loop);
})();
