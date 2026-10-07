import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

/* Lays the captures from showcase.mjs out as portfolio images: one feature
 * per image, a short Arabic headline, the screen large enough to read. Each
 * slide is a plain HTML page rendered at 2× and saved as JPEG.
 *
 * Run `npm run showcase` first; this only reads ./showcase/raw. */

const DIR = resolve('showcase/compose')
const OUT = resolve(process.env.SHOWCASE_OUT || 'showcase/gallery')
await mkdir(DIR, { recursive: true })
await mkdir(OUT, { recursive: true })

const W = 1600
const STATUS_BAR = 36
const H = 900
const raw = (name) => `../raw/${name}.png`
const font = (w) => `../../node_modules/@fontsource/ibm-plex-sans-arabic/arabic-${w}.css`
const latin = (w) => `../../node_modules/@fontsource/ibm-plex-sans-arabic/latin-${w}.css`

const CSS = `
:root {
  --ink: #0f172a; --muted: #475569; --primary: #4f46e5; --primary-soft: #eef2ff;
  --accent: #0891b2; --line: #e2e8f0;
  --brand: linear-gradient(135deg, #818cf8, #4f46e5 42%, #0891b2);
}
* { box-sizing: border-box; margin: 0; }
html, body { width: ${W}px; height: ${H}px; }
body {
  font-family: 'IBM Plex Sans Arabic', sans-serif; color: var(--ink);
  overflow: hidden; position: relative; -webkit-font-smoothing: antialiased;
}
.light {
  background:
    radial-gradient(900px 500px at 85% -10%, #e0e7ff 0%, transparent 60%),
    radial-gradient(700px 500px at 0% 110%, #cffafe 0%, transparent 60%),
    #f6f7fb;
}
.light::before {
  content: ''; position: absolute; inset: 0;
  background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
  background-size: 22px 22px; opacity: .45;
  mask-image: linear-gradient(to bottom, #000, transparent 70%);
}
.dark {
  background:
    radial-gradient(900px 600px at 100% 0%, #312e81 0%, transparent 60%),
    radial-gradient(800px 600px at 0% 100%, #0e7490 0%, transparent 55%),
    #0b1029;
  color: #fff;
}
.dark::before {
  content: ''; position: absolute; inset: 0;
  background-image: radial-gradient(rgba(255,255,255,.12) 1px, transparent 1px);
  background-size: 22px 22px;
}

.brand { position: absolute; top: 40px; left: 64px; display: flex; align-items: center; gap: 10px;
  font-weight: 700; font-size: 22px; z-index: 5; }
.brand i { width: 36px; height: 36px; border-radius: 10px; background: var(--brand);
  display: grid; place-items: center; box-shadow: 0 6px 16px -6px #4f46e5; }
.brand b { background: var(--brand); -webkit-background-clip: text; color: transparent; }
.dark .brand b { background: linear-gradient(90deg, #a5b4fc, #67e8f9); -webkit-background-clip: text; }

.head { position: absolute; top: 56px; right: 72px; z-index: 5; max-width: 900px; }
.kicker { display: inline-flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 600;
  color: var(--primary); background: #fff; border: 1px solid #c7d2fe; padding: 6px 14px;
  border-radius: 999px; margin-bottom: 18px; }
.kicker::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--brand); }
h1 { font-size: 50px; line-height: 1.25; font-weight: 700; letter-spacing: -.5px; }
h1 em { font-style: normal; background: var(--brand); -webkit-background-clip: text; color: transparent; }
.sub { font-size: 21px; color: var(--muted); margin-top: 12px; line-height: 1.6; }

.browser { position: absolute; border-radius: 14px; overflow: hidden; background: #fff;
  box-shadow: 0 40px 80px -30px rgba(15,23,42,.35), 0 0 0 1px rgba(15,23,42,.08); z-index: 2; }
.browser .bar { height: 38px; background: #f1f5f9; border-bottom: 1px solid var(--line);
  display: flex; align-items: center; gap: 8px; padding: 0 16px; direction: ltr; }
.browser .bar span { width: 11px; height: 11px; border-radius: 50%; }
.browser .bar span:nth-child(1) { background: #fb7185; }
.browser .bar span:nth-child(2) { background: #fbbf24; }
.browser .bar span:nth-child(3) { background: #34d399; }
.browser .bar div { margin: 0 auto; height: 22px; width: 38%; border-radius: 6px; background: #fff;
  border: 1px solid var(--line); font-size: 12px; color: #64748b; display: grid; place-items: center;
  direction: rtl; }
.shot { background-repeat: no-repeat; background-size: 100% auto; background-position: top center; }

.phone { position: absolute; border-radius: 46px; background: #0f172a; padding: 11px; z-index: 3;
  box-shadow: 0 40px 70px -25px rgba(15,23,42,.5), inset 0 0 0 2px #334155; }
.phone .screen { border-radius: 36px; overflow: hidden; position: relative; background-color: #fff; }
.phone .screen::before { content: ''; position: absolute; top: 9px; left: 50%; transform: translateX(-50%);
  width: 34%; height: 22px; border-radius: 12px; background: #0f172a; z-index: 2; }

.card { position: absolute; border-radius: 18px; overflow: hidden; background-color: #fff; z-index: 2;
  box-shadow: 0 30px 60px -28px rgba(15,23,42,.35), 0 0 0 1px rgba(15,23,42,.08); }

.chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 26px; }
.chip { font-size: 17px; font-weight: 600; padding: 9px 16px; border-radius: 12px; background: #fff;
  border: 1px solid var(--line); color: var(--ink); display: inline-flex; gap: 8px; align-items: center; }
.chip::before { content: '✓'; color: #059669; font-weight: 700; }
.dark .chip { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.16); color: #fff; }
.dark .chip::before { color: #5eead4; }
.tech { display: flex; gap: 8px; margin-top: 18px; direction: ltr; justify-content: flex-end; }
.tech span { font: 600 14px/1 ui-monospace, 'Cascadia Code', monospace; padding: 7px 11px; border-radius: 8px;
  background: var(--primary-soft); color: #3730a3; }
.dark .tech span { background: rgba(165,180,252,.14); color: #c7d2fe; }

.label { position: absolute; z-index: 4; text-align: center; font-size: 19px; font-weight: 700; }
.label small { display: block; font-size: 15px; font-weight: 500; color: var(--muted); margin-top: 2px; }
.num { display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 50%;
  background: var(--brand); color: #fff; font-size: 15px; margin-left: 8px; vertical-align: middle; }
`

/** Browser window showing the top `cropH` css px of a 1440-wide capture. */
function browser({ img, x, y, w, cropH, title = 'وعدة · لوحة التحكم', pos = 'top center' }) {
  const h = Math.round((cropH * w) / 1440)
  return `<div class="browser" style="left:${x}px;top:${y}px;width:${w}px">
    <div class="bar"><span></span><span></span><span></span><div>${title}</div></div>
    <div class="shot" style="height:${h}px;background-image:url(${raw(img)});background-position:${pos}"></div>
  </div>`
}

/** Phone showing the top of a 390-wide capture. */
function phone({ img, x, y, w, z = 3 }) {
  const inner = w - 22
  const h = Math.round((inner * 844) / 390)
  // room for the notch, as on a real phone, so it never covers the app header
  return `<div class="phone" style="left:${x}px;top:${y}px;width:${w}px;z-index:${z}">
    <div class="screen shot" style="height:${h + STATUS_BAR}px;background-image:url(${raw(img)});background-position:center ${STATUS_BAR}px"></div>
  </div>`
}

/** A drawer cropped out of a 1440-wide capture: it sits at css x 0–480. */
function drawer({ img, x, y, w, cropH }) {
  const scale = w / 480
  return `<div class="card shot" style="left:${x}px;top:${y}px;width:${w}px;height:${Math.round(cropH * scale)}px;
    background-image:url(${raw(img)});background-size:${1440 * scale}px auto;background-position:left top"></div>`
}

const brand = `<div class="brand"><i><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/>
  <path d="M16 2v4M8 2v4M3 10h18"/></svg></i><span>وعدة</span></div>`

const head = ({ kicker, title, sub, extra = '' }) => `<div class="head">
  ${kicker ? `<div class="kicker">${kicker}</div>` : ''}
  <h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}${extra}</div>`

const SLIDES = [
  {
    name: '00-الغلاف',
    theme: 'dark',
    body: `
      <div class="head" style="top:150px;max-width:600px">
        <h1 style="font-size:62px">نظام حجز<br>وإدارة مواعيد <em style="background:linear-gradient(90deg,#a5b4fc,#67e8f9);-webkit-background-clip:text">متكامل</em></h1>
        <p class="sub" style="color:#cbd5e1;font-size:22px">صفحة حجز لعملائك، ولوحة تحكم كاملة لك —<br>عيادات، صالونات، مطاعم، ومراكز خدمات.</p>
        <div class="chips">
          <span class="chip">حجز ذاتي 24/7</span><span class="chip">منع التعارض تلقائياً</span>
          <span class="chip">تحليلات وتقارير</span><span class="chip">عربي ومتجاوب</span>
        </div>
        <div class="tech"><span>MySQL</span><span>Laravel 12</span><span>Vue 3</span></div>
      </div>
      ${browser({ img: 'today', x: 40, y: 150, w: 860, cropH: 960 })}
      ${phone({ img: 'm-book-2', x: 650, y: 330, w: 270 })}`,
  },
  {
    name: '01-رحلة-العميل',
    theme: 'light',
    body: `
      ${head({
        kicker: 'صفحة الحجز للعملاء',
        title: 'عميلك يحجز بنفسه<br><em>في 3 خطوات</em>',
        sub: 'يرى الأوقات المتاحة فعلاً فقط،<br>ويستلم رقماً مرجعياً يتابع به حجزه.',
      }).replace('<div class="head">', '<div class="head" style="top:200px;max-width:440px">')}
      ${phone({ img: 'm-book-1', x: 700, y: 150, w: 270 })}
      ${phone({ img: 'm-book-2', x: 390, y: 150, w: 270 })}
      ${phone({ img: 'm-book-done', x: 80, y: 150, w: 270 })}
      <div class="label" style="left:700px;width:270px;top:96px"><span class="num">1</span>اختيار الخدمة</div>
      <div class="label" style="left:390px;width:270px;top:96px"><span class="num">2</span>اختيار الموعد</div>
      <div class="label" style="left:80px;width:270px;top:96px"><span class="num">3</span>تأكيد فوري</div>`,
  },
  {
    name: '02-لوحة-اليوم',
    theme: 'light',
    body: `
      ${head({
        kicker: 'لوحة التحكم',
        title: 'يومك كاملاً في <em>شاشة واحدة</em>',
        sub: 'ما يحتاج إجراءً أولاً، ثم جدول اليوم والموعد التالي ونسبة الإشغال.',
      })}
      ${brand}
      ${browser({ img: 'today', x: 130, y: 290, w: 1340, cropH: 900 })}`,
  },
  {
    name: '03-التقويم',
    theme: 'light',
    body: `
      ${head({
        kicker: 'التقويم',
        title: 'أسبوعك واضح، و<em>لا حجز فوق حجز</em>',
        sub: 'عرض يومي وأسبوعي وقائمة — والنظام يمنع حجز نفس الغرفة في نفس الوقت.',
      })}
      ${brand}
      ${browser({ img: 'calendar', x: 130, y: 290, w: 1340, cropH: 600 })}`,
  },
  {
    name: '04-التحليلات',
    theme: 'light',
    body: `
      ${head({
        kicker: 'التحليلات',
        title: 'أرقام نشاطك <em>من حجوزاتك الفعلية</em>',
        sub: 'الإشغال، الإيراد المحصّل والمستحق، عدم الحضور، وأوقات الذروة.',
      })}
      ${brand}
      ${browser({ img: 'analytics', x: 130, y: 290, w: 1340, cropH: 920 })}`,
  },
  {
    name: '05-تفاصيل-الحجز-والعملاء',
    theme: 'light',
    body: `
      ${head({
        kicker: 'الحجوزات والعملاء',
        title: 'سجل كامل<br>لكل حجز <em>ولكل عميل</em>',
        sub: 'الحالة والدفع وتاريخ كل تغيير،<br>وملف لكل عميل بزياراته ومدفوعاته.',
      }).replace('<div class="head">', '<div class="head" style="top:200px;max-width:440px">')}
      ${drawer({ img: 'booking-detail', x: 560, y: 70, w: 440, cropH: 960 })}
      ${drawer({ img: 'customer-detail', x: 80, y: 130, w: 440, cropH: 960 })}`,
  },
  {
    name: '06-متجاوب-على-كل-الأجهزة',
    theme: 'light',
    body: `
      ${head({
        kicker: 'يعمل على الجوال والكمبيوتر',
        title: 'تدير حجوزاتك <em>من أي جهاز</em>',
        sub: 'واجهة عربية كاملة من اليمين لليسار، مبنية على Laravel API قابلة للربط.',
      })}
      ${brand}
      ${browser({ img: 'bookings', x: 60, y: 300, w: 1060, cropH: 900, title: 'وعدة · الحجوزات' })}
      ${phone({ img: 'm-today', x: 1170, y: 270, w: 290 })}`,
  },
]

const browserApp = await chromium.launch()
const page = await browserApp.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })

for (const slide of SLIDES) {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
    ${[400, 500, 600, 700].map((w) => `<link rel="stylesheet" href="${font(w)}"><link rel="stylesheet" href="${latin(w)}">`).join('')}
    <style>${CSS}</style></head><body class="${slide.theme}">${slide.body}</body></html>`
  const file = resolve(DIR, `${slide.name}.html`)
  await writeFile(file, html)
  await page.goto(pathToFileURL(file).href)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: resolve(OUT, `${slide.name}.jpg`), type: 'jpeg', quality: 90 })
  console.log('✓', slide.name)
}

await browserApp.close()
