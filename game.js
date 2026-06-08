/* =========================================================================
   Snake 2048  —  Canvas 2.5D isometric, single player (المرحلة 1++)
   - دفعة سرعة بشريط طاقة (ضغط مطوّل) يُعاد ملؤه خلال 10 ثوانٍ
   - تحكّم بالماوس + الأسهم/WASD + مسطرة المسافة للدفعة
   - مكعبات قوى كبطاقات مسطّحة على الأرض
   - أرضية كحلية + حواجز تتغيّر كل لعبة / كل 10 دقائق
   ========================================================================= */

(() => {
  "use strict";

  // ---------------------------------------------------------------------
  // إعدادات
  // ---------------------------------------------------------------------
  const CONFIG = {
    WORLD: 95,
    SCALE: 26,
    ISO_X: 1.0,
    ISO_Y: 0.5,

    BASE_SIZE: 1.0,
    SIZE_GROWTH: 0.12,
    CUBE_H: 0.62,

    SEG_GAP: 0.58,
    SPEED: 8.5,
    TURN_RATE: 6.8,        // توجيه أكثر سلاسة واستجابة

    SPEEDCUBE_MULT: 2.0,
    SPEEDCUBE_TIME: 3.0,

    BOOST_MULT: 1.5,       // دفعة الضغط المطوّل
    BOOST_DRAIN: 0.25,     // استهلاك الطاقة/ثانية (ممتلئة ≈ 4 ثوانٍ)
    BOOST_REFILL: 0.10,    // إعادة الملء/ثانية (10 ثوانٍ كاملة)

    FOOD_COUNT: 90,
    POWERUP_COUNT: 8,
    OBSTACLE_MIN: 6,
    OBSTACLE_MAX: 10,
    MAP_INTERVAL: 600,     // تغيير الخريطة كل 10 دقائق
    START_SNAKE: [8, 4, 2],
  };

  const FOOD_WEIGHTS = [
    { v: 2, w: 46 }, { v: 4, w: 28 }, { v: 8, w: 15 },
    { v: 16, w: 8 }, { v: 32, w: 3 },
  ];
  const POWERUPS = {
    speed:  { color: "#19d3ff", label: "⚡",  glow: "#19d3ff" },
    double: { color: "#37d67a", label: "×2", glow: "#37d67a" },
    half:   { color: "#ff5d73", label: "÷2", glow: "#ff5d73" },
  };
  const POWERUP_WEIGHTS = [
    { t: "speed", w: 50 }, { t: "double", w: 30 }, { t: "half", w: 20 },
  ];

  // ---------------------------------------------------------------------
  // Canvas
  // ---------------------------------------------------------------------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------------------------------------------------------------------
  // أدوات
  // ---------------------------------------------------------------------
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const log2 = (v) => Math.log(v) / Math.LN2;
  function angleLerp(a, target, maxStep) {
    let d = target - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    if (d > maxStep) d = maxStep;
    if (d < -maxStep) d = -maxStep;
    return a + d;
  }
  const sizeForValue = (v) => CONFIG.BASE_SIZE * (0.86 + CONFIG.SIZE_GROWTH * (log2(v) - 1));

  const VALUE_COLORS = {
    2: "#f2c14e", 4: "#f0a868", 8: "#ec7d5a", 16: "#e85d5d",
    32: "#d94f9a", 64: "#9b5de5", 128: "#5d8ce8", 256: "#4fb0e8",
    512: "#3fc7c0", 1024: "#46c97a", 2048: "#8ad94f", 4096: "#ffd23f",
  };
  const colorForValue = (v) => VALUE_COLORS[v] || "#ffd23f";
  function shade(hex, factor) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = clamp(Math.round(r * factor), 0, 255);
    g = clamp(Math.round(g * factor), 0, 255);
    b = clamp(Math.round(b * factor), 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  // ---------------------------------------------------------------------
  // كاميرا وإسقاط
  // ---------------------------------------------------------------------
  let camX = 0, camY = 0;
  function project(wx, wy) {
    return {
      x: (wx - wy) * CONFIG.ISO_X * CONFIG.SCALE + camX,
      y: (wx + wy) * CONFIG.ISO_Y * CONFIG.SCALE + camY,
    };
  }
  function unproject(sx, sy) {
    const a = (sx - camX) / (CONFIG.ISO_X * CONFIG.SCALE);
    const b = (sy - camY) / (CONFIG.ISO_Y * CONFIG.SCALE);
    return { x: (a + b) / 2, y: (b - a) / 2 };
  }
  function updateCamera(hx, hy) {
    camX = W / 2 - (hx - hy) * CONFIG.ISO_X * CONFIG.SCALE;
    camY = H / 2 - (hx + hy) * CONFIG.ISO_Y * CONFIG.SCALE;
  }

  // ---------------------------------------------------------------------
  // رسم
  // ---------------------------------------------------------------------
  function quad(a, b, c, d) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath(); ctx.fill();
  }
  function strokePath(pts, close) {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (close) ctx.closePath();
    ctx.stroke();
  }
  const mid = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

  // مكعب مجسّم (للثعبان والطعام)
  function drawCube(wx, wy, sizeW, opts) {
    const color = opts.color;
    const half = sizeW / 2;
    const t1 = project(wx - half, wy - half);
    const t2 = project(wx + half, wy - half);
    const t3 = project(wx + half, wy + half);
    const t4 = project(wx - half, wy + half);
    const ch = sizeW * CONFIG.SCALE * CONFIG.CUBE_H;

    // ظل أرضي
    ctx.save();
    ctx.globalAlpha = 0.25; ctx.fillStyle = "#000";
    const sh = project(wx, wy);
    ctx.beginPath();
    ctx.ellipse(sh.x, sh.y + ch * 0.6, half * CONFIG.SCALE * 1.05, half * CONFIG.SCALE * 0.55, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.restore();

    ctx.fillStyle = shade(color, 0.70);
    quad(t2, t3, { x: t3.x, y: t3.y + ch }, { x: t2.x, y: t2.y + ch });
    ctx.fillStyle = shade(color, 0.52);
    quad(t4, t3, { x: t3.x, y: t3.y + ch }, { x: t4.x, y: t4.y + ch });
    ctx.fillStyle = color;
    quad(t1, t2, t3, t4);

    // لمعة علوية
    ctx.fillStyle = shade(color, 1.18);
    quad(mid(t1, t2, 0.12), mid(t2, t3, 0.12),
         { x: (t3.x + t1.x) / 2, y: (t3.y + t1.y) / 2 }, mid(t1, t4, 0.12));

    ctx.strokeStyle = shade(color, 0.40); ctx.lineWidth = 1.4;
    strokePath([t1, t2, t3, t4], true);
    strokePath([t2, { x: t2.x, y: t2.y + ch }], false);
    strokePath([t3, { x: t3.x, y: t3.y + ch }], false);
    strokePath([t4, { x: t4.x, y: t4.y + ch }], false);

    const cx = (t1.x + t2.x + t3.x + t4.x) / 4;
    const cy = (t1.y + t2.y + t3.y + t4.y) / 4;
    const fs = Math.max(9, sizeW * CONFIG.SCALE * 0.42);
    ctx.font = `800 ${fs}px "Segoe UI", Tahoma, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(2, fs * 0.16); ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.strokeText(opts.label, cx, cy);
    ctx.fillStyle = "#fff"; ctx.fillText(opts.label, cx, cy);
  }

  // بطاقة قوة مسطّحة على الأرض (سجادة)
  function drawCard(wx, wy, sizeW, type) {
    const pu = POWERUPS[type];
    const half = sizeW / 2;
    const a = project(wx - half, wy - half);
    const b = project(wx + half, wy - half);
    const c = project(wx + half, wy + half);
    const d = project(wx - half, wy + half);
    const pulse = 0.5 + 0.5 * Math.sin(now * 3 + wx);

    ctx.save();
    ctx.shadowColor = pu.glow;
    ctx.shadowBlur = 14 + pulse * 10;

    // إطار البطاقة
    ctx.fillStyle = shade(pu.color, 0.45);
    quad(a, b, c, d);
    // داخل البطاقة
    const k = 0.16;
    ctx.fillStyle = pu.color;
    quad(mid(a, c, k), mid(b, d, k), mid(c, a, k), mid(d, b, k));
    ctx.restore();

    // خطوط زخرفة (سجادة)
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.5;
    strokePath([mid(a, c, 0.30), mid(b, d, 0.30), mid(c, a, 0.30), mid(d, b, 0.30)], true);

    const cx = (a.x + b.x + c.x + d.x) / 4;
    const cy = (a.y + b.y + c.y + d.y) / 4;
    const fs = sizeW * CONFIG.SCALE * 0.40;
    ctx.font = `800 ${fs}px "Segoe UI", Tahoma, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.strokeText(pu.label, cx, cy);
    ctx.fillStyle = "#fff"; ctx.fillText(pu.label, cx, cy);
  }

  // حاجز (صندوق مرتفع)
  function drawBox(cx, cy, hw, hh, height, color) {
    const t1 = project(cx - hw, cy - hh);
    const t2 = project(cx + hw, cy - hh);
    const t3 = project(cx + hw, cy + hh);
    const t4 = project(cx - hw, cy + hh);
    const ch = height * CONFIG.SCALE * 0.5;

    ctx.fillStyle = shade(color, 0.62);
    quad(t2, t3, { x: t3.x, y: t3.y + ch }, { x: t2.x, y: t2.y + ch });
    ctx.fillStyle = shade(color, 0.45);
    quad(t4, t3, { x: t3.x, y: t3.y + ch }, { x: t4.x, y: t4.y + ch });
    ctx.fillStyle = color;
    quad(t1, t2, t3, t4);

    ctx.strokeStyle = shade(color, 0.30); ctx.lineWidth = 1.5;
    strokePath([t1, t2, t3, t4], true);
    strokePath([t2, { x: t2.x, y: t2.y + ch }], false);
    strokePath([t3, { x: t3.x, y: t3.y + ch }], false);
    strokePath([t4, { x: t4.x, y: t4.y + ch }], false);
  }

  // ---------------------------------------------------------------------
  // الثعبان
  // ---------------------------------------------------------------------
  const snake = {
    x: 0, y: 0, angle: 0, values: [], path: [],
    speedTimer: 0, stamina: 1, boosting: false,
  };
  let playerName = "أنت";

  function resetSnake() {
    snake.x = 0; snake.y = 0; snake.angle = 0;
    snake.values = CONFIG.START_SNAKE.slice().sort((a, b) => b - a);
    snake.path = [{ x: 0, y: 0 }];
    snake.speedTimer = 0; snake.stamina = 1; snake.boosting = false;
  }
  function segmentDistances() {
    const d = [0];
    for (let i = 1; i < snake.values.length; i++) {
      const s1 = sizeForValue(snake.values[i - 1]);
      const s2 = sizeForValue(snake.values[i]);
      d.push(d[i - 1] + ((s1 + s2) / 2) * CONFIG.SEG_GAP);
    }
    return d;
  }
  function pointAtDistance(d) {
    const p = snake.path;
    if (d <= 0 || p.length < 2) return { x: p[0].x, y: p[0].y };
    let acc = 0;
    for (let i = 1; i < p.length; i++) {
      const seg = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
      if (seg <= 1e-6) continue;
      if (acc + seg >= d) {
        const t = (d - acc) / seg;
        return { x: lerp(p[i - 1].x, p[i].x, t), y: lerp(p[i - 1].y, p[i].y, t) };
      }
      acc += seg;
    }
    const last = p[p.length - 1];
    return { x: last.x, y: last.y };
  }
  function bodyPositions() {
    return segmentDistances().map((d, i) => {
      const pt = pointAtDistance(d);
      return { x: pt.x, y: pt.y, value: snake.values[i], size: sizeForValue(snake.values[i]) };
    });
  }
  const headValue = () => snake.values[0];
  const score = () => snake.values.reduce((s, v) => s + v, 0);

  // ---------------------------------------------------------------------
  // الخريطة: طعام + قوى + حواجز
  // ---------------------------------------------------------------------
  let foods = [], powerups = [], obstacles = [];

  function weighted(list, key) {
    const total = list.reduce((s, e) => s + e.w, 0);
    let r = Math.random() * total;
    for (const e of list) { if (r < e.w) return e[key]; r -= e.w; }
    return list[0][key];
  }
  function insideObstacle(x, y, margin) {
    for (const o of obstacles) {
      if (x > o.x - o.hw - margin && x < o.x + o.hw + margin &&
          y > o.y - o.hh - margin && y < o.y + o.hh + margin) return true;
    }
    return false;
  }
  function freeWorldPos(margin) {
    const m = CONFIG.WORLD * 0.92;
    for (let k = 0; k < 30; k++) {
      const x = (Math.random() * 2 - 1) * m, y = (Math.random() * 2 - 1) * m;
      if (!insideObstacle(x, y, margin)) return { x, y };
    }
    return { x: (Math.random() * 2 - 1) * m, y: (Math.random() * 2 - 1) * m };
  }
  function spawnFood() {
    const p = freeWorldPos(1); const v = weighted(FOOD_WEIGHTS, "v");
    return { x: p.x, y: p.y, value: v, size: sizeForValue(v) };
  }
  function spawnPowerup() {
    const p = freeWorldPos(2); const t = weighted(POWERUP_WEIGHTS, "t");
    return { x: p.x, y: p.y, type: t, size: CONFIG.BASE_SIZE * 2.0 };
  }
  function genObstacles() {
    obstacles = [];
    const count = CONFIG.OBSTACLE_MIN + Math.floor(Math.random() * (CONFIG.OBSTACLE_MAX - CONFIG.OBSTACLE_MIN + 1));
    const lim = CONFIG.WORLD * 0.8;
    let tries = 0;
    while (obstacles.length < count && tries < 300) {
      tries++;
      const x = (Math.random() * 2 - 1) * lim;
      const y = (Math.random() * 2 - 1) * lim;
      if (Math.hypot(x, y) < 18) continue; // ابقِ مركز الانطلاق فارغاً
      const longish = Math.random() < 0.5;
      const a = 3 + Math.random() * 6;
      const b = 3 + Math.random() * 6;
      const hw = longish ? a * 1.6 : a;
      const hh = longish ? b : b * 1.6;
      // تجنّب التداخل الشديد
      let ok = true;
      for (const o of obstacles) {
        if (Math.abs(o.x - x) < o.hw + hw + 4 && Math.abs(o.y - y) < o.hh + hh + 4) { ok = false; break; }
      }
      if (ok) obstacles.push({ x, y, hw, hh, h: 2.6, color: "#3a4a66" });
    }
  }
  function initItems() {
    genObstacles();
    foods = []; powerups = [];
    for (let i = 0; i < CONFIG.FOOD_COUNT; i++) foods.push(spawnFood());
    for (let i = 0; i < CONFIG.POWERUP_COUNT; i++) powerups.push(spawnPowerup());
  }

  // ---------------------------------------------------------------------
  // الأكل + الدمج + القوى
  // ---------------------------------------------------------------------
  function eatValue(v) {
    snake.values.push(v);
    snake.values.sort((a, b) => b - a);
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < snake.values.length - 1; i++) {
        if (snake.values[i] === snake.values[i + 1]) {
          snake.values[i] *= 2;
          snake.values.splice(i + 1, 1);
          snake.values.sort((a, b) => b - a);
          merged = true; break;
        }
      }
    }
  }
  function applyPowerup(type) {
    if (type === "speed") snake.speedTimer = CONFIG.SPEEDCUBE_TIME;
    else if (type === "double") snake.values = snake.values.map((v) => v * 2);
    else if (type === "half") {
      snake.values = snake.values.map((v) => v / 2).filter((v) => v >= 2);
      snake.values.sort((a, b) => b - a);
      if (snake.values.length === 0) gameOver();
    }
  }

  // ---------------------------------------------------------------------
  // الإدخال
  // ---------------------------------------------------------------------
  let pointer = { x: W / 2, y: H / 2 + 80 };
  const input = { holding: false, up: false, down: false, left: false, right: false, boostKey: false };

  canvas.addEventListener("mousemove", (e) => { pointer.x = e.clientX; pointer.y = e.clientY; });
  canvas.addEventListener("mousedown", (e) => { if (e.button === 0) input.holding = true; });
  window.addEventListener("mouseup", (e) => { if (e.button === 0) input.holding = false; });
  canvas.addEventListener("mouseleave", () => { input.holding = false; });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("touchstart", (e) => {
    if (e.touches[0]) { pointer.x = e.touches[0].clientX; pointer.y = e.touches[0].clientY; }
    input.holding = true;
  });
  canvas.addEventListener("touchmove", (e) => {
    if (e.touches[0]) { pointer.x = e.touches[0].clientX; pointer.y = e.touches[0].clientY; }
    e.preventDefault();
  }, { passive: false });
  window.addEventListener("touchend", () => { input.holding = false; });

  function isTyping() {
    const el = document.activeElement;
    return el && el.tagName === "INPUT";
  }
  window.addEventListener("keydown", (e) => {
    if (isTyping()) return;
    switch (e.code) {
      case "ArrowUp": case "KeyW": input.up = true; e.preventDefault(); break;
      case "ArrowDown": case "KeyS": input.down = true; e.preventDefault(); break;
      case "ArrowLeft": case "KeyA": input.left = true; e.preventDefault(); break;
      case "ArrowRight": case "KeyD": input.right = true; e.preventDefault(); break;
      case "Space": input.boostKey = true; e.preventDefault(); break;
    }
  });
  window.addEventListener("keyup", (e) => {
    switch (e.code) {
      case "ArrowUp": case "KeyW": input.up = false; break;
      case "ArrowDown": case "KeyS": input.down = false; break;
      case "ArrowLeft": case "KeyA": input.left = false; break;
      case "ArrowRight": case "KeyD": input.right = false; break;
      case "Space": input.boostKey = false; break;
    }
  });

  // ---------------------------------------------------------------------
  // حالة اللعبة
  // ---------------------------------------------------------------------
  let state = "menu";
  let lastT = 0, now = 0, mapTimer = 0;

  function startGame() {
    const inp = document.getElementById("name-input");
    const nm = (inp.value || "").trim();
    playerName = nm || "أنت";
    try { localStorage.setItem("snake2048_name", playerName); } catch (e) {}
    resetSnake(); initItems(); mapTimer = 0; updateCamera(snake.x, snake.y);
    state = "playing";
    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("over-screen").classList.add("hidden");
  }
  function gameOver() {
    state = "over";
    document.getElementById("final-best").textContent = headValue() || 0;
    document.getElementById("final-score").textContent = score();
    document.getElementById("over-screen").classList.remove("hidden");
  }

  function currentSpeed() {
    let m = 1;
    if (snake.speedTimer > 0) m *= CONFIG.SPEEDCUBE_MULT;
    if (snake.boosting) m *= CONFIG.BOOST_MULT;
    return CONFIG.SPEED * m;
  }

  // التوجيه: من اتجاه على الشاشة إلى اتجاه في العالم
  function steerTo(sdx, sdy, dt) {
    const o = unproject(W / 2, H / 2);
    const p = unproject(W / 2 + sdx, H / 2 + sdy);
    const desired = Math.atan2(p.y - o.y, p.x - o.x);
    snake.angle = angleLerp(snake.angle, desired, CONFIG.TURN_RATE * dt);
  }

  function update(dt) {
    // مؤقّت تغيير الخريطة
    mapTimer += dt;
    if (mapTimer >= CONFIG.MAP_INTERVAL) { mapTimer = 0; initItems(); }

    // الطاقة / الدفعة
    const wantBoost = input.holding || input.boostKey;
    snake.boosting = wantBoost && snake.stamina > 0.001;
    if (snake.boosting) snake.stamina = Math.max(0, snake.stamina - CONFIG.BOOST_DRAIN * dt);
    else snake.stamina = Math.min(1, snake.stamina + CONFIG.BOOST_REFILL * dt);
    if (snake.speedTimer > 0) snake.speedTimer = Math.max(0, snake.speedTimer - dt);

    // التوجيه
    const usingKeys = input.up || input.down || input.left || input.right;
    if (usingKeys) {
      const sx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const sy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      if (sx || sy) steerTo(sx, sy, dt);
    } else {
      const sdx = pointer.x - W / 2, sdy = pointer.y - H / 2;
      if (Math.hypot(sdx, sdy) > 14) steerTo(sdx, sdy, dt);
    }

    // الحركة
    const step = currentSpeed() * dt;
    snake.x += Math.cos(snake.angle) * step;
    snake.y += Math.sin(snake.angle) * step;

    // حدود + حواجز → نهاية
    if (Math.abs(snake.x) > CONFIG.WORLD || Math.abs(snake.y) > CONFIG.WORLD) {
      snake.x = clamp(snake.x, -CONFIG.WORLD, CONFIG.WORLD);
      snake.y = clamp(snake.y, -CONFIG.WORLD, CONFIG.WORLD);
      gameOver(); return;
    }
    if (insideObstacle(snake.x, snake.y, sizeForValue(headValue()) * 0.32)) { gameOver(); return; }

    // المسار
    snake.path.unshift({ x: snake.x, y: snake.y });
    const dists = segmentDistances();
    const need = dists[dists.length - 1] + 4;
    let total = 0;
    for (let i = 1; i < snake.path.length; i++) {
      total += Math.hypot(snake.path[i].x - snake.path[i - 1].x, snake.path[i].y - snake.path[i - 1].y);
      if (total > need) { snake.path.length = i + 1; break; }
    }

    const hv = headValue(), hSize = sizeForValue(hv);
    for (let i = foods.length - 1; i >= 0; i--) {
      const f = foods[i];
      if (Math.hypot(f.x - snake.x, f.y - snake.y) < (hSize + f.size) * 0.5)
        if (f.value <= hv) { eatValue(f.value); foods[i] = spawnFood(); }
    }
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      if (Math.hypot(p.x - snake.x, p.y - snake.y) < (hSize + p.size) * 0.45) {
        applyPowerup(p.type); powerups[i] = spawnPowerup();
        if (state !== "playing") return;
      }
    }

    updateCamera(snake.x, snake.y);
    updateHUD();
  }

  // ---------------------------------------------------------------------
  // الرسم
  // ---------------------------------------------------------------------
  function drawGround() {
    ctx.fillStyle = "#0b1830"; // كحلي مريح
    ctx.fillRect(0, 0, W, H);

    const c1 = project(-CONFIG.WORLD, -CONFIG.WORLD);
    const c2 = project(CONFIG.WORLD, -CONFIG.WORLD);
    const c3 = project(CONFIG.WORLD, CONFIG.WORLD);
    const c4 = project(-CONFIG.WORLD, CONFIG.WORLD);
    ctx.fillStyle = "#13294d";
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y);
    ctx.lineTo(c3.x, c3.y); ctx.lineTo(c4.x, c4.y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(120,160,210,0.5)"; ctx.lineWidth = 3; ctx.stroke();

    const center = unproject(W / 2, H / 2);
    const range = 34;
    const gx0 = Math.floor(clamp(center.x - range, -CONFIG.WORLD, CONFIG.WORLD));
    const gx1 = Math.ceil(clamp(center.x + range, -CONFIG.WORLD, CONFIG.WORLD));
    const gy0 = Math.floor(clamp(center.y - range, -CONFIG.WORLD, CONFIG.WORLD));
    const gy1 = Math.ceil(clamp(center.y + range, -CONFIG.WORLD, CONFIG.WORLD));
    ctx.fillStyle = "rgba(120,160,210,0.18)";
    for (let gx = gx0; gx <= gx1; gx += 4)
      for (let gy = gy0; gy <= gy1; gy += 4) {
        const p = project(gx, gy);
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2); ctx.fill();
      }
  }

  function render() {
    drawGround();

    // البطاقات تُرسم أولاً (مسطّحة على الأرض)
    for (const p of powerups) drawCard(p.x, p.y, p.size, p.type);

    const drawables = [];
    for (const f of foods)
      drawables.push({ kind: "food", x: f.x, y: f.y, size: f.size, value: f.value, depth: f.x + f.y });
    for (const o of obstacles)
      drawables.push({ kind: "wall", o, depth: o.x + o.y });
    for (const s of bodyPositions())
      drawables.push({ kind: "body", x: s.x, y: s.y, size: s.size, value: s.value, depth: s.x + s.y });

    drawables.sort((a, b) => a.depth - b.depth);
    for (const d of drawables) {
      if (d.kind === "wall") drawBox(d.o.x, d.o.y, d.o.hw, d.o.hh, d.o.h, d.o.color);
      else drawCube(d.x, d.y, d.size, { color: colorForValue(d.value), label: String(d.value) });
    }

    drawArrow();
    drawNameLabel();
    drawGauges();
  }

  function drawArrow() {
    const c = project(snake.x, snake.y);
    const ahead = project(snake.x + Math.cos(snake.angle), snake.y + Math.sin(snake.angle));
    let dx = ahead.x - c.x, dy = ahead.y - c.y;
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const gap = 30, L = 80;
    const x0 = c.x + dx * gap, y0 = c.y + dy * gap;
    const x1 = c.x + dx * L, y1 = c.y + dy * L;
    ctx.save();
    ctx.shadowColor = "rgba(80,210,255,0.9)"; ctx.shadowBlur = 12;
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, "rgba(80,210,255,0)");
    grad.addColorStop(1, "rgba(120,230,255,0.95)");
    ctx.strokeStyle = grad; ctx.lineWidth = 7; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const px = -dy, py = dx, hw = 11, hl = 18;
    ctx.fillStyle = "rgba(150,235,255,0.98)";
    ctx.beginPath();
    ctx.moveTo(x1 + dx * 4, y1 + dy * 4);
    ctx.lineTo(x1 - dx * hl + px * hw, y1 - dy * hl + py * hw);
    ctx.lineTo(x1 - dx * hl - px * hw, y1 - dy * hl - py * hw);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawNameLabel() {
    const c = project(snake.x, snake.y);
    const y = c.y - sizeForValue(headValue()) * CONFIG.SCALE * CONFIG.CUBE_H - 24;
    ctx.font = '700 15px "Segoe UI", Tahoma, sans-serif';
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.strokeText(playerName, c.x, y);
    ctx.fillStyle = "#fff"; ctx.fillText(playerName, c.x, y);
  }

  // عدّادات دائرية فوق الرأس (الطاقة + مكعب السرعة)
  function drawGauges() {
    const gauges = [];
    if (snake.stamina < 0.999 || snake.boosting)
      gauges.push({ frac: snake.stamina, color: snake.boosting ? "#19d3ff" : "#5a86c8", icon: "⚡" });
    if (snake.speedTimer > 0)
      gauges.push({ frac: snake.speedTimer / CONFIG.SPEEDCUBE_TIME, color: "#ffb020", icon: "×2" });
    if (!gauges.length) return;

    const c = project(snake.x, snake.y);
    const baseY = c.y - sizeForValue(headValue()) * CONFIG.SCALE * CONFIG.CUBE_H - 56;
    const r = 16, spacing = 42;
    let x = c.x - ((gauges.length - 1) * spacing) / 2;
    for (const g of gauges) {
      ctx.beginPath(); ctx.arc(x, baseY, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, baseY);
      ctx.arc(x, baseY, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * g.frac);
      ctx.closePath(); ctx.fillStyle = g.color; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath(); ctx.arc(x, baseY, r, 0, Math.PI * 2); ctx.stroke();
      ctx.font = '800 12px "Segoe UI", Tahoma, sans-serif';
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(g.icon, x, baseY);
      x += spacing;
    }
  }

  // ---------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------
  function updateHUD() {
    document.getElementById("best").textContent = headValue();
    document.getElementById("score").textContent = score();
    document.getElementById("length").textContent = snake.values.length;
    document.getElementById("lb-list").innerHTML =
      `<li class="me"><span><span class="rank">1.</span> ${escapeHtml(playerName)}</span><span>${headValue()}</span></li>`;
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------------------------------------------------------------------
  // الحلقة
  // ---------------------------------------------------------------------
  function loop(t) {
    const dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t; now += dt;
    if (state === "playing") update(dt);
    if (state !== "menu") render();
    requestAnimationFrame(loop);
  }

  document.getElementById("play-btn").addEventListener("click", startGame);
  document.getElementById("restart-btn").addEventListener("click", startGame);
  try {
    const saved = localStorage.getItem("snake2048_name");
    if (saved) document.getElementById("name-input").value = saved;
  } catch (e) {}

  resetSnake(); initItems(); updateCamera(0, 0);
  requestAnimationFrame((t) => { lastT = t; loop(t); });
})();
