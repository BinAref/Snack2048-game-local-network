# 🎨 Snake 2048 — دليل إعادة تصميم شاملة لـ Claude Code

> انسخ كل قسم وأعطه لـ Claude Code بالترتيب. كل قسم = جلسة عمل مستقلة.

---

## 📋 السياق العام (أرسله في بداية كل جلسة)

```
أنا أعمل على لعبة Snake 2048 — ثعبان مكوّن من مكعبات أرقام إيزومترية 2.5D.
المشروع يعمل تقنياً بالكامل. المطلوب فقط إعادة تصميم بصري كاملة.

الأسلوب البصري المطلوب:
- Neon Cyberpunk داكن — خلفية #050510 مع توهّجات نيون
- لوحة الألوان: أزرق #00D4FF، بنفسجي #9B59B6، ذهبي #F39C12، وردي #FF006E
- الخطوط: "Orbitron" للعناوين، "Rajdhani" للأرقام والبيانات
- كل بطاقة/نافذة: زجاج شفاف (glassmorphism) مع border نيون متوهّج
- تأثيرات: glow، particle، shimmer على الدمج
- لا أبيض صريح — الألوان الفاتحة فقط كـ glow أو نص على خلفية داكنة
```

---

## 🗂️ الترتيب الموصى به للتنفيذ

```
1. style.css — نظام التصميم الكامل (ابدأ هنا أولاً)
2. شاشة المنيو الرئيسية (index.html القسم الأول)
3. HUD أثناء اللعب
4. شاشات: Pause / Statistics / Leaderboard
5. شاشة Resume Game + Shop Preview
6. مكعبات الثعبان وتأثيرات الدمج (game.js)
7. Power-ups البصرية
8. تحسينات الأنيميشن النهائية
```

---

## 🎨 PROMPT 1 — نظام التصميم (style.css)

```
أعد كتابة style.css بالكامل بهذا النظام:

**المتغيرات (CSS Variables):**
:root {
  /* الخلفيات */
  --bg-void: #050510;
  --bg-surface: #0A0A1F;
  --bg-card: rgba(10, 10, 40, 0.85);
  --bg-card-hover: rgba(20, 20, 60, 0.95);

  /* الألوان الرئيسية */
  --neon-blue: #00D4FF;
  --neon-purple: #9B59B6;
  --neon-gold: #F39C12;
  --neon-pink: #FF006E;
  --neon-green: #00FF88;
  --neon-red: #FF3030;

  /* النص */
  --text-primary: #E8F4FD;
  --text-secondary: #7B8FA1;
  --text-accent: #00D4FF;

  /* الحدود */
  --border-neon: rgba(0, 212, 255, 0.4);
  --border-glow: rgba(0, 212, 255, 0.8);

  /* التوهّج */
  --glow-blue: 0 0 20px rgba(0,212,255,0.6), 0 0 40px rgba(0,212,255,0.3);
  --glow-purple: 0 0 20px rgba(155,89,182,0.6), 0 0 40px rgba(155,89,182,0.3);
  --glow-gold: 0 0 20px rgba(243,156,18,0.6), 0 0 40px rgba(243,156,18,0.3);
  --glow-pink: 0 0 20px rgba(255,0,110,0.6), 0 0 40px rgba(255,0,110,0.3);

  /* الزوايا */
  --radius-sm: 8px;
  --radius-md: 16px;
  --radius-lg: 24px;

  /* الخطوط */
  --font-display: 'Orbitron', monospace;
  --font-data: 'Rajdhani', sans-serif;
  --font-body: 'Inter', sans-serif;
}

**الخطوط (أضف في <head>):**
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@400;600;700&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">

**البطاقات الزجاجية:**
.glass-card {
  background: var(--bg-card);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-neon);
  border-radius: var(--radius-md);
  box-shadow: var(--glow-blue), inset 0 1px 0 rgba(255,255,255,0.05);
  transition: all 0.3s ease;
}
.glass-card:hover {
  border-color: var(--border-glow);
  box-shadow: var(--glow-blue), 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
}

**الأزرار:**
.btn-primary {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 14px 32px;
  border-radius: var(--radius-sm);
  border: 2px solid var(--neon-blue);
  background: linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,212,255,0.05));
  color: var(--neon-blue);
  box-shadow: var(--glow-blue);
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}
.btn-primary::before {
  content: '';
  position: absolute;
  top: 0; left: -100%;
  width: 100%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(0,212,255,0.1), transparent);
  transition: left 0.4s ease;
}
.btn-primary:hover::before { left: 100%; }
.btn-primary:hover {
  background: linear-gradient(135deg, rgba(0,212,255,0.35), rgba(0,212,255,0.15));
  box-shadow: var(--glow-blue), 0 0 60px rgba(0,212,255,0.4);
  transform: translateY(-2px);
}

.btn-danger {
  border-color: var(--neon-red);
  background: linear-gradient(135deg, rgba(255,48,48,0.2), rgba(255,48,48,0.05));
  color: var(--neon-red);
  box-shadow: 0 0 20px rgba(255,48,48,0.4);
}

**الخلفية المتحركة:**
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background:
    radial-gradient(ellipse at 20% 50%, rgba(0,212,255,0.03) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 20%, rgba(155,89,182,0.04) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 80%, rgba(243,156,18,0.02) 0%, transparent 50%);
  pointer-events: none;
  z-index: 0;
}

**شبكة الخلفية (Grid):**
.grid-bg {
  background-image:
    linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px);
  background-size: 40px 40px;
}

**شريط التقدم:**
.progress-bar {
  height: 6px;
  border-radius: 3px;
  background: rgba(255,255,255,0.05);
  overflow: hidden;
  position: relative;
}
.progress-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--neon-blue), var(--neon-purple));
  box-shadow: 0 0 10px var(--neon-blue);
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

أضف أيضاً:
- Scrollbar مخصص بلون نيون
- ::selection بلون أزرق نيون
- تأثير scanlines خفيف على الـ canvas
- Keyframe animations: @keyframes pulse-glow, flicker, float, shimmer
- Media queries للموبايل (breakpoint 768px)
```

---

## 🏠 PROMPT 2 — شاشة المنيو الرئيسية

```
أعد تصميم شاشة المنيو الرئيسية (Main Menu) بالكامل:

**التخطيط:**
- خلفية: var(--bg-void) مع grid-bg و particle canvas في الخلفية
- المحتوى في المركز عمودياً، عرض max 480px

**اسم اللعبة:**
- SNAKE بخط Orbitron وزن 900 حجم 72px
- لون gradient: from #00D4FF to #9B59B6
- text-shadow: glow أزرق قوي
- 2048 أسفله بنفس الخط لكن ذهبي #F39C12 مع glow ذهبي
- أنيميشن خفيف: flicker كل بضع ثوانٍ مثل علامة نيون

**الشعار/أيقونة:**
- ثعبان صغير مرسوم بـ SVG أمام الاسم أو فوقه
- دائرة متوهّجة خلفه

**حقل الاسم:**
- input بحدود نيون أزرق
- placeholder: "ENTER YOUR NAME" بحروف كبيرة
- عند الكتابة: border يتوهّج بشكل أقوى
- حجم الخط: Rajdhani 16px

**أزرار اللعب:**
- SOLO و MULTIPLAYER جنباً إلى جنب
- SOLO: نيون أزرق
- MULTIPLAYER: نيون بنفسجي مع أيقونة 👥
- عرض كل زر 48%

**زر ابدأ اللعبة:**
- عريض 100%، ارتفاع 56px
- نص: "▶ START GAME" بخط Orbitron
- Gradient داخلي من أزرق لبنفسجي
- عند hover: يتوهّج أقوى + يرتفع 3px

**قسم الغرف (للجماعي):**
- يظهر بأنيميشن slide-down عند اختيار Multiplayer
- بطاقة زجاجية مع حد بنفسجي
- زر PUBLIC (قفل مفتوح) ← أخضر نيون
- زر PRIVATE (قفل مغلق) ← ذهبي
- حقل رمز الغرفة + زر JOIN

**أسفل الشاشة:**
- أزرار صغيرة: LEADERBOARD | SHOP | SETTINGS | LANGUAGE 🌐
- أيقونات + نص صغير، مرتّبة أفقياً
- لون فاتح dim، تتوهّج عند hover

**تفاصيل إضافية:**
- أنيميشن دخول: العناصر تظهر من الأسفل واحداً تلو الآخر (stagger 100ms)
- نجوم/جسيمات خفيفة تتحرك في الخلفية
```

---

## 🎮 PROMPT 3 — HUD أثناء اللعب

```
أعد تصميم واجهة HUD أثناء اللعبة:

**الشريط العلوي (مضغوط، لا يأخذ مساحة):**
- شفاف تماماً مع blur خفيف
- ارتفاع 48px فقط
- يمين: اسم اللاعب + SCORE بخط Rajdhani نيون أزرق
- يسار: BEST + MERGES بحجم أصغر
- وسط: اسم اللعبة صغير + المرحلة الحالية

**الـ Dropdown — إحصائياتك:**
- ينبثق من الأعلى بأنيميشن slide-down
- بطاقة زجاجية، عرض 240px
- صفوف: SCORE / BEST / LENGTH / MERGES / TIME / STAGE
- كل قيمة بخط Rajdhani Bold، ملوّنة حسب أهميتها
- شريط الطاقة أسفله:
  ⚡ [████████░░] مع لون متدرّج أزرق→أخضر→أحمر حسب الكمية
  أنيميشن pulse عند الاندفاع

**الـ Dropdown — المتصدّرون:**
- يظهر من اليسار أو اليمين
- يعرض 7 لاعبين (3 فوقك + أنت مميّز + 3 تحتك)
- أنت: صف ذهبي متوهّج، باقي اللاعبين: رمادي
- أيقونة تاج 👑 للمركز الأول
- أرقام المراتب بنيون خافت

**عداد الميدالية (عند التصدّر):**
- دائرة صغيرة في الزاوية
- تعدّ الوقت مع لون متغيّر حسب الميدالية:
  🥉 برونز → 🥈 فضي → 🥇 ذهبي → 💎 → 🔥 → ♾️
- أنيميشن نبض عند الاقتراب من الدقيقة التالية

**Power-ups النشطة:**
- أيقونات صغيرة (40px) تطفو في الزاوية السفلى اليسرى
- لكل قوة: أيقونة + عداد تنازلي دائري حولها
- تختفي بأنيميشن fade+scale عند الانتهاء

**رموز الدردشة:**
- تطفو فوق رأس الثعبان مباشرة
- حجم كبير (32px) مع تأثير float وfade

**إشعارات جانبية:**
- تنزلق من اليمين
- بطاقة صغيرة: "👋 Player joined"
- تختفي تلقائياً بعد 3 ثوانٍ
```

---

## ⏸️ PROMPT 4 — شاشات Pause / Statistics / Leaderboard

```
أعد تصميم الشاشات الثانوية:

**نافذة Pause:**
- Overlay: خلفية سوداء شفافة 70% مع blur
- بطاقة مركزية: glass card عرض 360px
- عنوان "PAUSED" بخط Orbitron، حرف بحرف متوهّج بأنيميشن
- زر RESUME: نيون أخضر، أيقونة ▶
- زر EXIT TO MENU: نيون أحمر، أيقونة ⏹
- فاصل نيون خفيف بين الزرين
- أنيميشن دخول: scale من 0.8 + opacity

**نافذة Statistics:**
- بطاقة زجاجية عريضة (480px)
- قسمان جنباً إلى جنب:
  - يسار: CURRENT GAME (نيون أزرق)
  - يمين: ALL TIME (نيون بنفسجي)
- كل إحصائية: label صغير رمادي + قيمة كبيرة ملوّنة
- PROGRESS section:
  - 4 أشرطة تقدم مع عناوين ونسب
  - الأشرطة بلون gradient متحرك
- الأعلى: زر X لإغلاق النافذة

**نافذة Leaderboard:**
- تبويبات: GLOBAL | FRIENDS | COUNTRY
- التبويب النشط: حد نيون + glow خفيف
- صفوف اللاعبين:
  - المركز الأول: صف ذهبي خاص مع تاج متوهّج
  - الثاني: فضي
  - الثالث: برونز
  - باقي الصفوف: صفوف شفافة تتوهّج عند hover
- المراتب 1-3: أيقونات تاج كبيرة + avatar دائري
- مرتبتك: مميّزة بإطار نيون أزرق
- الأرقام بخط Rajdhani Bold
```

---

## 🏪 PROMPT 5 — Resume Game + Shop Preview

```
**شاشة Resume Game:**
- تعرض مركزياً عند العودة للعبة
- عداد عكسي كبير (5,4,3,2,1):
  - دائرة SVG animated بشريط يتقلص
  - الرقم في المنتصف بخط Orbitron حجم 96px
  - لون: gradient من أزرق لبنفسجي
  - نبض مع كل ثانية
- نص "Do you want to continue?" بخط Rajdhani
- زر CONTINUE: نيون أخضر
- زر EXIT: نيون أحمر

**Shop Preview:**
- رأس الصفحة: عملتان (💎 12.5K و 🪙 25.6M) مع + لشراء المزيد
  - خلفية ذهبية/بنفسجية، بخط Rajdhani Bold
- قسم SPECIAL OFFERS:
  - 3 بطاقات: STARTER / VALUE / ULTIMATE
  - ULTIMATE: حد متدرّج ذهبي مع ribbon "BEST VALUE"
  - كل بطاقة: صورة جوهرة/حجر + الكمية + السعر
  - الأسعار بخط أخضر نيون
- قسم POWER-UPS للشراء:
  - أيقونات 4 قوى في صف
  - كل أيقونة: دائرة متوهّجة + اسم + عدد المتوفر (x10)
  - سعر صغير تحتها
- Footer Navigation:
  - 5 أيقونات: OFFERS | POWER-UPS | COINS | GEMS | BOOSTS
  - النشط: نيون أزرق، الغير نشط: رمادي
```

---

## 🐍 PROMPT 6 — مكعبات الثعبان وتأثيرات الدمج (game.js)

```
أعد تصميم رسم مكعبات الثعبان في game.js بالكامل:

**نظام ألوان المكعبات حسب القيمة:**
const BLOCK_COLORS = {
  2:    { top: '#1a1a2e', side1: '#16213e', side2: '#0f3460', text: '#00D4FF', glow: '#00D4FF' },
  4:    { top: '#1a2e1a', side1: '#16381e', side2: '#0f4a28', text: '#00FF88', glow: '#00FF88' },
  8:    { top: '#2e1a1a', side1: '#3e1616', side2: '#4a0f0f', text: '#FF6B6B', glow: '#FF3030' },
  16:   { top: '#2e2a1a', side1: '#3e3416', side2: '#4a3e0f', text: '#FFB347', glow: '#F39C12' },
  32:   { top: '#1a1e2e', side1: '#16233e', side2: '#0f2a4a', text: '#7EB8FF', glow: '#3498DB' },
  64:   { top: '#2e1a2e', side1: '#3e163e', side2: '#4a0f4a', text: '#DA70D6', glow: '#9B59B6' },
  128:  { top: '#2e2e1a', side1: '#3e3e16', side2: '#4a4a0f', text: '#FFD700', glow: '#F1C40F' },
  // تكمل للأرقام الأكبر بألوان أكثر إشراقاً وإثارة
  // 256, 512, 1024, 2048: ألوان ملكية مع particle effects
};

**رسم المكعب الإيزومتري (drawBlock):**
- الوجه العلوي: المعيّن الأساسي مع gradient خفيف
- انعكاس ضوء في زاوية واحدة (highlight corner)
- الوجهان الجانبيان: أداكن بنسبة 25% و 40%
- حافة نيون متوهّجة على الأضلاع العلوية
- ظل أرضي: ellipse شفافة تحت المكعب
- الرقم في وسط الوجه العلوي:
  - خط Orbitron Bold
  - حجم يتكيّف مع الرقم (كبير للأرقام القصيرة)
  - text glow بلون المكعب
  - drop-shadow داكن للقراءة

**تأثير الدمج (Merge Animation):**
1. Flash: وميض أبيض لحظي (30ms)
2. Scale bounce: 1.0 → 1.4 → 0.9 → 1.0 (200ms cubic-bezier)
3. Particle burst: 12 جسيم يتطاير من مركز المكعب
   - الجسيمات بلون glow المكعب الجديد
   - تتلاشى خلال 500ms
4. Ring expand: دائرة توهّج تتمدد وتختفي
5. Number change: flip animation سريع (100ms)

**تأثير حركة الثعبان:**
- Jet trail تحت المكعبات أثناء الاندفاع:
  - جسيمات صغيرة تتولّد خلف كل مكعب
  - gradient من لون المكعب إلى شفاف
  - تتلاشى في 300ms
- Motion blur خفيف أثناء التسارع العالي

**المكعبات على الأرض (Food):**
- نبض خفيف (pulse scale 1.0→1.05→1.0) دائم
- glow أكثر إشراقاً من مكعبات الثعبان
- عند الاقتراب: تكبر قليلاً (magnetic effect)

**بطاقات Power-ups:**
- مسطّحة أرضية مع حد متوهّج يدور حولها (conic-gradient animation)
- أيقونة كبيرة في المنتصف
- شعاع ضوء يصعد من تحتها
- ألوان حسب النوع:
  ⚡ أصفر، ×2 أزرق، ÷2 برتقالي، 📡 أخضر
```

---

## ✨ PROMPT 7 — تحسينات نهائية وتجميع

```
بعد الانتهاء من كل الشاشات، طبّق هذه التحسينات النهائية:

**1. نظام الجسيمات العالمي (Particle System):**
أنشئ class ParticleSystem منفصل:
- جسيمات خلفية: نجوم صغيرة بطيئة (150 جسيم)
- جسيمات تفاعلية: تنبثق عند:
  - الدمج (burst)
  - أكل الطعام (small burst)
  - الموت (explosion)
  - الفوز (fireworks)

**2. صوت بصري (Visual Sound Feedback):**
- كل حدث مهم → flash خفيف على الشاشة بلون مناسب
- موت → flash أحمر + shake animation
- ميدالية جديدة → flash ذهبي + particle burst
- دمج 2048 → flash أبيض + zoom out momentary

**3. شاشة تحميل (Loading Screen):**
- أنيميشن: ثعبان صغير يدور
- شريط تحميل نيون
- اسم اللعبة يظهر حرفاً بحرفاً

**4. شاشة الفوز:**
- خلفية: fireworks ملوّنة مستمرة
- بطاقة كبيرة: اسم الفائز + "INFINITE REACHED! ♾️"
- الثلاثة الأوائل مع أيقونات تاج كبيرة
- زر: PLAY AGAIN بأنيميشن نبض متواصل
- confetti يتساقط من الأعلى

**5. مراجعة الاتساق النهائي:**
- تأكّد أن جميع الألوان من المتغيرات فقط (لا ألوان مكتوبة مباشرة)
- تأكّد أن جميع الخطوط من المتغيرات
- تأكّد أن جميع الأنيميشن تحترم prefers-reduced-motion
- اختبر على شاشة 375px عرض (موبايل) و1920px (سطح مكتب)
- تأكّد أن Canvas يغطي الشاشة كاملة دون overflow

**6. أداء:**
- استخدم requestAnimationFrame لجميع الأنيميشن
- حدّد عدد الجسيمات بـ MAX_PARTICLES = 300
- استخدم will-change: transform للعناصر المتحركة
- أوقف أنيميشن الخلفية عند فقدان focus (visibilitychange)
```

---

## 🔍 نصائح للتعامل مع Claude Code

### ✅ قل له دائماً:
- "لا تغيّر منطق اللعبة، فقط التصميم البصري"
- "احفظ نسخة احتياطية قبل أي تعديل كبير"
- "اختبر على المتصفح وأخبرني بأي errors"
- "استخدم المتغيرات من :root فقط، لا ترمّز الألوان مباشرة"

### ❌ تجنّب:
- إعطاءه كل الـ prompts دفعة واحدة
- طلب تغيير game.js قبل الانتهاء من style.css
- تجاوز مرحلة عدون كاملة قبل مراجعتها

### 🔄 عند عدم الرضا:
```
"النتيجة لا تبدو احترافية بما يكفي.
المشكلة المحددة: [اذكر ما لا يعجبك]
ما أريده بالضبط: [صف التأثير المطلوب]
مرجع: انظر للصورة المرفقة للمقارنة"
```

### 📸 أرفق الصورة الأصلية:
في كل جلسة مع Claude Code، أرفق صورة التصميم المرجعي وقل:
"التصميم المطلوب مشابه لهذه الصورة من حيث الأسلوب والألوان"

---

## 📁 ترتيب الملفات النهائي

```
Snack2048/
├── index.html          ← هيكل + شاشات
├── style.css           ← نظام التصميم الكامل
├── game.js             ← المحرك + رسم المكعبات
├── lang.js             ← الترجمات
├── particles.js        ← نظام الجسيمات (جديد)
├── sw.js               ← Service Worker
├── manifest.json       ← PWA
├── icon.svg            ← أيقونة
└── server.js           ← خادم LAN
```

---

*هذا الدليل مصمّم لإعادة التصميم مرحلة بمرحلة دون المساس بمنطق اللعبة.*
*ابدأ بـ PROMPT 1 واحرص على مراجعة النتيجة قبل الانتقال للتالي.*
