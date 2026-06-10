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
    BASE_SIZE: 1.0, SIZE_GROWTH: 0.045, CUBE_H: 0.62,
    SEG_GAP: 1.18, SPEED: 8.5, TURN_RATE: 6.8,  // >1 = فجوة صغيرة بين المكعبات (خلف بعضها لا فوقها)

    SPEEDCUBE_MULT: 2.0, SPEEDCUBE_TIME: 3.0, RADAR_TIME: 8.0,
    MAGNET_TIME: 7.0, MAGNET_RANGE: 13, MAGNET_PULL: 17,
    BOOST_MULT: 1.5, BOOST_DRAIN: 0.25, BOOST_REFILL: 0.10,
    STAMINA_DELAY: 0.4,    // تأخير قبل إعادة الملء بعد النفاد
    STAMINA_RECOVER: 0.35, // يجب بلوغ هذا القدر قبل السماح بالاندفاع ثانيةً

    FOOD_COUNT: 95, POWERUP_COUNT: 8,
    MOVING_FOOD_RATIO: 0.18,      // نسبة الطعام المتحرك
    DANGER_SEVER_INTERVAL: 0.5,   // كل نصف ثانية يسقط آخر مكعب داخل منطقة الخطر

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
    radar:  { color: "#2ee6a6", label: "📡", glow: "#2ee6a6" },
    magnet: { color: "#b06bff", label: "🧲", glow: "#b06bff" },
  };
  const POWERUP_WEIGHTS = [{ t: "speed", w: 38 }, { t: "double", w: 24 }, { t: "half", w: 16 }, { t: "radar", w: 12 }, { t: "magnet", w: 12 }];

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
    // تكبير الكاميرا حسب حجم الشاشة (الهاتف يرى مساحة مناسبة)
    CONFIG.SCALE = Math.max(17, Math.min(27, Math.min(W, H) / 22));
  }
  addEventListener("resize", resize); resize();

  // =====================================================================
  // أدوات
  // =====================================================================
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const log2 = (v) => Math.log(v) / Math.LN2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const sfx = (n) => { try { if (window.Sound) Sound.play(n); } catch (e) {} }; // مؤثّر صوتي آمن
  let wasBoosting = false; // لتشغيل صوت الاندفاع عند بدايته فقط
  let hapticsOn = true; try { hapticsOn = localStorage.getItem("snake2048_haptics") !== "0"; } catch (e) {}
  let lowGfx = false; try { lowGfx = localStorage.getItem("snake2048_lowgfx") === "1"; } catch (e) {}
  const vibrate = (ms) => { try { if (hapticsOn && window.Sound) Sound.vibrate(ms); } catch (e) {} };
  // إحصائيات اللاعب الدائمة + الإنجازات + شريط القتل
  let maxReign = 0, killFeed = [];
  let stats = { games: 0, kills: 0, playSec: 0, cups: 0, best: 0, reign: 0, ach: {} };
  try { const s = JSON.parse(localStorage.getItem("snake2048_stats")); if (s) stats = Object.assign(stats, s); } catch (e) {}
  function saveStats() { try { localStorage.setItem("snake2048_stats", JSON.stringify(stats)); } catch (e) {} }
  function normAngle(d) { // تطبيع زاوية إلى [-π,π] بأمان (يتحمّل Infinity/NaN ولا يدور أبداً)
    if (!isFinite(d)) return 0;
    d = d % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }
  function angleLerp(a, target, maxStep) {
    const d = clamp(normAngle(target - a), -maxStep, maxStep);
    return a + d;
  }
  const sizeForValue = (v) => clamp(CONFIG.BASE_SIZE * (0.9 + CONFIG.SIZE_GROWTH * (log2(v) - 1)), 0.85, 2.6);
  // اختصار الأرقام الكبيرة حتى لا تخرج من المكعب (K/M/B/T...)
  function fmtNum(v) {
    if (v < 1000) return "" + v;
    const units = ["K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc", "UDc", "DDc", "TDc", "QaDc", "QiDc", "SxDc", "SpDc", "OcDc", "NoDc", "Vg", "UVg", "DVg", "TVg", "QaVg", "QiVg", "SxVg", "SpVg", "OcVg", "NoVg", "Tg", "UTg", "DTg", "TTg", "QaTg", "QiTg", "SxTg", "SpTg", "OcTg", "NoTg", "Qd"];
    let n = v, i = -1;
    while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
    let s = n < 10 ? n.toFixed(1) : Math.round(n).toString();
    return s.replace(/\.0$/, "") + units[i];
  }
  // ألوان المكعبات (Neon Cyberpunk): وجه علوي داكن + توهّج/نص نيون
  const BLOCK_COLORS = {
    2:    { top: "#141428", side1: "#0e1a30", side2: "#0a2440", text: "#00D4FF", glow: "#00D4FF" },
    4:    { top: "#0f2418", side1: "#0c2e1a", side2: "#0a3a24", text: "#00FF88", glow: "#00FF88" },
    8:    { top: "#2a1414", side1: "#3a1212", side2: "#4a0f0f", text: "#FF8A8A", glow: "#FF3030" },
    16:   { top: "#2a2410", side1: "#3a3010", side2: "#4a380c", text: "#FFB347", glow: "#F39C12" },
    32:   { top: "#141a2e", side1: "#10233e", side2: "#0c2a4a", text: "#7EB8FF", glow: "#3498DB" },
    64:   { top: "#241024", side1: "#34103a", side2: "#400f4a", text: "#DA70D6", glow: "#9B59B6" },
    128:  { top: "#242414", side1: "#343410", side2: "#44440c", text: "#FFE34D", glow: "#F1C40F" },
    256:  { top: "#102a2a", side1: "#0e3a3a", side2: "#0a4a4a", text: "#5FF0E0", glow: "#1ABC9C" },
    512:  { top: "#2a1020", side1: "#3a0e2c", side2: "#4a0a38", text: "#FF7AB8", glow: "#FF006E" },
    1024: { top: "#1a1030", side1: "#220e44", side2: "#2c0a58", text: "#B388FF", glow: "#7C4DFF" },
    2048: { top: "#2a2008", side1: "#3a2c06", side2: "#4a3804", text: "#FFD23F", glow: "#FFC107" },
    4096: { top: "#0a2a1a", side1: "#083a22", side2: "#064a2c", text: "#6BFFB0", glow: "#00FF88" },
  };
  function blockStyle(v) {
    if (BLOCK_COLORS[v]) return BLOCK_COLORS[v];
    // توليد لوني للأرقام الأكبر حسب الأُس
    const e = Math.round(log2(v)), hue = (e * 38) % 360;
    return {
      top: `hsl(${hue},45%,12%)`, side1: `hsl(${hue},50%,10%)`, side2: `hsl(${hue},55%,8%)`,
      text: `hsl(${hue},100%,72%)`, glow: `hsl(${hue},100%,60%)`,
    };
  }
  const colorForValue = (v) => blockStyle(v).glow; // لون الجسيمات
  let blockShape = "cube"; // cube | sphere | cylinder | gem
  try { blockShape = localStorage.getItem("snake2048_shape") || "cube"; } catch (e) {}
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgb(${clamp(Math.round(r * f), 0, 255)},${clamp(Math.round(g * f), 0, 255)},${clamp(Math.round(b * f), 0, 255)})`;
  }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

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
  // مسار مضلّع بحواف دائرية (ناعمة) عبر arcTo
  function traceRounded(pts, r) {
    const n = pts.length;
    ctx.beginPath();
    ctx.moveTo((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
    for (let i = 0; i < n; i++) {
      const cur = pts[(i + 1) % n], nx = pts[(i + 2) % n];
      ctx.arcTo(cur.x, cur.y, (cur.x + nx.x) / 2, (cur.y + nx.y) / 2, r);
    }
    ctx.closePath();
  }

  // رقم واضح + ظل أرضي مشتركان لكل الأشكال
  function drawNum(cx, cy, label, fs) {
    ctx.font = `800 ${fs}px "Orbitron","Rajdhani",sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, fs * 0.24); ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.strokeText(label, cx, cy);
    ctx.fillStyle = "#F2FAFF"; ctx.fillText(label, cx, cy);
  }
  function groundShadow(wx, wy, sizeW, ch) {
    ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = "#000";
    const sh = project(wx, wy);
    ctx.beginPath();
    ctx.ellipse(sh.x, sh.y + ch * 0.7, sizeW * 0.5 * CONFIG.SCALE * 1.25, sizeW * 0.5 * CONFIG.SCALE * 0.6, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.restore();
  }
  const numF = (label) => label.length > 4 ? 0.30 : label.length > 3 ? 0.36 : 0.46;

  function drawCube(wx, wy, sizeW, value) {
    if (blockShape === "sphere") return drawSphere(wx, wy, sizeW, value);
    if (blockShape === "cylinder") return drawCylinder(wx, wy, sizeW, value);
    if (blockShape === "gem") return drawGem(wx, wy, sizeW, value);
    if (blockShape === "hex") return drawPrism(wx, wy, sizeW, value, 6);
    if (blockShape === "pyramid") return drawPyramid(wx, wy, sizeW, value);
    if (blockShape === "star") return drawStar(wx, wy, sizeW, value);
    const st = blockStyle(value), half = sizeW / 2;
    const t1 = project(wx - half, wy - half), t2 = project(wx + half, wy - half);
    const t3 = project(wx + half, wy + half), t4 = project(wx - half, wy + half);
    const ch = sizeW * CONFIG.SCALE * CONFIG.CUBE_H;
    const b2 = { x: t2.x, y: t2.y + ch }, b3 = { x: t3.x, y: t3.y + ch }, b4 = { x: t4.x, y: t4.y + ch };
    const r = clamp(sizeW * CONFIG.SCALE * 0.16, 3, 9); // نصف قطر الحواف
    const cx = (t1.x + t2.x + t3.x + t4.x) / 4, cy = (t1.y + t2.y + t3.y + t4.y) / 4;

    // ظل أرضي
    ctx.save();
    ctx.globalAlpha = 0.45; ctx.fillStyle = "#000";
    const sh = project(wx, wy);
    ctx.beginPath();
    ctx.ellipse(sh.x, sh.y + ch * 0.7, half * CONFIG.SCALE * 1.25, half * CONFIG.SCALE * 0.6, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.restore();

    ctx.lineJoin = "round"; ctx.lineCap = "round";

    // الوجهان الجانبيان (تعبئة كاملة لتفادي الفراغات)
    ctx.fillStyle = st.side1; quad(t2, t3, b3, b2);
    ctx.fillStyle = st.side2; quad(t4, t3, b3, b4);

    // الوجه العلوي بحواف ناعمة + تدرّج
    const grad = ctx.createLinearGradient(t1.x, t1.y, t3.x, t3.y);
    grad.addColorStop(0, st.top); grad.addColorStop(1, st.side1);
    ctx.fillStyle = grad; traceRounded([t1, t2, t3, t4], r); ctx.fill();
    // انعكاس ضوء
    ctx.fillStyle = "rgba(255,255,255,0.09)";
    quad(t1, mid(t1, t2, 0.45), mid(t1, t3, 0.32), mid(t1, t4, 0.45));

    // الصورة الظلّية الخارجية بحواف ناعمة + توهّج نيون
    ctx.save();
    ctx.shadowColor = st.glow; ctx.shadowBlur = 9;
    ctx.strokeStyle = st.glow; ctx.lineWidth = 1.8;
    traceRounded([t1, t2, b2, b3, b4, t4], r); ctx.stroke();
    ctx.restore();
    // حدّ الوجه العلوي
    ctx.strokeStyle = hexA(st.glow, 0.85); ctx.lineWidth = 1.4;
    traceRounded([t1, t2, t3, t4], r); ctx.stroke();

    // الرقم — واضح وحادّ
    drawNum(cx, cy, fmtNum(value), Math.max(11, sizeW * CONFIG.SCALE * numF(fmtNum(value))));
  }

  // كرة
  function drawSphere(wx, wy, sizeW, value) {
    const st = blockStyle(value), c = project(wx, wy);
    const rad = sizeW * CONFIG.SCALE * 0.62, cy = c.y - rad * 0.55;
    groundShadow(wx, wy, sizeW, rad);
    ctx.fillStyle = st.top; ctx.beginPath(); ctx.arc(c.x, cy, rad, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(c.x - rad * 0.35, cy - rad * 0.4, rad * 0.1, c.x, cy, rad);
    g.addColorStop(0, "rgba(255,255,255,0.35)"); g.addColorStop(0.5, "rgba(255,255,255,0.05)"); g.addColorStop(1, "rgba(0,0,0,0.25)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, cy, rad, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.shadowColor = st.glow; ctx.shadowBlur = 10; ctx.strokeStyle = st.glow; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(c.x, cy, rad, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    drawNum(c.x, cy, fmtNum(value), Math.max(11, rad * 0.9 * numF(fmtNum(value)) * 2.0));
  }
  // أسطوانة (قرص)
  function drawCylinder(wx, wy, sizeW, value) {
    const st = blockStyle(value), c = project(wx, wy);
    const rx = sizeW * CONFIG.SCALE * 0.62, ry = rx * 0.5, ch = sizeW * CONFIG.SCALE * 0.7, topY = c.y - ch;
    groundShadow(wx, wy, sizeW, ch * 1.2);
    ctx.fillStyle = st.side2; ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = st.side1; ctx.fillRect(c.x - rx, topY, rx * 2, ch);
    ctx.fillStyle = st.side2; ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = st.top; ctx.beginPath(); ctx.ellipse(c.x, topY, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.shadowColor = st.glow; ctx.shadowBlur = 9; ctx.strokeStyle = st.glow; ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.ellipse(c.x, topY, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c.x - rx, topY); ctx.lineTo(c.x - rx, c.y); ctx.moveTo(c.x + rx, topY); ctx.lineTo(c.x + rx, c.y); ctx.stroke();
    ctx.restore();
    drawNum(c.x, topY, fmtNum(value), Math.max(11, sizeW * CONFIG.SCALE * numF(fmtNum(value))));
  }
  // جوهرة (معيّن)
  function drawGem(wx, wy, sizeW, value) {
    const st = blockStyle(value), c = project(wx, wy);
    const w = sizeW * CONFIG.SCALE * 0.7, h = sizeW * CONFIG.SCALE * 0.85, cy = c.y - h * 0.55;
    const top = { x: c.x, y: cy - h }, rt = { x: c.x + w, y: cy }, bot = { x: c.x, y: cy + h }, lf = { x: c.x - w, y: cy };
    groundShadow(wx, wy, sizeW, h);
    ctx.fillStyle = st.side2; ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(lf.x, lf.y); ctx.lineTo(bot.x, bot.y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = st.top; ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(rt.x, rt.y); ctx.lineTo(bot.x, bot.y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(rt.x, rt.y); ctx.lineTo(c.x, cy); ctx.lineTo(lf.x, lf.y); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.shadowColor = st.glow; ctx.shadowBlur = 9; ctx.strokeStyle = st.glow; ctx.lineWidth = 1.8; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(rt.x, rt.y); ctx.lineTo(bot.x, bot.y); ctx.lineTo(lf.x, lf.y); ctx.closePath(); ctx.stroke(); ctx.restore();
    drawNum(c.x, cy, fmtNum(value), Math.max(11, sizeW * CONFIG.SCALE * numF(fmtNum(value))));
  }

  // منشور سداسي/متعدّد الأضلاع
  function drawPrism(wx, wy, sizeW, value, sides) {
    const st = blockStyle(value), c = project(wx, wy);
    const rx = sizeW * CONFIG.SCALE * 0.6, ry = rx * 0.5, ch = sizeW * CONFIG.SCALE * 0.7, topY = c.y - ch;
    const pt = (cy2, i) => ({ x: c.x + Math.cos(-Math.PI / 2 + i * Math.PI * 2 / sides) * rx, y: cy2 + Math.sin(-Math.PI / 2 + i * Math.PI * 2 / sides) * ry });
    groundShadow(wx, wy, sizeW, ch * 1.2);
    // أوجه جانبية
    for (let i = 0; i < sides; i++) {
      const a = pt(c.y, i), b = pt(c.y, (i + 1) % sides), ta = pt(topY, i), tb = pt(topY, (i + 1) % sides);
      if ((a.y + b.y) / 2 < c.y - 0.5) continue; // الأمامية فقط
      ctx.fillStyle = i % 2 ? st.side1 : st.side2; quad(a, b, tb, ta);
    }
    // الوجه العلوي
    ctx.fillStyle = st.top; ctx.beginPath();
    for (let i = 0; i < sides; i++) { const p = pt(topY, i); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } ctx.closePath(); ctx.fill();
    ctx.save(); ctx.shadowColor = st.glow; ctx.shadowBlur = 9; ctx.strokeStyle = st.glow; ctx.lineWidth = 1.7; ctx.lineJoin = "round";
    ctx.beginPath(); for (let i = 0; i < sides; i++) { const p = pt(topY, i); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } ctx.closePath(); ctx.stroke(); ctx.restore();
    drawNum(c.x, topY, fmtNum(value), Math.max(11, sizeW * CONFIG.SCALE * numF(fmtNum(value))));
  }
  // هرم
  function drawPyramid(wx, wy, sizeW, value) {
    const st = blockStyle(value), c = project(wx, wy);
    const half = sizeW * CONFIG.SCALE * 0.62, ch = sizeW * CONFIG.SCALE * 0.95;
    const b1 = project(wx - sizeW / 2, wy - sizeW / 2), b2 = project(wx + sizeW / 2, wy - sizeW / 2), b3 = project(wx + sizeW / 2, wy + sizeW / 2), b4 = project(wx - sizeW / 2, wy + sizeW / 2);
    const apex = { x: c.x, y: c.y - ch };
    groundShadow(wx, wy, sizeW, ch * 0.5);
    ctx.lineJoin = "round";
    ctx.fillStyle = st.side2; ctx.beginPath(); ctx.moveTo(b4.x, b4.y); ctx.lineTo(b3.x, b3.y); ctx.lineTo(apex.x, apex.y); ctx.closePath(); ctx.fill(); // أمامي
    ctx.fillStyle = st.side1; ctx.beginPath(); ctx.moveTo(b2.x, b2.y); ctx.lineTo(b3.x, b3.y); ctx.lineTo(apex.x, apex.y); ctx.closePath(); ctx.fill(); // يمين
    ctx.save(); ctx.shadowColor = st.glow; ctx.shadowBlur = 9; ctx.strokeStyle = st.glow; ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.moveTo(b4.x, b4.y); ctx.lineTo(b3.x, b3.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(apex.x, apex.y); ctx.lineTo(b4.x, b4.y); ctx.lineTo(apex.x, apex.y); ctx.lineTo(b3.x, b3.y); ctx.stroke(); ctx.restore();
    drawNum(c.x, c.y - ch * 0.35, fmtNum(value), Math.max(10, sizeW * CONFIG.SCALE * numF(fmtNum(value)) * 0.85));
  }
  // نجمة
  function drawStar(wx, wy, sizeW, value) {
    const st = blockStyle(value), c = project(wx, wy);
    const R = sizeW * CONFIG.SCALE * 0.72, rIn = R * 0.45, cy = c.y - R * 0.5;
    groundShadow(wx, wy, sizeW, R);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? rIn : R, a = -Math.PI / 2 + i * Math.PI / 5;
      const x = c.x + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.85;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = st.top; ctx.fill();
    ctx.save(); ctx.shadowColor = st.glow; ctx.shadowBlur = 10; ctx.strokeStyle = st.glow; ctx.lineWidth = 1.8; ctx.lineJoin = "round"; ctx.stroke(); ctx.restore();
    drawNum(c.x, cy, fmtNum(value), Math.max(10, sizeW * CONFIG.SCALE * numF(fmtNum(value)) * 0.8));
  }

  function drawCard(wx, wy, sizeW, type) {
    const pu = POWERUPS[type], half = sizeW / 2;
    const a = project(wx - half, wy - half), b = project(wx + half, wy - half);
    const c = project(wx + half, wy + half), d = project(wx - half, wy + half);
    const cx = (a.x + b.x + c.x + d.x) / 4, cy = (a.y + b.y + c.y + d.y) / 4;
    const pulse = 0.5 + 0.5 * Math.sin(now * 3 + wx);

    // شعاع ضوء يصعد من البطاقة
    ctx.save();
    const beamH = sizeW * CONFIG.SCALE * 1.7;
    const bg = ctx.createLinearGradient(cx, cy, cx, cy - beamH);
    bg.addColorStop(0, hexA(pu.glow, 0.30 * (0.6 + pulse * 0.4))); bg.addColorStop(1, hexA(pu.glow, 0));
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.moveTo(cx - 9, cy); ctx.lineTo(cx + 9, cy); ctx.lineTo(cx + 3, cy - beamH); ctx.lineTo(cx - 3, cy - beamH); ctx.closePath(); ctx.fill();
    ctx.restore();

    // البطاقة + توهّج نابض
    ctx.save(); ctx.shadowColor = pu.glow; ctx.shadowBlur = 16 + pulse * 14;
    ctx.fillStyle = shade(pu.color, 0.5); quad(a, b, c, d);
    const k = 0.16; ctx.fillStyle = pu.color;
    quad(mid(a, c, k), mid(b, d, k), mid(c, a, k), mid(d, b, k));
    ctx.restore();
    ctx.strokeStyle = hexA("#ffffff", 0.4); ctx.lineWidth = 1.5;
    strokePath([mid(a, c, 0.30), mid(b, d, 0.30), mid(c, a, 0.30), mid(d, b, 0.30)], true);

    // الرمز
    const fs = sizeW * CONFIG.SCALE * 0.42;
    ctx.font = `700 ${fs}px "Orbitron", "Rajdhani", sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.strokeText(pu.label, cx, cy);
    ctx.save(); ctx.shadowColor = pu.glow; ctx.shadowBlur = 8; ctx.fillStyle = "#fff"; ctx.fillText(pu.label, cx, cy); ctx.restore();
  }

  function drawBox(cx, cy, hw, hh, height, color) {
    // القاعدة = حدود التصادم (الخط السفلي الخارجي)
    const b1 = project(cx - hw, cy - hh), b2 = project(cx + hw, cy - hh);
    const b3 = project(cx + hw, cy + hh), b4 = project(cx - hw, cy + hh);
    const ch = height * CONFIG.SCALE * 0.5;
    const up = (p) => ({ x: p.x, y: p.y - ch });
    const T1 = up(b1), T2 = up(b2), T3 = up(b3), T4 = up(b4); // الوجه العلوي مرتفع
    const r = 7, edge = "#4ac8ff";
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    // أوجه شبه شفافة ترتفع من القاعدة (ترى ما خلفها)
    ctx.save(); ctx.globalAlpha = 0.5;
    ctx.fillStyle = shade(color, 0.62); quad(b2, b3, T3, T2); // أمامي‑أيمن
    ctx.fillStyle = shade(color, 0.45); quad(b4, b3, T3, T4); // أمامي‑أيسر
    ctx.fillStyle = color; traceRounded([T1, T2, T3, T4], r); ctx.fill(); // علوي
    ctx.restore();
    // صورة ظلّية خارجية متوهّجة: القاعدة الأمامية ثم الأعلى
    ctx.save();
    ctx.shadowColor = hexA(edge, 0.7); ctx.shadowBlur = 8;
    ctx.strokeStyle = hexA(edge, 0.85); ctx.lineWidth = 1.7;
    traceRounded([b4, b3, b2, T2, T1, T4], r); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = hexA(edge, 0.7); ctx.lineWidth = 1.4;
    traceRounded([T1, T2, T3, T4], r); ctx.stroke(); // حدّ الأعلى
    // خط القاعدة الأمامي (الحدود الخارجية)
    ctx.strokeStyle = hexA(edge, 0.45); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(b4.x, b4.y); ctx.lineTo(b3.x, b3.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
  }
  function drawObstacle(o) {
    if (o.kind === "cyl") drawPillar(o.x, o.y, Math.min(o.hw, o.hh), o.h, o.color, 0);
    else if (o.kind === "hex") drawPillar(o.x, o.y, Math.min(o.hw, o.hh), o.h, o.color, 6);
    else drawBox(o.x, o.y, o.hw, o.hh, o.h, o.color);
  }
  // عمود (أسطواني sides=0 أو متعدّد الأضلاع) يرتفع من القاعدة، شبه شفاف
  function drawPillar(cx, cy, rad, height, color, sides) {
    const c = project(cx, cy), edge = "#4ac8ff";
    const rx = rad * CONFIG.SCALE, ry = rx * 0.5, ch = height * CONFIG.SCALE * 0.5, topY = c.y - ch;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    if (sides === 0) {
      ctx.save(); ctx.globalAlpha = 0.5;
      ctx.fillStyle = shade(color, 0.5); ctx.fillRect(c.x - rx, topY, rx * 2, ch);
      ctx.fillStyle = shade(color, 0.62); ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(c.x, topY, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.shadowColor = hexA(edge, 0.7); ctx.shadowBlur = 8; ctx.strokeStyle = hexA(edge, 0.85); ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.ellipse(c.x, topY, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(c.x - rx, topY); ctx.lineTo(c.x - rx, c.y); ctx.moveTo(c.x + rx, topY); ctx.lineTo(c.x + rx, c.y); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI); ctx.stroke(); ctx.restore();
    } else {
      const pt = (cy2, i) => ({ x: c.x + Math.cos(-Math.PI / 2 + i * Math.PI * 2 / sides) * rx, y: cy2 + Math.sin(-Math.PI / 2 + i * Math.PI * 2 / sides) * ry });
      ctx.save(); ctx.globalAlpha = 0.5;
      for (let i = 0; i < sides; i++) { const a = pt(c.y, i), b = pt(c.y, (i + 1) % sides), ta = pt(topY, i), tb = pt(topY, (i + 1) % sides); if ((a.y + b.y) / 2 < c.y - 0.5) continue; ctx.fillStyle = i % 2 ? shade(color, 0.5) : shade(color, 0.62); quad(a, b, tb, ta); }
      ctx.fillStyle = color; ctx.beginPath(); for (let i = 0; i < sides; i++) { const p = pt(topY, i); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.shadowColor = hexA(edge, 0.7); ctx.shadowBlur = 8; ctx.strokeStyle = hexA(edge, 0.85); ctx.lineWidth = 1.7; ctx.lineJoin = "round";
      ctx.beginPath(); for (let i = 0; i < sides; i++) { const p = pt(topY, i); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } ctx.closePath(); ctx.stroke(); ctx.restore();
    }
  }

  // =====================================================================
  // الثعبان
  // =====================================================================
  const snake = {
    x: 0, y: 0, angle: 0, values: [], path: [],
    speedTimer: 0, stamina: 1, boosting: false, exhausted: false, staminaDelay: 0, dangerTimer: 0, headDangerTimer: 0, charges: 0, radarTimer: 0, magnetTimer: 0,
  };
  let playerName = "أنت";

  function resetSnake() {
    snake.x = 0; snake.y = 0; snake.angle = 0;
    snake.values = CONFIG.START_SNAKE.slice().sort((a, b) => b - a);
    snake.path = [{ x: 0, y: 0 }];
    snake.speedTimer = 0; snake.stamina = 1; snake.boosting = false; snake.exhausted = false; snake.staminaDelay = 0;
    snake.dangerTimer = 0; snake.headDangerTimer = 0; snake.charges = 0; snake.radarTimer = 0; snake.magnetTimer = 0;
  }
  // دوال عامّة تعمل لأي ثعبان (لاعب أو بوت)
  function segDistOf(values) {
    const d = [0];
    for (let i = 1; i < values.length; i++) {
      const s1 = sizeForValue(values[i - 1]), s2 = sizeForValue(values[i]);
      d.push(d[i - 1] + ((s1 + s2) / 2) * CONFIG.SEG_GAP);
    }
    return d;
  }
  function pointAtOf(p, d) {
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
  function bodyOf(s) {
    return segDistOf(s.values).map((d, i) => {
      const pt = pointAtOf(s.path, d);
      return { x: pt.x, y: pt.y, value: s.values[i], size: sizeForValue(s.values[i]) };
    });
  }
  const segmentDistances = () => segDistOf(snake.values);
  const pointAtDistance = (d) => pointAtOf(snake.path, d);
  const bodyPositions = () => bodyOf(snake);
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
    for (const o of obstacles) {
      if (o.kind === "cyl" || o.kind === "hex") {
        if (Math.hypot(o.x - x, o.y - y) < Math.min(o.hw, o.hh) * 0.72 + margin) return true; // نصف القطر المرئي
      } else if (x > o.x - o.hw - margin && x < o.x + o.hw + margin && y > o.y - o.hh - margin && y < o.y + o.hh + margin) return true;
    }
    return false;
  }
  function inDanger(x, y) {
    for (const dz of dangers) if (Math.hypot(dz.x - x, dz.y - y) < dz.r) return true;
    for (const p of dangerProjectiles) if (Math.hypot(p.x - x, p.y - y) < p.r + 0.6) return true;
    return false;
  }
  // مناطق خطر متحرّكة (مقذوفات) تتولّد في المستويات المتقدّمة
  let dangerProjectiles = [], dprojTimer = 0;
  function updateDangerProjectiles(dt) {
    if (gameLevel >= 2 && dangers.length) {
      dprojTimer += dt;
      const interval = Math.max(0.7, 2.6 - gameLevel * 0.25);
      while (dprojTimer >= interval) {
        dprojTimer -= interval;
        const dz = dangers[(Math.random() * dangers.length) | 0];
        const a = rand(0, Math.PI * 2), sp = rand(9, 15);
        const turn = gameLevel >= 4 ? rand(-1.6, 1.6) : 0; // حلزوني في المستويات الأعلى
        dangerProjectiles.push({ x: dz.x, y: dz.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: rand(2.5, 4), turn, age: 0 });
      }
    }
    for (let i = dangerProjectiles.length - 1; i >= 0; i--) {
      const p = dangerProjectiles[i]; p.age += dt;
      if (p.turn) { const ang = Math.atan2(p.vy, p.vx) + p.turn * dt, s = Math.hypot(p.vx, p.vy); p.vx = Math.cos(ang) * s; p.vy = Math.sin(ang) * s; p.turn *= 0.985; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.age > 14 || Math.abs(p.x) > CONFIG.WORLD + 8 || Math.abs(p.y) > CONFIG.WORLD + 8) dangerProjectiles.splice(i, 1);
    }
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
    return { id: nextItemId++, x, y, value: Math.max(2, v), size: sizeForValue(Math.max(2, v)), vx: 0, vy: 0, noEat: now + 1.2, loose: true };
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
            obstacles.push({ x, y, hw: gap * 0.32, hh: gap * 0.32, h: 5.0, color: "#3a4a66", kind: "box" });
          }
        }
    } else {
      const count = 5 + Math.floor(Math.random() * 5);
      const KINDS = ["box", "cyl", "hex"];
      let tries = 0;
      while (obstacles.length < count && tries < 300) {
        tries++;
        const x = rand(-R * 0.8, R * 0.8), y = rand(-R * 0.8, R * 0.8);
        if (Math.hypot(x, y) < 18 || !inBounds(x, y)) continue;
        const kind = KINDS[(Math.random() * KINDS.length) | 0];
        let hw, hh;
        if (kind === "box") { const longish = Math.random() < 0.5, a = rand(3, 9), b = rand(3, 9); hw = longish ? a * 1.6 : a; hh = longish ? b : b * 1.6; }
        else { hw = hh = rand(4, 7); } // أعمدة دائرية/سداسية مربعة القاعدة
        let ok = true;
        for (const o of obstacles) if (Math.abs(o.x - x) < o.hw + hw + 4 && Math.abs(o.y - y) < o.hh + hh + 4) { ok = false; break; }
        if (ok) obstacles.push({ x, y, hw, hh, h: 5.0, color: "#3a4a66", kind });
      }
    }
    // مناطق خطر (تزيد مع المستوى) بأشكال مختلفة
    dangerProjectiles = []; dprojTimer = 0;
    const DSHAPES = ["circle", "square", "triangle"];
    const dz = 3 + gameLevel;
    for (let i = 0; i < dz; i++) {
      const x = rand(-R * 0.85, R * 0.85), y = rand(-R * 0.85, R * 0.85);
      if (Math.hypot(x, y) < 20 || !inBounds(x, y)) { i--; continue; }
      dangers.push({ x, y, r: rand(6, 11), shape: DSHAPES[(Math.random() * DSHAPES.length) | 0], rot: rand(0, Math.PI) });
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
    sfx("eat");
    snake.values.push(v); snake.values.sort((a, b) => b - a);
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < snake.values.length - 1; i++) {
        if (snake.values[i] === snake.values[i + 1]) {
          snake.values[i] *= 2; const nv = snake.values[i];
          snake.values.splice(i + 1, 1);
          snake.values.sort((a, b) => b - a);
          spawnMergeFx(nv); merged = true; break;
        }
      }
    }
  }
  function applyPowerup(type) {
    sfx("power");
    if (type === "speed") snake.speedTimer = CONFIG.SPEEDCUBE_TIME;
    else if (type === "radar") snake.radarTimer = CONFIG.RADAR_TIME;
    else if (type === "magnet") snake.magnetTimer = CONFIG.MAGNET_TIME;
    else if (type === "double") { snake.values = snake.values.map((v) => v * 2); }
    else if (type === "half") {
      snake.values = snake.values.map((v) => v / 2).filter((v) => v >= 2);
      snake.values.sort((a, b) => b - a);
      if (snake.values.length === 0) gameOver();
    }
  }
  // قطع آخر مكعب (لا يقتل؛ يتوقّف عند الرأس فقط)
  function severTailOne() {
    if (snake.values.length <= 1) return;
    const v = snake.values.pop();
    const dists = segmentDistances();
    const pt = pointAtDistance(dists[dists.length - 1] || 0);
    dropLoose(pt.x, pt.y, v);
    spawnBurst(pt.x, pt.y, "#ff5d73", 10);
  }
  // إسقاط مكعب ساكن: المضيف يضيفه مباشرة، العميل يطلب من المضيف
  function dropLoose(x, y, v) {
    if (authority()) {
      if (foods.length >= 240) { const i = foods.findIndex((f) => f.loose); foods.splice(i >= 0 ? i : 0, 1); } // حدّ أقصى يمنع التراكم والتجمّد
      foods.push(looseFood(x, y, v));
    } else netSend({ t: "drop", x, y, v });
  }

  // المراحل: تتقدّم فقط عبر نظام الميداليات (لا علاقة لأرقام المكعبات)
  let gameLevel = 1, mapRotation = 0;
  function advanceMap() {
    gameLevel++; mapRotation++;
    initItems(); // آمن لأنه يُستدعى من updateMedals قبل حلقات الأكل
    document.getElementById("level").textContent = gameLevel;
    const mt = "🗺️ " + t("mapNext") + " " + gameLevel;
    notify(mt);
    if (isHost) { hostBroadcast(worldMsg()); hostBroadcast(itemsMsg()); hostBroadcast({ t: "notify", text: mt }); }
  }

  // =====================================================================
  // مؤثرات (جسيمات)
  // =====================================================================
  let particles = [];
  function spawnBurst(x, y, color, n) {
    if (lowGfx) n = Math.max(2, Math.round(n * 0.4)); // جودة منخفضة = جسيمات أقل
    if (particles.length > 700) return; // سقف أمان: انفجار ضخم لا يُغرق المصفوف
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(8, 26);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), max: 0.7, color, size: rand(2, 5) });
    }
  }
  // حلقات توهّج + وميض شاشة + اهتزاز
  let rings = [], flash = 0, flashCol = "#ffffff", shake = 0;
  function spawnRing(x, y, color) { rings.push({ x, y, r: 0.3, life: 0.5, max: 0.5, color }); }
  function updateRings(dt) {
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.life -= dt; r.r += dt * 9; if (r.life <= 0) rings.splice(i, 1); }
    if (flash > 0) flash = Math.max(0, flash - dt * 1.6);
    if (shake > 0) shake = Math.max(0, shake - dt);
  }
  function drawRings() {
    for (const r of rings) {
      const p = project(r.x, r.y), a = clamp(r.life / r.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = a * 0.85; ctx.strokeStyle = r.color; ctx.lineWidth = 3;
      ctx.shadowColor = r.color; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 10, r.r * CONFIG.SCALE, r.r * CONFIG.SCALE * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke(); ctx.restore();
    }
  }
  function drawFlash() { if (flash > 0) { ctx.save(); ctx.globalAlpha = clamp(flash, 0, 0.5); ctx.fillStyle = flashCol; ctx.fillRect(0, 0, W, H); ctx.restore(); } }
  const shakeOffset = () => (shake > 0 ? { x: (Math.random() * 2 - 1) * shake * 18, y: (Math.random() * 2 - 1) * shake * 18 } : { x: 0, y: 0 });
  function spawnMergeFx(value) {
    sfx("merge");
    const glow = blockStyle(value || 4).glow;
    spawnBurst(snake.x, snake.y, glow, 16);
    spawnRing(snake.x, snake.y, glow);
    if (value >= 2048) { flashCol = "#ffffff"; flash = 0.35; } // وميض للأرقام الكبيرة
  }
  // ألعاب نارية لشاشة الفوز
  let fireT = 0;
  function fireworksTick(dt) {
    fireT -= dt;
    if (fireT <= 0) {
      fireT = rand(0.25, 0.6);
      const c = unproject(rand(W * 0.2, W * 0.8), rand(H * 0.2, H * 0.55));
      const col = ["#00D4FF", "#9B59B6", "#F39C12", "#FF006E", "#00FF88"][(Math.random() * 5) | 0];
      spawnBurst(c.x, c.y, col, 22); spawnRing(c.x, c.y, col);
    }
  }
  // أثر السرعة: خطوط انسيابية متوهّجة + شرارات من خلف الذيل (لأي ثعبان)
  function spawnTrailAt(tx, ty, angle, speedCube) {
    const col = speedCube ? "#ffb020" : "#19d3ff";
    const bx = -Math.cos(angle), by = -Math.sin(angle);
    for (let i = 0; i < 3; i++) {
      const spread = rand(-0.45, 0.45);
      particles.push({ x: tx - by * spread, y: ty + bx * spread, vx: bx * rand(6, 10) + rand(-1, 1), vy: by * rand(6, 10) + rand(-1, 1), life: rand(0.35, 0.6), max: 0.6, color: col, size: rand(2.5, 5), streak: true, glow: col, low: true });
    }
    if (Math.random() < 0.35) particles.push({ x: tx, y: ty, vx: bx * rand(4, 7), vy: by * rand(4, 7), life: 0.3, max: 0.3, color: "#ffffff", size: rand(2, 3.4), streak: true, glow: col, low: true });
  }
  const tailOf = (s) => { const b = bodyOf(s); return b[b.length - 1] || { x: s.x, y: s.y }; };
  function spawnBoostTrail() { const t = tailOf(snake); spawnTrailAt(t.x, t.y, snake.angle, snake.speedTimer > 0); }
  function spawnEatFx(x, y) { spawnBurst(x, y, "#bfe9ff", 6); }
  // تشظٍّ عند الموت: قطع أصغر تتطاير ثم تختفي دفعةً واحدة (تكسّر ومات)
  let debris = [];
  function spawnDebris(x, y, value) {
    for (let i = 0; i < 4; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(7, 16);
      debris.push({ x, y, value, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5, sz: rand(0.38, 0.6) });
    }
  }
  function updateDebris(dt) {
    for (let i = debris.length - 1; i >= 0; i--) { const d = debris[i]; d.life -= dt; if (d.life <= 0) { debris.splice(i, 1); continue; } d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= 0.86; d.vy *= 0.86; }
  }
  function drawDebris() { for (const d of debris) drawCube(d.x, d.y, sizeForValue(d.value) * d.sz, d.value); } // بلا تلاشٍ — تختفي فجأة
  function spawnDeathFx() {
    for (const s of bodyPositions()) { spawnBurst(s.x, s.y, colorForValue(s.value), 16); spawnDebris(s.x, s.y, s.value); } // يتكسّر ويتطاير ثم يختفي
    flashCol = "#FF3030"; flash = 0.45; shake = 0.55;
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92;
    }
  }
  function drawParticles(lowLayer) {
    ctx.save();
    for (const p of particles) {
      if (!!p.low !== !!lowLayer) continue; // طبقة منفصلة لشعاع السرعة (تحت المكعبات)
      const pr = project(p.x, p.y);
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      if (p.streak) {
        const back = project(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
        const yo = p.low ? 8 : -10; // تحت المكعب لأثر السرعة
        ctx.shadowColor = p.glow || p.color; ctx.shadowBlur = 12;
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(pr.x, pr.y + yo); ctx.lineTo(back.x, back.y + yo); ctx.stroke();
      } else {
        ctx.shadowBlur = 0; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(pr.x, pr.y - 10, p.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
  // نفّاثة توهّج خلف الذيل (تُرسم تحت المكعبات) لأي ثعبان
  function drawJetAt(tx, ty, angle, sizeW, speedCube) {
    const bx = -Math.cos(angle), by = -Math.sin(angle);
    const c = project(tx + bx * 1.0, ty + by * 1.0);
    const col = speedCube ? "255,176,32" : "25,211,255";
    const cy = c.y + sizeW * CONFIG.SCALE * CONFIG.CUBE_H * 0.7;
    const rr = sizeW * CONFIG.SCALE * (0.85 + 0.18 * Math.sin(now * 22));
    ctx.save();
    const g = ctx.createRadialGradient(c.x, cy, 2, c.x, cy, rr);
    g.addColorStop(0, `rgba(${col},0.55)`); g.addColorStop(0.5, `rgba(${col},0.22)`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, cy, rr, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawBoostJet() { const t = tailOf(snake); drawJetAt(t.x, t.y, snake.angle, sizeForValue(headValue()), snake.speedTimer > 0); }
  // هالة المغناطيس (حلقة نابضة على الأرض)
  function drawMagnetRing(wx, wy) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 5), rW = CONFIG.MAGNET_RANGE * (0.62 + 0.38 * pulse);
    ctx.save();
    ctx.strokeStyle = `rgba(176,107,255,${0.22 + 0.22 * pulse})`; ctx.lineWidth = 2.2;
    ctx.shadowColor = "rgba(176,107,255,0.6)"; ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2, pr = project(wx + Math.cos(a) * rW, wy + Math.sin(a) * rW); i ? ctx.lineTo(pr.x, pr.y) : ctx.moveTo(pr.x, pr.y); }
    ctx.closePath(); ctx.stroke();
    ctx.restore();
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
  const input = { holding: false, up: false, down: false, left: false, right: false, boostKey: false, joyActive: false, joyX: 0, joyY: 0 };
  const touchDevice = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
  if (touchDevice) document.body.classList.add("touch");

  // ماوس (سطح المكتب)
  canvas.addEventListener("mousemove", (e) => { pointer.x = e.clientX; pointer.y = e.clientY; });
  canvas.addEventListener("mousedown", (e) => { if (e.button === 0) input.holding = true; });
  addEventListener("mouseup", (e) => { if (e.button === 0) input.holding = false; });
  canvas.addEventListener("mouseleave", () => { input.holding = false; });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // عصا تحكّم لمسية (تظهر حيث تلمس)
  const joyEl = document.getElementById("joystick");
  const knobEl = document.getElementById("joystick-knob");
  let joyId = null, joyBaseX = 0, joyBaseY = 0;
  const JOY_R = 55, JOY_BOX = 65;
  canvas.addEventListener("touchstart", (e) => {
    for (const t of e.changedTouches) {
      if (joyId === null) {
        joyId = t.identifier; joyBaseX = t.clientX; joyBaseY = t.clientY;
        input.joyActive = true; input.joyX = 0; input.joyY = 0;
        joyEl.style.left = joyBaseX + "px"; joyEl.style.top = joyBaseY + "px";
        knobEl.style.left = JOY_BOX + "px"; knobEl.style.top = JOY_BOX + "px";
        joyEl.classList.remove("hidden");
      }
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        const dx = t.clientX - joyBaseX, dy = t.clientY - joyBaseY;
        const d = Math.hypot(dx, dy) || 1, cl = Math.min(d, JOY_R);
        input.joyX = dx; input.joyY = dy; // اتجاه على الشاشة
        knobEl.style.left = (JOY_BOX + (dx / d) * cl) + "px";
        knobEl.style.top = (JOY_BOX + (dy / d) * cl) + "px";
      }
    }
    e.preventDefault();
  }, { passive: false });
  function endJoy(e) {
    for (const t of e.changedTouches) if (t.identifier === joyId) { joyId = null; input.joyActive = false; joyEl.classList.add("hidden"); }
  }
  canvas.addEventListener("touchend", endJoy);
  canvas.addEventListener("touchcancel", endJoy);

  // زرّ التسارع
  const boostBtn = document.getElementById("boost-btn");
  const setBoost = (v) => { input.boostKey = v; };
  boostBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); setBoost(true); });
  boostBtn.addEventListener("pointerup", () => setBoost(false));
  boostBtn.addEventListener("pointerleave", () => setBoost(false));
  boostBtn.addEventListener("pointercancel", () => setBoost(false));
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
      case "KeyQ": usePower("double"); break;
      case "KeyF": usePower("speed"); break;
      case "KeyR": usePower("radar"); break;
      case "KeyM": usePower("magnet"); break;
      case "Digit1": case "Numpad1": emojiByIndex(0); break;
      case "Digit2": case "Numpad2": emojiByIndex(1); break;
      case "Digit3": case "Numpad3": emojiByIndex(2); break;
      case "Digit4": case "Numpad4": emojiByIndex(3); break;
      case "Digit5": case "Numpad5": emojiByIndex(4); break;
      case "Escape": if (state === "playing") pauseGame(); else if (state === "paused") resumeGame(); break;
      case "Tab": e.preventDefault(); toggleLB(); break;
      case "Digit0": case "Numpad0": toggleStats(); break;
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
  // جائزة كأس النهاية: قوة ×2 تبقى مع الفائز عبر كل الألعاب (محفوظة) حتى يستعملها
  let prizeCharges = 0;
  try { prizeCharges = Math.max(0, parseInt(localStorage.getItem("snake2048_prize")) || 0); } catch (e) {}
  function savePrize() { try { localStorage.setItem("snake2048_prize", String(prizeCharges)); } catch (e) {} }

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
    const stillHost = online && isHost && peer;
    const stillClient = online && !isHost && hostConn && hostConn.open;
    // خسارة في غرفة مستمرة: إحياء في نفس العالم دون إعادة بنائه (العالم ظلّ حياً للبقية)
    if ((stillHost || stillClient) && state === "over") { respawnInRoom(); return; }
    // فوز (جولة جديدة) أو غير متصل: لعبة كاملة جديدة
    beginPlay(stillHost ? "host" : (stillClient ? "client" : "solo"));
  }
  // إحياء اللاعب في نفس الغرفة الجارية: يلمس ثعبانه فقط، لا العالم ولا اللاعبين الآخرين
  function respawnInRoom() {
    resetSnake();
    const a = rand(0, Math.PI * 2), d = rand(0, CONFIG.WORLD * 0.5);
    snake.x = Math.cos(a) * d; snake.y = Math.sin(a) * d; snake.path = [{ x: snake.x, y: snake.y }];
    snake.charges = prizeCharges; updateCharges();
    particles = []; floatEmojis = []; debris = []; rings = []; flash = 0;
    document.getElementById("over-screen").classList.add("hidden");
    document.getElementById("win-screen").classList.add("hidden");
    document.getElementById("chat-bar").classList.remove("hidden");
    document.body.classList.add("in-game");
    state = "playing"; lastT = performance.now();
    if (online && !isHost && hostConn && hostConn.open) { try { netSend({ t: "hello", name: playerName }); } catch (_) {} }
    syncPowers();
  }
  function beginPlay(mode) {
    const nm = (document.getElementById("name-input").value || "").trim();
    playerName = nm || t("you");
    try { localStorage.setItem("snake2048_name", playerName); } catch (e) {}
    online = mode !== "solo"; isHost = mode === "host"; migrating = false;
    if (mode !== "host") hideRoomCodeHud(); // الرمز يظهر للمضيف الخاص فقط
    gameLevel = 1; mapRotation = 0;
    medal.level = 0; medal.leaderId = null; medal.reign = 0; medal.leaderName = "";
    particles = []; floatEmojis = []; rings = []; flash = 0; debris = []; playTime = 0; maxReign = 0; killFeed = []; remotes.clear(); resetBots();
    resetSnake();
    if (online) { // موضع انطلاق عشوائي لتفادي التراكب
      const a = rand(0, Math.PI * 2), d = rand(0, CONFIG.WORLD * 0.5);
      snake.x = Math.cos(a) * d; snake.y = Math.sin(a) * d; snake.path = [{ x: snake.x, y: snake.y }];
    }
    if (authority()) initItems();
    else { foods = []; powerups = []; obstacles = []; dangers = []; dangerProjectiles = []; } // العميل ينتظر عالم المضيف
    updateCamera(snake.x, snake.y);
    snake.charges = prizeCharges; // الجائزة محفوظة وتبقى حتى تُستعمل (لا تُفقد عند الخسارة أو الخروج)
    updateCharges();
    document.getElementById("level").textContent = gameLevel;
    document.getElementById("chat-bar").classList.remove("hidden");
    document.body.classList.add("in-game");
    state = "playing";
    try { if (window.Sound) Sound.startMusic(); } catch (e) {} // موسيقى أثناء اللعب
    try { history.pushState({ p: "game" }, ""); } catch (_) {} // لاعتراض زر الرجوع
    syncPowers();
    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("over-screen").classList.add("hidden");
    document.getElementById("win-screen").classList.add("hidden");
    if (isHost) { hostBroadcast(worldMsg()); hostBroadcast(itemsMsg()); }
  }
  let deathTimer = 0, deathBest = 0, deathScore = 0;
  function gameOver() {
    if (state !== "playing" && state !== "paused") return; // قد يُؤكَل وهو متوقّف مؤقتاً
    document.getElementById("pause-screen").classList.add("hidden");
    deathBest = headValue() || 0; deathScore = score();
    if (deathBest > highScore) { highScore = deathBest; try { localStorage.setItem("snake2048_high", String(highScore)); } catch (e) {} }
    if (online) netSend({ t: "dead" });
    sfx("death"); vibrate(140);
    spawnDeathFx();
    state = "dying"; deathTimer = 0.62; // القطع تتطاير ثم تختفي فجأة ثم تظهر شاشة الخسارة
    document.getElementById("chat-bar").classList.add("hidden");
    document.body.classList.remove("in-game");
    syncPowers();
  }
  function finalizeOver() {
    state = "over";
    recordGameEnd(false);
    document.getElementById("final-best").textContent = fmtNum(deathBest);
    document.getElementById("final-score").textContent = fmtNum(deathScore);
    document.getElementById("over-screen").classList.remove("hidden");
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
  const botScore = (b) => b.values.reduce((s, v) => s + v, 0);
  function computeLeader() {
    let best = { id: myId, name: playerName, score: score() };
    if (online) for (const r of remotes.values()) if ((r.score || 0) > best.score) best = { id: r.id, name: r.name, score: r.score || 0 };
    for (const b of bots.values()) { const s = botScore(b); if (s > best.score) best = { id: b.id, name: b.name, score: s }; }
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
        const msg = "🏅 " + leader.name + " " + m.icon;
        notify(msg);
        if (isHost) { hostBroadcast({ t: "notify", text: msg }); hostBroadcast({ t: "medal", level: medal.level, leaderId: medal.leaderId, leaderName: medal.leaderName }); }
        if (medal.level === 6) { doWin(leader.name, leader.id); return; }
        advanceMap();
      }
    }
    updateMedalBadge();
  }
  const MEDAL_COLORS = [null, "#CD7F32", "#C0C0C0", "#FFD23F", "#5FF0E0", "#FF6B3D", "#FF2EE6"];
  function updateMedalBadge() {
    const badge = document.getElementById("medal-badge");
    if (medal.level > 0) {
      badge.classList.remove("hidden");
      const c = MEDAL_COLORS[medal.level] || "#FFD23F";
      badge.style.borderColor = c;
      badge.style.boxShadow = `0 0 20px ${c}88, 0 0 6px ${c}`;
      document.getElementById("medal-icon").textContent = MEDALS[medal.level].icon;
      const nm = document.getElementById("medal-name");
      nm.textContent = medal.leaderName || ""; nm.style.color = c;
    } else badge.classList.add("hidden");
  }
  function doWin(name, id) {
    if (isHost) hostBroadcast({ t: "win", name, id });
    winGame(name, id);
  }
  // الفوز عند بلوغ اللانهائية: تنتهي اللعبة، والفائز يبدأ التالية ومعه 3 شحنات
  function winGame(winner, winnerId) {
    if (state !== "playing") return;
    state = "won"; sfx("win");
    recordGameEnd(!online || winnerId === myId);
    if (!online || winnerId === myId) { prizeCharges = 3; savePrize(); } // الجائزة للفائز فقط، وتبقى محفوظة
    if (headValue() > highScore) { highScore = headValue(); try { localStorage.setItem("snake2048_high", String(highScore)); } catch (e) {} }
    document.getElementById("win-name").textContent = winner;
    document.getElementById("win-screen").classList.remove("hidden");
    document.getElementById("chat-bar").classList.add("hidden");
    document.body.classList.remove("in-game");
    syncPowers();
  }
  function useCharge() {
    if (snake.charges <= 0 || state !== "playing") return;
    sfx("power");
    snake.charges--; prizeCharges = snake.charges; savePrize(); // تُخصم من الجائزة المحفوظة عند الاستعمال فقط
    snake.values = snake.values.map((v) => v * 2);
    spawnBurst(snake.x, snake.y, "#37d67a", 18); updateCharges();
  }
  function updateCharges() {
    const el = document.getElementById("charges");
    if (snake.charges <= 0) { el.classList.add("hidden"); el.innerHTML = ""; return; }
    el.classList.remove("hidden");
    el.innerHTML = "";
    for (let i = 0; i < snake.charges; i++) {
      const b = document.createElement("button");
      b.className = "charge-btn"; b.innerHTML = "×2<span class='kbd'>E</span>";
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); useCharge(); }); el.appendChild(b);
    }
  }

  // ===== قوى خاصة لصاحب الاسم BinAref (بلا حدود، في أي وقت) =====
  const BINAREF_NAME = "binaref";
  const isBinAref = () => (playerName || "").trim().toLowerCase() === BINAREF_NAME;
  const ABILITIES = [
    { id: "double", icon: "×2", key: "Q", run: () => { snake.values = snake.values.map((v) => v * 2); spawnBurst(snake.x, snake.y, "#37d67a", 18); } },
    { id: "speed",  icon: "⚡", key: "F", run: () => { snake.speedTimer = CONFIG.SPEEDCUBE_TIME; } },
    { id: "radar",  icon: "📡", key: "R", run: () => { snake.radarTimer = CONFIG.RADAR_TIME; } },
    { id: "magnet", icon: "🧲", key: "M", run: () => { snake.magnetTimer = CONFIG.MAGNET_TIME; } },
    // أضف أي ميزة مستقبلية هنا وتظهر له تلقائياً
  ];
  function usePower(id) { if (state !== "playing" || !isBinAref()) return; const a = ABILITIES.find((x) => x.id === id); if (a) { sfx("power"); a.run(); } }
  function buildPowers() {
    const el = document.getElementById("powers"); el.innerHTML = "";
    for (const a of ABILITIES) {
      const b = document.createElement("button"); b.className = "power-btn";
      b.innerHTML = a.icon + "<span class='kbd'>" + a.key + "</span>";
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); usePower(a.id); }); el.appendChild(b);
    }
  }
  function syncPowers() { document.getElementById("powers").classList.toggle("hidden", !(isBinAref() && state === "playing")); }

  // =====================================================================
  // التحديث
  // =====================================================================
  // تحريك الطعام المتحرّك وارتداده عن الحدود/الحواجز (المضيف فقط)
  function moveFoods(dt) {
    for (const f of foods) {
      if (f.vx || f.vy) {
        f.x += f.vx * dt; f.y += f.vy * dt;
        if (!inBounds(f.x, f.y) || insideObstacle(f.x, f.y, f.size * 0.4)) { f.vx *= -1; f.vy *= -1; f.x += f.vx * dt * 2; f.y += f.vy * dt * 2; }
      }
    }
  }
  // المضيف يُبقي العالم حياً للعملاء حتى أثناء إيقافه المؤقت أو بعد موته (ما دام لم يخرج من الغرفة)
  function hostKeepAlive(dt) {
    playTime += dt;
    updateDangerProjectiles(dt);
    moveFoods(dt);
    manageBots(dt); // البوتات تتحرّك وتتقاتل وتهاجم العملاء
  }
  function update(dt) {
    playTime += dt;
    updateMedals(dt);
    if (state !== "playing") return; // قد تنتهي اللعبة بالفوز (اللانهائية)

    // في العمودي: دفع العصا بقوة = تسارع (بلا زرّ)
    const portrait = H > W;
    const joyBoost = portrait && input.joyActive && Math.hypot(input.joyX, input.joyY) > JOY_R * 1.4; // يلزم سحب أبعد للخارج
    const wantBoost = input.holding || input.boostKey || joyBoost;
    if (snake.exhausted) {
      // نفدت الطاقة: انتظر جزءاً من الثانية ثم امتلئ، ولا اندفاع حتى التعافي
      snake.boosting = false;
      if (snake.staminaDelay > 0) snake.staminaDelay -= dt;
      else snake.stamina = Math.min(1, snake.stamina + CONFIG.BOOST_REFILL * dt);
      if (snake.stamina >= CONFIG.STAMINA_RECOVER) snake.exhausted = false;
    } else {
      snake.boosting = wantBoost && snake.stamina > 0.001;
      if (snake.boosting) {
        snake.stamina -= CONFIG.BOOST_DRAIN * dt;
        if (snake.stamina <= 0) { snake.stamina = 0; snake.boosting = false; snake.exhausted = true; snake.staminaDelay = CONFIG.STAMINA_DELAY; }
      } else snake.stamina = Math.min(1, snake.stamina + CONFIG.BOOST_REFILL * dt);
    }
    if (snake.boosting && !wasBoosting) sfx("boost"); // صوت عند بدء الاندفاع فقط
    wasBoosting = snake.boosting;
    if (snake.speedTimer > 0) snake.speedTimer = Math.max(0, snake.speedTimer - dt);
    if (snake.radarTimer > 0) snake.radarTimer = Math.max(0, snake.radarTimer - dt);
    if (snake.magnetTimer > 0) {
      snake.magnetTimer = Math.max(0, snake.magnetTimer - dt);
      for (const f of foods) { const dx = snake.x - f.x, dy = snake.y - f.y, d = Math.hypot(dx, dy); if (d < CONFIG.MAGNET_RANGE && d > 0.1) { const pull = Math.min(CONFIG.MAGNET_PULL * dt, d); f.x += dx / d * pull; f.y += dy / d * pull; } }
    }
    if (authority()) updateDangerProjectiles(dt); // المضيف يحرّك مناطق الخطر المتقدّمة

    // توجيه: لوحة المفاتيح > عصا اللمس > الماوس
    if (input.up || input.down || input.left || input.right) {
      const sx = (input.right ? 1 : 0) - (input.left ? 1 : 0), sy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      if (sx || sy) steerTo(sx, sy, dt);
    } else if (input.joyActive) {
      if (Math.hypot(input.joyX, input.joyY) > 8) steerTo(input.joyX, input.joyY, dt);
    } else if (!touchDevice) {
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
      const m = sizeForValue(headValue()) * 0.62; // يبقى المكعب خارج الحاجز تماماً
      if (o.kind === "cyl" || o.kind === "hex") {
        // دفع دائري (يطابق شكل العمود)
        const rad = Math.min(o.hw, o.hh) * 0.72 + m, dx = snake.x - o.x, dy = snake.y - o.y, d = Math.hypot(dx, dy);
        if (d < rad && d > 1e-4) { const push = rad - d; snake.x += (dx / d) * push; snake.y += (dy / d) * push; }
      } else if (snake.x > o.x - o.hw - m && snake.x < o.x + o.hw + m && snake.y > o.y - o.hh - m && snake.y < o.y + o.hh + m) {
        const dxl = (o.x - o.hw - m) - snake.x, dxr = (o.x + o.hw + m) - snake.x;
        const dyl = (o.y - o.hh - m) - snake.y, dyr = (o.y + o.hh + m) - snake.y;
        const px = Math.abs(dxl) < Math.abs(dxr) ? dxl : dxr;
        const py = Math.abs(dyl) < Math.abs(dyr) ? dyl : dyr;
        if (Math.abs(px) < Math.abs(py)) snake.x += px; else snake.y += py;
      }
    }

    // مناطق الخطر: كل 0.5s يسقط آخر مكعب حتى يبقى الرأس، ثم مهلة ثانية ثم الموت
    if (inDanger(snake.x, snake.y)) {
      if (snake.values.length > 1) {
        snake.headDangerTimer = 0;
        snake.dangerTimer += dt;
        while (snake.dangerTimer >= CONFIG.DANGER_SEVER_INTERVAL && snake.values.length > 1) {
          snake.dangerTimer -= CONFIG.DANGER_SEVER_INTERVAL;
          severTailOne();
        }
      } else {
        snake.headDangerTimer += dt;
        if (snake.headDangerTimer >= 1.0) { gameOver(); return; }
      }
    } else { snake.dangerTimer = 0; snake.headDangerTimer = 0; }

    // مسار
    snake.path.unshift({ x: snake.x, y: snake.y });
    const dists = segmentDistances(); const need = dists[dists.length - 1] + 4; let total = 0;
    for (let i = 1; i < snake.path.length; i++) {
      total += Math.hypot(snake.path[i].x - snake.path[i - 1].x, snake.path[i].y - snake.path[i - 1].y);
      if (total > need) { snake.path.length = i + 1; break; }
    }

    // طعام متحرك (المضيف فقط يحرّكه)
    if (authority()) moveFoods(dt);

    const hv = headValue(), hSize = sizeForValue(hv);
    for (let i = foods.length - 1; i >= 0; i--) {
      const f = foods[i];
      // يمكن الأكل داخل الخطر؛ لكن المكعب المقطوع للتو لا يُؤكل لمدة قصيرة (noEat)
      if (!(f.noEat && now < f.noEat) && Math.hypot(f.x - snake.x, f.y - snake.y) < (hSize + f.size) * 0.5 && f.value <= hv) {
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

    if (authority()) manageBots(dt); // محاكاة البوتات (المضيف/الفردي)
    if (online || bots.size) resolveCombat(dt);

    // بثّ حالتي + (للمضيف) حالة العالم
    if (online) {
      lastNetSend += dt;
      if (lastNetSend >= 0.05) { lastNetSend = 0; netTick(); }
    }

    updateParticles(dt); updateEmojis(dt); updateRings(dt); updateDebris(dt); updateKillFeed(dt);
    updateCamera(snake.x, snake.y); updateHUD();
  }

  // =====================================================================
  // القتال (أونلاين): رأس‑برأس + عضّ الجسم
  // =====================================================================
  function resolveCombat(dt) {
    const hv = headValue(), hSize = sizeForValue(hv);
    const opps = [];
    for (const r of remotes.values()) if (r.body && r.body.length) opps.push(r);
    for (const bot of bots.values()) opps.push({ id: bot.id, x: bot.x, y: bot.y, head: bot.values[0], boosting: bot.boost, body: bodyOf(bot).map((s) => ({ x: s.x, y: s.y, v: s.value })), _bot: bot });
    for (const r of opps) {
      const cd = r._bot ? "_pbiteCD" : "biteCD", obj = r._bot || r;
      obj[cd] = Math.max(0, (obj[cd] || 0) - dt);
      if (!r.body || !r.body.length) continue;
      const rHeadV = r.head || (r.body[0] && r.body[0].v) || 2;
      const rHeadS = sizeForValue(rHeadV);
      const dHead = Math.hypot(r.x - snake.x, r.y - snake.y);
      if (dHead < (hSize + rHeadS) * 0.5) {
        if (hv > rHeadV) { biteOpp(r, 0, rHeadV); continue; }
        else if (hv === rHeadV) {
          const nx = (snake.x - r.x) / (dHead || 1), ny = (snake.y - r.y) / (dHead || 1);
          const push = 0.9 * (r.boosting ? 1.3 : 1) * (snake.boosting ? 0.4 : 1);
          snake.x += nx * push; snake.y += ny * push; continue;
        } else { const nx = (snake.x - r.x) / (dHead || 1), ny = (snake.y - r.y) / (dHead || 1); snake.x += nx * 0.5; snake.y += ny * 0.5; }
      }
      for (let k = 1; k < r.body.length; k++) {
        const b = r.body[k];
        if (b.v < hv && Math.hypot(b.x - snake.x, b.y - snake.y) < (hSize + sizeForValue(b.v)) * 0.5) { biteOpp(r, k, b.v); break; }
      }
    }
  }
  // عضّ خصم: بوت مباشرةً، أو لاعب عبر الشبكة
  function biteOpp(r, k, v) {
    if (r._bot) {
      if (r._bot._pbiteCD > 0) return;
      r._bot._pbiteCD = 0.4; eatValue(v); spawnEatFx(snake.x, snake.y); applyCutToBot(r._bot, k);
    } else {
      if (r.biteCD > 0) return;
      r.biteCD = 0.4; eatValue(v); spawnEatFx(snake.x, snake.y); netSend({ t: "cut", target: r.id, index: k });
    }
    if (k === 0) onKill(r._bot ? r._bot.name : (r.name || "?")); // أكل الرأس = قتلة
  }
  function onKill(name) { stats.kills++; addKill(name); vibrate(25); }

  // وصلني عضّ: المهاجم أكل المكعب index، وما بعده (index+1..) يسقط طعاماً، وأحتفظ بـ 0..index-1
  function applyCut(index) {
    if (state !== "playing" && state !== "paused") return;
    index = Math.floor(index);
    if (index >= snake.values.length) return; // فهرس قديم — تجاهل (يمنع NaN)
    if (index <= 0) { gameOver(); return; } // أُكل الرأس → خسارة فوراً
    const body = bodyPositions();
    const dropped = snake.values.slice(index + 1);
    for (let j = 0; j < dropped.length; j++) {
      const pos = body[index + 1 + j] || { x: snake.x, y: snake.y };
      dropLoose(pos.x, pos.y, dropped[j]);
      spawnBurst(pos.x, pos.y, "#ff5d73", 8);
    }
    snake.values.length = index; // نحتفظ بـ 0..index-1
    if (snake.values.length === 0) { gameOver(); return; }
  }

  // =====================================================================
  // البوتات (ثعابين AI)
  // =====================================================================
  const BOT_NAMES = ["Khaizen", "Neffex", "Aria", "Kenji", "Yuki", "Hassan", "Layla", "Diego", "Sofia", "Pierre", "Olga", "Viktor", "Mei", "Jin", "Ravi", "Priya", "Omar", "Nadia", "Lukas", "Emma", "Chen", "Akira", "Fatima", "Carlos", "Ingrid", "Tariq", "Sakura", "Minho", "Ivan", "Zara"];
  const bots = new Map();
  let botSeq = 0, aiEnabled = true, botTarget = 24, botSpawnCD = 0, playerReign = 0, challengeWave = 0;
  try { aiEnabled = localStorage.getItem("snake2048_ai") !== "0"; } catch (e) {}

  function usedNames() { const s = new Set([playerName]); for (const b of bots.values()) s.add(b.name); for (const r of remotes.values()) s.add(r.name); return s; }
  function pickBotName() { const used = usedNames(), avail = BOT_NAMES.filter((n) => !used.has(n)); return avail.length ? avail[(Math.random() * avail.length) | 0] : "Bot" + botSeq; }

  // مستوى الصعوبة الزمني: 0 سهل … 5 كابوس (كل 5 دقائق)
  const aiTier = () => clamp(Math.floor(playTime / 300), 0, 5);
  function makeBot(opts) {
    opts = opts || {};
    const strength = opts.strength != null ? opts.strength : 0.4;
    // الصعوبة (الذكاء) ترتفع مع الوقت؛ القدرات تبقى كاللاعب
    const base = opts.diff != null ? opts.diff : (0.08 + strength * 0.35);
    const diff = clamp(base + aiTier() * 0.15, 0.05, 0.99);
    let top = opts.top;
    if (!top) { const maxExp = 1 + Math.floor(strength * (3 + gameLevel)); top = Math.pow(2, 1 + Math.floor(Math.random() * maxExp)); }
    top = Math.max(2, Math.pow(2, Math.round(log2(top))));
    const values = [top]; let v = top;
    while (v > 2 && values.length < 5) { v /= 2; values.push(v); }
    const p = freePos(2), id = "bot" + (botSeq++);
    return { id, name: pickBotName(), color: colorForId(id), x: p.x, y: p.y, angle: rand(0, Math.PI * 2), values, path: [{ x: p.x, y: p.y }], diff, react: lerp(0.6, 0.1, diff), aiT: rand(0, 0.3), boost: false, stamina: 1, speedTimer: 0, radarTimer: 0, magnetTimer: 0, dangerTimer: 0, headDangerTimer: 0, desiredAngle: rand(0, Math.PI * 2), _pbiteCD: 0, _obiteCD: 0, alive: true, emojiEm: null, emojiLife: 0 };
  }
  function addBot(opts) { if (bots.size >= 30) return; const b = makeBot(opts); bots.set(b.id, b); }
  function killBot(bot, eatenHead) {
    if (!bot.alive) return; bot.alive = false;
    const segs = bodyOf(bot);
    for (let i = 0; i < segs.length; i++) {
      if (eatenHead && i === 0) continue; // الرأس أُكل بالفعل من المهاجم — لا يُسقط كطعام
      const s = segs[i]; spawnBurst(s.x, s.y, colorForValue(s.value), 8); dropLoose(s.x + rand(-1, 1), s.y + rand(-1, 1), s.value);
    }
    bots.delete(bot.id);
  }
  function botEat(bot, val) {
    bot.values.push(val); bot.values.sort((a, b) => b - a);
    let m = true; while (m) { m = false; for (let i = 0; i < bot.values.length - 1; i++) if (bot.values[i] === bot.values[i + 1]) { bot.values[i] *= 2; bot.values.splice(i + 1, 1); bot.values.sort((a, b) => b - a); m = true; break; } }
  }
  function applyBotPowerup(bot, type) {
    if (type === "speed") bot.speedTimer = CONFIG.SPEEDCUBE_TIME;
    else if (type === "radar") bot.radarTimer = CONFIG.RADAR_TIME;
    else if (type === "magnet") bot.magnetTimer = CONFIG.MAGNET_TIME;
    else if (type === "double") bot.values = bot.values.map((v) => v * 2);
    else if (type === "half") { bot.values = bot.values.map((v) => v / 2).filter((v) => v >= 2); bot.values.sort((a, b) => b - a); if (!bot.values.length) killBot(bot); }
  }
  function severBotTail(bot) { if (bot.values.length <= 1) return; const v = bot.values.pop(); const d = segDistOf(bot.values); const pt = pointAtOf(bot.path, d[d.length - 1] || 0); dropLoose(pt.x, pt.y, v); }
  function applyCutToBot(bot, index) {
    if (!bot.alive) return;
    index = Math.floor(index);
    if (index >= bot.values.length) return; // فهرس قديم
    if (index <= 0) { killBot(bot, true); return; } // أُكل الرأس → لا يُسقط كطعام
    const body = bodyOf(bot), dropped = bot.values.slice(index + 1);
    for (let j = 0; j < dropped.length; j++) { const pos = body[index + 1 + j] || { x: bot.x, y: bot.y }; dropLoose(pos.x, pos.y, dropped[j]); }
    bot.values.length = index;
    if (!bot.values.length) killBot(bot);
  }
  function pushOutObstaclesBot(bot) {
    for (const o of obstacles) {
      const m = sizeForValue(bot.values[0]) * 0.5;
      if (o.kind === "cyl" || o.kind === "hex") { const rad = Math.min(o.hw, o.hh) * 0.72 + m, dx = bot.x - o.x, dy = bot.y - o.y, d = Math.hypot(dx, dy); if (d < rad && d > 1e-4) { const push = rad - d; bot.x += dx / d * push; bot.y += dy / d * push; } }
      else if (bot.x > o.x - o.hw - m && bot.x < o.x + o.hw + m && bot.y > o.y - o.hh - m && bot.y < o.y + o.hh + m) { const dxl = (o.x - o.hw - m) - bot.x, dxr = (o.x + o.hw + m) - bot.x, dyl = (o.y - o.hh - m) - bot.y, dyr = (o.y + o.hh + m) - bot.y, px = Math.abs(dxl) < Math.abs(dxr) ? dxl : dxr, py = Math.abs(dyl) < Math.abs(dyr) ? dyl : dyr; if (Math.abs(px) < Math.abs(py)) bot.x += px; else bot.y += py; }
    }
  }
  // قرار البوت
  function decideBot(bot) {
    const hv = bot.values[0], hx = bot.x, hy = bot.y, smart = bot.diff;
    // مجال الرؤية = كاللاعب؛ لا يرى أبعد إلا إن أكل رادار
    const VISION = 34, eyeR = bot.radarTimer > 0 ? CONFIG.WORLD * 2.2 : VISION;
    let ax = 0, ay = 0, nThreat = null, tD = 1e9, nPrey = null, pD = 1e9;
    const ents = [];
    if (state === "playing") ents.push({ id: myId, x: snake.x, y: snake.y, head: headValue() });
    for (const o of bots.values()) if (o.id !== bot.id && o.alive) ents.push({ id: o.id, x: o.x, y: o.y, head: o.values[0] });
    for (const r of remotes.values()) if (r.body) ents.push({ id: r.id, x: r.x, y: r.y, head: r.head });
    for (const e of ents) { const d = Math.hypot(e.x - hx, e.y - hy); if (d > eyeR) continue; if (e.head > hv) { if (d < tD) { tD = d; nThreat = e; } } else if (e.head < hv) { if (d < pD) { pD = d; nPrey = e; } } }
    bot.boost = false;
    if (nThreat && tD < 22 * (0.6 + smart)) { const a = Math.atan2(hy - nThreat.y, hx - nThreat.x); ax += Math.cos(a) * 2.6; ay += Math.sin(a) * 2.6; if (tD < 9 && bot.stamina > 0.3) bot.boost = true; } // اندفاع للهروب
    if (nPrey && pD < 26 && Math.random() < 0.5 + smart * 0.5) { const a = Math.atan2(nPrey.y - hy, nPrey.x - hx); ax += Math.cos(a) * (1 + smart); ay += Math.sin(a) * (1 + smart); if (pD < 11 && bot.stamina > 0.3) bot.boost = true; }
    let bf = null, bd = 1e9;
    for (const f of foods) { if (f.value > hv || (f.noEat && now < f.noEat)) continue; const d = Math.hypot(f.x - hx, f.y - hy); if (d > VISION) continue; if (d < bd) { bd = d; bf = f; } }
    // الأذكياء يقصدون مكعبات القوى القريبة المرئية
    if (smart > 0.4) for (const p of powerups) { const d = Math.hypot(p.x - hx, p.y - hy); if (d < VISION * 0.7 && (!bf || d < bd * 0.8)) { bf = p; bd = d; } }
    if (bf) { const a = Math.atan2(bf.y - hy, bf.x - hx); ax += Math.cos(a) * (nThreat && tD < 18 ? 0.4 : 1.4); ay += Math.sin(a) * (nThreat && tD < 18 ? 0.4 : 1.4); }
    const edgeD = CONFIG.WORLD - Math.max(Math.abs(hx), Math.abs(hy));
    if (edgeD < 18) { const a = Math.atan2(-hy, -hx), w = 3.5 * (1 - edgeD / 18); ax += Math.cos(a) * w; ay += Math.sin(a) * w; }
    for (const dz of dangers) { const d = Math.hypot(dz.x - hx, dz.y - hy), rr = dz.r + 9; if (d < rr) { const a = Math.atan2(hy - dz.y, hx - dz.x), w = 2.5 * (1 - d / rr); ax += Math.cos(a) * w; ay += Math.sin(a) * w; } }
    if (smart > 0.3) for (const o of obstacles) { const d = Math.hypot(o.x - hx, o.y - hy), rr = Math.max(o.hw, o.hh) + 6; if (d < rr) { const a = Math.atan2(hy - o.y, hx - o.x), w = 1.8 * (1 - d / rr); ax += Math.cos(a) * w; ay += Math.sin(a) * w; } }
    bot.desiredAngle = (ax || ay) ? Math.atan2(ay, ax) : bot.angle + rand(-0.3, 0.3);
    bot.desiredAngle += rand(-1, 1) * (1 - smart) * 0.45; // عدم دقّة للضعفاء
  }
  function stepBot(bot, dt) {
    bot.aiT -= dt; if (bot.aiT <= 0) { bot.aiT = bot.react; decideBot(bot); }
    bot.angle = angleLerp(bot.angle, bot.desiredAngle, CONFIG.TURN_RATE * dt);
    if (bot.boost && bot.stamina > 0.02) bot.stamina = Math.max(0, bot.stamina - CONFIG.BOOST_DRAIN * dt); else bot.stamina = Math.min(1, bot.stamina + CONFIG.BOOST_REFILL * dt);
    if (bot.speedTimer > 0) bot.speedTimer = Math.max(0, bot.speedTimer - dt);
    if (bot.radarTimer > 0) bot.radarTimer = Math.max(0, bot.radarTimer - dt);
    if (bot.magnetTimer > 0) { bot.magnetTimer = Math.max(0, bot.magnetTimer - dt); for (const f of foods) { const dx = bot.x - f.x, dy = bot.y - f.y, d = Math.hypot(dx, dy); if (d < CONFIG.MAGNET_RANGE && d > 0.1) { const pull = Math.min(CONFIG.MAGNET_PULL * dt, d); f.x += dx / d * pull; f.y += dy / d * pull; } } }
    const boosting = bot.boost && bot.stamina > 0.02, sp = CONFIG.SPEED * (bot.speedTimer > 0 ? CONFIG.SPEEDCUBE_MULT : 1) * (boosting ? CONFIG.BOOST_MULT : 1);
    bot.x += Math.cos(bot.angle) * sp * dt; bot.y += Math.sin(bot.angle) * sp * dt;
    if (!inBounds(bot.x, bot.y)) { killBot(bot); return; }
    pushOutObstaclesBot(bot);
    if (inDanger(bot.x, bot.y)) {
      if (bot.values.length > 1) { bot.headDangerTimer = 0; bot.dangerTimer += dt; while (bot.dangerTimer >= CONFIG.DANGER_SEVER_INTERVAL && bot.values.length > 1) { bot.dangerTimer -= CONFIG.DANGER_SEVER_INTERVAL; severBotTail(bot); } }
      else { bot.headDangerTimer += dt; if (bot.headDangerTimer >= 1) { killBot(bot); return; } }
    } else { bot.dangerTimer = 0; bot.headDangerTimer = 0; }
    bot.path.unshift({ x: bot.x, y: bot.y });
    const dists = segDistOf(bot.values), need = dists[dists.length - 1] + 4; let total = 0;
    for (let i = 1; i < bot.path.length; i++) { total += Math.hypot(bot.path[i].x - bot.path[i - 1].x, bot.path[i].y - bot.path[i - 1].y); if (total > need) { bot.path.length = i + 1; break; } }
    const hv = bot.values[0], hSize = sizeForValue(hv);
    for (let i = foods.length - 1; i >= 0; i--) { const f = foods[i]; if (!(f.noEat && now < f.noEat) && f.value <= hv && Math.hypot(f.x - bot.x, f.y - bot.y) < (hSize + f.size) * 0.5) { botEat(bot, f.value); foods[i] = spawnFood(); } }
    for (let i = powerups.length - 1; i >= 0; i--) { const p = powerups[i]; if (Math.hypot(p.x - bot.x, p.y - bot.y) < (hSize + p.size) * 0.45) { applyBotPowerup(bot, p.type); powerups[i] = spawnPowerup(); if (!bot.alive) return; } }
    // أثر السرعة على البوت (مثل اللاعب)
    if (((bot.boost && bot.stamina > 0.02) || bot.speedTimer > 0) && Math.random() < 0.7) { const t = tailOf(bot); spawnTrailAt(t.x, t.y, bot.angle, bot.speedTimer > 0); }
    if (bot.emojiLife > 0) bot.emojiLife -= dt;
  }
  // هجوم البوت على اللاعب/البوتات/الخصوم
  function botOffense(bot, dt) {
    if (bot._obiteCD > 0) { bot._obiteCD -= dt; return; }
    const hv = bot.values[0], hSize = sizeForValue(hv);
    const targets = [];
    if (state === "playing") targets.push({ kind: "me", x: snake.x, y: snake.y, head: headValue(), body: bodyPositions() });
    for (const o of bots.values()) if (o.id !== bot.id && o.alive) targets.push({ kind: "bot", ref: o, x: o.x, y: o.y, head: o.values[0], body: bodyOf(o) });
    for (const r of remotes.values()) if (r.body) targets.push({ kind: "remote", ref: r, x: r.x, y: r.y, head: r.head, body: r.body });
    for (const T of targets) {
      const tHeadS = sizeForValue(T.head), dHead = Math.hypot(T.x - bot.x, T.y - bot.y);
      if (dHead < (hSize + tHeadS) * 0.5 && hv > T.head) { botBite(bot, T, 0); return; }
      for (let k = 1; k < T.body.length; k++) { const b = T.body[k], bv = b.value != null ? b.value : b.v; if (bv < hv && Math.hypot(b.x - bot.x, b.y - bot.y) < (hSize + sizeForValue(bv)) * 0.5) { botBite(bot, T, k); return; } }
    }
  }
  function botBite(bot, T, k) {
    bot._obiteCD = 0.5;
    const cube = T.body[k], bv = k === 0 ? T.head : (cube.value != null ? cube.value : cube.v);
    botEat(bot, bv);
    if (T.kind === "me") applyCut(k);
    else if (T.kind === "bot") applyCutToBot(T.ref, k);
    else if (T.kind === "remote") { const c = clientConns.get(T.ref.id); if (c && c.open) { try { c.send({ t: "cut", index: k }); } catch (e) {} } }
  }
  // تحدّيات تكيّفية: إن بقي اللاعب متصدّراً تظهر بوتات بقوّته
  function updateChallengers(dt) {
    if (online && !isHost) return;
    const leader = computeLeader();
    if (leader.id === myId && state === "playing") {
      playerReign += dt;
      if (playerReign > maxReign) maxReign = playerReign;
      // 6 دقائق من الصدارة المتواصلة → يظهر منافس أقوى، وكل مرّة أقوى من سابقتها
      if (playerReign >= 360) {
        playerReign = 0; challengeWave++;
        const ph = headValue();
        const strength = Math.min(0.99, 0.86 + challengeWave * 0.03);
        const topMul = 1.6 + challengeWave * 0.5;
        addBot({ top: Math.max(ph * 2, Math.round(ph * topMul)), diff: strength });
      }
    } else { playerReign = 0; } // فقدان الصدارة يصفّر العدّاد (يبدأ 6 دقائق جديدة عند العودة)
  }
  function manageBots(dt) {
    if (!aiEnabled) { if (bots.size) bots.clear(); return; }
    let target;
    if (online) target = Math.max(0, 20 - (1 + clientConns.size)); else target = botTarget;
    botSpawnCD -= dt;
    if (bots.size < target && botSpawnCD <= 0) { addBot({ strength: rand(0.05, 0.55) }); botSpawnCD = 0.3; }
    updateChallengers(dt);
    for (const bot of [...bots.values()]) stepBot(bot, dt);
    for (const bot of [...bots.values()]) if (bot.alive) botOffense(bot, dt);
  }
  function resetBots() { bots.clear(); playerReign = 0; challengeWave = 0; botSpawnCD = 0; botTarget = 20 + Math.floor(Math.random() * 11); }
  window.toggleAI = function () {
    aiEnabled = document.getElementById("ai-toggle").checked;
    try { localStorage.setItem("snake2048_ai", aiEnabled ? "1" : "0"); } catch (e) {}
    if (!aiEnabled) bots.clear();
  };
  // تحكّم أثناء اللعب (المدير): سويتش لإزالة/إعادة الذكاء الاصطناعي حتى بعد بدء اللعبة
  window.togglePauseAI = function () {
    const cb = document.getElementById("pause-ai-toggle");
    aiEnabled = cb ? cb.checked : !aiEnabled;
    try { localStorage.setItem("snake2048_ai", aiEnabled ? "1" : "0"); } catch (e) {}
    if (!aiEnabled) bots.clear(); // إزالة فورية لكل البوتات
    const menuCb = document.getElementById("ai-toggle"); if (menuCb) menuCb.checked = aiEnabled;
  };
  function updatePauseAIBtn() {
    const row = document.getElementById("pause-ai-row"); if (!row) return;
    row.classList.toggle("hidden", online && !isHost); // المضيف/الفردي فقط يملك البوتات
    const cb = document.getElementById("pause-ai-toggle"); if (cb) cb.checked = aiEnabled;
  }

  // =====================================================================
  // الرسم
  // =====================================================================
  function arenaPath() {
    const R = CONFIG.WORLD;
    ctx.beginPath();
    if (mapShape === "circle") {
      for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; const pr = project(Math.cos(a) * R, Math.sin(a) * R); i ? ctx.lineTo(pr.x, pr.y) : ctx.moveTo(pr.x, pr.y); }
    } else if (mapShape === "triangle") {
      mapTri.forEach((v, i) => { const pr = project(v.x, v.y); i ? ctx.lineTo(pr.x, pr.y) : ctx.moveTo(pr.x, pr.y); });
    } else {
      [[-R, -R], [R, -R], [R, R], [-R, R]].forEach((c, i) => { const pr = project(c[0], c[1]); i ? ctx.lineTo(pr.x, pr.y) : ctx.moveTo(pr.x, pr.y); });
    }
    ctx.closePath();
  }
  function drawGround() {
    ctx.fillStyle = "#050510"; ctx.fillRect(-24, -24, W + 48, H + 48); // فراغ نيون داكن
    const R = CONFIG.WORLD;
    // الأرضية + إطار متوهّج
    ctx.fillStyle = "#0A0A1F"; ctx.strokeStyle = "rgba(0,212,255,0.45)"; ctx.lineWidth = 3;
    ctx.save(); ctx.shadowColor = "rgba(0,212,255,0.6)"; ctx.shadowBlur = 14;
    arenaPath(); ctx.fill(); ctx.stroke(); ctx.restore();

    // شبكة خطوط نيون ثابتة (داخل الساحة)
    ctx.save();
    arenaPath(); ctx.clip();
    ctx.strokeStyle = "rgba(0,212,255,0.07)"; ctx.lineWidth = 1;
    const step = 7;
    for (let g = -R; g <= R; g += step) {
      let p1 = project(g, -R), p2 = project(g, R);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      let p3 = project(-R, g), p4 = project(R, g);
      ctx.beginPath(); ctx.moveTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.stroke();
    }
    ctx.restore();

    // مناطق الخطر بأشكال مختلفة
    for (const dz of dangers) drawDanger(dz.x, dz.y, dz.r, dz.shape || "circle", dz.rot || 0);
    // المقذوفات المتحرّكة (مناطق خطر صغيرة)
    for (const p of dangerProjectiles) drawDanger(p.x, p.y, p.r, "circle", 0, true);
  }
  function drawDanger(x, y, r, shape, rot, small) {
    const pulse = 0.5 + 0.5 * Math.sin(now * (small ? 7 : 4) + x);
    ctx.save();
    ctx.globalAlpha = (small ? 0.5 : 0.35) + pulse * 0.25;
    ctx.fillStyle = "#c0203a";
    ctx.beginPath();
    const pts = shape === "square" ? 4 : shape === "triangle" ? 3 : 32;
    const a0 = shape === "circle" ? 0 : rot - Math.PI / 2, rr = shape === "circle" ? r : r * 1.25;
    for (let i = 0; i <= pts; i++) { const a = a0 + (i / pts) * Math.PI * 2; const pr = project(x + Math.cos(a) * rr, y + Math.sin(a) * rr); i ? ctx.lineTo(pr.x, pr.y) : ctx.moveTo(pr.x, pr.y); }
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.85; ctx.strokeStyle = "#ff5d73"; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
    ctx.restore();
  }

  // ترتيب إيزومتري طوبولوجي: A خلف B إن كان مسقطه كاملاً على الجهة البعيدة في محور
  function isoBehind(A, B) { return (A.x2 <= B.x1 + 0.02) || (A.y2 <= B.y1 + 0.02); }
  function sortIso(items) {
    const n = items.length;
    // أمان: إن تجاوز العدد المرئي حدّاً متطرفاً، استخدم ترتيب العمق الرخيص O(n log n) بدل O(n²) لمنع أي تعليق
    if (n > 380) return items.slice().sort((a, b) => a.depth - b.depth);
    const before = items.map(() => []);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const A = items[i], B = items[j], aB = isoBehind(A, B), bB = isoBehind(B, A);
      if (aB && !bB) before[j].push(i);
      else if (bB && !aB) before[i].push(j);
      else if (A.depth <= B.depth) before[j].push(i); else before[i].push(j);
    }
    const out = [], vis = new Array(n).fill(0);
    const visit = (i) => { if (vis[i]) return; vis[i] = 1; for (const k of before[i]) if (vis[k] !== 1) visit(k); vis[i] = 2; out.push(items[i]); };
    for (let i = 0; i < n; i++) visit(i);
    return out;
  }

  function render() {
    const so = shakeOffset();
    ctx.save(); ctx.translate(so.x, so.y);
    drawGround();
    for (const p of powerups) drawCard(p.x, p.y, p.size, p.type);
    if (state === "playing" && (snake.boosting || snake.speedTimer > 0)) drawBoostJet(); // تحت المكعبات
    for (const bt of bots.values()) if (bt.boost || bt.speedTimer > 0) { const t = tailOf(bt); drawJetAt(t.x, t.y, bt.angle, sizeForValue(bt.values[0]), bt.speedTimer > 0); }
    for (const r of remotes.values()) if (r.boosting && r.body && r.body.length) { const t = r.body[r.body.length - 1]; drawJetAt(t.x, t.y, r.angle || 0, sizeForValue(r.head || 2), false); }
    // هالة المغناطيس
    if (state === "playing" && snake.magnetTimer > 0) drawMagnetRing(snake.x, snake.y);
    for (const bt of bots.values()) if (bt.magnetTimer > 0) drawMagnetRing(bt.x, bt.y);
    drawParticles(true); // شعاع السرعة يُرسم تحت المكعبات
    const drawables = [];
    // عزل ما هو خارج الشاشة قبل الترتيب الطوبولوجي (O(N²)) — يمنع التعليق مهما كثرت الكائنات دون تغيير المظهر
    const VIS_M = CONFIG.SCALE * 6 + 120;
    const onScreen = (wx, wy) => { const p = project(wx, wy); return p.x > -VIS_M && p.x < W + VIS_M && p.y > -VIS_M && p.y < H + VIS_M; };
    const pushCube = (kind, x, y, size, value) => {
      if (!onScreen(x, y)) return;
      const half = size / 2;
      drawables.push({ kind, x, y, size, value, depth: x + y, x1: x - half, x2: x + half, y1: y - half, y2: y + half });
    };
    for (const f of foods) pushCube("food", f.x, f.y, f.size, f.value);
    for (const o of obstacles) {
      if (!onScreen(o.x, o.y)) continue;
      const rr = (o.kind === "cyl" || o.kind === "hex") ? Math.min(o.hw, o.hh) * 0.72 : 0;
      const hw = rr || o.hw, hh = rr || o.hh;
      drawables.push({ kind: "wall", o, depth: o.x + o.y, x1: o.x - hw, x2: o.x + hw, y1: o.y - hh, y2: o.y + hh });
    }
    if (state === "playing") for (const s of bodyPositions()) pushCube("body", s.x, s.y, s.size, s.value); // يختفي عند التفتّت
    for (const r of remotes.values()) { if (!r.body) continue; for (const b of r.body) pushCube("body", b.x, b.y, sizeForValue(b.v), b.v); }
    for (const bt of bots.values()) for (const s of bodyOf(bt)) pushCube("body", s.x, s.y, s.size, s.value);
    for (const d of sortIso(drawables)) {
      if (d.kind === "wall") drawObstacle(d.o);
      else if (d.kind === "food") drawCube(d.x, d.y, d.size * (1 + 0.05 * Math.sin(now * 3 + d.x)), d.value); // نبض خفيف للطعام
      else drawCube(d.x, d.y, d.size, d.value);
    }
    drawDebris(); // قطع الموت المتطايرة
    drawParticles(false); // جسيمات الأكل/الدمج فوق المكعبات
    drawRings();
    // أسماء الثعابين البعيدة والبوتات
    for (const r of remotes.values()) drawRemoteLabel(r);
    for (const bt of bots.values()) drawRemoteLabel({ x: bt.x, y: bt.y, head: bt.values[0], name: bt.name, color: bt.color, emojiLife: bt.emojiLife, emojiEm: bt.emojiEm });
    drawArrow(); drawNameLabel(); drawEmojis();
    if (snake.radarTimer > 0) { drawPowerupRadar(); drawEffectTimer("📡", snake.radarTimer, "#ffd23f", 0); } // الرادار يكشف الكنوز/القوى
    if (snake.magnetTimer > 0) drawEffectTimer("🧲", snake.magnetTimer, "#c79bff", snake.radarTimer > 0 ? 1 : 0);
    if (state === "playing") drawMinimap();
    drawKillFeed();
    drawFlash();
    ctx.restore();
  }
  // شريط القتل: يظهر من أكلتَ رأسه
  function addKill(name) { killFeed.unshift({ text: "🍴 " + name, life: 2.6 }); if (killFeed.length > 4) killFeed.pop(); }
  function updateKillFeed(dt) { for (let i = killFeed.length - 1; i >= 0; i--) { killFeed[i].life -= dt; if (killFeed[i].life <= 0) killFeed.splice(i, 1); } }
  function drawKillFeed() {
    if (!killFeed.length) return;
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = '800 16px "Segoe UI", Tahoma, sans-serif';
    let y = H * 0.2;
    for (const k of killFeed) {
      ctx.globalAlpha = clamp(k.life / 0.5, 0, 1);
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.strokeText(k.text, W / 2, y);
      ctx.fillStyle = "#ffd23f"; ctx.fillText(k.text, W / 2, y); y += 26;
    }
    ctx.restore();
  }
  // خريطة مصغّرة: الأعداء فقط (أحمر، الأقوى أكبر) + موقعك. وعند الرادار تظهر القوى/الكنوز بالأصفر.
  function drawMinimap() {
    const S = Math.min(W, H) * 0.2, pad = 12, x0 = pad, y0 = H - S - pad, R = CONFIG.WORLD;
    const mx = (v) => x0 + (v + R) / (2 * R) * S, my = (v) => y0 + (v + R) / (2 * R) * S;
    const dot = (hv) => clamp(1.8 + log2(Math.max(2, hv)) * 0.5, 2, 6.5); // الأقوى = أكبر
    ctx.save();
    ctx.globalAlpha = 0.82; ctx.fillStyle = "rgba(6,16,30,0.7)"; ctx.fillRect(x0, y0, S, S);
    ctx.strokeStyle = "rgba(0,212,255,0.4)"; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y0, S, S);
    // الأعداء (أحمر، حجم حسب القوة)
    ctx.fillStyle = "#ff3b3b";
    for (const r of remotes.values()) if (r.x != null) { ctx.beginPath(); ctx.arc(mx(r.x), my(r.y), dot(r.head || 2), 0, Math.PI * 2); ctx.fill(); }
    for (const b of bots.values()) { ctx.beginPath(); ctx.arc(mx(b.x), my(b.y), dot(b.values[0]), 0, Math.PI * 2); ctx.fill(); }
    // عند الرادار: كشف القوى/الكنوز (أصفر)
    if (snake.radarTimer > 0) { ctx.fillStyle = "#ffd23f"; for (const p of powerups) { ctx.beginPath(); ctx.arc(mx(p.x), my(p.y), 2.6, 0, Math.PI * 2); ctx.fill(); } }
    // اللاعب
    ctx.fillStyle = "#19d3ff"; ctx.beginPath(); ctx.arc(mx(snake.x), my(snake.y), 3, 0, Math.PI * 2); ctx.fill();
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
    // يبدأ السهم دائماً خارج المكعب (حسب حجم الرأس)
    const gap = sizeForValue(headValue()) * CONFIG.SCALE * 1.15 + 10, L = gap + 20;
    const x0 = c.x + dx * gap, y0 = c.y + dy * gap, x1 = c.x + dx * L, y1 = c.y + dy * L;
    ctx.save(); ctx.shadowColor = "rgba(80,210,255,0.9)"; ctx.shadowBlur = 8;
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "rgba(80,210,255,0)"); g.addColorStop(1, "rgba(120,230,255,0.95)");
    ctx.strokeStyle = g; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const px = -dy, py = dx, hw = 6, hl = 10; ctx.fillStyle = "rgba(150,235,255,0.98)";
    ctx.beginPath(); ctx.moveTo(x1 + dx * 4, y1 + dy * 4);
    ctx.lineTo(x1 - dx * hl + px * hw, y1 - dy * hl + py * hw);
    ctx.lineTo(x1 - dx * hl - px * hw, y1 - dy * hl - py * hw);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  // الرادار: مؤشّرات على حافة الشاشة نحو أقرب اللاعبين
  function drawRadar() {
    const cx = W / 2, cy = H / 2;
    const items = [];
    const add = (x, y, color) => { const rp = project(x, y); items.push({ ang: Math.atan2(rp.y - cy, rp.x - cx), d: Math.hypot(x - snake.x, y - snake.y), color }); };
    for (const r of remotes.values()) if (r.x != null) add(r.x, r.y, r.color || "#2ee6a6");
    for (const bt of bots.values()) add(bt.x, bt.y, bt.color);
    const ring = Math.min(W, H) * 0.22; // أقرب للاعب
    const angDiff = (a, b) => Math.abs(normAngle(a - b));
    const arrow = (it, big) => {
      const ex = cx + Math.cos(it.ang) * ring, ey = cy + Math.sin(it.ang) * ring;
      const col = big ? "#ff3b3b" : (it.color || "#2ee6a6"), s = big ? 9 : 5.5;
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(it.ang);
      ctx.globalAlpha = big ? 1 : 0.6; ctx.shadowColor = col; ctx.shadowBlur = big ? 14 : 5; ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(s + 7, 0); ctx.lineTo(-s, s); ctx.lineTo(-s, -s); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (big) { ctx.font = '800 12px "Segoe UI", Tahoma, sans-serif'; ctx.fillStyle = "#ffd0d0"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(Math.round(it.d) + "", ex - Math.cos(it.ang) * 17, ey - Math.sin(it.ang) * 17); }
    };
    if (items.length) {
      items.sort((a, b) => a.d - b.d);
      arrow(items[0], true); // أقرب عدو — سهم أحمر بارز
      const shown = [items[0].ang];
      let n = 0;
      for (let i = 1; i < items.length && n < 4; i++) { if (shown.some((a) => angDiff(a, items[i].ang) < 0.4)) continue; arrow(items[i], false); shown.push(items[i].ang); n++; }
    }
    ctx.globalAlpha = 1; ctx.fillStyle = "#2ee6a6"; ctx.font = '800 14px "Segoe UI", Tahoma, sans-serif'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("📡 " + Math.ceil(snake.radarTimer) + "s", cx, cy - ring - 18);
  }
  // رادار المكافآت: يدلّ على القوى المنتشرة (إيجابية وسلبية مثل ÷2) — حلقة خارجية بالأيقونات
  function drawPowerupRadar() {
    const cx = W / 2, cy = H / 2, ring = Math.min(W, H) * 0.30;
    const items = [];
    for (const p of powerups) { if (p.x == null) continue; const rp = project(p.x, p.y); items.push({ ang: Math.atan2(rp.y - cy, rp.x - cx), d: Math.hypot(p.x - snake.x, p.y - snake.y), type: p.type }); }
    if (!items.length) return;
    items.sort((a, b) => a.d - b.d);
    const angDiff = (a, b) => Math.abs(normAngle(a - b));
    const shown = []; let n = 0;
    for (let i = 0; i < items.length && n < 5; i++) {
      const it = items[i];
      if (shown.some((a) => angDiff(a, it.ang) < 0.35)) continue;
      const pu = POWERUPS[it.type] || {}, col = pu.glow || "#b06bff";
      const ex = cx + Math.cos(it.ang) * ring, ey = cy + Math.sin(it.ang) * ring;
      ctx.save(); ctx.globalAlpha = 0.9; ctx.shadowColor = col; ctx.shadowBlur = 8;
      ctx.font = '800 15px "Segoe UI", Tahoma, sans-serif'; ctx.fillStyle = col; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(pu.label || "◆", ex, ey);
      ctx.restore();
      shown.push(it.ang); n++;
    }
  }
  // عدّاد تأثير (مثل الرادار) أعلى الرأس
  function drawEffectTimer(icon, t, color, slot) {
    const cx = W / 2, cy = H / 2, ring = Math.min(W, H) * 0.22;
    ctx.fillStyle = color; ctx.font = '800 14px "Segoe UI", Tahoma, sans-serif'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(icon + " " + Math.ceil(t) + "s", cx, cy - ring - 18 - slot * 22);
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
    // شريط الطاقة في الـHUD (هو العدّاد المعتمد)
    document.getElementById("boost-bar-fill").style.width = Math.round(snake.stamina * 100) + "%";
    const bw = document.getElementById("boost-bar-wrap");
    bw.classList.toggle("boosting", snake.boosting);
    bw.classList.toggle("empty", snake.exhausted);
    // طبقة ×2 المستقلّة فوق شريط الطاقة، تتناقص وحدها
    const sc = document.getElementById("speedcube-fill");
    if (snake.speedTimer > 0) { sc.style.display = "block"; sc.style.width = (snake.speedTimer / CONFIG.SPEEDCUBE_TIME * 100) + "%"; }
    else sc.style.display = "none";
    document.getElementById("boost-bar-label").textContent = snake.exhausted ? "…" : "⚡";
    const entries = [{ id: myId, name: playerName, head: headValue(), me: true }];
    if (online) for (const r of remotes.values()) entries.push({ id: r.id, name: r.name || "?", head: r.head || 2, me: false });
    for (const b of bots.values()) entries.push({ id: b.id, name: b.name, head: b.values[0], me: false });
    entries.sort((a, b) => b.head - a.head);
    const n = entries.length, myIdx = entries.findIndex((e) => e.me);
    const row = (e, rank) => {
      const mstr = (e.id === medal.leaderId && medal.level > 0) ? " " + MEDALS[medal.level].icon : "";
      return `<li class="${e.me ? "me" : ""}"><span><span class="rank">${rank}.</span> ${escapeHtml(e.name)}${mstr}</span><span>${fmtNum(e.head)}</span></li>`;
    };
    let html = "";
    if (!lbOpen) {
      html = row(entries[myIdx], myIdx + 1); // مطويّ: مرتبتك فقط
    } else {
      // نافذة 7: 3 فوقك + أنت + 3 تحتك
      const start = Math.max(0, Math.min(myIdx - 3, Math.max(0, n - 7)));
      for (let i = start; i < Math.min(n, start + 7); i++) html += row(entries[i], i + 1);
    }
    document.getElementById("lb-list").innerHTML = html;
  }
  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function notify(text) {
    const box = document.getElementById("notifications");
    const d = document.createElement("div"); d.className = "notif"; d.textContent = text;
    box.appendChild(d); setTimeout(() => d.remove(), 3000);
  }

  // دردشة الرموز (نقر أو أرقام 1..5)
  const chatButtons = [...document.querySelectorAll("#chat-bar button")];
  function sendEmoji(em) { if (!em) return; showEmoji(em); if (online) netSend({ t: "emoji", em }); }
  // pointerdown (لا click): يعمل فوراً حتى أثناء تحريك العصا بإصبع آخر (لمس متعدّد)
  chatButtons.forEach((b) => b.addEventListener("pointerdown", (e) => { e.preventDefault(); sendEmoji(b.dataset.emoji); }));
  function emojiByIndex(i) { const b = chatButtons[i]; if (b) sendEmoji(b.dataset.emoji); }

  // ===== الواجهة: الطيّ + اللغات =====
  let lbOpen = true, statsOpen = true, curLang = "en";
  window.toggleStats = function () { statsOpen = !statsOpen; document.getElementById("stats-body").classList.toggle("hidden", !statsOpen); document.getElementById("stats-arrow").textContent = statsOpen ? "▾" : "▸"; };
  window.toggleLB = function () { lbOpen = !lbOpen; document.getElementById("lb-arrow").textContent = lbOpen ? "▾" : "▸"; };

  function t(key) { const L = window.I18N || {}; return (L[curLang] && L[curLang][key]) || (L.en && L.en[key]) || key; }
  function applyI18n() {
    document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.getAttribute("data-i18n"))));
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => (el.placeholder = t(el.getAttribute("data-i18n-ph"))));
    document.querySelectorAll("[data-i18n-title]").forEach((el) => (el.title = t(el.getAttribute("data-i18n-title"))));
    document.getElementById("name-input").placeholder = t("namePh");
    document.getElementById("lang-search").placeholder = t("search");
    const meta = (window.LANGS || []).find((l) => l.code === curLang);
    const rtl = (window.I18N[curLang] && window.I18N[curLang]._rtl) || (meta && meta.rtl);
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.documentElement.lang = curLang;
    document.getElementById("lang-current").textContent = curLang.toUpperCase();
  }
  function setLang(code) { curLang = code; try { localStorage.setItem("snake2048_lang", code); } catch (e) {} applyI18n(); }
  function buildLangList(filter) {
    const ul = document.getElementById("lang-list"); ul.innerHTML = "";
    const f = (filter || "").trim().toLowerCase();
    for (const L of (window.LANGS || [])) {
      if (f && !((L.native || "").toLowerCase().includes(f) || (L.en || "").toLowerCase().includes(f) || (L.q || "").includes(f))) continue;
      const li = document.createElement("li"); li.textContent = L.native + " — " + L.en;
      li.onclick = () => { setLang(L.code); document.getElementById("lang-menu").classList.add("hidden"); };
      ul.appendChild(li);
    }
  }
  window.toggleLangMenu = function () {
    const m = document.getElementById("lang-menu"); const willOpen = m.classList.contains("hidden");
    m.classList.toggle("hidden");
    if (willOpen) { const s = document.getElementById("lang-search"); s.value = ""; buildLangList(""); s.focus(); }
  };
  window.filterLangs = function () { buildLangList(document.getElementById("lang-search").value); };
  (function initLang() {
    let saved = null; try { saved = localStorage.getItem("snake2048_lang"); } catch (e) {}
    let code = saved || (navigator.language || "en").slice(0, 2).toLowerCase();
    if (!(window.LANGS || []).some((l) => l.code === code)) code = "en";
    curLang = code; applyI18n();
  })();

  // =====================================================================
  // الشبكة (PeerJS) — نجمة: المضيف يملك العالم ويعيد توزيع الحالة
  // =====================================================================
  const PEER_PREFIX = "snk2048-";
  let roomCode = "", netItemsCounter = 0, currentRoom = "", migrating = false;

  // خوادم ICE لعبور الشبكات عبر الإنترنت: STUN لاكتشاف العنوان + TURN كملاذ احتياطي للشبكات الصارمة
  const ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.relay.metered.ca:80" },
    { urls: "turn:global.relay.metered.ca:80", username: "bff9dcf046c2151512c0c118", credential: "y/2G1Uawi49iC2kO" },
    { urls: "turn:global.relay.metered.ca:80?transport=tcp", username: "bff9dcf046c2151512c0c118", credential: "y/2G1Uawi49iC2kO" },
    { urls: "turn:global.relay.metered.ca:443", username: "bff9dcf046c2151512c0c118", credential: "y/2G1Uawi49iC2kO" },
    { urls: "turns:global.relay.metered.ca:443?transport=tcp", username: "bff9dcf046c2151512c0c118", credential: "y/2G1Uawi49iC2kO" },
  ];
  // اللعب الجماعي عبر الإنترنت دائماً (سحابة PeerJS + STUN/TURN). لا يوجد وضع محلي في الويب.
  function peerOpts() { return { debug: 1, config: { iceServers: ICE_SERVERS } }; }

  // واجهة اللوحات
  window.switchMode = function (mode) {
    document.getElementById("btn-solo").classList.toggle("active", mode === "solo");
    document.getElementById("btn-multi").classList.toggle("active", mode === "multi");
    document.getElementById("panel-solo").classList.toggle("hidden", mode !== "solo");
    document.getElementById("panel-multi").classList.toggle("hidden", mode !== "multi");
    if (mode !== "multi") closeLobby();
  };
  let roomLocked = false, hostLobby = false; // مفتوح = عامة، مغلق = خاصة (برمز)
  window.toggleLock = function () {
    roomLocked = !roomLocked;
    const b = document.getElementById("lock-toggle");
    b.textContent = roomLocked ? "🔒" : "🔓";
    b.classList.toggle("open", !roomLocked);
    b.classList.toggle("locked", roomLocked);
    // القفل يبدّل بين خانة الانضمام ورمز الغرفة في نفس الموضع
    document.getElementById("section-join").classList.toggle("hidden", roomLocked);
    document.getElementById("room-code-wrap").classList.toggle("hidden", !roomLocked);
    if (roomLocked) { document.getElementById("room-code-display").textContent = "…"; openLobby(); }
    else closeLobby();
  };
  function resetLockUI() {
    roomLocked = false;
    const b = document.getElementById("lock-toggle");
    b.textContent = "🔓"; b.classList.add("open"); b.classList.remove("locked");
    document.getElementById("section-join").classList.remove("hidden");
    document.getElementById("room-code-wrap").classList.add("hidden");
  }
  window.pasteCode = async function () {
    const inp = document.getElementById("join-code-input");
    try { const txt = await navigator.clipboard.readText(); inp.value = (txt || "").trim().toUpperCase(); }
    catch (e) { inp.focus(); }
  };
  window.copyCode = function () { copyText(document.getElementById("room-code-display").textContent); };
  function copyText(code) {
    if (!code) return;
    if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => notify(t("copied")), () => {});
    else notify(code);
  }

  function genCode() { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }
  function peerLoaded() { return typeof Peer !== "undefined"; }

  const PUBLIC_CODE = "PUBLIC"; // الغرفة العامة المشتركة (رمز ثابت)
  function setName() { const nm = (document.getElementById("name-input").value || "").trim(); playerName = nm || t("you"); }
  function mStatus(text, err) { const s = document.getElementById("multi-status"); s.classList.toggle("error", !!err); s.textContent = text; }

  let openTimer = null;
  function armTimeout(statusFn) {
    clearTimeout(openTimer);
    openTimer = setTimeout(() => { if (!online) statusFn(t("netTimeout"), true); }, 9000);
  }

  function showRoomCodeHud(code) {
    const el = document.getElementById("room-code-hud");
    document.getElementById("room-code-hud-val").textContent = code;
    el.classList.remove("hidden");
  }
  function hideRoomCodeHud() { document.getElementById("room-code-hud").classList.add("hidden"); }

  // الزرّ الرئيسي
  window.doPlayMulti = function () {
    if (navigator.onLine === false) { mStatus(t("netNeedInternet"), true); return; } // العالمي يحتاج إنترنت
    if (!peerLoaded()) { mStatus(t("netTimeout"), true); return; }
    setName();
    if (roomLocked) {
      if (online && isHost) { hostLobby = false; showRoomCodeHud(roomCode); beginPlay("host"); } // ابدأ اللعب كمضيف
      else openLobby(); // أنشئ الغرفة أولاً (يظهر الرمز) ثم اضغط مرة أخرى للبدء
    } else { mStatus(t("connecting")); startPublic(); }
  };

  // إنشاء غرفة خاصة فوراً عند إغلاق القفل (لوبي قبل اللعب)
  function openLobby() {
    if (online && isHost) return;
    if (!peerLoaded()) { mStatus(t("netTimeout"), true); return; }
    setName(); hostLobby = true; mStatus(t("connecting"));
    startHost(0, genCode());
  }
  function closeLobby() {
    if (state === "playing") return;
    if (online && isHost && hostLobby) { try { if (peer) peer.destroy(); } catch (_) {} online = false; isHost = false; }
    hostLobby = false;
    document.getElementById("room-code-wrap").classList.add("hidden");
    mStatus("");
  }

  // الغرفة العامة: حاول أن تكون المضيف، وإن كان موجوداً فانضمّ إليه
  function startPublic() {
    armTimeout(mStatus);
    currentRoom = PUBLIC_CODE;
    peer = new Peer(PEER_PREFIX + PUBLIC_CODE, peerOpts());
    peer.on("open", (id) => { clearTimeout(openTimer); roomCode = ""; becomeHost(id); hideRoomCodeHud(); mStatus("🌍 " + t("hostNow")); beginPlay("host"); });
    peer.on("error", (e) => {
      if (e.type === "unavailable-id") { try { peer.destroy(); } catch (_) {} mStatus(t("connecting")); joinRoom(PUBLIC_CODE, document.getElementById("multi-status")); }
      else mStatus("خطأ: " + e.type, true);
    });
  }

  // غرفة خاصة برمز (لوبي: ينشئ العالم ويعرض الرمز دون بدء اللعب)
  function startHost(attempt, code) {
    roomCode = code; currentRoom = code;
    armTimeout(mStatus);
    peer = new Peer(PEER_PREFIX + roomCode, peerOpts());
    peer.on("open", (id) => {
      clearTimeout(openTimer);
      becomeHost(id);
      initItems(); // العالم جاهز لمن ينضمّ أثناء الانتظار
      document.getElementById("room-code-wrap").classList.remove("hidden");
      document.getElementById("room-code-display").textContent = roomCode;
      mStatus("");
    });
    peer.on("error", (e) => {
      if (e.type === "unavailable-id" && attempt < 6) { try { peer.destroy(); } catch (_) {} startHost(attempt + 1, genCode()); }
      else mStatus("خطأ: " + e.type, true);
    });
  }
  function becomeHost(id) {
    myId = id; isHost = true; online = true;
    peer.on("connection", onHostConnection);
  }
  function onHostConnection(conn) {
    conn.on("data", (d) => handleHostMsg(conn.peer, d));
    conn.on("close", () => {
      const r = remotes.get(conn.peer); remotes.delete(conn.peer); clientConns.delete(conn.peer);
      if (r) { const msg = "👋 " + r.name + " " + t("left"); notify(msg); hostBroadcast({ t: "notify", text: msg }); }
    });
    conn.on("open", () => {
      clientConns.set(conn.peer, conn);
      const nm = (conn.metadata && conn.metadata.name) || "لاعب";
      const r = remotes.get(conn.peer) || { id: conn.peer, color: colorForId(conn.peer) }; r.name = nm; remotes.set(conn.peer, r);
      try { conn.send(worldMsg()); conn.send(itemsMsg()); } catch (_) {}
      const txt = "👋 " + nm + " " + t("joined"); notify(txt); hostBroadcast({ t: "notify", text: txt }, conn.peer);
    });
  }

  // ---- الانضمام (عميل) ----
  window.doJoin = function () {
    const s = document.getElementById("join-status"); s.classList.remove("error");
    if (online && isHost) return; // أنت مضيف بالفعل — لا تنضمّ مرتين
    if (navigator.onLine === false) { s.classList.add("error"); s.textContent = t("netNeedInternet"); return; } // العالمي يحتاج إنترنت
    if (!peerLoaded()) { s.classList.add("error"); s.textContent = "تعذّر تحميل PeerJS"; return; }
    const code = (document.getElementById("join-code-input").value || "").trim().toUpperCase();
    if (!code) { s.classList.add("error"); s.textContent = "الصق رمز الغرفة"; return; }
    setName();
    joinRoom(code, s);
  };
  function joinRoom(code, statusEl) {
    const setS = (txt, err) => { statusEl.classList.toggle("error", !!err); statusEl.textContent = txt; };
    setS(t("connecting"));
    currentRoom = code;
    armTimeout(setS);
    peer = new Peer(peerOpts());
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
      conn.on("close", () => { if (online && !isHost) onHostLost(); });
    });
    peer.on("error", (e) => {
      setS(e.type === "peer-unavailable" ? t("roomNotFound") : "خطأ: " + e.type, true);
    });
  }

  // ====== نقل الاستضافة تلقائياً عند خروج المضيف ======
  function onHostLost() {
    if (!online || isHost || migrating) return;
    if (localNet) { backToMenu(); return; } // المحلي: لا ترحيل، عُد للقائمة
    migrating = true; hostConn = null;
    const newHostId = electNewHost();
    if (!newHostId) { backToMenu(); migrating = false; return; } // لم يبقَ أحد → أُغلقت الغرفة
    if (newHostId === myId) claimHost(0);   // أنا المتصدّر → أصبح المضيف
    else reconnectToHost(0);                // غيري → أعد الاتصال بالمضيف الجديد
  }
  // اختيار حتمي: المتصدّر بالنقاط (تعادل: أصغر مُعرّف)، باستثناء المضيف القديم
  function electNewHost() {
    const oldHostId = PEER_PREFIX + currentRoom;
    const cands = [{ id: myId, score: score() }];
    for (const r of remotes.values()) cands.push({ id: r.id, score: r.score || 0 });
    const filtered = cands.filter((c) => c.id !== oldHostId);
    if (!filtered.length) return null;
    filtered.sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : 1));
    return filtered[0].id;
  }
  function claimHost(attempt) {
    try { if (peer) peer.destroy(); } catch (_) {}
    remotes.clear();
    peer = new Peer(PEER_PREFIX + currentRoom, peerOpts());
    peer.on("open", (id) => {
      myId = id; isHost = true; online = true; migrating = false;
      peer.on("connection", onHostConnection);
      if (currentRoom !== PUBLIC_CODE) showRoomCodeHud(currentRoom); else hideRoomCodeHud();
    });
    peer.on("error", (e) => {
      if (e.type === "unavailable-id" && attempt < 15) setTimeout(() => claimHost(attempt + 1), 600);
      else { migrating = false; backToMenu(); }
    });
  }
  function reconnectToHost(attempt) {
    try { if (peer) peer.destroy(); } catch (_) {}
    peer = new Peer(peerOpts());
    peer.on("open", () => {
      myId = peer.id;
      const conn = peer.connect(PEER_PREFIX + currentRoom, { metadata: { name: playerName }, reliable: true });
      conn.on("data", (d) => handleClientMsg(d));
      conn.on("open", () => { hostConn = conn; isHost = false; online = true; migrating = false; netSend({ t: "hello", name: playerName }); });
      conn.on("close", () => { if (online && !isHost) onHostLost(); });
    });
    peer.on("error", () => {
      if (attempt < 15) setTimeout(() => reconnectToHost(attempt + 1), 700);
      else { migrating = false; backToMenu(); }
    });
  }

  // ===== اللعب المحلي عبر Nearby Connections (تطبيق أندرويد فقط، بلا إنترنت) =====
  // يعيد استخدام نفس بروتوكول الرسائل: نغلّف كل اتصال بكائن له send/open مثل PeerJS.
  const isNativeApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const Nearby = (isNativeApp && window.Capacitor.Plugins) ? window.Capacitor.Plugins.Nearby : null;
  let localNet = false, nearbyReady = false;
  const nearbyWrap = (id) => ({ peer: id, open: true, send: (m) => { try { Nearby.send({ to: id, data: JSON.stringify(m) }); } catch (_) {} } });
  function initNearby() {
    if (!Nearby || nearbyReady) return; nearbyReady = true;
    Nearby.addListener("data", (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (isHost) handleHostMsg(ev.id, m); else handleClientMsg(m);
    });
    Nearby.addListener("open", (ev) => {
      if (isHost) {
        const conn = nearbyWrap(ev.id); clientConns.set(ev.id, conn);
        const r = remotes.get(ev.id) || { id: ev.id, color: colorForId(ev.id) }; remotes.set(ev.id, r);
        try { conn.send({ t: "yourId", id: ev.id }); conn.send(worldMsg()); conn.send(itemsMsg()); } catch (_) {}
        const txt = "👋 " + t("joined"); notify(txt); hostBroadcast({ t: "notify", text: txt }, ev.id);
      } else {
        hostConn = nearbyWrap(ev.id); online = true; isHost = false; migrating = false;
        beginPlay("client"); netSend({ t: "hello", name: playerName });
      }
    });
    Nearby.addListener("close", (ev) => {
      if (isHost) { const r = remotes.get(ev.id); remotes.delete(ev.id); clientConns.delete(ev.id); if (r) { const msg = "👋 " + (r.name || "") + " " + t("left"); notify(msg); hostBroadcast({ t: "notify", text: msg }); } }
      else if (hostConn && hostConn.peer === ev.id) onHostLost();
    });
  }
  window.localHost = function () {
    if (!Nearby) { mStatus(t("netTimeout"), true); return; }
    setName(); initNearby(); localNet = true; currentRoom = "LAN"; myId = "host"; mStatus(t("connecting"));
    Nearby.startHost({ name: playerName }).then(() => { isHost = true; online = true; migrating = false; mStatus("📡 " + t("hostNow")); beginPlay("host"); })
      .catch((e) => { mStatus(String(e).indexOf("permission") >= 0 ? t("connecting") : ("" + (e && e.message || e)), true); });
  };
  window.localJoin = function () {
    if (!Nearby) { mStatus(t("netTimeout"), true); return; }
    setName(); initNearby(); localNet = true; currentRoom = "LAN"; myId = "c" + Math.floor(Math.random() * 1e6); mStatus(t("connecting"));
    Nearby.startJoin({ name: playerName }).catch((e) => { if (String(e).indexOf("permission") < 0) mStatus("" + (e && e.message || e), true); });
  };

  function backToMenu() {
    online = false; isHost = false; migrating = false; state = "menu"; remotes.clear(); bots.clear(); hostConn = null; clientConns.clear();
    hideRoomCodeHud(); document.body.classList.remove("in-game");
    hostLobby = false;
    if (localNet && Nearby) { try { Nearby.stop(); } catch (_) {} } localNet = false;
    try { if (window.Sound) Sound.stopMusic(); } catch (e) {} // إيقاف الموسيقى في القائمة
    try { if (peer) peer.destroy(); } catch (_) {}
    document.getElementById("start-screen").classList.remove("hidden");
    document.getElementById("chat-bar").classList.add("hidden");
    document.getElementById("pause-screen").classList.add("hidden");
    resetLockUI();
    syncPowers();
  }

  // ===== الإيقاف المؤقت =====
  function pauseGame() {
    if (state !== "playing") return;
    state = "paused";
    document.getElementById("pause-screen").classList.remove("hidden");
    document.getElementById("chat-bar").classList.add("hidden");
    document.body.classList.remove("in-game");
    updatePauseAIBtn();
    syncPowers();
  }
  window.resumeGame = function () {
    if (state !== "paused") return;
    state = "playing";
    document.getElementById("pause-screen").classList.add("hidden");
    document.getElementById("chat-bar").classList.remove("hidden");
    document.body.classList.add("in-game");
    lastT = performance.now(); // تفادي قفزة الزمن
    syncPowers();
  };
  window.exitToMenu = function () {
    document.getElementById("pause-screen").classList.add("hidden");
    backToMenu();
  };
  // الرجوع/التصغير في الهواتف → إيقاف مؤقت
  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseGame(); });
  addEventListener("popstate", () => {
    if (state === "playing") { pauseGame(); try { history.pushState({ p: "game" }, ""); } catch (_) {} }
    else if (state === "paused") exitToMenu();
  });

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
  function worldMsg() { return { t: "world", mapShape, mapTri, obstacles, dangers, level: gameLevel, shape: blockShape }; }
  function itemsMsg() {
    return {
      t: "items",
      foods: foods.map((f) => ({ id: f.id, x: +f.x.toFixed(2), y: +f.y.toFixed(2), value: f.value })),
      powerups: powerups.map((p) => ({ id: p.id, x: +p.x.toFixed(2), y: +p.y.toFixed(2), type: p.type })),
      dprojs: dangerProjectiles.map((p) => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1), r: p.r })),
    };
  }
  function bodyMsg() { return bodyPositions().map((b) => ({ x: +b.x.toFixed(2), y: +b.y.toFixed(2), v: b.value })); }
  function selfEntry() { return { id: myId, name: playerName, x: +snake.x.toFixed(2), y: +snake.y.toFixed(2), angle: snake.angle, head: headValue(), boosting: snake.boosting, score: score(), body: bodyMsg() }; }
  function myStateMsg() { return { t: "state", name: playerName, x: +snake.x.toFixed(2), y: +snake.y.toFixed(2), angle: +snake.angle.toFixed(3), head: headValue(), boosting: snake.boosting, score: score(), body: bodyMsg() }; }
  function snakesMsg() {
    const list = [];
    if (state === "playing" || state === "paused") list.push(selfEntry()); // الموقوف مؤقتاً يبقى ظاهراً ويمكن أكله؛ الميت فقط يُحذف
    for (const r of remotes.values()) list.push({ id: r.id, name: r.name, x: r.x, y: r.y, angle: r.angle, head: r.head, boosting: r.boosting, score: r.score, body: r.body });
    for (const b of bots.values()) list.push({ id: b.id, name: b.name, x: b.x, y: b.y, angle: b.angle, head: b.values[0], boosting: b.boost, score: botScore(b), body: bodyOf(b).map((s) => ({ x: +s.x.toFixed(2), y: +s.y.toFixed(2), v: s.value })) });
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
        else if (bots.has(msg.target)) applyCutToBot(bots.get(msg.target), msg.index);
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
      case "yourId": myId = msg.id; break; // المضيف المحلي يعطي العميل مُعرّفه (Nearby)
      case "world": mapShape = msg.mapShape; mapTri = msg.mapTri; obstacles = msg.obstacles || []; dangers = msg.dangers || []; gameLevel = msg.level || 1; if (msg.shape) blockShape = msg.shape; document.getElementById("level").textContent = gameLevel; break;
      case "items": foods = (msg.foods || []).map((f) => ({ id: f.id, x: f.x, y: f.y, value: f.value, size: sizeForValue(f.value), vx: 0, vy: 0 })); powerups = (msg.powerups || []).map((p) => ({ id: p.id, x: p.x, y: p.y, type: p.type, size: CONFIG.BASE_SIZE * 2.0 })); dangerProjectiles = (msg.dprojs || []).map((p) => ({ x: p.x, y: p.y, r: p.r, vx: 0, vy: 0, turn: 0, age: 0 })); break;
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
    try { // درع أمان: خطأ عابر لا يجمّد اللعبة نهائياً
      if (state === "playing") update(dt);
      else {
        updateParticles(dt); updateEmojis(dt); updateRings(dt); updateDebris(dt); updateKillFeed(dt);
        if (state === "dying") { deathTimer -= dt; if (deathTimer <= 0) finalizeOver(); }
        if (state === "won") fireworksTick(dt); // ألعاب نارية
        // المضيف ما زال داخل الغرفة (موقوف مؤقتاً/ميت): يُبقي العالم حياً ويوزّعه فلا يتجمّد العملاء
        if (isHost && online) {
          hostKeepAlive(dt);
          lastNetSend += dt; if (lastNetSend >= 0.05) { lastNetSend = 0; hostBroadcast(snakesMsg()); if ((++netItemsCounter) % 4 === 0) hostBroadcast(itemsMsg()); }
        }
      }
      if (state !== "menu") render();
    } catch (e) { console.error(e); }
    requestAnimationFrame(loop);
  }

  document.getElementById("play-btn").addEventListener("click", startGame);
  document.getElementById("restart-btn").addEventListener("click", () => { restart(); });
  document.getElementById("win-restart-btn").addEventListener("click", () => { restart(); });
  document.getElementById("room-code-hud-copy").addEventListener("click", () => { copyText(document.getElementById("room-code-hud-val").textContent); });
  try { const sv = localStorage.getItem("snake2048_name"); if (sv) document.getElementById("name-input").value = sv; } catch (e) {}

  // تثبيت التطبيق (PWA)
  let deferredPrompt = null;
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; });
  window.installApp = function () {
    if (!deferredPrompt) { notify(t("installHint")); return; }
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(() => { deferredPrompt = null; });
  };
  addEventListener("appinstalled", () => { deferredPrompt = null; });
  // تطبيق أندرويد (APK): يتيح اللعب المحلي بلا إنترنت. يُضبط الرابط بعد بناء التطبيق ورفعه على GitHub Releases.
  const APK_URL = "https://github.com/BinAref/Snack2048-game-local-network/releases/download/v1/Snake2048.apk";
  window.downloadAndroid = function () {
    closeDownload();
    if (APK_URL) window.open(APK_URL, "_blank");
    else { notify(t("apkSoon")); installApp(); } // مؤقتاً: نسخة الأوفلاين قريباً + إتاحة تثبيت PWA الآن
  };
  window.downloadIphone = function () { closeDownload(); installApp(); }; // آيفون = PWA

  // التعليمات
  window.openHelp = function () { document.getElementById("help-screen").classList.remove("hidden"); };
  // ويدجت تحميل اللعبة: يعرض خياري أندرويد/آيفون مع الشرح
  window.openDownload = function () { document.getElementById("download-modal").classList.remove("hidden"); };
  window.closeDownload = function () { document.getElementById("download-modal").classList.add("hidden"); };
  window.closeHelp = function () { document.getElementById("help-screen").classList.add("hidden"); };
  // الرجوع للواجهة الرئيسية من شاشتي الفوز/الخسارة
  window.toMenu = function () {
    document.getElementById("over-screen").classList.add("hidden");
    document.getElementById("win-screen").classList.add("hidden");
    backToMenu();
  };
  // إغلاق اللعبة (المتصفح/التطبيق)
  window.quitGame = function () {
    // التطبيق الأصلي: أغلق التطبيق فعلياً
    try { if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App) { Capacitor.Plugins.App.exitApp(); return; } } catch (e) {}
    // المتصفّح/PWA: حاول إغلاق التبويب (ينجح إن فُتح عبر سكربت أو في وضع التطبيق المستقل) — بلا about:blank
    try { window.open("", "_self"); window.close(); } catch (e) {}
    try { window.close(); } catch (e) {}
  };

  // اختيار شكل المكعبات (درب‑داون جانبي)
  const SHAPE_ICONS = { cube: "⬛", sphere: "⚫", cylinder: "🛢️", gem: "🔷", hex: "⬡", pyramid: "🔺", star: "⭐" };
  window.toggleShapeDD = function () { document.getElementById("shape-options").classList.toggle("hidden"); };
  window.selectShape = function (s) { blockShape = s; try { localStorage.setItem("snake2048_shape", s); } catch (e) {} updateShapeUI(); document.getElementById("shape-options").classList.add("hidden"); };
  function updateShapeUI() {
    document.getElementById("shape-toggle").textContent = SHAPE_ICONS[blockShape] || "⬛";
    document.querySelectorAll("#shape-options .shape-btn").forEach((b) => b.classList.toggle("active", b.dataset.shape === blockShape));
  }
  updateShapeUI();

  // ===== الإعدادات: صوت + اهتزاز + جودة =====
  window.openSettings = function () { document.getElementById("settings-screen").classList.remove("hidden"); };
  window.closeSettings = function () { document.getElementById("settings-screen").classList.add("hidden"); };
  function setChecked(id, v) { const e = document.getElementById(id); if (e) e.checked = v; }
  // كتم/تشغيل الصوت (يزامن كل مفاتيح الصوت)
  window.toggleSound = function () {
    if (!window.Sound) return;
    const on = !Sound.toggleMute();
    setChecked("set-sound", on); setChecked("pause-snd-toggle", on);
  };
  window.toggleHaptics = function () {
    const cb = document.getElementById("set-haptics"); hapticsOn = cb ? cb.checked : !hapticsOn;
    try { localStorage.setItem("snake2048_haptics", hapticsOn ? "1" : "0"); } catch (e) {}
    if (hapticsOn) vibrate(30);
  };
  window.toggleQuality = function () {
    const cb = document.getElementById("set-quality"); lowGfx = cb ? !cb.checked : !lowGfx;
    try { localStorage.setItem("snake2048_lowgfx", lowGfx ? "1" : "0"); } catch (e) {}
    applyQuality();
  };
  function applyQuality() { try { const bg = document.getElementById("bg-stars"); if (bg) bg.style.display = lowGfx ? "none" : ""; } catch (e) {} }
  // ضبط الحالة الأولية للمفاتيح
  try {
    setChecked("set-sound", !(window.Sound && Sound.isMuted()));
    setChecked("pause-snd-toggle", !(window.Sound && Sound.isMuted()));
    setChecked("set-haptics", hapticsOn);
    setChecked("set-quality", !lowGfx);
    applyQuality();
  } catch (e) {}

  // ===== الإنجازات (نظام متدرّج) + ملفّ اللاعب =====
  const ACHIEVEMENTS = [
    { type: "num", v: 1024, icon: "🔢" }, { type: "num", v: 2048, icon: "🔢" }, { type: "num", v: 4096, icon: "🟦" },
    { type: "num", v: 8192, icon: "🟦" }, { type: "num", v: 16384, icon: "💎" }, { type: "num", v: 32768, icon: "💠" },
    { type: "kills", v: 10, icon: "⚔️" }, { type: "kills", v: 50, icon: "🗡️" }, { type: "kills", v: 100, icon: "💀" }, { type: "kills", v: 250, icon: "☠️" },
    { type: "games", v: 10, icon: "🎮" }, { type: "games", v: 50, icon: "🎮" }, { type: "games", v: 100, icon: "🕹️" },
    { type: "play", v: 1800, icon: "⏱️" }, { type: "play", v: 7200, icon: "⏳" },
    { type: "king", v: 360, icon: "👑" }, { type: "king", v: 1800, icon: "👑" },
    { type: "cup", v: 1, icon: "🏆" }, { type: "cup", v: 5, icon: "🏆" }, { type: "cup", v: 10, icon: "🥇" },
  ];
  const achId = (a) => a.type + a.v;
  function achTest(a, s) {
    if (a.type === "num") return (s.best || 0) >= a.v;
    if (a.type === "kills") return (s.kills || 0) >= a.v;
    if (a.type === "games") return (s.games || 0) >= a.v;
    if (a.type === "play") return (s.playSec || 0) >= a.v;
    if (a.type === "king") return (s.reign || 0) >= a.v;
    if (a.type === "cup") return (s.cups || 0) >= a.v;
    return false;
  }
  function achName(a) {
    if (a.type === "num") return t("achReach") + " " + fmtNum(a.v);
    if (a.type === "kills") return a.v + " " + t("achKills");
    if (a.type === "games") return a.v + " " + t("stGames");
    if (a.type === "play") return t("achPlay") + " " + Math.round(a.v / 60) + "m";
    if (a.type === "king") return "👑 " + Math.round(a.v / 60) + "m";
    if (a.type === "cup") return a.v + " " + t("stCups");
    return "";
  }
  function checkAchievements() {
    for (const a of ACHIEVEMENTS) { const id = achId(a); if (!stats.ach[id] && achTest(a, stats)) { stats.ach[id] = 1; notify("🏅 " + achName(a)); sfx("win"); } }
    saveStats();
  }
  function recordGameEnd(won) {
    stats.games++; stats.playSec += Math.round(playTime);
    stats.best = Math.max(stats.best || 0, headValue() || 0, deathBest || 0, highScore || 0);
    stats.reign = Math.max(stats.reign || 0, maxReign);
    if (won) stats.cups++;
    saveStats(); checkAchievements();
  }
  window.openProfile = function () {
    const card = (ic, val, lb) => `<div class="stat"><div class="stat-ic">${ic}</div><div class="stat-val">${val}</div><div class="stat-lb">${lb}</div></div>`;
    const got = ACHIEVEMENTS.filter((a) => stats.ach[achId(a)]).length;
    document.getElementById("profile-stats").innerHTML =
      card("🔢", fmtNum(Math.max(stats.best || 0, highScore || 0)), t("stBest")) +
      card("🎮", stats.games || 0, t("stGames")) +
      card("⚔️", stats.kills || 0, t("stKills")) +
      card("⏱️", Math.floor((stats.playSec || 0) / 60) + "m", t("stTime")) +
      card("🏆", stats.cups || 0, t("stCups")) +
      card("🏅", got + "/" + ACHIEVEMENTS.length, t("achievements"));
    document.getElementById("profile-ach").innerHTML = ACHIEVEMENTS.map((a) =>
      `<div class="ach ${stats.ach[achId(a)] ? "got" : ""}"><div class="ach-ic">${a.icon}</div><div class="ach-nm">${achName(a)}</div></div>`).join("");
    document.getElementById("profile-screen").classList.remove("hidden");
  };
  window.closeProfile = function () { document.getElementById("profile-screen").classList.add("hidden"); };

  buildPowers();
  if (isNativeApp) { try { document.getElementById("local-lan").classList.remove("hidden"); } catch (e) {} } // لعب محلي في التطبيق فقط
  try { document.getElementById("ai-toggle").checked = aiEnabled; } catch (e) {}
  gameLevel = 1; resetSnake(); initItems(); updateCamera(0, 0);
  document.getElementById("highscore").textContent = fmtNum(highScore);
  requestAnimationFrame((t) => { lastT = t; loop(t); });
})();
