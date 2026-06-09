/* =========================================================================
   Snake 2048  —  Canvas 2.5D isometric
   المرحلة A (أوفلاين كامل): خرائط متعددة، مناطق خطر، قطع الجسم، طعام متحرك،
   مؤثرات بصرية، مستويات، ميداليات زمنية، شحنات جائزة، دردشة رموز.
   المرحلة B (أونلاين) تُبنى لاحقاً فوق هذا الأساس.
   ========================================================================= */

(() => {
  "use strict";

  // =====================================================================
  // إعدادات
  // =====================================================================
  const CONFIG = {
    WORLD: 95, SCALE: 26, ISO_X: 1.0, ISO_Y: 0.5,
    BASE_SIZE: 1.0, SIZE_GROWTH: 0.12, CUBE_H: 0.62,
    SEG_GAP: 0.58, SPEED: 8.5, TURN_RATE: 6.8,

    SPEEDCUBE_MULT: 2.0, SPEEDCUBE_TIME: 3.0,
    BOOST_MULT: 1.5, BOOST_DRAIN: 0.25, BOOST_REFILL: 0.10,

    FOOD_COUNT: 95, POWERUP_COUNT: 8,
    MOVING_FOOD_RATIO: 0.18,      // نسبة الطعام المتحرك
    DANGER_SEVER_INTERVAL: 2.0,   // كل ثانيتين يسقط آخر مكعب داخل منطقة الخطر

    MAP_INTERVAL: 300,            // تغيير الخريطة كل 5 دقائق
    REIGN_STEP: 300,              // كل 5 دقائق في الصدارة = ميدالية
    START_SNAKE: [8, 4, 2],
  };

  const FOOD_WEIGHTS = [
    { v: 2, w: 46 }, { v: 4, w: 28 }, { v: 8, w: 15 }, { v: 16, w: 8 }, { v: 32, w: 3 },
  ];
  const POWERUPS = {
    speed:  { color: "#19d3ff", label: "⚡",  glow: "#19d3ff" },
    double: { color: "#37d67a", label: "×2", glow: "#37d67a" },
    half:   { color: "#ff5d73", label: "÷2", glow: "#ff5d73" },
  };
  const POWERUP_WEIGHTS = [{ t: "speed", w: 50 }, { t: "double", w: 30 }, { t: "half", w: 20 }];

  const MAP_PATTERNS = ["square", "circle", "triangle", "maze"];
  const MEDALS = [
    null,
    { icon: "🥉", name: "برونزية" },
    { icon: "🥈", name: "فضية" },
    { icon: "🥇", name: "ذهبية" },
    { icon: "💎", name: "أسطورية" },
    { icon: "🔥", name: "خرافية" },
    { icon: "♾️", name: "لا نهائية" },
  ];

  // =====================================================================
  // Canvas
  // =====================================================================
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  addEventListener("resize", resize); resize();

  // =====================================================================
  // أدوات
  // =====================================================================
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const log2 = (v) => Math.log(v) / Math.LN2;
  const rand = (a, b) => a + Math.random() * (b - a);
  function angleLerp(a, target, maxStep) {
    let d = target - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    d = clamp(d, -maxStep, maxStep);
    return a + d;
  }
  const sizeForValue = (v) => CONFIG.BASE_SIZE * (0.86 + CONFIG.SIZE_GROWTH * (log2(v) - 1));
  // اختصار الأرقام الكبيرة حتى لا تخرج من المكعب (K/M/B/T...)
  function fmtNum(v) {
    if (v < 1000) return "" + v;
    const units = ["K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "De"];
    let n = v, i = -1;
    while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
    let s = n < 10 ? n.toFixed(1) : Math.round(n).toString();
    return s.replace(/\.0$/, "") + units[i];
  }
  const VALUE_COLORS = {
    2: "#f2c14e", 4: "#f0a868", 8: "#ec7d5a", 16: "#e85d5d", 32: "#d94f9a",
    64: "#9b5de5", 128: "#5d8ce8", 256: "#4fb0e8", 512: "#3fc7c0",
    1024: "#46c97a", 2048: "#8ad94f", 4096: "#ffd23f", 8192: "#ff8c42",
  };
  const colorForValue = (v) => VALUE_COLORS[v] || "#ff8c42";
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgb(${clamp(Math.round(r * f), 0, 255)},${clamp(Math.round(g * f), 0, 255)},${clamp(Math.round(b * f), 0, 255)})`;
  }

  // =====================================================================
  // كاميرا + إسقاط
  // =====================================================================
  let camX = 0, camY = 0;
  function project(wx, wy) {
    return { x: (wx - wy) * CONFIG.ISO_X * CONFIG.SCALE + camX, y: (wx + wy) * CONFIG.ISO_Y * CONFIG.SCALE + camY };
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

  // =====================================================================
  // أوّليات الرسم
  // =====================================================================
  function quad(a, b, c, d) {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
  }
  function strokePath(pts, close) {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (close) ctx.closePath(); ctx.stroke();
  }
  const mid = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

  function drawCube(wx, wy, sizeW, opts) {
    const color = opts.color, half = sizeW / 2;
    const t1 = project(wx - half, wy - half), t2 = project(wx + half, wy - half);
    const t3 = project(wx + half, wy + half), t4 = project(wx - half, wy + half);
    const ch = sizeW * CONFIG.SCALE * CONFIG.CUBE_H;

    // ظل ديناميكي أعمق
    ctx.save();
    ctx.globalAlpha = 0.4; ctx.fillStyle = "#000";
    const sh = project(wx, wy);
    ctx.beginPath();
    ctx.ellipse(sh.x, sh.y + ch * 0.7, half * CONFIG.SCALE * 1.2, half * CONFIG.SCALE * 0.62, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.restore();

    ctx.fillStyle = shade(color, 0.70);
    quad(t2, t3, { x: t3.x, y: t3.y + ch }, { x: t2.x, y: t2.y + ch });
    ctx.fillStyle = shade(color, 0.52);
    quad(t4, t3, { x: t3.x, y: t3.y + ch }, { x: t4.x, y: t4.y + ch });
    ctx.fillStyle = color; quad(t1, t2, t3, t4);
    ctx.fillStyle = shade(color, 1.18);
    quad(mid(t1, t2, 0.12), mid(t2, t3, 0.12), { x: (t3.x + t1.x) / 2, y: (t3.y + t1.y) / 2 }, mid(t1, t4, 0.12));
    ctx.strokeStyle = shade(color, 0.40); ctx.lineWidth = 1.4;
    strokePath([t1, t2, t3, t4], true);
    strokePath([t2, { x: t2.x, y: t2.y + ch }], false);
    strokePath([t3, { x: t3.x, y: t3.y + ch }], false);
    strokePath([t4, { x: t4.x, y: t4.y + ch }], false);

    if (opts.label) {
      const cx = (t1.x + t2.x + t3.x + t4.x) / 4, cy = (t1.y + t2.y + t3.y + t4.y) / 4;
      const lenF = opts.label.length > 4 ? 0.28 : opts.label.length > 3 ? 0.34 : 0.42;
      const fs = Math.max(9, sizeW * CONFIG.SCALE * lenF);
      ctx.font = `800 ${fs}px "Segoe UI", Tahoma, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(2, fs * 0.16); ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.strokeText(opts.label, cx, cy);
      ctx.fillStyle = "#fff"; ctx.fillText(opts.label, cx, cy);
    }
  }

  function drawCard(wx, wy, sizeW, type) {
    const pu = POWERUPS[type], half = sizeW / 2;
    const a = project(wx - half, wy - half), b = project(wx + half, wy - half);
    const c = project(wx + half, wy + half), d = project(wx - half, wy + half);
    const pulse = 0.5 + 0.5 * Math.sin(now * 3 + wx);
    ctx.save(); ctx.shadowColor = pu.glow; ctx.shadowBlur = 14 + pulse * 10;
    ctx.fillStyle = shade(pu.color, 0.45); quad(a, b, c, d);
    const k = 0.16; ctx.fillStyle = pu.color;
    quad(mid(a, c, k), mid(b, d, k), mid(c, a, k), mid(d, b, k));
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.5;
    strokePath([mid(a, c, 0.30), mid(b, d, 0.30), mid(c, a, 0.30), mid(d, b, 0.30)], true);
    const cx = (a.x + b.x + c.x + d.x) / 4, cy = (a.y + b.y + c.y + d.y) / 4;
    const fs = sizeW * CONFIG.SCALE * 0.40;
    ctx.font = `800 ${fs}px "Segoe UI", Tahoma, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.strokeText(pu.label, cx, cy); ctx.fillStyle = "#fff"; ctx.fillText(pu.label, cx, cy);
  }

  function drawBox(cx, cy, hw, hh, height, color) {
    const t1 = project(cx - hw, cy - hh), t2 = project(cx + hw, cy - hh);
    const t3 = project(cx + hw, cy + hh), t4 = project(cx - hw, cy + hh);
    const ch = height * CONFIG.SCALE * 0.5;
    ctx.fillStyle = shade(color, 0.62);
    quad(t2, t3, { x: t3.x, y: t3.y + ch }, { x: t2.x, y: t2.y + ch });
    ctx.fillStyle = shade(color, 0.45);
    quad(t4, t3, { x: t3.x, y: t3.y + ch }, { x: t4.x, y: t4.y + ch });
    ctx.fillStyle = color; quad(t1, t2, t3, t4);
    ctx.strokeStyle = shade(color, 0.30); ctx.lineWidth = 1.5;
    strokePath([t1, t2, t3, t4], true);
    strokePath([t2, { x: t2.x, y: t2.y + ch }], false);
    strokePath([t3, { x: t3.x, y: t3.y + ch }], false);
    strokePath([t4, { x: t4.x, y: t4.y + ch }], false);
  }

  // =====================================================================
  // الثعبان
  // =====================================================================
  const snake = {
    x: 0, y: 0, angle: 0, values: [], path: [],
    speedTimer: 0, stamina: 1, boosting: false, dangerTimer: 0, charges: 0,
  };
  let playerName = "أنت";

  function resetSnake() {
    snake.x = 0; snake.y = 0; snake.angle = 0;
    snake.values = CONFIG.START_SNAKE.slice().sort((a, b) => b - a);
    snake.path = [{ x: 0, y: 0 }];
    snake.speedTimer = 0; snake.stamina = 1; snake.boosting = false;
    snake.dangerTimer = 0; snake.charges = 0;
  }
  function segmentDistances() {
    const d = [0];
    for (let i = 1; i < snake.values.length; i++) {
      const s1 = sizeForValue(snake.values[i - 1]), s2 = sizeForValue(snake.values[i]);
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
      if (acc + seg >= d) { const t = (d - acc) / seg; return { x: lerp(p[i - 1].x, p[i].x, t), y: lerp(p[i - 1].y, p[i].y, t) }; }
      acc += seg;
    }
    const last = p[p.length - 1]; return { x: last.x, y: last.y };
  }
  function bodyPositions() {
    return segmentDistances().map((d, i) => {
      const pt = pointAtDistance(d);
      return { x: pt.x, y: pt.y, value: snake.values[i], size: sizeForValue(snake.values[i]) };
    });
  }
  const headValue = () => snake.values[0];
  const score = () => snake.values.reduce((s, v) => s + v, 0);

  // =====================================================================
  // الخريطة: شكل + حواجز + مناطق خطر + طعام + قوى
  // =====================================================================
  let foods = [], powerups = [], obstacles = [], dangers = [];
  let mapShape = "square", mapTri = null;

  function inBounds(x, y) {
    const R = CONFIG.WORLD;
    if (mapShape === "circle") return Math.hypot(x, y) <= R;
    if (mapShape === "triangle") {
      const v = mapTri; // 3 رؤوس
      const sign = (p, a, b) => (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
      const p = { x, y };
      const d1 = sign(p, v[0], v[1]), d2 = sign(p, v[1], v[2]), d3 = sign(p, v[2], v[0]);
      const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
      return !(neg && pos);
    }
    return Math.abs(x) <= R && Math.abs(y) <= R; // square / maze
  }
  function insideObstacle(x, y, margin) {
    for (const o of obstacles)
      if (x > o.x - o.hw - margin && x < o.x + o.hw + margin && y > o.y - o.hh - margin && y < o.y + o.hh + margin) return true;
    return false;
  }
  function inDanger(x, y) {
    for (const dz of dangers) if (Math.hypot(dz.x - x, dz.y - y) < dz.r) return true;
    return false;
  }
  function freePos(margin) {
    const R = CONFIG.WORLD * 0.9;
    for (let k = 0; k < 40; k++) {
      const x = rand(-R, R), y = rand(-R, R);
      if (inBounds(x, y) && !insideObstacle(x, y, margin) && !inDanger(x, y)) return { x, y };
    }
    return { x: 0, y: 0 };
  }
  let nextItemId = 1;
  function spawnFood() {
    const p = freePos(1), v = weighted(FOOD_WEIGHTS, "v");
    const moving = Math.random() < CONFIG.MOVING_FOOD_RATIO;
    const a = rand(0, Math.PI * 2);
    return { id: nextItemId++, x: p.x, y: p.y, value: v, size: sizeForValue(v), vx: moving ? Math.cos(a) * 2.2 : 0, vy: moving ? Math.sin(a) * 2.2 : 0 };
  }
  function looseFood(x, y, v) {
    return { id: nextItemId++, x, y, value: Math.max(2, v), size: sizeForValue(Math.max(2, v)), vx: 0, vy: 0 };
  }
  function spawnPowerup() {
    const p = freePos(2), t = weighted(POWERUP_WEIGHTS, "t");
    return { id: nextItemId++, x: p.x, y: p.y, type: t, size: CONFIG.BASE_SIZE * 2.0 };
  }
  function weighted(list, key) {
    const total = list.reduce((s, e) => s + e.w, 0); let r = Math.random() * total;
    for (const e of list) { if (r < e.w) return e[key]; r -= e.w; }
    return list[0][key];
  }

  function genMap() {
    // اختر النمط بالتناوب حسب المستوى
    mapShape = MAP_PATTERNS[(gameLevel - 1 + mapRotation) % MAP_PATTERNS.length];
    const R = CONFIG.WORLD;
    if (mapShape === "triangle")
      mapTri = [0, 1, 2].map((i) => { const a = -Math.PI / 2 + i * (Math.PI * 2 / 3); return { x: Math.cos(a) * R * 1.3, y: Math.sin(a) * R * 1.3 }; });

    obstacles = []; dangers = [];
    if (mapShape === "maze") {
      // متاهة: شبكة جدران غير قاتلة
      const cells = 6, gap = (R * 1.5) / cells;
      for (let i = -cells; i <= cells; i++)
        for (let j = -cells; j <= cells; j++) {
          if (Math.random() < 0.30) {
            const x = i * gap, y = j * gap;
            if (Math.hypot(x, y) < 16 || !inBounds(x, y)) continue;
            obstacles.push({ x, y, hw: gap * 0.32, hh: gap * 0.32, h: 2.6, color: "#3a4a66" });
          }
        }
    } else {
      const count = 5 + Math.floor(Math.random() * 5);
      let tries = 0;
      while (obstacles.length < count && tries < 300) {
        tries++;
        const x = rand(-R * 0.8, R * 0.8), y = rand(-R * 0.8, R * 0.8);
        if (Math.hypot(x, y) < 18 || !inBounds(x, y)) continue;
        const longish = Math.random() < 0.5, a = rand(3, 9), b = rand(3, 9);
        const hw = longish ? a * 1.6 : a, hh = longish ? b : b * 1.6;
        let ok = true;
        for (const o of obstacles) if (Math.abs(o.x - x) < o.hw + hw + 4 && Math.abs(o.y - y) < o.hh + hh + 4) { ok = false; break; }
        if (ok) obstacles.push({ x, y, hw, hh, h: 2.6, color: "#3a4a66" });
      }
    }
    // مناطق خطر (تزيد مع المستوى)
    const dz = 3 + gameLevel;
    for (let i = 0; i < dz; i++) {
      const x = rand(-R * 0.85, R * 0.85), y = rand(-R * 0.85, R * 0.85);
      if (Math.hypot(x, y) < 20 || !inBounds(x, y)) { i--; continue; }
      dangers.push({ x, y, r: rand(6, 11) });
    }
  }

  function initItems() {
    genMap();
    const foodN = Math.max(35, CONFIG.FOOD_COUNT - (gameLevel - 1) * 12); // طعام أقل كل مرحلة
    foods = []; powerups = [];
    for (let i = 0; i < foodN; i++) foods.push(spawnFood());
    for (let i = 0; i < CONFIG.POWERUP_COUNT; i++) powerups.push(spawnPowerup());
  }

  // =====================================================================
  // الأكل + الدمج + القوى + القطع
  // =====================================================================
  function eatValue(v) {
    snake.values.push(v); snake.values.sort((a, b) => b - a);
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < snake.values.length - 1; i++) {
        if (snake.values[i] === snake.values[i + 1]) {
          snake.values[i] *= 2; snake.values.splice(i + 1, 1);
          snake.values.sort((a, b) => b - a);
          spawnMergeFx(); merged = true; break;
        }
      }
    }
  }
  function applyPowerup(type) {
    if (type === "speed") snake.speedTimer = CONFIG.SPEEDCUBE_TIME;
    else if (type === "double") { snake.values = snake.values.map((v) => v * 2); }
    else if (type === "half") {
      snake.values = snake.values.map((v) => v / 2).filter((v) => v >= 2);
      snake.values.sort((a, b) => b - a);
      if (snake.values.length === 0) gameOver();
    }
  }
  // قطع الذيل: المكعب الأخير يتحول لطعام ساكن
  function severTail() {
    if (snake.values.length <= 1) { gameOver(); return; }
    const v = snake.values.pop();
    const dists = segmentDistances();
    const pt = pointAtDistance(dists[dists.length - 1] || 0);
    dropLoose(pt.x, pt.y, v);
    spawnBurst(pt.x, pt.y, "#ff5d73", 10);
  }
  // إسقاط مكعب ساكن: المضيف يضيفه مباشرة، العميل يطلب من المضيف
  function dropLoose(x, y, v) {
    if (authority()) { foods.push(looseFood(x, y, v)); }
    else netSend({ t: "drop", x, y, v });
  }

  // المراحل: تتقدّم فقط عبر نظام الميداليات (لا علاقة لأرقام المكعبات)
  let gameLevel = 1, mapRotation = 0;
  function advanceMap() {
    gameLevel++; mapRotation++;
    initItems(); // آمن لأنه يُستدعى من updateMedals قبل حلقات الأكل
    document.getElementById("level").textContent = gameLevel;
    notify("🗺️ الخريطة التالية — المرحلة " + gameLevel);
    if (isHost) { hostBroadcast(worldMsg()); hostBroadcast(itemsMsg()); hostBroadcast({ t: "notify", text: "🗺️ الخريطة التالية — المرحلة " + gameLevel }); }
  }

  // =====================================================================
  // مؤثرات (جسيمات)
  // =====================================================================
  let particles = [];
  function spawnBurst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(8, 26);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), max: 0.7, color, size: rand(2, 5) });
    }
  }
  function spawnMergeFx() { spawnBurst(snake.x, snake.y, "#fff6c2", 14); }
  // أثر السرعة: جسيمات تتطاير خلف الثعبان أثناء الاندفاع
  function spawnBoostTrail() {
    const col = snake.speedTimer > 0 ? "#ffb020" : "#19d3ff";
    const body = bodyPositions();
    for (let k = 0; k < body.length; k += 2) {
      if (Math.random() > 0.5) continue;
      const b = body[k];
      particles.push({
        x: b.x + rand(-0.3, 0.3), y: b.y + rand(-0.3, 0.3),
        vx: -Math.cos(snake.angle) * 7 + rand(-3, 3), vy: -Math.sin(snake.angle) * 7 + rand(-3, 3),
        life: 0.45, max: 0.45, color: col, size: rand(2, 5),
      });
    }
  }
  function spawnEatFx(x, y) { spawnBurst(x, y, "#bfe9ff", 6); }
  function spawnDeathFx() {
    for (const s of bodyPositions()) spawnBurst(s.x, s.y, colorForValue(s.value), 14);
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92;
    }
  }
  function drawParticles() {
    for (const p of particles) {
      const pr = project(p.x, p.y);
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(pr.x, pr.y - 10, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // رموز عائمة
  let floatEmojis = [];
  function showEmoji(em) { floatEmojis.push({ x: snake.x, y: snake.y, em, life: 2 }); }
  function updateEmojis(dt) {
    for (let i = floatEmojis.length - 1; i >= 0; i--) { floatEmojis[i].life -= dt; if (floatEmojis[i].life <= 0) floatEmojis.splice(i, 1); }
    for (const r of remotes.values()) if (r.emojiLife > 0) r.emojiLife -= dt;
  }
  function drawEmojis() {
    for (const e of floatEmojis) {
      const pr = project(e.x, e.y);
      ctx.globalAlpha = clamp(e.life, 0, 1);
      ctx.font = "30px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(e.em, pr.x, pr.y - 70 - (2 - e.life) * 24);
    }
    ctx.globalAlpha = 1;
  }

  // =====================================================================
  // الإدخال
  // =====================================================================
  let pointer = { x: W / 2, y: H / 2 + 80 };
  const input = { holding: false, up: false, down: false, left: false, right: false, boostKey: false };
  canvas.addEventListener("mousemove", (e) => { pointer.x = e.clientX; pointer.y = e.clientY; });
  canvas.addEventListener("mousedown", (e) => { if (e.button === 0) input.holding = true; });
  addEventListener("mouseup", (e) => { if (e.button === 0) input.holding = false; });
  canvas.addEventListener("mouseleave", () => { input.holding = false; });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("touchstart", (e) => { if (e.touches[0]) { pointer.x = e.touches[0].clientX; pointer.y = e.touches[0].clientY; } input.holding = true; });
  canvas.addEventListener("touchmove", (e) => { if (e.touches[0]) { pointer.x = e.touches[0].clientX; pointer.y = e.touches[0].clientY; } e.preventDefault(); }, { passive: false });
  addEventListener("touchend", () => { input.holding = false; });
  const isTyping = () => { const el = document.activeElement; return el && el.tagName === "INPUT"; };
  addEventListener("keydown", (e) => {
    if (isTyping()) return;
    switch (e.code) {
      case "ArrowUp": case "KeyW": input.up = true; e.preventDefault(); break;
      case "ArrowDown": case "KeyS": input.down = true; e.preventDefault(); break;
      case "ArrowLeft": case "KeyA": input.left = true; e.preventDefault(); break;
      case "ArrowRight": case "KeyD": input.right = true; e.preventDefault(); break;
      case "Space": input.boostKey = true; e.preventDefault(); break;
      case "KeyE": useCharge(); break;
    }
  });
  addEventListener("keyup", (e) => {
    switch (e.code) {
      case "ArrowUp": case "KeyW": input.up = false; break;
      case "ArrowDown": case "KeyS": input.down = false; break;
      case "ArrowLeft": case "KeyA": input.left = false; break;
      case "ArrowRight": case "KeyD": input.right = false; break;
      case "Space": input.boostKey = false; break;
    }
  });

  // =====================================================================
  // حالة اللعبة + الميداليات
  // =====================================================================
  let state = "menu", lastT = 0, now = 0, playTime = 0;
  let highScore = 0;
  try { highScore = parseInt(localStorage.getItem("snake2048_high") || "0") || 0; } catch (e) {}
  const medal = { level: 0, leaderId: null, reign: 0, leaderName: "" };
  let giftCharges = 0; // شحنات الجائزة المُرحَّلة للفائز في اللعبة التالية

  // =====================================================================
  // حالة الشبكة
  // =====================================================================
  let myId = "p" + Math.random().toString(36).slice(2, 8);
  let online = false, isHost = false;
  const authority = () => !online || isHost; // من يملك صلاحية تعديل العالم
  let peer = null;            // كائن PeerJS
  let hostConn = null;        // اتصال العميل بالمضيف
  const clientConns = new Map(); // عند المضيف: id -> conn
  const remotes = new Map();  // id -> لاعب بعيد {name,x,y,angle,head,boosting,score,body,emoji,emojiT,color,seen}
  let lastNetSend = 0;
  const SNAKE_COLORS = ["#4fd1ff", "#ff8c42", "#37d67a", "#d94f9a", "#ffd23f", "#9b5de5", "#ff5d73"];
  const colorForId = (id) => SNAKE_COLORS[Math.abs(hashStr(id)) % SNAKE_COLORS.length];
  function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

  function startGame() { beginPlay("solo"); }
  function restart() {
    const stillConnected = online && ((isHost && peer) || (!isHost && hostConn && hostConn.open));
    beginPlay(stillConnected ? (isHost ? "host" : "client") : "solo");
  }
  function beginPlay(mode) {
    const nm = (document.getElementById("name-input").value || "").trim();
    playerName = nm || "أنت";
    try { localStorage.setItem("snake2048_name", playerName); } catch (e) {}
    online = mode !== "solo"; isHost = mode === "host";
    if (mode !== "host") hideRoomCodeHud(); // الرمز يظهر للمضيف الخاص فقط
    gameLevel = 1; mapRotation = 0;
    medal.level = 0; medal.leaderId = null; medal.reign = 0; medal.leaderName = "";
    particles = []; floatEmojis = []; playTime = 0; remotes.clear();
    resetSnake();
    if (online) { // موضع انطلاق عشوائي لتفادي التراكب
      const a = rand(0, Math.PI * 2), d = rand(0, CONFIG.WORLD * 0.5);
      snake.x = Math.cos(a) * d; snake.y = Math.sin(a) * d; snake.path = [{ x: snake.x, y: snake.y }];
    }
    if (authority()) initItems();
    else { foods = []; powerups = []; obstacles = []; dangers = []; } // العميل ينتظر عالم المضيف
    updateCamera(snake.x, snake.y);
    snake.charges = giftCharges; giftCharges = 0;
    updateCharges();
    document.getElementById("level").textContent = gameLevel;
    document.getElementById("chat-bar").classList.remove("hidden");
    state = "playing";
    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("over-screen").classList.add("hidden");
    document.getElementById("win-screen").classList.add("hidden");
    if (isHost) { hostBroadcast(worldMsg()); hostBroadcast(itemsMsg()); }
  }
  function gameOver() {
    if (state !== "playing") return;
    spawnDeathFx();
    if (headValue() > highScore) { highScore = headValue(); try { localStorage.setItem("snake2048_high", String(highScore)); } catch (e) {} }
    if (online) netSend({ t: "dead" });
    state = "over";
    document.getElementById("final-best").textContent = fmtNum(headValue() || 0);
    document.getElementById("final-score").textContent = fmtNum(score());
    document.getElementById("over-screen").classList.remove("hidden");
    document.getElementById("chat-bar").classList.add("hidden");
  }

  function currentSpeed() {
    let m = 1;
    if (snake.speedTimer > 0) m *= CONFIG.SPEEDCUBE_MULT;
    if (snake.boosting) m *= CONFIG.BOOST_MULT;
    return CONFIG.SPEED * m;
  }
  function steerTo(sdx, sdy, dt) {
    const o = unproject(W / 2, H / 2), p = unproject(W / 2 + sdx, H / 2 + sdy);
    snake.angle = angleLerp(snake.angle, Math.atan2(p.y - o.y, p.x - o.x), CONFIG.TURN_RATE * dt);
  }

  // المتصدّر = صاحب أعلى نقاط بين كل اللاعبين
  function computeLeader() {
    let best = { id: myId, name: playerName, score: score() };
    if (online) for (const r of remotes.values()) if ((r.score || 0) > best.score) best = { id: r.id, name: r.name, score: r.score || 0 };
    return best;
  }
  // الميداليات: من يبقى 5 دقائق متواصلة في الصدارة يحصل على ميدالية وتتغيّر الخريطة
  function updateMedals(dt) {
    if (online && !isHost) { updateMedalBadge(); return; } // العميل يتلقّاها من المضيف
    const leader = computeLeader();
    if (leader.id !== medal.leaderId) { medal.leaderId = leader.id; medal.leaderName = leader.name; medal.reign = 0; }
    else {
      medal.reign += dt;
      if (medal.reign >= CONFIG.REIGN_STEP) {
        medal.reign = 0;
        if (medal.level < 6) medal.level++;
        const m = MEDALS[medal.level];
        const msg = "🏅 " + leader.name + " — ميدالية " + m.name + " " + m.icon;
        notify(msg);
        if (isHost) { hostBroadcast({ t: "notify", text: msg }); hostBroadcast({ t: "medal", level: medal.level, leaderId: medal.leaderId, leaderName: medal.leaderName }); }
        if (medal.level === 6) { doWin(leader.name, leader.id); return; }
        advanceMap();
      }
    }
    updateMedalBadge();
  }
  function updateMedalBadge() {
    const badge = document.getElementById("medal-badge");
    if (medal.level > 0) {
      badge.classList.remove("hidden");
      document.getElementById("medal-icon").textContent = MEDALS[medal.level].icon;
      document.getElementById("medal-name").textContent = MEDALS[medal.level].name + (medal.leaderName ? " — " + medal.leaderName : "");
    } else badge.classList.add("hidden");
  }
  function doWin(name, id) {
    if (isHost) hostBroadcast({ t: "win", name, id });
    winGame(name, id);
  }
  // الفوز عند بلوغ اللانهائية: تنتهي اللعبة، والفائز يبدأ التالية ومعه 3 شحنات
  function winGame(winner, winnerId) {
    if (state !== "playing") return;
    state = "won";
    giftCharges = (!online || winnerId === myId) ? 3 : 0; // الهدية للفائز فقط
    if (headValue() > highScore) { highScore = headValue(); try { localStorage.setItem("snake2048_high", String(highScore)); } catch (e) {} }
    document.getElementById("win-name").textContent = winner;
    document.getElementById("win-screen").classList.remove("hidden");
    document.getElementById("chat-bar").classList.add("hidden");
  }
  function useCharge() {
    if (snake.charges <= 0 || state !== "playing") return;
    snake.charges--; snake.values = snake.values.map((v) => v * 2);
    spawnBurst(snake.x, snake.y, "#37d67a", 18); updateCharges();
  }
  function updateCharges() {
    const el = document.getElementById("charges");
    if (snake.charges <= 0) { el.classList.add("hidden"); el.innerHTML = ""; return; }
    el.classList.remove("hidden");
    el.innerHTML = "";
    for (let i = 0; i < snake.charges; i++) {
      const b = document.createElement("button");
      b.className = "charge-btn"; b.innerHTML = "×2<small>E</small>";
      b.onclick = useCharge; el.appendChild(b);
    }
  }

  // =====================================================================
  // التحديث
  // =====================================================================
  function update(dt) {
    playTime += dt;
    updateMedals(dt);
    if (state !== "playing") return; // قد تنتهي اللعبة بالفوز (اللانهائية)

    const wantBoost = input.holding || input.boostKey;
    snake.boosting = wantBoost && snake.stamina > 0.001;
    if (snake.boosting) snake.stamina = Math.max(0, snake.stamina - CONFIG.BOOST_DRAIN * dt);
    else snake.stamina = Math.min(1, snake.stamina + CONFIG.BOOST_REFILL * dt);
    if (snake.speedTimer > 0) snake.speedTimer = Math.max(0, snake.speedTimer - dt);

    // توجيه
    if (input.up || input.down || input.left || input.right) {
      const sx = (input.right ? 1 : 0) - (input.left ? 1 : 0), sy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      if (sx || sy) steerTo(sx, sy, dt);
    } else {
      const sdx = pointer.x - W / 2, sdy = pointer.y - H / 2;
      if (Math.hypot(sdx, sdy) > 14) steerTo(sdx, sdy, dt);
    }

    const step = currentSpeed() * dt;
    snake.x += Math.cos(snake.angle) * step; snake.y += Math.sin(snake.angle) * step;
    if (snake.boosting || snake.speedTimer > 0) spawnBoostTrail();

    // الخروج من الخريطة = موت
    if (!inBounds(snake.x, snake.y)) { gameOver(); return; }

    // الحواجز لا تقتل: تمنع الدخول (ندفع الرأس للخارج)
    for (const o of obstacles) {
      const m = sizeForValue(headValue()) * 0.3;
      if (snake.x > o.x - o.hw - m && snake.x < o.x + o.hw + m && snake.y > o.y - o.hh - m && snake.y < o.y + o.hh + m) {
        const dxl = (o.x - o.hw - m) - snake.x, dxr = (o.x + o.hw + m) - snake.x;
        const dyl = (o.y - o.hh - m) - snake.y, dyr = (o.y + o.hh + m) - snake.y;
        const px = Math.abs(dxl) < Math.abs(dxr) ? dxl : dxr;
        const py = Math.abs(dyl) < Math.abs(dyr) ? dyl : dyr;
        if (Math.abs(px) < Math.abs(py)) snake.x += px; else snake.y += py;
      }
    }

    // مناطق الخطر: قطع الجسم تدريجياً
    if (inDanger(snake.x, snake.y)) {
      snake.dangerTimer += dt;
      while (snake.dangerTimer >= CONFIG.DANGER_SEVER_INTERVAL) {
        snake.dangerTimer -= CONFIG.DANGER_SEVER_INTERVAL;
        severTail(); if (state !== "playing") return;
      }
    } else snake.dangerTimer = 0;

    // مسار
    snake.path.unshift({ x: snake.x, y: snake.y });
    const dists = segmentDistances(); const need = dists[dists.length - 1] + 4; let total = 0;
    for (let i = 1; i < snake.path.length; i++) {
      total += Math.hypot(snake.path[i].x - snake.path[i - 1].x, snake.path[i].y - snake.path[i - 1].y);
      if (total > need) { snake.path.length = i + 1; break; }
    }

    // طعام متحرك (المضيف فقط يحرّكه)
    if (authority()) {
      for (const f of foods) {
        if (f.vx || f.vy) {
          f.x += f.vx * dt; f.y += f.vy * dt;
          if (!inBounds(f.x, f.y)) { f.vx *= -1; f.vy *= -1; f.x += f.vx * dt; f.y += f.vy * dt; }
        }
      }
    }

    const hv = headValue(), hSize = sizeForValue(hv);
    for (let i = foods.length - 1; i >= 0; i--) {
      const f = foods[i];
      if (Math.hypot(f.x - snake.x, f.y - snake.y) < (hSize + f.size) * 0.5 && f.value <= hv) {
        eatValue(f.value); spawnEatFx(f.x, f.y);
        if (authority()) foods[i] = spawnFood();
        else { foods.splice(i, 1); netSend({ t: "eat", id: f.id }); }
      }
    }
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      if (Math.hypot(p.x - snake.x, p.y - snake.y) < (hSize + p.size) * 0.45) {
        spawnBurst(p.x, p.y, POWERUPS[p.type].glow, 12);
        applyPowerup(p.type);
        if (authority()) powerups[i] = spawnPowerup();
        else { powerups.splice(i, 1); netSend({ t: "eatpu", id: p.id }); }
        if (state !== "playing") return;
      }
    }

    if (online) resolveCombat();

    // بثّ حالتي + (للمضيف) حالة العالم
    if (online) {
      lastNetSend += dt;
      if (lastNetSend >= 0.05) { lastNetSend = 0; netTick(); }
    }

    updateParticles(dt); updateEmojis(dt);
    updateCamera(snake.x, snake.y); updateHUD();
  }

  // =====================================================================
  // القتال (أونلاين): رأس‑برأس + عضّ الجسم
  // =====================================================================
  function resolveCombat() {
    const hv = headValue(), hSize = sizeForValue(hv);
    for (const r of remotes.values()) {
      if (!r.body || !r.body.length) continue;
      const rHeadV = r.head || (r.body[0] && r.body[0].v) || 2;
      const rHeadS = sizeForValue(rHeadV);
      // رأس برأس
      const dHead = Math.hypot(r.x - snake.x, r.y - snake.y);
      if (dHead < (hSize + rHeadS) * 0.5) {
        if (hv > rHeadV) { netSend({ t: "cut", target: r.id, index: 0 }); continue; }
        else if (hv === rHeadV) {
          // تصادم: ادفع رأسي بعيداً (السرعة ترجّح)
          const nx = (snake.x - r.x) / (dHead || 1), ny = (snake.y - r.y) / (dHead || 1);
          let push = 0.9 * (r.boosting ? 1.3 : 1) * (snake.boosting ? 0.4 : 1);
          snake.x += nx * push; snake.y += ny * push;
          continue;
        }
        // رأسي أصغر: الطرف الآخر سيعضّني — ابتعد قليلاً
        const nx = (snake.x - r.x) / (dHead || 1), ny = (snake.y - r.y) / (dHead || 1);
        snake.x += nx * 0.5; snake.y += ny * 0.5;
      }
      // عضّ الجسم: أصغر من رأسي فقط
      for (let k = 1; k < r.body.length; k++) {
        const b = r.body[k];
        if (b.v < hv && Math.hypot(b.x - snake.x, b.y - snake.y) < (hSize + sizeForValue(b.v)) * 0.5) {
          netSend({ t: "cut", target: r.id, index: k });
          break;
        }
      }
    }
  }

  // تطبيق قطع على ثعباني (وصلني عبر المضيف)
  function applyCut(index) {
    if (state !== "playing") return;
    if (index <= 0) { gameOver(); return; }
    if (index >= snake.values.length) return;
    const body = bodyPositions();
    const dropped = snake.values.slice(index);
    snake.values.length = index;
    for (let k = 0; k < dropped.length; k++) {
      const pos = body[index + k] || { x: snake.x, y: snake.y };
      dropLoose(pos.x, pos.y, dropped[k]);
      spawnBurst(pos.x, pos.y, "#ff5d73", 8);
    }
  }

  // =====================================================================
  // الرسم
  // =====================================================================
  function drawGround() {
    ctx.fillStyle = "#0b1830"; ctx.fillRect(0, 0, W, H);
    const R = CONFIG.WORLD;
    ctx.fillStyle = "#13294d"; ctx.strokeStyle = "rgba(120,160,210,0.5)"; ctx.lineWidth = 3;
    ctx.beginPath();
    if (mapShape === "circle") {
      // مضلّع يقارب الدائرة
      for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; const pr = project(Math.cos(a) * R, Math.sin(a) * R); i ? ctx.lineTo(pr.x, pr.y) : ctx.moveTo(pr.x, pr.y); }
    } else if (mapShape === "triangle") {
      mapTri.forEach((v, i) => { const pr = project(v.x, v.y); i ? ctx.lineTo(pr.x, pr.y) : ctx.moveTo(pr.x, pr.y); });
    } else {
      [[-R, -R], [R, -R], [R, R], [-R, R]].forEach((c, i) => { const pr = project(c[0], c[1]); i ? ctx.lineTo(pr.x, pr.y) : ctx.moveTo(pr.x, pr.y); });
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // نقاط الشبكة
    const center = unproject(W / 2, H / 2), range = 34;
    const gx0 = Math.floor(center.x - range), gx1 = Math.ceil(center.x + range);
    const gy0 = Math.floor(center.y - range), gy1 = Math.ceil(center.y + range);
    ctx.fillStyle = "rgba(120,160,210,0.16)";
    for (let gx = gx0; gx <= gx1; gx += 4) for (let gy = gy0; gy <= gy1; gy += 4) {
      if (!inBounds(gx, gy)) continue;
      const p = project(gx, gy); ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2); ctx.fill();
    }

    // مناطق الخطر (دوائر حمراء على الأرض)
    for (const dz of dangers) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 4 + dz.x);
      ctx.save();
      ctx.globalAlpha = 0.35 + pulse * 0.25;
      ctx.fillStyle = "#c0203a";
      ctx.beginPath();
      for (let i = 0; i <= 32; i++) { const a = (i / 32) * Math.PI * 2; const pr = project(dz.x + Math.cos(a) * dz.r, dz.y + Math.sin(a) * dz.r); i ? ctx.lineTo(pr.x, pr.y) : ctx.moveTo(pr.x, pr.y); }
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.8; ctx.strokeStyle = "#ff5d73"; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
  }

  function render() {
    drawGround();
    for (const p of powerups) drawCard(p.x, p.y, p.size, p.type);
    const drawables = [];
    for (const f of foods) drawables.push({ kind: "food", x: f.x, y: f.y, size: f.size, value: f.value, depth: f.x + f.y });
    for (const o of obstacles) drawables.push({ kind: "wall", o, depth: o.x + o.y });
    for (const s of bodyPositions()) drawables.push({ kind: "body", x: s.x, y: s.y, size: s.size, value: s.value, depth: s.x + s.y });
    // الثعابين البعيدة
    for (const r of remotes.values()) {
      if (!r.body) continue;
      for (const b of r.body) drawables.push({ kind: "body", x: b.x, y: b.y, size: sizeForValue(b.v), value: b.v, depth: b.x + b.y });
    }
    drawables.sort((a, b) => a.depth - b.depth);
    for (const d of drawables) {
      if (d.kind === "wall") drawBox(d.o.x, d.o.y, d.o.hw, d.o.hh, d.o.h, d.o.color);
      else drawCube(d.x, d.y, d.size, { color: colorForValue(d.value), label: fmtNum(d.value) });
    }
    drawParticles();
    if (snake.boosting || snake.speedTimer > 0) drawBoostAura();
    // أسماء ورموز الثعابين البعيدة
    for (const r of remotes.values()) drawRemoteLabel(r);
    drawArrow(); drawNameLabel(); drawGauges(); drawEmojis();
  }
  // هالة سرعة نابضة حول الرأس + خطوط اندفاع
  function drawBoostAura() {
    const c = project(snake.x, snake.y);
    const col = snake.speedTimer > 0 ? "255,176,32" : "25,211,255";
    const rr = sizeForValue(headValue()) * CONFIG.SCALE * (1.4 + 0.25 * Math.sin(now * 18));
    ctx.save();
    const g = ctx.createRadialGradient(c.x, c.y, rr * 0.2, c.x, c.y, rr);
    g.addColorStop(0, `rgba(${col},0.45)`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, rr, 0, Math.PI * 2); ctx.fill();
    // خطوط اندفاع خلف الرأس
    const ah = project(snake.x + Math.cos(snake.angle), snake.y + Math.sin(snake.angle));
    let dx = ah.x - c.x, dy = ah.y - c.y; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    ctx.strokeStyle = `rgba(${col},0.5)`; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * 10, ox = -dy * off, oy = dx * off;
      const s = 18 + (now * 120 % 26);
      ctx.beginPath(); ctx.moveTo(c.x - dx * s + ox, c.y - dy * s + oy); ctx.lineTo(c.x - dx * (s + 14) + ox, c.y - dy * (s + 14) + oy); ctx.stroke();
    }
    ctx.restore();
  }
  function drawRemoteLabel(r) {
    if (r.x == null) return;
    const c = project(r.x, r.y);
    const y = c.y - sizeForValue(r.head || 2) * CONFIG.SCALE * CONFIG.CUBE_H - 24;
    ctx.font = '700 14px "Segoe UI", Tahoma, sans-serif'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.strokeText(r.name || "?", c.x, y);
    ctx.fillStyle = r.color || "#fff"; ctx.fillText(r.name || "?", c.x, y);
    if (r.emojiLife > 0) {
      ctx.globalAlpha = clamp(r.emojiLife, 0, 1);
      ctx.font = "28px serif"; ctx.fillText(r.emojiEm, c.x, y - 34 - (2 - r.emojiLife) * 20);
      ctx.globalAlpha = 1;
    }
  }

  function drawArrow() {
    const c = project(snake.x, snake.y);
    const ah = project(snake.x + Math.cos(snake.angle), snake.y + Math.sin(snake.angle));
    let dx = ah.x - c.x, dy = ah.y - c.y; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const x0 = c.x + dx * 30, y0 = c.y + dy * 30, x1 = c.x + dx * 80, y1 = c.y + dy * 80;
    ctx.save(); ctx.shadowColor = "rgba(80,210,255,0.9)"; ctx.shadowBlur = 12;
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "rgba(80,210,255,0)"); g.addColorStop(1, "rgba(120,230,255,0.95)");
    ctx.strokeStyle = g; ctx.lineWidth = 7; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const px = -dy, py = dx, hw = 11, hl = 18; ctx.fillStyle = "rgba(150,235,255,0.98)";
    ctx.beginPath(); ctx.moveTo(x1 + dx * 4, y1 + dy * 4);
    ctx.lineTo(x1 - dx * hl + px * hw, y1 - dy * hl + py * hw);
    ctx.lineTo(x1 - dx * hl - px * hw, y1 - dy * hl - py * hw);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function drawNameLabel() {
    const c = project(snake.x, snake.y);
    const y = c.y - sizeForValue(headValue()) * CONFIG.SCALE * CONFIG.CUBE_H - 24;
    ctx.font = '700 15px "Segoe UI", Tahoma, sans-serif'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.strokeText(playerName, c.x, y);
    ctx.fillStyle = "#fff"; ctx.fillText(playerName, c.x, y);
  }
  function drawGauges() {
    const g = [];
    if (snake.stamina < 0.999 || snake.boosting) g.push({ frac: snake.stamina, color: snake.boosting ? "#19d3ff" : "#5a86c8", icon: "⚡" });
    if (snake.speedTimer > 0) g.push({ frac: snake.speedTimer / CONFIG.SPEEDCUBE_TIME, color: "#ffb020", icon: "×2" });
    if (!g.length) return;
    const c = project(snake.x, snake.y), baseY = c.y - sizeForValue(headValue()) * CONFIG.SCALE * CONFIG.CUBE_H - 56;
    const r = 16, spacing = 42; let x = c.x - ((g.length - 1) * spacing) / 2;
    for (const e of g) {
      ctx.beginPath(); ctx.arc(x, baseY, r, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, baseY); ctx.arc(x, baseY, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * e.frac); ctx.closePath();
      ctx.fillStyle = e.color; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.beginPath(); ctx.arc(x, baseY, r, 0, Math.PI * 2); ctx.stroke();
      ctx.font = '800 12px "Segoe UI", Tahoma, sans-serif'; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(e.icon, x, baseY); x += spacing;
    }
  }

  // =====================================================================
  // HUD + إشعارات
  // =====================================================================
  function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ":" + (s < 10 ? "0" : "") + s; }
  function updateHUD() {
    document.getElementById("best").textContent = fmtNum(headValue());
    document.getElementById("score").textContent = fmtNum(score());
    document.getElementById("length").textContent = snake.values.length;
    document.getElementById("time").textContent = fmtTime(playTime);
    document.getElementById("highscore").textContent = fmtNum(Math.max(highScore, headValue()));
    const entries = [{ id: myId, name: playerName, head: headValue(), me: true }];
    if (online) for (const r of remotes.values()) entries.push({ id: r.id, name: r.name || "?", head: r.head || 2, me: false });
    entries.sort((a, b) => b.head - a.head);
    let html = "";
    entries.slice(0, 5).forEach((e, i) => {
      const mstr = (e.id === medal.leaderId && medal.level > 0) ? " " + MEDALS[medal.level].icon : "";
      html += `<li class="${e.me ? "me" : ""}"><span><span class="rank">${i + 1}.</span> ${escapeHtml(e.name)}${mstr}</span><span>${fmtNum(e.head)}</span></li>`;
    });
    document.getElementById("lb-list").innerHTML = html;
  }
  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function notify(text) {
    const box = document.getElementById("notifications");
    const d = document.createElement("div"); d.className = "notif"; d.textContent = text;
    box.appendChild(d); setTimeout(() => d.remove(), 3000);
  }

  // دردشة الرموز
  document.querySelectorAll("#chat-bar button").forEach((b) => {
    b.addEventListener("click", () => { showEmoji(b.dataset.emoji); if (online) netSend({ t: "emoji", em: b.dataset.emoji }); });
  });

  // =====================================================================
  // الشبكة (PeerJS) — نجمة: المضيف يملك العالم ويعيد توزيع الحالة
  // =====================================================================
  const PEER_PREFIX = "snk2048-";
  let roomCode = "", netItemsCounter = 0;

  // واجهة اللوحات
  window.switchMode = function (mode) {
    document.getElementById("btn-solo").classList.toggle("active", mode === "solo");
    document.getElementById("btn-multi").classList.toggle("active", mode === "multi");
    document.getElementById("panel-solo").classList.toggle("hidden", mode !== "solo");
    document.getElementById("panel-multi").classList.toggle("hidden", mode !== "multi");
  };
  window.onPrivateToggle = function () {
    const priv = document.getElementById("private-room").checked;
    document.getElementById("room-hint").textContent = priv
      ? "غرفة خاصة: ستحصل على رمز ترسله لأصدقائك."
      : "غرفة عامة: يدخلها أي شخص مباشرة بدون رمز.";
    document.getElementById("play-multi-btn").textContent = priv ? "أنشئ غرفة خاصة" : "العب أونلاين";
    document.getElementById("room-code-wrap").classList.add("hidden");
  };
  window.copyCode = function () { copyText(document.getElementById("room-code-display").textContent); };
  function copyText(code) {
    if (!code) return;
    if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => notify("نُسخ الرمز ✓"), () => {});
    else notify("الرمز: " + code);
  }

  function genCode() { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }
  function peerLoaded() { return typeof Peer !== "undefined"; }

  const PUBLIC_CODE = "PUBLIC"; // الغرفة العامة المشتركة (رمز ثابت)
  function setName() { const nm = (document.getElementById("name-input").value || "").trim(); playerName = nm || "أنت"; }
  function mStatus(text, err) { const s = document.getElementById("multi-status"); s.classList.toggle("error", !!err); s.textContent = text; }

  let openTimer = null;
  function armTimeout(statusFn) {
    clearTimeout(openTimer);
    openTimer = setTimeout(() => { if (!online) statusFn("تعذّر الاتصال بخادم اللعب — تحقّق من الإنترنت وحاول ثانية", true); }, 9000);
  }

  function showRoomCodeHud(code) {
    const el = document.getElementById("room-code-hud");
    document.getElementById("room-code-hud-val").textContent = code;
    el.classList.remove("hidden");
  }
  function hideRoomCodeHud() { document.getElementById("room-code-hud").classList.add("hidden"); }

  // الزرّ الرئيسي: عام (دخول/استضافة تلقائي) أو خاص (إنشاء برمز)
  window.doPlayMulti = function () {
    if (!peerLoaded()) { mStatus("تعذّر تحميل PeerJS (تحقّق من الإنترنت ثم أعد التحميل)", true); return; }
    setName();
    if (document.getElementById("private-room").checked) { mStatus("جارٍ إنشاء الغرفة الخاصة…"); startHost(0, genCode()); }
    else { mStatus("جارٍ الدخول للغرفة العامة…"); startPublic(); }
  };

  // الغرفة العامة: حاول أن تكون المضيف، وإن كان موجوداً فانضمّ إليه
  function startPublic() {
    armTimeout(mStatus);
    peer = new Peer(PEER_PREFIX + PUBLIC_CODE, { debug: 1 });
    peer.on("open", (id) => { clearTimeout(openTimer); roomCode = ""; becomeHost(id); hideRoomCodeHud(); mStatus("أنت مضيف الغرفة العامة 🌍"); });
    peer.on("error", (e) => {
      if (e.type === "unavailable-id") { try { peer.destroy(); } catch (_) {} mStatus("جارٍ الانضمام للغرفة العامة…"); joinRoom(PUBLIC_CODE, document.getElementById("multi-status")); }
      else mStatus("خطأ: " + e.type, true);
    });
  }

  // غرفة خاصة برمز
  function startHost(attempt, code) {
    roomCode = code;
    armTimeout(mStatus);
    peer = new Peer(PEER_PREFIX + roomCode, { debug: 1 });
    peer.on("open", (id) => {
      clearTimeout(openTimer);
      becomeHost(id);
      showRoomCodeHud(roomCode);
      mStatus("الغرفة جاهزة — الرمز ظاهر أعلى اليسار 👈");
    });
    peer.on("error", (e) => {
      if (e.type === "unavailable-id" && attempt < 6) { try { peer.destroy(); } catch (_) {} startHost(attempt + 1, genCode()); }
      else mStatus("خطأ: " + e.type, true);
    });
  }
  function becomeHost(id) {
    myId = id; isHost = true; online = true;
    peer.on("connection", onHostConnection);
    beginPlay("host");
  }
  function onHostConnection(conn) {
    conn.on("data", (d) => handleHostMsg(conn.peer, d));
    conn.on("close", () => {
      const r = remotes.get(conn.peer); remotes.delete(conn.peer); clientConns.delete(conn.peer);
      if (r) { const t = "👋 " + r.name + " غادر"; notify(t); hostBroadcast({ t: "notify", text: t }); }
    });
    conn.on("open", () => {
      clientConns.set(conn.peer, conn);
      const nm = (conn.metadata && conn.metadata.name) || "لاعب";
      const r = remotes.get(conn.peer) || { id: conn.peer, color: colorForId(conn.peer) }; r.name = nm; remotes.set(conn.peer, r);
      try { conn.send(worldMsg()); conn.send(itemsMsg()); } catch (_) {}
      const txt = "👋 " + nm + " انضم"; notify(txt); hostBroadcast({ t: "notify", text: txt }, conn.peer);
    });
  }

  // ---- الانضمام (عميل) ----
  window.doJoin = function () {
    const s = document.getElementById("join-status"); s.classList.remove("error");
    if (!peerLoaded()) { s.classList.add("error"); s.textContent = "تعذّر تحميل PeerJS"; return; }
    const code = (document.getElementById("join-code-input").value || "").trim().toUpperCase();
    if (!code) { s.classList.add("error"); s.textContent = "الصق رمز الغرفة"; return; }
    setName();
    joinRoom(code, s);
  };
  function joinRoom(code, statusEl) {
    const setS = (txt, err) => { statusEl.classList.toggle("error", !!err); statusEl.textContent = txt; };
    setS("جارٍ الاتصال…");
    armTimeout(setS);
    peer = new Peer({ debug: 1 });
    peer.on("open", () => {
      myId = peer.id;
      const conn = peer.connect(PEER_PREFIX + code, { metadata: { name: playerName }, reliable: true });
      conn.on("data", (d) => handleClientMsg(d));
      conn.on("open", () => {
        clearTimeout(openTimer);
        hostConn = conn; isHost = false; online = true;
        setS("متصل ✓");
        beginPlay("client");
        netSend({ t: "hello", name: playerName });
      });
      conn.on("close", () => { if (online) { notify("انقطع الاتصال بالمضيف"); backToMenu(); } });
    });
    peer.on("error", (e) => {
      setS(e.type === "peer-unavailable" ? "الغرفة غير موجودة" : "خطأ: " + e.type, true);
    });
  }

  function backToMenu() {
    online = false; isHost = false; state = "menu"; remotes.clear(); hostConn = null; clientConns.clear();
    hideRoomCodeHud();
    try { if (peer) peer.destroy(); } catch (_) {}
    document.getElementById("start-screen").classList.remove("hidden");
    document.getElementById("chat-bar").classList.add("hidden");
  }

  // ---- الإرسال / البثّ ----
  function netSend(msg) {
    if (!online) return;
    if (isHost) handleHostMsg(myId, msg);
    else if (hostConn && hostConn.open) { try { hostConn.send(msg); } catch (_) {} }
  }
  function hostBroadcast(msg, exceptId) {
    for (const [id, c] of clientConns) if (id !== exceptId && c.open) { try { c.send(msg); } catch (_) {} }
  }
  function netTick() {
    if (isHost) {
      hostBroadcast(snakesMsg());
      if ((++netItemsCounter) % 4 === 0) hostBroadcast(itemsMsg());
    } else netSend(myStateMsg());
  }

  // ---- رسائل ----
  function worldMsg() { return { t: "world", mapShape, mapTri, obstacles, dangers, level: gameLevel }; }
  function itemsMsg() {
    return {
      t: "items",
      foods: foods.map((f) => ({ id: f.id, x: +f.x.toFixed(2), y: +f.y.toFixed(2), value: f.value })),
      powerups: powerups.map((p) => ({ id: p.id, x: +p.x.toFixed(2), y: +p.y.toFixed(2), type: p.type })),
    };
  }
  function bodyMsg() { return bodyPositions().map((b) => ({ x: +b.x.toFixed(2), y: +b.y.toFixed(2), v: b.value })); }
  function selfEntry() { return { id: myId, name: playerName, x: +snake.x.toFixed(2), y: +snake.y.toFixed(2), angle: snake.angle, head: headValue(), boosting: snake.boosting, score: score(), body: bodyMsg() }; }
  function myStateMsg() { return { t: "state", name: playerName, x: +snake.x.toFixed(2), y: +snake.y.toFixed(2), angle: +snake.angle.toFixed(3), head: headValue(), boosting: snake.boosting, score: score(), body: bodyMsg() }; }
  function snakesMsg() {
    const list = [];
    if (state === "playing") list.push(selfEntry()); // المضيف الميت لا يُرسَل
    for (const r of remotes.values()) list.push({ id: r.id, name: r.name, x: r.x, y: r.y, angle: r.angle, head: r.head, boosting: r.boosting, score: r.score, body: r.body });
    return { t: "snakes", list };
  }

  // ---- استقبال (المضيف) ----
  function handleHostMsg(fromId, msg) {
    switch (msg.t) {
      case "hello": { const r = remotes.get(fromId) || { id: fromId, color: colorForId(fromId) }; r.name = msg.name || r.name || "لاعب"; remotes.set(fromId, r); break; }
      case "state": { const r = remotes.get(fromId) || { id: fromId, color: colorForId(fromId) }; r.id = fromId; r.name = msg.name || r.name; r.x = msg.x; r.y = msg.y; r.angle = msg.angle; r.head = msg.head; r.boosting = msg.boosting; r.score = msg.score; r.body = msg.body; r.seen = now; remotes.set(fromId, r); break; }
      case "eat": { const i = foods.findIndex((f) => f.id === msg.id); if (i >= 0) foods[i] = spawnFood(); break; }
      case "eatpu": { const i = powerups.findIndex((p) => p.id === msg.id); if (i >= 0) powerups[i] = spawnPowerup(); break; }
      case "drop": foods.push(looseFood(msg.x, msg.y, msg.v)); break;
      case "cut": {
        if (msg.target === myId) applyCut(msg.index);
        else { const c = clientConns.get(msg.target); if (c && c.open) { try { c.send({ t: "cut", index: msg.index }); } catch (_) {} } }
        break;
      }
      case "emoji": { const r = remotes.get(fromId); if (r) { r.emojiEm = msg.em; r.emojiLife = 2; } hostBroadcast({ t: "emoji", id: fromId, em: msg.em }, fromId); break; }
      case "dead": { remotes.delete(fromId); hostBroadcast({ t: "left", id: fromId }); break; }
    }
  }

  // ---- استقبال (العميل) ----
  function handleClientMsg(msg) {
    switch (msg.t) {
      case "world": mapShape = msg.mapShape; mapTri = msg.mapTri; obstacles = msg.obstacles || []; dangers = msg.dangers || []; gameLevel = msg.level || 1; document.getElementById("level").textContent = gameLevel; break;
      case "items": foods = (msg.foods || []).map((f) => ({ id: f.id, x: f.x, y: f.y, value: f.value, size: sizeForValue(f.value), vx: 0, vy: 0 })); powerups = (msg.powerups || []).map((p) => ({ id: p.id, x: p.x, y: p.y, type: p.type, size: CONFIG.BASE_SIZE * 2.0 })); break;
      case "snakes": applySnakes(msg.list || []); break;
      case "notify": notify(msg.text); break;
      case "emoji": { if (msg.id === myId) break; const r = remotes.get(msg.id); if (r) { r.emojiEm = msg.em; r.emojiLife = 2; } break; }
      case "medal": medal.level = msg.level; medal.leaderId = msg.leaderId; medal.leaderName = msg.leaderName; updateMedalBadge(); break;
      case "win": winGame(msg.name, msg.id); break;
      case "cut": applyCut(msg.index); break;
      case "left": remotes.delete(msg.id); break;
      case "denied": { const s = document.getElementById("join-status"); s.classList.add("error"); s.textContent = "كلمة السر غير صحيحة"; backToMenu(); break; }
    }
  }
  function applySnakes(list) {
    const ids = new Set();
    for (const e of list) {
      if (e.id === myId) continue;
      ids.add(e.id);
      const r = remotes.get(e.id) || { color: colorForId(e.id) };
      r.id = e.id; r.name = e.name; r.x = e.x; r.y = e.y; r.angle = e.angle; r.head = e.head; r.boosting = e.boosting; r.score = e.score; r.body = e.body; r.seen = now;
      remotes.set(e.id, r);
    }
    for (const id of [...remotes.keys()]) if (!ids.has(id)) remotes.delete(id);
  }

  // =====================================================================
  // الحلقة
  // =====================================================================
  function loop(t) {
    const dt = Math.min((t - lastT) / 1000, 0.05); lastT = t; now += dt;
    if (state === "playing") update(dt);
    else {
      updateParticles(dt); updateEmojis(dt);
      // المضيف يواصل توزيع العالم حتى لو مات ثعبانه حتى لا يتجمّد العملاء
      if (isHost && online) { lastNetSend += dt; if (lastNetSend >= 0.05) { lastNetSend = 0; hostBroadcast(snakesMsg()); if ((++netItemsCounter) % 4 === 0) hostBroadcast(itemsMsg()); } }
    }
    if (state !== "menu") render();
    requestAnimationFrame(loop);
  }

  document.getElementById("play-btn").addEventListener("click", startGame);
  document.getElementById("restart-btn").addEventListener("click", () => { restart(); });
  document.getElementById("win-restart-btn").addEventListener("click", () => { restart(); });
  document.getElementById("room-code-hud-copy").addEventListener("click", () => { copyText(document.getElementById("room-code-hud-val").textContent); });
  try { const sv = localStorage.getItem("snake2048_name"); if (sv) document.getElementById("name-input").value = sv; } catch (e) {}

  gameLevel = 1; resetSnake(); initItems(); updateCamera(0, 0);
  document.getElementById("highscore").textContent = fmtNum(highScore);
  requestAnimationFrame((t) => { lastT = t; loop(t); });
})();
