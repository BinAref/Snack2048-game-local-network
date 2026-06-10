// يولّد أيقونات التطبيق من الصورة snake2048.png (أندرويد + PWA ويب/آيفون)
const sharp = require("sharp");
const SRC = "../snake2048.png";

(async () => {
  // ===== أيقونات الويب/الآيفون (PWA) في الجذر =====
  await sharp(SRC).resize(512, 512).png().toFile("../icon-512.png");
  await sharp(SRC).resize(192, 192).png().toFile("../icon-192.png");
  await sharp(SRC).resize(180, 180).png().toFile("../apple-touch-icon.png");

  // ===== مصدر أيقونات أندرويد لأداة capacitor-assets =====
  await sharp(SRC).resize(1024, 1024, { fit: "cover" }).png().toFile("assets/icon-only.png");
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#0b1830" } }).png().toFile("assets/icon-background.png");
  const fg = await sharp(SRC).resize(820, 820).png().toBuffer();
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fg, gravity: "center" }]).png().toFile("assets/icon-foreground.png");

  console.log("icons generated (web + android source)");
})();
