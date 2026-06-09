/* =========================================================================
   خادم PeerJS محلي — للّعب الجماعي على شبكة محلية (واي‑فاي) بلا إنترنت.
   التشغيل:
     1) ثبّت Node.js
     2) في هذا المجلد:  npm install peer
     3) شغّل:           node server.js
     4) في game.js اضبط:  LAN = { enabled: true, host: "IP-جهازك", port: 9000, path: "/" }
        (اعرف IP جهازك بأمر ipconfig على ويندوز — مثل 192.168.1.10)
     5) افتح اللعبة على كل الأجهزة عبر:  http://IP-جهازك:8080  (شغّل خادم ملفات ثابت)
   ========================================================================= */

const { PeerServer } = require("peer");

const PORT = 9000;
const server = PeerServer({ port: PORT, path: "/" });

server.on("connection", (client) => console.log("اتصل لاعب:", client.getId()));
server.on("disconnect", (client) => console.log("غادر لاعب:", client.getId()));

console.log(`خادم PeerJS المحلي يعمل على المنفذ ${PORT}`);
console.log("اضبط LAN.enabled=true و host=IP هذا الجهاز في game.js");
