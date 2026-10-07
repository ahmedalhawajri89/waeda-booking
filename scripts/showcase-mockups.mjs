import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

/* Marketplace gallery: the app at phone size, in phone mockups, at 4K.
 * Reviewers rejected desktop screens shrunk into browser frames as "low
 * quality" and asked for exactly this. No captions — the screens carry it.
 *
 * Reads the ×3 phone captures (1170×2289) from showcase.mjs and the cover
 * from showcase-cover.mjs; writes ./showcase/khamsat. */

const RAW = resolve('showcase/raw')
const DIR = resolve('showcase/compose')
const OUT = resolve(process.env.SHOWCASE_OUT || 'showcase/khamsat')
await mkdir(DIR, { recursive: true })
await mkdir(OUT, { recursive: true })

const W = 1600
const H = 900
const SCALE = 2.4 // → 3840×2160

const img = (name) => pathToFileURL(resolve(RAW, `${name}.png`)).href

/* status bar glyphs: signal, wifi, battery */
const STATUS = `<span class="time">9:41</span><span class="glyphs">
  <svg width="18" height="11" viewBox="0 0 18 11"><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="6" rx="1"/><rect x="10" y="2.5" width="3" height="8.5" rx="1"/><rect x="15" y="0" width="3" height="11" rx="1"/></svg>
  <svg width="16" height="11" viewBox="0 0 16 11"><path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10.3 10.3 0 0 0 8 .4 10.3 10.3 0 0 0 .8 3.3L2 4.6a8.5 8.5 0 0 1 6-2.4zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.2-1.3A6.8 6.8 0 0 0 8 4 6.8 6.8 0 0 0 3.4 5.8l1.2 1.3c.9-.8 2.1-1.3 3.4-1.3zM8 9.4l1.9-2a2.7 2.7 0 0 0-3.8 0z"/></svg>
  <svg width="26" height="12" viewBox="0 0 26 12"><rect x=".5" y=".5" width="22" height="11" rx="3.2" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="17" height="8" rx="2"/><rect x="23.5" y="4" width="1.6" height="4" rx=".8" opacity=".45"/></svg>
</span>`

/** A phone at `w` css px wide, centred on (cx, cy). */
function phone({ shot, cx, cy, w = 330, rotate = 0, z = 2 }) {
  const screenW = w - 24
  const screenH = Math.round((screenW * 844) / 390)
  const h = screenH + 24
  // status bar 47pt + app 763pt + home-indicator safe area 34pt = 844pt
  const pt = screenW / 390
  return `<div class="shadow" style="left:${cx - w * 0.38}px;top:${cy + h / 2 - 40}px;width:${w * 0.76}px;z-index:${z - 1}"></div>
  <div class="phone" style="left:${cx - w / 2}px;top:${cy - h / 2}px;width:${w}px;height:${h}px;transform:rotate(${rotate}deg);z-index:${z}">
    <i class="btn b1"></i><i class="btn b2"></i><i class="btn b3"></i><i class="btn b4"></i>
    <div class="screen" style="width:${screenW}px;height:${screenH}px">
      <div class="status" style="height:${Math.round(47 * pt)}px">${STATUS}</div>
      <div class="island"></div>
      <img src="${img(shot)}" style="width:${screenW}px">
      <div class="safe" style="height:${Math.round(34 * pt)}px"><i class="home"></i></div>
    </div>
  </div>`
}

const THEMES = {
  lavender: ['#EEF0FF', '#C7D2FE', '#E9D5FF', '#A5F3FC'],
  mint: ['#ECFDF8', '#A7F3D0', '#A5F3FC', '#C7D2FE'],
  rose: ['#FFF1F6', '#FBCFE8', '#FDE68A', '#C7D2FE'],
  sky: ['#EFF8FF', '#BAE6FD', '#C7D2FE', '#FBCFE8'],
  violet: ['#F5F3FF', '#DDD6FE', '#A5F3FC', '#FBCFE8'],
}

function background([base, a, b, c]) {
  return `background:
    radial-gradient(640px 520px at 92% 8%, ${a} 0%, transparent 70%),
    radial-gradient(600px 520px at 6% 92%, ${b} 0%, transparent 70%),
    radial-gradient(520px 420px at 50% 115%, ${c} 0%, transparent 70%),
    ${base};`
}

const CSS = `
* { box-sizing: border-box; margin: 0; }
html, body { width: ${W}px; height: ${H}px; }
body { overflow: hidden; position: relative; font-family: -apple-system, 'Segoe UI', system-ui, sans-serif; }
body::before { content: ''; position: absolute; inset: 0;
  background-image: radial-gradient(rgba(99,102,241,.28) 1.1px, transparent 1.1px); background-size: 26px 26px;
  mask-image: radial-gradient(ellipse at center, transparent 25%, #000 80%); opacity: .55; }
.ring { position: absolute; border-radius: 50%; border: 1.5px solid rgba(99,102,241,.14); }
.blob { position: absolute; border-radius: 50%; filter: blur(1px); }

.phone { position: absolute; border-radius: 58px; padding: 12px;
  background: linear-gradient(145deg, #3B4150 0%, #1B1E25 22%, #2A2E37 55%, #101216 100%);
  box-shadow:
    0 0 0 1.5px #5B6272 inset, 0 0 0 3px #0B0C10 inset, 0 2px 6px rgba(15,23,42,.18); }
.shadow { position: absolute; height: 70px; border-radius: 50%; background: rgba(30,27,75,.42); filter: blur(30px); }
.safe { background: #fff; position: relative; }
.btn { position: absolute; width: 4px; border-radius: 3px; background: linear-gradient(90deg, #15171C, #3B4150); }
.b1 { left: -3px; top: 120px; height: 30px; }
.b2 { left: -3px; top: 172px; height: 56px; }
.b3 { left: -3px; top: 240px; height: 56px; }
.b4 { right: -3px; top: 190px; height: 88px; background: linear-gradient(270deg, #15171C, #3B4150); }
.screen { position: relative; border-radius: 46px; overflow: hidden; background: #fff; }
.screen img { display: block; }
.status { display: flex; align-items: center; justify-content: space-between; padding: 0 30px 0 34px;
  background: #fff; color: #0F172A; position: relative; z-index: 1; }
.status .time { font-weight: 600; font-size: 15px; letter-spacing: -.2px; padding-top: 4px; }
.status .glyphs { display: flex; gap: 6px; align-items: center; padding-top: 4px; fill: currentColor; }
.island { position: absolute; top: 11px; left: 50%; transform: translateX(-50%); width: 31%; height: 30px;
  border-radius: 20px; background: #000; z-index: 2; }
.home { position: absolute; bottom: 9px; left: 50%; transform: translateX(-50%); width: 36%; height: 5px;
  border-radius: 5px; background: rgba(15,23,42,.85); z-index: 2; }
`

/* Shared decoration: soft rings behind the phones */
const deco = `
  <div class="ring" style="left:520px;top:-260px;width:560px;height:560px"></div>
  <div class="ring" style="left:440px;top:-340px;width:720px;height:720px"></div>
  <div class="ring" style="left:-140px;top:560px;width:460px;height:460px"></div>
  <div class="blob" style="left:1420px;top:640px;width:90px;height:90px;background:radial-gradient(circle at 30% 30%,#fff,#C7D2FE)"></div>
  <div class="blob" style="left:110px;top:120px;width:56px;height:56px;background:radial-gradient(circle at 30% 30%,#fff,#A5F3FC)"></div>`

/** three phones: middle forward and larger */
const trio = (a, b, c) => `
  ${phone({ shot: a, cx: 1230, cy: 470, w: 318, rotate: 0, z: 2 })}
  ${phone({ shot: b, cx: 800, cy: 450, w: 350, rotate: 0, z: 3 })}
  ${phone({ shot: c, cx: 370, cy: 470, w: 318, rotate: 0, z: 2 })}`

/** two phones, staggered */
const duo = (a, b) => `
  ${phone({ shot: a, cx: 1020, cy: 440, w: 350, z: 3 })}
  ${phone({ shot: b, cx: 590, cy: 470, w: 350, z: 2 })}`

const SLIDES = [
  { name: '01', theme: 'lavender', body: trio('m-book-1', 'm-book-2', 'm-book-done') },
  { name: '02', theme: 'sky', body: trio('m-today', 'm-today-2', 'm-calendar-list') },
  { name: '03', theme: 'violet', body: duo('m-analytics', 'm-analytics-2') },
  { name: '04', theme: 'mint', body: trio('m-bookings', 'm-booking-detail', 'm-create-booking') },
  { name: '05', theme: 'rose', body: trio('m-customers', 'm-customer-detail', 'm-settings') },
  { name: '06', theme: 'lavender', body: duo('m-book-3', 'm-calendar') },
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE })

for (const slide of SLIDES) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
    <body style="${background(THEMES[slide.theme])}">${deco}${slide.body}</body></html>`
  const file = resolve(DIR, `mockup-${slide.name}.html`)
  await writeFile(file, html)
  await page.goto(pathToFileURL(file).href)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: resolve(OUT, `${slide.name}.jpg`), type: 'jpeg', quality: 92 })
  console.log('✓', slide.name)
}
await browser.close()

// the cover leads the gallery
await copyFile(resolve('showcase/gallery/00-الغلاف.jpg'), resolve(OUT, '00.jpg')).catch(() =>
  console.log('! run showcase-cover.mjs for the cover'),
)
