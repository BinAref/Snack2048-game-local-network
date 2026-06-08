/* =========================================================================
   Snake 2048  —  Multiplayer (WebRTC/PeerJS)  +  Solo
   =========================================================================
   البنية:
   · Solo   – لعبة منفردة كالمعتاد
   · Host   – ينشئ غرفة، يتحكّم بالخريطة/الطعام/البذرة، يُزامن الحالة
   · Guest  – يدخل كود الغرفة، يرسل إدخاله، يستقبل الحالة من الـ Host

   بروتوكول الرسائل (كلها JSON):
   Host → Guest:
     { t:"world",  seed, obstacles, foods, powerups, mapTimer }
     { t:"peers",  players: [{id,name,x,y,angle,values,stamina,boosting,dead}] }
     { t:"start"  }
     { t:"foodEat", idx, newFood }
     { t:"puEat",   idx, newPu   }
   Guest → Host:
     { t:"hello", name }
     { t:"input", x, y, angle, values, stamina, boosting, dead }
   ========================================================================= */

(() => {
"use strict";

// -------------------------------------------------------------------------
// إعدادات
// -------------------------------------------------------------------------
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
  TURN_RATE: 6.8,

  SPEEDCUBE_MULT: 2.0,
  SPEEDCUBE_TIME: 3.0,

  BOOST_MULT: 1.5,
  BOOST_DRAIN: 0.25,   // يُفرغ الشريط في ~4 ثوانٍ
  BOOST_REFILL: 0.10,  // يملؤه في 10 ثوانٍ

  FOOD_COUNT: 90,
  POWERUP_COUNT: 8,
  OBSTACLE_MIN: 6,
  OBSTACLE_MAX: 10,
  MAP_INTERVAL: 600,   // تغيير الخريطة كل 10 دقائق
  START_SNAKE: [8, 4, 2],

  NET_SEND_RATE: 0.05,  // إرسال الموقع كل 50ms
  SYNC_RATE: 0.5,       // Host يُزامن حالة الكل كل 500ms
};

const FOOD_WEIGHTS = [
  { v: 2, w: 46 }, { v: 4, w: 28 }, { v: 8, w: 15 },
  { v: 16, w: 8 }, { v: 32, w: 3 },
];
const POWERUPS = {
  speed:  { color: "#19d3ff", label: "⚡", glow: "#19d3ff" },
  double: { color: "#37d67a", label: "×2", glow: "#37d67a" },
  half:   { color: "#ff5d73", label: "÷2", glow: "#ff5d73" },
};
const POWERUP_WEIGHTS = [
  { t: "speed", w: 50 }, { t: "double", w: 30 }, { t: "half", w: 20 },
];

// ألوان للاعبين الآخرين (تُميّزهم)
const PEER_COLORS = [
  "#ff6b6b","#ffd93d","#6bcb77","#4d96ff",
  "#ff9af2","#ff944d","#a8ff78","#38cfff",
];

// -------------------------------------------------------------------------
// Canvas
// -------------------------------------------------------------------------
const canvas = document.getElementById("game");
const ctx    = canvas.getContext("2d");
let W = 0, H = 0, DPR = 1;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width  = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width  = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// -------------------------------------------------------------------------
// أدوات
// -------------------------------------------------------------------------
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp   = (a, b, t)  => a + (b - a) * t;
const log2   = (v)        => Math.log(v) / Math.LN2;

function angleLerp(a, target, maxStep) {
  let d = target - a;
  while (d >  Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  if (d >  maxStep) d =  maxStep;
  if (d < -maxStep) d = -maxStep;
  return a + d;
}

const sizeForValue = (v) =>
  CONFIG.BASE_SIZE * (0.86 + CONFIG.SIZE_GROWTH * (log2(v) - 1));

const VALUE_COLORS = {
  2:"#f2c14e",4:"#f0a868",8:"#ec7d5a",16:"#e85d5d",
  32:"#d94f9a",64:"#9b5de5",128:"#5d8ce8",256:"#4fb0e8",
  512:"#3fc7c0",1024:"#46c97a",2048:"#8ad94f",4096:"#ffd23f",
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

// -------------------------------------------------------------------------
// كاميرا وإسقاط
// -------------------------------------------------------------------------
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

// -------------------------------------------------------------------------
// رسم مشترك
// -------------------------------------------------------------------------
function quad(a, b, c, d) {
  ctx.beginPath();
  ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
  ctx.lineTo(c.x,c.y); ctx.lineTo(d.x,d.y);
  ctx.closePath(); ctx.fill();
}
function strokePath(pts, close) {
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (close) ctx.closePath();
  ctx.stroke();
}
const mid = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

// مكعب مجسّم
function drawCube(wx, wy, sizeW, opts) {
  const color = opts.color;
  const half  = sizeW / 2;
  const t1 = project(wx - half, wy - half);
  const t2 = project(wx + half, wy - half);
  const t3 = project(wx + half, wy + half);
  const t4 = project(wx - half, wy + half);
  const ch  = sizeW * CONFIG.SCALE * CONFIG.CUBE_H;

  // ظل أرضي
  ctx.save();
  ctx.globalAlpha = 0.22; ctx.fillStyle = "#000";
  const sh = project(wx, wy);
  ctx.beginPath();
  ctx.ellipse(sh.x, sh.y + ch * 0.6,
    half * CONFIG.SCALE * 1.05, half * CONFIG.SCALE * 0.5,
    0, 0, Math.PI * 2);
  ctx.fill(); ctx.restore();

  ctx.fillStyle = shade(color, 0.70);
  quad(t2, t3, { x:t3.x, y:t3.y+ch }, { x:t2.x, y:t2.y+ch });
  ctx.fillStyle = shade(color, 0.52);
  quad(t4, t3, { x:t3.x, y:t3.y+ch }, { x:t4.x, y:t4.y+ch });
  ctx.fillStyle = color;
  quad(t1, t2, t3, t4);

  ctx.fillStyle = shade(color, 1.18);
  quad(mid(t1,t2,0.12), mid(t2,t3,0.12),
       { x:(t3.x+t1.x)/2, y:(t3.y+t1.y)/2 }, mid(t1,t4,0.12));

  ctx.strokeStyle = shade(color, 0.40); ctx.lineWidth = 1.4;
  strokePath([t1,t2,t3,t4], true);
  strokePath([t2,{x:t2.x,y:t2.y+ch}], false);
  strokePath([t3,{x:t3.x,y:t3.y+ch}], false);
  strokePath([t4,{x:t4.x,y:t4.y+ch}], false);

  const cx = (t1.x+t2.x+t3.x+t4.x)/4;
  const cy = (t1.y+t2.y+t3.y+t4.y)/4;
  const fs = Math.max(9, sizeW * CONFIG.SCALE * 0.42);
  ctx.font = `800 ${fs}px "Segoe UI",Tahoma,sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(2, fs*0.16); ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.strokeText(opts.label, cx, cy);
  ctx.fillStyle = "#fff"; ctx.fillText(opts.label, cx, cy);
}

// بطاقة قوى مسطّحة (سجادة)
function drawCard(wx, wy, sizeW, type) {
  const pu   = POWERUPS[type];
  const half = sizeW / 2;
  const a = project(wx-half, wy-half);
  const b = project(wx+half, wy-half);
  const c = project(wx+half, wy+half);
  const d = project(wx-half, wy+half);
  const pulse = 0.5 + 0.5 * Math.sin(now * 3 + wx);

  ctx.save();
  ctx.shadowColor = pu.glow;
  ctx.shadowBlur  = 14 + pulse * 10;

  ctx.fillStyle = shade(pu.color, 0.45);
  quad(a, b, c, d);
  const k = 0.16;
  ctx.fillStyle = pu.color;
  quad(mid(a,c,k), mid(b,d,k), mid(c,a,k), mid(d,b,k));
  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.5;
  strokePath([mid(a,c,0.30), mid(b,d,0.30), mid(c,a,0.30), mid(d,b,0.30)], true);

  const cx = (a.x+b.x+c.x+d.x)/4;
  const cy = (a.y+b.y+c.y+d.y)/4;
  const fs = sizeW * CONFIG.SCALE * 0.40;
  ctx.font = `800 ${fs}px "Segoe UI",Tahoma,sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.strokeText(pu.label, cx, cy);
  ctx.fillStyle = "#fff"; ctx.fillText(pu.label, cx, cy);
}

// حاجز
function drawBox(cx, cy, hw, hh, height, color) {
  const t1 = project(cx-hw, cy-hh);
  const t2 = project(cx+hw, cy-hh);
  const t3 = project(cx+hw, cy+hh);
  const t4 = project(cx-hw, cy+hh);
  const ch  = height * CONFIG.SCALE * 0.5;

  ctx.fillStyle = shade(color, 0.62);
  quad(t2, t3, {x:t3.x,y:t3.y+ch}, {x:t2.x,y:t2.y+ch});
  ctx.fillStyle = shade(color, 0.45);
  quad(t4, t3, {x:t3.x,y:t3.y+ch}, {x:t4.x,y:t4.y+ch});
  ctx.fillStyle = color;
  quad(t1, t2, t3, t4);

  ctx.strokeStyle = shade(color, 0.30); ctx.lineWidth = 1.5;
  strokePath([t1,t2,t3,t4], true);
  strokePath([t2,{x:t2.x,y:t2.y+ch}], false);
  strokePath([t3,{x:t3.x,y:t3.y+ch}], false);
  strokePath([t4,{x:t4.x,y:t4.y+ch}], false);
}

// -------------------------------------------------------------------------
// الثعبان المحلي
// -------------------------------------------------------------------------
const snake = {
  x:0, y:0, angle:0, values:[], path:[],
  speedTimer:0, stamina:1, boosting:false,
};
let playerName = "أنت";
let myColorIndex = 0; // لون مخصّص عند اللعب المتعدد

function resetSnake(startX, startY, startAngle) {
  snake.x = startX || 0;
  snake.y = startY || 0;
  snake.angle = startAngle || 0;
  snake.values = CONFIG.START_SNAKE.slice().sort((a,b)=>b-a);
  snake.path   = [{ x: snake.x, y: snake.y }];
  snake.speedTimer = 0; snake.stamina = 1; snake.boosting = false;
}

function segmentDistances(values) {
  const v = values || snake.values;
  const d = [0];
  for (let i = 1; i < v.length; i++) {
    const s1 = sizeForValue(v[i-1]);
    const s2 = sizeForValue(v[i]);
    d.push(d[i-1] + ((s1+s2)/2) * CONFIG.SEG_GAP);
  }
  return d;
}
function pointAtDistance(path, d) {
  const p = path;
  if (d <= 0 || p.length < 2) return { x:p[0].x, y:p[0].y };
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const seg = Math.hypot(p[i].x-p[i-1].x, p[i].y-p[i-1].y);
    if (seg <= 1e-6) continue;
    if (acc + seg >= d) {
      const t = (d - acc) / seg;
      return { x:lerp(p[i-1].x,p[i].x,t), y:lerp(p[i-1].y,p[i].y,t) };
    }
    acc += seg;
  }
  const last = p[p.length-1];
  return { x:last.x, y:last.y };
}
function bodyPositions(path, values) {
  path   = path   || snake.path;
  values = values || snake.values;
  return segmentDistances(values).map((d, i) => {
    const pt = pointAtDistance(path, d);
    return { x:pt.x, y:pt.y, value:values[i], size:sizeForValue(values[i]) };
  });
}
const headValue = () => snake.values[0] || 2;
const score     = () => snake.values.reduce((s,v)=>s+v, 0);

// -------------------------------------------------------------------------
// الخريطة (يتحكّم بها الـ Host / Solo)
// -------------------------------------------------------------------------
let foods = [], powerups = [], obstacles = [];

function seededRand(seed) {
  // PRNG بسيط لتوليد نفس الخريطة على جميع الأجهزة
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

function weighted(list, key, rand) {
  const r = rand || Math.random;
  const total = list.reduce((s,e)=>s+e.w, 0);
  let v = (typeof r === "function" ? r() : Math.random()) * total;
  for (const e of list) { if (v < e.w) return e[key]; v -= e.w; }
  return list[0][key];
}
function insideObstacle(x, y, margin) {
  for (const o of obstacles) {
    if (x > o.x-o.hw-margin && x < o.x+o.hw+margin &&
        y > o.y-o.hh-margin && y < o.y+o.hh+margin) return true;
  }
  return false;
}
function freeWorldPos(margin, rand) {
  const m = CONFIG.WORLD * 0.92;
  const r = rand || Math.random;
  for (let k = 0; k < 30; k++) {
    const x = (r()*2-1)*m, y = (r()*2-1)*m;
    if (!insideObstacle(x, y, margin)) return { x, y };
  }
  return { x:(r()*2-1)*m, y:(r()*2-1)*m };
}

function genObstacles(rand) {
  obstacles = [];
  const r = rand || Math.random;
  const count = CONFIG.OBSTACLE_MIN +
    Math.floor(r() * (CONFIG.OBSTACLE_MAX - CONFIG.OBSTACLE_MIN + 1));
  const lim = CONFIG.WORLD * 0.8;
  let tries = 0;
  while (obstacles.length < count && tries < 300) {
    tries++;
    const x = (r()*2-1)*lim;
    const y = (r()*2-1)*lim;
    if (Math.hypot(x, y) < 18) continue;
    const longish = r() < 0.5;
    const a = 3 + r()*6, b = 3 + r()*6;
    const hw = longish ? a*1.6 : a;
    const hh = longish ? b : b*1.6;
    let ok = true;
    for (const o of obstacles) {
      if (Math.abs(o.x-x) < o.hw+hw+4 && Math.abs(o.y-y) < o.hh+hh+4)
        { ok = false; break; }
    }
    if (ok) obstacles.push({ x, y, hw, hh, h:2.6, color:"#3a4a66" });
  }
}

function initItems(seed) {
  const r = seed !== undefined ? seededRand(seed) : Math.random.bind(Math);
  genObstacles(r);
  foods = []; powerups = [];
  for (let i = 0; i < CONFIG.FOOD_COUNT; i++) {
    const p = freeWorldPos(1, r);
    const v = weighted(FOOD_WEIGHTS, "v", r);
    foods.push({ x:p.x, y:p.y, value:v, size:sizeForValue(v) });
  }
  for (let i = 0; i < CONFIG.POWERUP_COUNT; i++) {
    const p = freeWorldPos(2, r);
    const t = weighted(POWERUP_WEIGHTS, "t", r);
    powerups.push({ x:p.x, y:p.y, type:t, size:CONFIG.BASE_SIZE*2.0 });
  }
}

function spawnFood() {
  const p = freeWorldPos(1);
  const v = weighted(FOOD_WEIGHTS, "v");
  return { x:p.x, y:p.y, value:v, size:sizeForValue(v) };
}
function spawnPowerup() {
  const p = freeWorldPos(2);
  const t = weighted(POWERUP_WEIGHTS, "t");
  return { x:p.x, y:p.y, type:t, size:CONFIG.BASE_SIZE*2.0 };
}

// -------------------------------------------------------------------------
// الأكل والقوى
// -------------------------------------------------------------------------
function eatValue(v) {
  snake.values.push(v);
  snake.values.sort((a,b)=>b-a);
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < snake.values.length-1; i++) {
      if (snake.values[i] === snake.values[i+1]) {
        snake.values[i] *= 2;
        snake.values.splice(i+1, 1);
        snake.values.sort((a,b)=>b-a);
        merged = true; break;
      }
    }
  }
}

function applyPowerup(type) {
  if (type === "speed") {
    snake.speedTimer = CONFIG.SPEEDCUBE_TIME;
  } else if (type === "double") {
    snake.values = snake.values.map(v => v*2);
  } else if (type === "half") {
    snake.values = snake.values.map(v=>v/2).filter(v=>v>=2);
    snake.values.sort((a,b)=>b-a);
    if (snake.values.length === 0) triggerGameOver();
  }
}

// -------------------------------------------------------------------------
// الإدخال
// -------------------------------------------------------------------------
let pointer = { x: 0, y: 0 };
const input = {
  holding: false,
  up:false, down:false, left:false, right:false,
  boostKey: false,
};

canvas.addEventListener("mousemove", e => {
  pointer.x = e.clientX; pointer.y = e.clientY;
});
canvas.addEventListener("mousedown",  e => { if(e.button===0) input.holding=true; });
window.addEventListener("mouseup",    e => { if(e.button===0) input.holding=false; });
canvas.addEventListener("mouseleave", () => { input.holding=false; });
canvas.addEventListener("contextmenu", e => e.preventDefault());
canvas.addEventListener("touchstart", e => {
  if(e.touches[0]){ pointer.x=e.touches[0].clientX; pointer.y=e.touches[0].clientY; }
  input.holding=true;
}, { passive:true });
canvas.addEventListener("touchmove", e => {
  if(e.touches[0]){ pointer.x=e.touches[0].clientX; pointer.y=e.touches[0].clientY; }
  e.preventDefault();
}, { passive:false });
window.addEventListener("touchend", () => { input.holding=false; });

function isTyping() {
  const el = document.activeElement;
  return el && (el.tagName==="INPUT" || el.tagName==="TEXTAREA");
}
window.addEventListener("keydown", e => {
  if(isTyping()) return;
  switch(e.code) {
    case "ArrowUp":    case "KeyW": input.up       = true; e.preventDefault(); break;
    case "ArrowDown":  case "KeyS": input.down     = true; e.preventDefault(); break;
    case "ArrowLeft":  case "KeyA": input.left     = true; e.preventDefault(); break;
    case "ArrowRight": case "KeyD": input.right    = true; e.preventDefault(); break;
    case "Space":                   input.boostKey = true; e.preventDefault(); break;
  }
});
window.addEventListener("keyup", e => {
  switch(e.code) {
    case "ArrowUp":    case "KeyW": input.up       = false; break;
    case "ArrowDown":  case "KeyS": input.down     = false; break;
    case "ArrowLeft":  case "KeyA": input.left     = false; break;
    case "ArrowRight": case "KeyD": input.right    = false; break;
    case "Space":                   input.boostKey = false; break;
  }
});

// -------------------------------------------------------------------------
// الشبكة — PeerJS
// -------------------------------------------------------------------------
// netMode: "solo" | "host" | "guest"
let netMode    = "solo";
let peer       = null;          // PeerJS instance
let hostConn   = null;          // اتصال Guest → Host
let guestConns = {};            // { peerId: DataConnection }  (Host فقط)
let remotePlayers = {};         // { peerId: { name, x, y, angle, values, path:[], stamina, boosting, dead, colorIdx } }
let myPeerId   = null;
let roomSeed   = 0;
let netSendTimer = 0;
let syncTimer    = 0;
let colorCounter = 0;

function broadcast(msg) {
  const str = JSON.stringify(msg);
  for (const id in guestConns) {
    try { guestConns[id].send(str); } catch(e){}
  }
}

function sendToHost(msg) {
  if(hostConn && hostConn.open) {
    try { hostConn.send(JSON.stringify(msg)); } catch(e){}
  }
}

function buildWorldMsg() {
  return {
    t: "world",
    seed: roomSeed,
    obstacles: obstacles.map(o=>({...o})),
    foods: foods.map(f=>({...f})),
    powerups: powerups.map(p=>({...p})),
  };
}

function buildPeersMsg() {
  const players = [];
  // نفسي (الـ Host)
  players.push({
    id: myPeerId,
    name: playerName,
    x: snake.x, y: snake.y,
    angle: snake.angle,
    values: snake.values.slice(),
    stamina: snake.stamina,
    boosting: snake.boosting,
    dead: state === "over",
    colorIdx: myColorIndex,
  });
  // الـ Guests
  for (const id in remotePlayers) {
    const rp = remotePlayers[id];
    players.push({
      id,
      name: rp.name,
      x: rp.x, y: rp.y,
      angle: rp.angle,
      values: rp.values || [2],
      stamina: rp.stamina || 1,
      boosting: rp.boosting || false,
      dead: rp.dead || false,
      colorIdx: rp.colorIdx,
    });
  }
  return { t:"peers", players };
}

function initPeer(onReady) {
  // نستخدم STUN مفتوح + خادم PeerJS العام
  peer = new Peer(undefined, {
    config: {
      iceServers: [
        { urls:"stun:stun.l.google.com:19302" },
        { urls:"stun:stun1.l.google.com:19302" },
      ],
    },
  });
  peer.on("open", id => {
    myPeerId = id;
    if(onReady) onReady(id);
  });
  peer.on("error", err => {
    console.error("PeerJS error:", err);
    setJoinStatus("خطأ في الاتصال: " + err.type, true);
    setHostStatus("خطأ: " + err.type);
  });
}

// Host: قبول اتصالات جديدة
function setupHostListeners() {
  peer.on("connection", conn => {
    conn.on("open", () => {
      guestConns[conn.peer] = conn;
      // أرسل حالة العالم الحالية للضيف الجديد
      conn.send(JSON.stringify(buildWorldMsg()));
      conn.send(JSON.stringify(buildPeersMsg()));
      conn.send(JSON.stringify({ t:"start" }));
      updateHostStatus();
    });
    conn.on("data", raw => {
      try {
        const msg = JSON.parse(raw);
        handleHostReceive(conn.peer, msg);
      } catch(e){}
    });
    conn.on("close", () => {
      delete guestConns[conn.peer];
      delete remotePlayers[conn.peer];
      updateHostStatus();
      updateLB();
    });
    conn.on("error", () => {
      delete guestConns[conn.peer];
      delete remotePlayers[conn.peer];
    });
  });
}

function handleHostReceive(peerId, msg) {
  if (msg.t === "hello") {
    if (!remotePlayers[peerId]) {
      remotePlayers[peerId] = {
        name: escapeHtml(msg.name || "ضيف"),
        x:0, y:0, angle:0, values:[2], path:[{x:0,y:0}],
        stamina:1, boosting:false, dead:false,
        colorIdx: (colorCounter++ % PEER_COLORS.length),
      };
    }
    updateHostStatus();
  }
  if (msg.t === "input") {
    const rp = remotePlayers[peerId];
    if (!rp) return;
    // تحديث موضع + مسار
    if (rp.x !== msg.x || rp.y !== msg.y) {
      rp.path.unshift({ x:msg.x, y:msg.y });
      // قصّر المسار
      const need = (segmentDistances(msg.values||[2]).pop() || 0) + 4;
      let tot = 0;
      for (let i = 1; i < rp.path.length; i++) {
        tot += Math.hypot(rp.path[i].x-rp.path[i-1].x, rp.path[i].y-rp.path[i-1].y);
        if (tot > need) { rp.path.length = i+1; break; }
      }
    }
    rp.x       = msg.x;
    rp.y       = msg.y;
    rp.angle   = msg.angle;
    rp.values  = msg.values || [2];
    rp.stamina = msg.stamina;
    rp.boosting= msg.boosting;
    rp.dead    = msg.dead;
    updateLB();
  }
}

// Guest: معالجة رسائل الـ Host
function handleGuestReceive(msg) {
  if (msg.t === "world") {
    // استقبل خريطة الـ Host
    obstacles = (msg.obstacles || []);
    foods     = (msg.foods     || []);
    powerups  = (msg.powerups  || []);
  }
  if (msg.t === "peers") {
    // حدّث بيانات جميع اللاعبين
    const seen = new Set();
    for (const p of (msg.players || [])) {
      if (p.id === myPeerId) continue; // تجاهل نفسك
      seen.add(p.id);
      if (!remotePlayers[p.id]) {
        remotePlayers[p.id] = { path:[{x:p.x,y:p.y}] };
      }
      const rp = remotePlayers[p.id];
      if (rp.x !== p.x || rp.y !== p.y) {
        rp.path.unshift({ x:p.x, y:p.y });
        const need = (segmentDistances(p.values||[2]).pop() || 0) + 4;
        let tot = 0;
        for (let i = 1; i < rp.path.length; i++) {
          tot += Math.hypot(rp.path[i].x-rp.path[i-1].x, rp.path[i].y-rp.path[i-1].y);
          if (tot > need) { rp.path.length = i+1; break; }
        }
      }
      rp.x       = p.x; rp.y = p.y;
      rp.angle   = p.angle;
      rp.name    = p.name;
      rp.values  = p.values || [2];
      rp.stamina = p.stamina;
      rp.boosting= p.boosting;
      rp.dead    = p.dead;
      rp.colorIdx= p.colorIdx;
    }
    // أزل من غادر
    for (const id in remotePlayers) {
      if (!seen.has(id)) delete remotePlayers[id];
    }
    updateLB();
  }
  if (msg.t === "start") {
    if (state !== "playing") {
      state = "playing";
      document.getElementById("start-screen").classList.add("hidden");
      document.getElementById("over-screen").classList.add("hidden");
    }
  }
  if (msg.t === "foodEat") {
    if (msg.idx >= 0 && msg.idx < foods.length) foods[msg.idx] = msg.newFood;
  }
  if (msg.t === "puEat") {
    if (msg.idx >= 0 && msg.idx < powerups.length) powerups[msg.idx] = msg.newPu;
  }
}

// -------------------------------------------------------------------------
// حالة اللعبة
// -------------------------------------------------------------------------
let state = "menu";  // "menu" | "playing" | "over"
let lastT = 0, now = 0, mapTimer = 0;

function startSolo() {
  netMode = "solo";
  remotePlayers = {};
  playerName = getNameInput();
  myColorIndex = 0;
  resetSnake(); initItems(); mapTimer = 0;
  updateCamera(snake.x, snake.y);
  state = "playing";
  hideScreens();
}

function startAsHost() {
  netMode = "host";
  roomSeed = Math.floor(Math.random() * 1e9);
  playerName = getNameInput();
  myColorIndex = 0;
  colorCounter = 1;
  remotePlayers = {};
  resetSnake(); initItems(roomSeed); mapTimer = 0;
  updateCamera(snake.x, snake.y);
  state = "playing";
  hideScreens();
  // أعلِم الـ Guests ببدء اللعبة وإرسال الخريطة
  broadcast(buildWorldMsg());
  broadcast({ t:"start" });
}

function joinAsGuest(code) {
  netMode = "guest";
  playerName = getNameInput();
  myColorIndex = colorCounter++ % PEER_COLORS.length;
  remotePlayers = {};
  resetSnake(); initItems(); mapTimer = 0;
  updateCamera(snake.x, snake.y);

  hostConn = peer.connect(code.trim(), { reliable:true, serialization:"raw" });
  hostConn.on("open", () => {
    setJoinStatus("متصل! في انتظار بدء اللعبة…");
    hostConn.send(JSON.stringify({ t:"hello", name:playerName }));
  });
  hostConn.on("data", raw => {
    try { handleGuestReceive(JSON.parse(raw)); } catch(e){}
  });
  hostConn.on("close", () => {
    setJoinStatus("انقطع الاتصال بالمضيف", true);
    state = "menu";
    document.getElementById("start-screen").classList.remove("hidden");
  });
  hostConn.on("error", err => {
    setJoinStatus("فشل الاتصال — تأكّد من الكود", true);
  });
}

function triggerGameOver() {
  state = "over";
  document.getElementById("final-best").textContent  = headValue();
  document.getElementById("final-score").textContent = score();
  document.getElementById("over-screen").classList.remove("hidden");
  if (netMode === "guest") {
    sendToHost({ t:"input", x:snake.x, y:snake.y, angle:snake.angle,
      values:snake.values, stamina:snake.stamina, boosting:false, dead:true });
  }
}

function restartGame() {
  if (netMode === "host") startAsHost();
  else if (netMode === "guest") {
    // إعادة الانطلاق دون إعادة الاتصال
    resetSnake(); state = "playing";
    document.getElementById("over-screen").classList.add("hidden");
    sendToHost({ t:"hello", name:playerName });
  } else startSolo();
}

function getNameInput() {
  const inp = document.getElementById("name-input");
  const nm  = (inp.value || "").trim();
  const name = nm || "أنت";
  try { localStorage.setItem("snake2048_name", name); } catch(e){}
  return name;
}
function hideScreens() {
  document.getElementById("start-screen").classList.add("hidden");
  document.getElementById("over-screen").classList.add("hidden");
}

// -------------------------------------------------------------------------
// سرعة
// -------------------------------------------------------------------------
function currentSpeed() {
  let m = 1;
  if (snake.speedTimer > 0) m *= CONFIG.SPEEDCUBE_MULT;
  if (snake.boosting)        m *= CONFIG.BOOST_MULT;
  return CONFIG.SPEED * m;
}

function steerTo(sdx, sdy, dt) {
  const o = unproject(W/2, H/2);
  const p = unproject(W/2+sdx, H/2+sdy);
  const desired = Math.atan2(p.y-o.y, p.x-o.x);
  snake.angle = angleLerp(snake.angle, desired, CONFIG.TURN_RATE * dt);
}

// -------------------------------------------------------------------------
// Update
// -------------------------------------------------------------------------
function update(dt) {
  // تغيير الخريطة دورياً (Solo + Host فقط)
  if (netMode !== "guest") {
    mapTimer += dt;
    if (mapTimer >= CONFIG.MAP_INTERVAL) {
      mapTimer = 0;
      const newSeed = Math.floor(Math.random()*1e9);
      roomSeed = newSeed;
      initItems(newSeed);
      if (netMode === "host") broadcast(buildWorldMsg());
    }
  }

  // الطاقة
  const wantBoost = input.holding || input.boostKey;
  snake.boosting = wantBoost && snake.stamina > 0.001;
  if (snake.boosting) snake.stamina = Math.max(0, snake.stamina - CONFIG.BOOST_DRAIN * dt);
  else                snake.stamina = Math.min(1, snake.stamina + CONFIG.BOOST_REFILL * dt);

  if (snake.speedTimer > 0) snake.speedTimer = Math.max(0, snake.speedTimer - dt);

  // التوجيه
  const usingKeys = input.up || input.down || input.left || input.right;
  if (usingKeys) {
    const sx = (input.right?1:0) - (input.left?1:0);
    const sy = (input.down?1:0)  - (input.up?1:0);
    if (sx || sy) steerTo(sx, sy, dt);
  } else {
    const sdx = pointer.x - W/2, sdy = pointer.y - H/2;
    if (Math.hypot(sdx, sdy) > 14) steerTo(sdx, sdy, dt);
  }

  // الحركة
  const step = currentSpeed() * dt;
  snake.x += Math.cos(snake.angle) * step;
  snake.y += Math.sin(snake.angle) * step;

  // حدود
  if (Math.abs(snake.x) > CONFIG.WORLD || Math.abs(snake.y) > CONFIG.WORLD) {
    snake.x = clamp(snake.x, -CONFIG.WORLD, CONFIG.WORLD);
    snake.y = clamp(snake.y, -CONFIG.WORLD, CONFIG.WORLD);
    triggerGameOver(); return;
  }
  if (insideObstacle(snake.x, snake.y, sizeForValue(headValue())*0.32)) {
    triggerGameOver(); return;
  }

  // المسار
  snake.path.unshift({ x:snake.x, y:snake.y });
  const dists = segmentDistances();
  const need  = dists[dists.length-1] + 4;
  let total = 0;
  for (let i = 1; i < snake.path.length; i++) {
    total += Math.hypot(snake.path[i].x-snake.path[i-1].x,
                        snake.path[i].y-snake.path[i-1].y);
    if (total > need) { snake.path.length = i+1; break; }
  }

  // الأكل
  const hv = headValue(), hSize = sizeForValue(hv);
  for (let i = foods.length-1; i >= 0; i--) {
    const f = foods[i];
    if (Math.hypot(f.x-snake.x, f.y-snake.y) < (hSize+f.size)*0.5) {
      if (f.value <= hv) {
        eatValue(f.value);
        const newFood = spawnFood();
        foods[i] = newFood;
        if (netMode === "host")   broadcast({ t:"foodEat", idx:i, newFood });
        if (netMode === "guest")  {} // الـ Host هو من يُقرّر (نترك الأكل محلياً بصرياً)
      }
    }
  }
  for (let i = powerups.length-1; i >= 0; i--) {
    const p = powerups[i];
    if (Math.hypot(p.x-snake.x, p.y-snake.y) < (hSize+p.size)*0.45) {
      applyPowerup(p.type);
      const newPu = spawnPowerup();
      powerups[i] = newPu;
      if (netMode === "host")  broadcast({ t:"puEat", idx:i, newPu });
      if (state !== "playing") return;
    }
  }

  updateCamera(snake.x, snake.y);
  updateBoostBar();
  updateHUD();

  // إرسال موقعنا للشبكة
  if (netMode !== "solo") {
    netSendTimer += dt;
    if (netSendTimer >= CONFIG.NET_SEND_RATE) {
      netSendTimer = 0;
      const msg = {
        t:"input",
        x:snake.x, y:snake.y, angle:snake.angle,
        values:snake.values,
        stamina:snake.stamina, boosting:snake.boosting,
        dead:false,
      };
      if (netMode === "host") {
        // الـ Host يُزامن حالة الكل
        syncTimer += CONFIG.NET_SEND_RATE;
        if (syncTimer >= CONFIG.SYNC_RATE) {
          syncTimer = 0;
          broadcast(buildPeersMsg());
        }
      } else {
        sendToHost(msg);
      }
    }
  }
}

// -------------------------------------------------------------------------
// رسم الأرضية
// -------------------------------------------------------------------------
function drawGround() {
  ctx.fillStyle = "#0b1830";
  ctx.fillRect(0, 0, W, H);

  const c1 = project(-CONFIG.WORLD, -CONFIG.WORLD);
  const c2 = project( CONFIG.WORLD, -CONFIG.WORLD);
  const c3 = project( CONFIG.WORLD,  CONFIG.WORLD);
  const c4 = project(-CONFIG.WORLD,  CONFIG.WORLD);
  ctx.fillStyle = "#13294d";
  ctx.beginPath();
  ctx.moveTo(c1.x,c1.y); ctx.lineTo(c2.x,c2.y);
  ctx.lineTo(c3.x,c3.y); ctx.lineTo(c4.x,c4.y);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(120,160,210,0.5)"; ctx.lineWidth = 3; ctx.stroke();

  // نقاط شبكة
  const center = unproject(W/2, H/2);
  const range = 34;
  const gx0 = Math.floor(clamp(center.x-range, -CONFIG.WORLD, CONFIG.WORLD));
  const gx1 = Math.ceil(clamp(center.x+range,  -CONFIG.WORLD, CONFIG.WORLD));
  const gy0 = Math.floor(clamp(center.y-range, -CONFIG.WORLD, CONFIG.WORLD));
  const gy1 = Math.ceil(clamp(center.y+range,  -CONFIG.WORLD, CONFIG.WORLD));
  ctx.fillStyle = "rgba(120,160,210,0.18)";
  for (let gx = gx0; gx <= gx1; gx += 4)
    for (let gy = gy0; gy <= gy1; gy += 4) {
      const p = project(gx, gy);
      ctx.beginPath(); ctx.arc(p.x,p.y,1.5,0,Math.PI*2); ctx.fill();
    }
}

// -------------------------------------------------------------------------
// رسم عدّادات (طاقة / سرعة خاصة)
// -------------------------------------------------------------------------
function drawGauges() {
  const gauges = [];
  if (snake.stamina < 0.999 || snake.boosting)
    gauges.push({ frac:snake.stamina,
      color: snake.boosting?"#19d3ff":"#5a86c8", icon:"⚡" });
  if (snake.speedTimer > 0)
    gauges.push({ frac:snake.speedTimer/CONFIG.SPEEDCUBE_TIME,
      color:"#ffb020", icon:"×2" });
  if (!gauges.length) return;

  const c     = project(snake.x, snake.y);
  const baseY = c.y - sizeForValue(headValue())*CONFIG.SCALE*CONFIG.CUBE_H - 56;
  const r=16, spacing=42;
  let x = c.x - ((gauges.length-1)*spacing)/2;
  for (const g of gauges) {
    ctx.beginPath(); ctx.arc(x, baseY, r, 0, Math.PI*2);
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, baseY);
    ctx.arc(x, baseY, r, -Math.PI/2, -Math.PI/2+Math.PI*2*g.frac);
    ctx.closePath(); ctx.fillStyle = g.color; ctx.fill();
    ctx.lineWidth=2.5; ctx.strokeStyle="rgba(255,255,255,0.85)";
    ctx.beginPath(); ctx.arc(x,baseY,r,0,Math.PI*2); ctx.stroke();
    ctx.font='800 12px "Segoe UI",Tahoma,sans-serif';
    ctx.fillStyle="#fff"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(g.icon, x, baseY);
    x += spacing;
  }
}

// -------------------------------------------------------------------------
// Render كامل
// -------------------------------------------------------------------------
function render() {
  drawGround();

  // البطاقات أولاً
  for (const p of powerups) drawCard(p.x, p.y, p.size, p.type);

  // تجميع كل ما يُرسم ورتّبه بالعمق
  const drawables = [];

  for (const f of foods)
    drawables.push({ kind:"food", x:f.x, y:f.y, size:f.size,
      value:f.value, depth:f.x+f.y });

  for (const o of obstacles)
    drawables.push({ kind:"wall", o, depth:o.x+o.y });

  // اللاعبون البعيدون
  for (const id in remotePlayers) {
    const rp = remotePlayers[id];
    if (rp.dead || !rp.values || rp.values.length===0) continue;
    const positions = bodyPositions(rp.path||[{x:rp.x,y:rp.y}], rp.values);
    const c = PEER_COLORS[rp.colorIdx % PEER_COLORS.length];
    for (const seg of positions)
      drawables.push({ kind:"remote", x:seg.x, y:seg.y,
        size:seg.size, color:c, depth:seg.x+seg.y });
  }

  // الثعبان المحلي
  for (const seg of bodyPositions()) {
    drawables.push({ kind:"body", x:seg.x, y:seg.y,
      size:seg.size, value:seg.value, depth:seg.x+seg.y });
  }

  drawables.sort((a,b) => a.depth - b.depth);
  for (const d of drawables) {
    if (d.kind === "wall")
      drawBox(d.o.x, d.o.y, d.o.hw, d.o.hh, d.o.h, d.o.color);
    else if (d.kind === "remote")
      drawCube(d.x, d.y, d.size, { color:d.color, label:"" });
    else
      drawCube(d.x, d.y, d.size,
        { color:colorForValue(d.value), label:String(d.value) });
  }

  // سهم + اسم اللاعب المحلي
  {
    if (snake.values.length > 0) {
      const positions = bodyPositions(snake.path, snake.values);
      if (positions.length > 0) {
        const head = positions[0];
        const c = project(head.x, head.y);
        const ahead = project(head.x + Math.cos(snake.angle)*0.8, head.y + Math.sin(snake.angle)*0.8);
        let dx=ahead.x-c.x, dy=ahead.y-c.y;
        const len=Math.hypot(dx,dy)||1; dx/=len; dy/=len;
        const gap=24,L=60;
        const x0=c.x+dx*gap,y0=c.y+dy*gap,x1=c.x+dx*L,y1=c.y+dy*L;
        ctx.save();
        ctx.shadowColor="rgba(80,210,255,0.9)"; ctx.shadowBlur=10;
        const grad=ctx.createLinearGradient(x0,y0,x1,y1);
        grad.addColorStop(0,"rgba(80,210,255,0)");
        grad.addColorStop(1,"rgba(80,210,255,0.9)");
        ctx.strokeStyle=grad; ctx.lineWidth=6; ctx.lineCap="round";
        ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
        const px=-dy,py=dx,hw=10,hl=16;
        ctx.fillStyle="rgba(150,235,255,0.98)";
        ctx.beginPath();
        ctx.moveTo(x1+dx*4,y1+dy*4);
        ctx.lineTo(x1-dx*hl+px*hw,y1-dy*hl+py*hw);
        ctx.lineTo(x1-dx*hl-px*hw,y1-dy*hl-py*hw);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        const nameY=c.y-sizeForValue(snake.values[0])*CONFIG.SCALE*CONFIG.CUBE_H-22;
        ctx.font='700 14px "Segoe UI",Tahoma,sans-serif';
        ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.lineWidth=4; ctx.strokeStyle="rgba(0,0,0,0.7)";
        ctx.strokeText(playerName,c.x,nameY);
        ctx.fillStyle="#fff"; ctx.fillText(playerName,c.x,nameY);
      }
    }
  }

  // سهم + اسم اللاعبين البعيدين
  for (const id in remotePlayers) {
    const rp = remotePlayers[id];
    if (rp.dead || !rp.values || rp.values.length===0) continue;
    const col = PEER_COLORS[rp.colorIdx % PEER_COLORS.length];
    const positions = bodyPositions(rp.path||[{x:rp.x,y:rp.y}], rp.values);
    if (!positions.length) continue;
    const head = positions[0];
    const sc = project(head.x, head.y);
    // سهم
    const rpAhead = project(head.x+Math.cos(rp.angle)*0.8, head.y+Math.sin(rp.angle)*0.8);
    let dx=rpAhead.x-sc.x, dy=rpAhead.y-sc.y;
    const len=Math.hypot(dx,dy)||1; dx/=len; dy/=len;
    const gap=24,L=55,x0=sc.x+dx*gap,y0=sc.y+dy*gap,x1=sc.x+dx*L,y1=sc.y+dy*L;
    ctx.save();
    ctx.shadowColor=col; ctx.shadowBlur=8;
    const grad=ctx.createLinearGradient(x0,y0,x1,y1);
    grad.addColorStop(0,"rgba(0,0,0,0)");
    grad.addColorStop(1,col);
    ctx.strokeStyle=grad; ctx.lineWidth=5; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
    const px=-dy,py=dx,hw=9,hl=14;
    ctx.fillStyle=col;
    ctx.beginPath();
    ctx.moveTo(x1+dx*3,y1+dy*3);
    ctx.lineTo(x1-dx*hl+px*hw,y1-dy*hl+py*hw);
    ctx.lineTo(x1-dx*hl-px*hw,y1-dy*hl-py*hw);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // اسم
    const nameY=sc.y-sizeForValue(rp.values[0])*CONFIG.SCALE*CONFIG.CUBE_H-22;
    ctx.font='700 14px "Segoe UI",Tahoma,sans-serif';
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.lineWidth=4; ctx.strokeStyle="rgba(0,0,0,0.7)";
    ctx.strokeText(rp.name,sc.x,nameY);
    ctx.fillStyle=col; ctx.fillText(rp.name,sc.x,nameY);
  }

  drawGauges();
}

// -------------------------------------------------------------------------
// HUD + شريط الطاقة
// -------------------------------------------------------------------------
function updateBoostBar() {
  const fill = document.getElementById("boost-bar-fill");
  const wrap = document.getElementById("boost-bar-wrap");
  if (!fill || !wrap) return;
  fill.style.width = (snake.stamina * 100).toFixed(1) + "%";
  if (snake.boosting) wrap.classList.add("boosting");
  else                wrap.classList.remove("boosting");
}

function updateHUD() {
  document.getElementById("best").textContent   = headValue();
  document.getElementById("score").textContent  = score();
  document.getElementById("length").textContent = snake.values.length;
}

function updateLB() {
  // اجمع كل اللاعبين + نفسك
  const all = [{
    name: playerName, val: headValue(), isMe: true,
  }];
  for (const id in remotePlayers) {
    const rp = remotePlayers[id];
    all.push({ name:rp.name, val:(rp.values&&rp.values[0])||2, isMe:false });
  }
  all.sort((a,b)=>b.val-a.val);
  const list = document.getElementById("lb-list");
  list.innerHTML = all.slice(0,8).map((p,i)=>
    `<li class="${p.isMe?"me":""}">
      <span><span class="rank">${i+1}.</span> ${escapeHtml(p.name)}</span>
      <span>${p.val}</span>
    </li>`
  ).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c=>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

// -------------------------------------------------------------------------
// واجهة القوائم
// -------------------------------------------------------------------------
window.selectTab = function(tab) {
  ["solo","host","join"].forEach(t => {
    document.getElementById("tab-"+t).classList.toggle("active", t===tab);
    document.getElementById("mode-"+t).classList.toggle("hidden", t!==tab);
  });
};

function setHostStatus(msg) {
  const el = document.getElementById("host-status");
  if (el) el.textContent = msg;
}
function updateHostStatus() {
  const count = Object.keys(guestConns).length;
  setHostStatus(`متصل: ${count} لاعب${count===1?"":"ين"} — يمكنهم الدخول الآن`);
}
function setJoinStatus(msg, isError) {
  const el = document.getElementById("join-status");
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("error", !!isError);
}

// -------------------------------------------------------------------------
// أزرار الشاشة
// -------------------------------------------------------------------------
document.getElementById("play-btn").addEventListener("click", startSolo);
document.getElementById("restart-btn").addEventListener("click", restartGame);

document.getElementById("host-btn").addEventListener("click", () => {
  const btn = document.getElementById("host-btn");
  btn.disabled = true;
  btn.textContent = "جارٍ الإنشاء…";
  initPeer(id => {
    setupHostListeners();
    document.getElementById("room-code-wrap").classList.remove("hidden");
    document.getElementById("room-code-display").textContent = id;
    setHostStatus("في انتظار اللاعبين…");
    btn.textContent = "ابدأ اللعبة";
    btn.disabled = false;
    btn.onclick = startAsHost;
  });
});

document.getElementById("copy-code-btn").addEventListener("click", () => {
  const code = document.getElementById("room-code-display").textContent;
  navigator.clipboard.writeText(code).then(()=>{
    document.getElementById("copy-code-btn").textContent = "تم النسخ ✓";
    setTimeout(()=>{ document.getElementById("copy-code-btn").textContent="نسخ"; }, 1500);
  }).catch(()=>{});
});

document.getElementById("join-btn").addEventListener("click", () => {
  const code = document.getElementById("join-code-input").value.trim();
  if (!code) { setJoinStatus("أدخل كود الغرفة أولاً", true); return; }
  setJoinStatus("جارٍ الاتصال…");
  document.getElementById("join-btn").disabled = true;
  initPeer(() => joinAsGuest(code));
});

// -------------------------------------------------------------------------
// الحلقة الرئيسية
// -------------------------------------------------------------------------
function loop(t) {
  const dt = Math.min((t - lastT) / 1000, 0.05);
  lastT = t; now += dt;
  if (state === "playing") update(dt);
  if (state !== "menu")    render();
  requestAnimationFrame(loop);
}

// تهيئة
try {
  const saved = localStorage.getItem("snake2048_name");
  if (saved) document.getElementById("name-input").value = saved;
} catch(e){}

pointer.x = W/2; pointer.y = H/2 + 80;
resetSnake(); initItems(); updateCamera(0,0);
requestAnimationFrame(t => { lastT = t; loop(t); });

})();
