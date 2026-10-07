import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

/* The service cover. Unlike the gallery slides it carries no words, numbers,
 * names or logos at all — marketplace reviewers reject covers with text on
 * them — so the product is redrawn as shapes: a week calendar filling with
 * bookings, a phone picking a slot, a confirmation. Skeleton bars stand in
 * wherever the real UI would have text.
 *
 * Self-contained: needs no captures from showcase.mjs. */

const DIR = resolve('showcase/compose')
const OUT = resolve(process.env.SHOWCASE_OUT || 'showcase/gallery')
await mkdir(DIR, { recursive: true })
await mkdir(OUT, { recursive: true })

const W = 1600
const H = 900

/* lucide paths, inlined so the page has no dependencies */
const ICON = {
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  arrow: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
}
const icon = (name, size = 18, color = 'currentColor', width = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`

const user = (bg) => `<span class="avatar" style="background:${bg}">
  <svg viewBox="0 0 24 24" width="62%" height="62%" fill="#fff"><circle cx="12" cy="8.5" r="4.2"/><path d="M3.8 21.5a8.2 8.2 0 0 1 16.4 0z"/></svg></span>`

/** Skeleton bar standing in for a line of text. */
const bar = (w, h = 8, c = 'var(--sk)', extra = '') =>
  `<i class="bar" style="width:${w}px;height:${h}px;background:${c};${extra}"></i>`

const TONES = {
  indigo: ['#EEF0FF', '#818CF8', '#C7CCFB'],
  cyan: ['#E6FBFE', '#22D3EE', '#A5EDF7'],
  pink: ['#FDEEF6', '#F472B6', '#F9C4DE'],
  mint: ['#E8FBF3', '#34D399', '#A7EBCF'],
  amber: ['#FFF7E6', '#FBBF24', '#FCE3A1'],
}

/* week grid: [column 0–6, start hour offset, length in hours, tone] */
const BOOKINGS = [
  [0, 0.1, 0.8, 'indigo'],
  [0, 1.2, 1.2, 'mint'],
  [0, 3.4, 0.9, 'cyan'],
  [1, 0.6, 1.0, 'pink'],
  [1, 2.0, 1.6, 'indigo'],
  [1, 4.0, 0.8, 'amber'],
  [2, 0.1, 1.3, 'cyan'],
  [2, 3.0, 1.0, 'mint'],
  [3, 0.9, 0.8, 'amber'],
  [3, 2.0, 0.9, 'indigo'],
  [3, 3.3, 1.4, 'pink'],
  [4, 0.3, 1.4, 'indigo'],
  [4, 2.2, 0.8, 'cyan'],
  [5, 1.0, 1.1, 'mint'],
  [5, 3.6, 1.0, 'indigo'],
  [6, 0.2, 0.9, 'pink'],
  [6, 1.5, 1.6, 'cyan'],
]
const HOUR = 66
const HOURS = 5.2

function weekGrid() {
  const cols = Array.from({ length: 7 }, (_, c) => {
    const blocks = BOOKINGS.filter(([col]) => col === c)
      .map(([, start, len, tone]) => {
        const [bg, edge, line] = TONES[tone]
        return `<div class="block" style="top:${start * HOUR}px;height:${len * HOUR - 6}px;background:${bg};border-inline-start-color:${edge}">
          ${bar(46, 6, edge, 'opacity:.85')}${len > 0.85 ? bar(30, 5, line, 'margin-top:6px') : ''}</div>`
      })
      .join('')
    // the booking that just arrived from the phone
    const fresh =
      c === 2
        ? `<div class="block fresh" style="top:${1.55 * HOUR}px;height:${1.2 * HOUR - 6}px">
            ${bar(46, 6, 'rgba(255,255,255,.95)')}${bar(30, 5, 'rgba(255,255,255,.6)', 'margin-top:6px')}
            <span class="fresh-check">${icon('check', 12, '#6366F1', 3)}</span></div>`
        : ''
    return `<div class="col">${blocks}${fresh}</div>`
  }).join('')
  const heads = Array.from(
    { length: 7 },
    (_, i) =>
      `<div class="dayhead${i === 2 ? ' today' : ''}">${bar(22, 5)}<b>${i === 2 ? '' : ''}</b></div>`,
  ).join('')
  const lines = Array.from(
    { length: 6 },
    (_, i) => `<span class="hline" style="top:${i * HOUR}px"></span>`,
  ).join('')
  return `<div class="week">
    <div class="weekhead"><span></span>${heads}</div>
    <div class="weekbody">
      <div class="rail">${Array.from({ length: 6 }, (_, i) => bar(22, 5, 'var(--sk)', `position:absolute;top:${i * HOUR - 3}px`)).join('')}</div>
      <div class="cols">${lines}${cols}</div>
    </div></div>`
}

function dashboard() {
  const nav = ['sun', 'calendar', 'users', 'chart', 'settings']
    .map(
      (n, i) =>
        `<div class="nav${i === 1 ? ' active' : ''}">${icon(n, 17, i === 1 ? '#6366F1' : '#94A3B8')}${bar(i === 1 ? 64 : 54, 7, i === 1 ? '#C7CCFB' : 'var(--sk)')}</div>`,
    )
    .join('')
  const stats = [
    ['indigo', 'chart'],
    ['mint', 'check'],
    ['pink', 'clock'],
  ]
    .map(
      ([tone, ic]) => `<div class="stat">
        <span class="tile" style="background:${TONES[tone][0]};color:${TONES[tone][1]}">${icon(ic, 16, 'currentColor', 2.4)}</span>
        <div>${bar(58, 6)}${bar(84, 12, '#CBD5E1', 'margin-top:9px;border-radius:5px')}</div></div>`,
    )
    .join('')
  return `<div class="dash glass">
    <aside>
      <div class="logo"><span class="tile grad">${icon('calendar', 17, '#fff', 2.2)}</span>${bar(62, 9, '#CBD5E1')}</div>
      ${nav}
    </aside>
    <section>
      <header>
        <div class="search">${icon('search', 15, '#94A3B8')}${bar(120, 7)}</div>
        <span style="flex:1"></span>
        <span class="chip-amber">${icon('bell', 14, '#D97706', 2.2)}</span>
        <span class="btn grad">${icon('plus', 16, '#fff', 2.6)}${bar(46, 7, 'rgba(255,255,255,.75)')}</span>
        ${user('linear-gradient(135deg,#A5B4FC,#6366F1)')}
      </header>
      <div class="stats">${stats}</div>
      <div class="cal">
        <div class="calhead">
          <span class="chev">${icon('chevR', 14, '#64748B')}</span>${bar(110, 9, '#CBD5E1')}<span class="chev">${icon('chevL', 14, '#64748B')}</span>
          <span style="flex:1"></span>
          <span class="seg"><i class="on"></i><i></i><i></i></span>
        </div>
        ${weekGrid()}
      </div>
    </section>
  </div>`
}

function phone() {
  const days = Array.from(
    { length: 6 },
    (_, i) =>
      `<span class="day${i === 1 ? ' on' : ''}">${bar(14, 4, i === 1 ? 'rgba(255,255,255,.7)' : 'var(--sk)')}${bar(12, 8, i === 1 ? '#fff' : '#CBD5E1', 'margin-top:5px;border-radius:3px')}</span>`,
  ).join('')
  // 0 free, 1 taken, 2 chosen
  const slots = [0, 0, 1, 0, 1, 0, 2, 0, 0, 0, 1, 0]
    .map(
      (s) =>
        `<span class="slot s${s}">${bar(30, 6, s === 2 ? '#fff' : s === 1 ? '#E2E8F0' : '#CBD5E1')}</span>`,
    )
    .join('')
  return `<div class="phone">
    <div class="screen">
      <div class="notch"></div>
      <div class="ptop"><span class="tile grad sm">${icon('calendar', 13, '#fff', 2.4)}</span>${bar(54, 7, '#CBD5E1')}</div>
      <div class="steps"><span class="dot done">${icon('check', 10, '#fff', 3.4)}</span><i></i><span class="dot cur"></span><i></i><span class="dot"></span></div>
      ${bar(96, 10, '#CBD5E1', 'margin:16px 18px 0 auto;display:block;border-radius:5px')}
      ${bar(140, 6, 'var(--sk)', 'margin:9px 18px 0 auto;display:block')}
      <div class="pcard">
        <div class="days">${days}</div>
        <div class="slots">${slots}</div>
      </div>
      <div class="pcard summary">
        <div>${bar(40, 6)}${bar(74, 7, '#CBD5E1')}</div>
        <div>${bar(34, 6)}${bar(92, 7, '#CBD5E1')}</div>
      </div>
      <div class="cta grad">${icon('arrow', 16, '#fff', 2.6)}${bar(54, 7, 'rgba(255,255,255,.8)')}</div>
    </div>
  </div>`
}

const donut = `<div class="float glass kpi">
  <svg width="74" height="74" viewBox="0 0 74 74">
    <defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#818CF8"/><stop offset="1" stop-color="#22D3EE"/></linearGradient></defs>
    <circle cx="37" cy="37" r="28" fill="none" stroke="#EEF0FF" stroke-width="10"/>
    <circle cx="37" cy="37" r="28" fill="none" stroke="url(#g1)" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${0.68 * 2 * Math.PI * 28} ${2 * Math.PI * 28}" transform="rotate(-90 37 37)"/>
  </svg>
  <div>${bar(70, 7)}${bar(46, 12, '#CBD5E1', 'margin-top:9px;border-radius:5px')}${bar(58, 6, 'var(--sk)', 'margin-top:9px')}</div>
</div>`

const chart = `<div class="float glass chart">
  <div class="row">${bar(76, 7)}<span style="flex:1"></span><span class="pill-up">${icon('chart', 12, '#059669', 2.6)}</span></div>
  <svg width="236" height="92" viewBox="0 0 236 92">
    <defs>
      <linearGradient id="g2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#22D3EE"/><stop offset="1" stop-color="#818CF8"/></linearGradient>
      <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#818CF8" stop-opacity=".32"/><stop offset="1" stop-color="#818CF8" stop-opacity="0"/></linearGradient>
    </defs>
    <path d="M0 74 C 24 70, 34 52, 58 56 S 96 72, 120 48 S 160 40, 180 30 S 214 26, 236 8 L236 92 L0 92Z" fill="url(#g3)"/>
    <path d="M0 74 C 24 70, 34 52, 58 56 S 96 72, 120 48 S 160 40, 180 30 S 214 26, 236 8" fill="none" stroke="url(#g2)" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="236" cy="8" r="0" />
  </svg>
</div>`

const toast = `<div class="float glass toast">
  <span class="ok">${icon('check', 20, '#fff', 3)}</span>
  <div>${bar(118, 8, '#CBD5E1')}${bar(78, 6, 'var(--sk)', 'margin-top:8px')}</div>
</div>`

const people = `<div class="float glass people">
  ${user('linear-gradient(135deg,#F9A8D4,#EC4899)')}
  ${user('linear-gradient(135deg,#67E8F9,#0891B2)')}
  ${user('linear-gradient(135deg,#A5B4FC,#6366F1)')}
  <span class="more">${icon('plus', 14, '#6366F1', 2.8)}</span>
</div>`

const bell = `<div class="float glass round bell">${icon('bell', 26, '#6366F1', 2)}<span class="ping"></span></div>`
const clock = `<div class="float glass round clock">${icon('clock', 22, '#0891B2', 2.2)}</div>`

const CSS = `
:root { --sk: #E2E8F0; --grad: linear-gradient(135deg, #818CF8, #6366F1 45%, #22D3EE); }
* { box-sizing: border-box; margin: 0; }
html, body { width: ${W}px; height: ${H}px; }
body {
  overflow: hidden; position: relative;
  background:
    radial-gradient(620px 460px at 88% 6%, #C7D2FE 0%, transparent 70%),
    radial-gradient(560px 460px at 4% 96%, #A5F3FC 0%, transparent 70%),
    radial-gradient(520px 380px at 60% 72%, #FBCFE8 0%, transparent 70%),
    radial-gradient(500px 400px at 18% 8%, #E9D5FF 0%, transparent 70%),
    #F7F5FF;
}
body::before { content: ''; position: absolute; inset: 0;
  background-image: radial-gradient(#A5B4FC 1.1px, transparent 1.1px); background-size: 26px 26px;
  opacity: .35; mask-image: radial-gradient(ellipse at center, #000 30%, transparent 75%); }
.orb { position: absolute; border-radius: 50%; filter: blur(2px); }
.bar { display: block; border-radius: 99px; flex: none; }
.grad { background: var(--grad); }
.glass { background: rgba(255,255,255,.78); backdrop-filter: blur(18px);
  border: 1px solid rgba(255,255,255,.9);
  box-shadow: 0 30px 60px -24px rgba(79,70,229,.28), 0 2px 6px rgba(15,23,42,.04); }
.tile { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; flex: none; }
.tile.sm { width: 26px; height: 26px; border-radius: 8px; }
.avatar { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: end center; overflow: hidden;
  border: 2px solid #fff; flex: none; }

/* dashboard */
.dash { position: absolute; left: 90px; top: 150px; width: 900px; height: 640px; border-radius: 22px;
  display: flex; direction: rtl; overflow: hidden; z-index: 2;
  transform: perspective(2400px) rotateY(-7deg) rotateX(3deg); transform-origin: right center; }
.dash aside { width: 178px; border-inline-end: 1px solid #EEF0F6; padding: 20px 14px; background: rgba(255,255,255,.55); }
.logo { display: flex; align-items: center; gap: 10px; margin-bottom: 26px; }
.nav { display: flex; align-items: center; gap: 11px; padding: 11px 12px; border-radius: 11px; margin-bottom: 4px; }
.nav.active { background: #EEF0FF; }
.dash section { flex: 1; display: flex; flex-direction: column; padding: 0 22px 20px; }
.dash header { height: 70px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #EEF0F6; margin: 0 -22px; padding: 0 22px; }
.search { display: flex; align-items: center; gap: 10px; height: 38px; width: 240px; padding: 0 14px;
  border-radius: 11px; border: 1px solid #E8EBF2; background: #fff; }
.chip-amber { width: 38px; height: 38px; border-radius: 11px; background: #FFF7E6; display: grid; place-items: center; border: 1px solid #FDE7B0; }
.btn { height: 38px; padding: 0 14px; border-radius: 11px; display: flex; align-items: center; gap: 9px;
  box-shadow: 0 10px 20px -10px #6366F1; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 18px; }
.stat { background: #fff; border: 1px solid #EEF0F6; border-radius: 14px; padding: 14px; display: flex; gap: 12px; align-items: center; }
.cal { margin-top: 16px; flex: 1; background: #fff; border: 1px solid #EEF0F6; border-radius: 16px; padding: 14px 16px; }
.calhead { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.chev { width: 26px; height: 26px; border-radius: 8px; border: 1px solid #E8EBF2; display: grid; place-items: center; }
.seg { display: flex; gap: 4px; padding: 4px; border-radius: 10px; background: #F1F5F9; }
.seg i { width: 34px; height: 18px; border-radius: 7px; }
.seg i.on { background: #fff; box-shadow: 0 1px 3px rgba(15,23,42,.12); }
.week { direction: rtl; }
.weekhead { display: grid; grid-template-columns: 34px repeat(7, 1fr); gap: 6px; margin-bottom: 8px; }
.dayhead { display: grid; place-items: center; gap: 5px; padding: 6px 0; border-radius: 9px; }
.dayhead b { width: 16px; height: 9px; border-radius: 3px; background: #CBD5E1; }
.dayhead.today { background: #EEF0FF; }
.dayhead.today b { background: #6366F1; }
.weekbody { display: grid; grid-template-columns: 34px 1fr; gap: 6px; height: ${HOURS * HOUR}px; }
.rail { position: relative; }
.cols { position: relative; display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.hline { position: absolute; inset-inline: 0; height: 1px; background: #F1F3F8; }
.col { position: relative; }
.block { position: absolute; inset-inline: 0; border-radius: 8px; border-inline-start: 3px solid; padding: 8px 7px; }
.block.fresh { background: var(--grad); border: 0; z-index: 3;
  box-shadow: 0 0 0 4px rgba(129,140,248,.25), 0 14px 26px -8px rgba(99,102,241,.7); }
.fresh-check { position: absolute; top: -9px; left: -9px; width: 22px; height: 22px; border-radius: 50%;
  background: #fff; display: grid; place-items: center; box-shadow: 0 4px 10px rgba(99,102,241,.4); }

/* phone */
.phone { position: absolute; left: 1060px; top: 96px; width: 312px; height: 650px; border-radius: 48px;
  background: #fff; padding: 11px; z-index: 5;
  box-shadow: 0 50px 90px -30px rgba(79,70,229,.45), 0 0 0 1px rgba(99,102,241,.12), inset 0 0 0 1px #EEF0F6;
  transform: rotate(4deg); }
.screen { position: relative; height: 100%; border-radius: 38px; overflow: hidden; direction: rtl;
  background: linear-gradient(#FBFBFF, #F5F6FC); border: 1px solid #EEF0F6; }
.notch { width: 96px; height: 24px; border-radius: 14px; background: #0F172A; margin: 10px auto 0; }
.ptop { display: flex; align-items: center; gap: 8px; padding: 16px 18px 12px; border-bottom: 1px solid #EEF0F6; }
.steps { display: flex; align-items: center; gap: 6px; padding: 16px 18px 0; }
.steps i { flex: 1; height: 2px; border-radius: 2px; background: #E2E8F0; }
.steps i:first-of-type { background: #A5B4FC; }
.dot { width: 22px; height: 22px; border-radius: 50%; border: 2px solid #E2E8F0; background: #fff; display: grid; place-items: center; }
.dot.done { background: var(--grad); border: 0; }
.dot.cur { border-color: #6366F1; box-shadow: 0 0 0 4px #EEF0FF; }
.pcard { margin: 16px 14px 0; background: #fff; border: 1px solid #EEF0F6; border-radius: 18px; padding: 13px; }
.days { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
.day { height: 50px; border-radius: 11px; border: 1px solid #E8EBF2; display: grid; place-content: center; justify-items: center; }
.day.on { background: var(--grad); border: 0; box-shadow: 0 10px 18px -8px #6366F1; }
.summary { padding: 4px 14px; }
.summary div { display: flex; justify-content: space-between; align-items: center; height: 34px; }
.summary div + div { border-top: 1px solid #F1F3F8; }
.slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-top: 14px; }
.slot { height: 36px; border-radius: 10px; border: 1px solid #E8EBF2; display: grid; place-items: center; background: #fff; position: relative; }
.slot.s1 { background: #F8FAFC; }
.slot.s1::after { content: ''; position: absolute; width: 38px; height: 1.5px; background: #CBD5E1; }
.slot.s2 { background: var(--grad); border: 0; box-shadow: 0 10px 18px -8px #6366F1; }
.cta { position: absolute; left: 14px; right: 14px; bottom: 22px; height: 46px; border-radius: 14px;
  display: flex; align-items: center; justify-content: center; gap: 10px; box-shadow: 0 14px 24px -10px #6366F1; }

/* floating */
.float { position: absolute; border-radius: 18px; z-index: 6; }
.kpi { left: 40px; top: 70px; padding: 16px 20px 16px 16px; display: flex; gap: 16px; align-items: center; direction: rtl; }
.chart { left: 40px; top: 660px; padding: 16px 18px 12px; direction: rtl; }
.chart .row { display: flex; align-items: center; margin-bottom: 8px; }
.pill-up { width: 26px; height: 22px; border-radius: 8px; background: #DCFCE7; display: grid; place-items: center; }
.toast { left: 1250px; top: 770px; padding: 16px 20px 16px 18px; display: flex; gap: 14px; align-items: center; direction: rtl; }
.ok { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #6EE7B7, #10B981);
  display: grid; place-items: center; box-shadow: 0 10px 20px -8px #10B981; }
.people { left: 1340px; top: 40px; padding: 10px 12px; display: flex; direction: ltr; border-radius: 99px; }
.people .avatar { width: 44px; height: 44px; margin-left: -12px; border-width: 3px; }
.people .avatar:first-child { margin-left: 0; }
.more { width: 44px; height: 44px; margin-left: -12px; border-radius: 50%; background: #EEF0FF; border: 3px solid #fff; display: grid; place-items: center; }
.round { border-radius: 50%; display: grid; place-items: center; }
.bell { left: 1440px; top: 420px; width: 72px; height: 72px; }
.ping { position: absolute; top: 16px; right: 18px; width: 12px; height: 12px; border-radius: 50%;
  background: #F472B6; border: 2.5px solid #fff; }
.clock { left: 960px; top: 64px; width: 58px; height: 58px; }
.spark { position: absolute; z-index: 7; }
.flow { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
`

const spark = (x, y, s, c) =>
  `<svg class="spark" style="left:${x}px;top:${y}px" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z" fill="${c}"/></svg>`

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
  <div class="orb" style="left:1180px;top:520px;width:120px;height:120px;background:radial-gradient(circle at 30% 30%,#fff,#C7D2FE)"></div>
  <div class="orb" style="left:40px;top:430px;width:70px;height:70px;background:radial-gradient(circle at 30% 30%,#fff,#A5F3FC)"></div>
  ${dashboard()}
  <svg class="flow" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="gf" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#22D3EE"/><stop offset="1" stop-color="#818CF8"/></linearGradient></defs>
    <path d="M1080 712 C 1010 860, 660 870, 570 660 S 535 610, 528 592" fill="none" stroke="url(#gf)" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round"/>
    <circle cx="1080" cy="712" r="6" fill="#22D3EE"/><circle cx="1080" cy="712" r="13" fill="#22D3EE" opacity=".2"/>
  </svg>
  ${phone()}
  ${donut}${chart}${toast}${people}${bell}${clock}
  ${spark(1372, 92, 26, '#818CF8')}${spark(1470, 300, 16, '#F472B6')}${spark(60, 330, 18, '#22D3EE')}${spark(980, 790, 14, '#818CF8')}
</body></html>`

const file = resolve(DIR, 'cover.html')
await writeFile(file, html)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })
await page.goto(pathToFileURL(file).href)
await page.screenshot({ path: resolve(OUT, '00-الغلاف.jpg'), type: 'jpeg', quality: 90 })

// how it reads as a thumbnail in a listing
const thumb = await browser.newPage({ viewport: { width: 400, height: 225 } })
await thumb.goto(pathToFileURL(file).href)
await thumb.evaluate(() => (document.body.style.zoom = String(400 / 1600)))
await thumb.screenshot({ path: resolve(OUT, '_preview-400.jpg'), type: 'jpeg', quality: 85 })

await browser.close()
console.log('✓ cover')
