import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

/* Portfolio captures. Unlike qa.mjs this changes nothing: every shot comes
 * from a fresh context (so no "اختبار تلقائي" booking from a QA run), at 2×
 * pixel density, with the clock pinned to 12:40 so the Today screen has a
 * now-line mid-day and a full needs-attention queue. */

const BASE = process.env.SHOWCASE_BASE_URL || 'http://localhost:5173'
const OUT = './showcase/raw'
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
})

const now = new Date()
now.setHours(12, 40, 0, 0)

const FREEZE = `*, *::before, *::after {
  transition: none !important; animation-delay: 0s !important;
  animation-duration: 0s !important; caret-color: transparent !important; }
[data-sonner-toaster] { display: none !important; }`

async function open(viewport, { signedIn = true } = {}) {
  // phones at their native ×3 density: the mockups are shown large
  const phone = viewport.width < 500
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: phone ? 3 : 2,
    isMobile: phone,
    hasTouch: phone,
    locale: 'ar',
    reducedMotion: 'reduce',
  })
  await ctx.clock.setFixedTime(now)
  const page = await ctx.newPage()
  if (signedIn) {
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /ادخل بالحساب التجريبي/ }).click()
    await page.waitForURL(/\/app$/)
  }
  return { ctx, page }
}

async function settle(page, ms = 900) {
  await page.addStyleTag({ content: FREEZE })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

/* The numbers are invented, but marketplace reviewers reject gallery images
 * that look like they carry contact details, so mask anything phone-shaped. */
async function maskPhones(page) {
  await page.evaluate(() => {
    const PHONE = /05\d{8}/g
    const MASK = '05X XXX XXXX'
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (PHONE.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(PHONE, MASK)
    }
    for (const input of document.querySelectorAll('input')) {
      if (PHONE.test(input.value)) input.value = input.value.replace(PHONE, MASK)
    }
  })
}

async function shot(page, name, opts = {}) {
  await maskPhones(page)
  await page.evaluate(() => document.activeElement?.blur())
  await page.screenshot({ path: `${OUT}/${name}.png`, ...opts })
  console.log('✓', name)
}

async function visit(page, path, name, opts) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  await settle(page)
  await shot(page, name, opts)
}

// --- operator console, desktop -------------------------------------------
{
  const { ctx, page } = await open({ width: 1440, height: 960 })
  await settle(page)
  await shot(page, 'today')
  await visit(page, '/app/calendar?view=week', 'calendar')
  await visit(page, '/app/calendar', 'calendar-day')
  await visit(page, '/app/analytics?range=30', 'analytics', { fullPage: true })
  await visit(page, '/app/customers', 'customers')
  await visit(page, '/app/settings', 'settings', { fullPage: true })

  // this week rather than the oldest rows of the quarter
  await page.goto(BASE + '/app/bookings', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'هذا الأسبوع' }).click()
  await settle(page)
  await shot(page, 'bookings')

  // a booking with its whole history: booked, confirmed, paid, completed
  const id = await page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem('bookingpro:bookings:v1'))
    const today = new Date().toDateString()
    return all.find(
      (b) =>
        new Date(b.startAt).toDateString() === today &&
        b.status === 'completed' &&
        b.serviceId === 's2',
    ).id
  })
  await page.goto(`${BASE}/app/bookings?booking=${id}`, { waitUntil: 'networkidle' })
  await page.getByRole('dialog').waitFor()
  await settle(page, 600)
  await shot(page, 'booking-detail')
  await page.keyboard.press('Escape')

  await page.goto(BASE + '/app/customers', { waitUntil: 'networkidle' })
  await settle(page)
  await page.getByText('سارة خالد').first().click()
  await settle(page, 600)
  await shot(page, 'customer-detail')

  await page.goto(BASE + '/app', { waitUntil: 'networkidle' })
  await settle(page)
  await page.keyboard.press('n')
  await page.getByRole('dialog').waitFor()
  await settle(page, 600)
  await shot(page, 'create-booking')
  await ctx.close()
}

// --- operator console, phone ---------------------------------------------
{
  const { ctx, page } = await open({ width: 390, height: 763 })
  await settle(page)
  await shot(page, 'm-today')
  await page.evaluate(() => window.scrollTo(0, 560))
  await settle(page, 300)
  await shot(page, 'm-today-2')
  await visit(page, '/app/calendar', 'm-calendar')
  await visit(page, '/app/calendar?view=agenda', 'm-calendar-list')
  await visit(page, '/app/analytics?range=30', 'm-analytics')
  await page.evaluate(() => window.scrollTo(0, 720))
  await settle(page, 300)
  await shot(page, 'm-analytics-2')
  await visit(page, '/app/customers', 'm-customers')
  await visit(page, '/app/settings', 'm-settings')

  await page.goto(BASE + '/app/bookings', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'هذا الأسبوع' }).click()
  await settle(page)
  await shot(page, 'm-bookings')

  const id = await page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem('bookingpro:bookings:v1'))
    const today = new Date().toDateString()
    return all.find(
      (b) =>
        new Date(b.startAt).toDateString() === today &&
        b.status === 'completed' &&
        b.serviceId === 's2',
    ).id
  })
  await page.goto(`${BASE}/app/bookings?booking=${id}`, { waitUntil: 'networkidle' })
  await page.getByRole('dialog').waitFor()
  await settle(page, 600)
  await shot(page, 'm-booking-detail')

  await page.goto(BASE + '/app/customers', { waitUntil: 'networkidle' })
  await settle(page)
  await page.getByText('سارة خالد').first().click()
  await settle(page, 600)
  await shot(page, 'm-customer-detail')

  await page.goto(BASE + '/app', { waitUntil: 'networkidle' })
  await settle(page)
  await page
    .getByRole('button', { name: /حجز جديد/ })
    .first()
    .click()
  await page.getByRole('dialog').waitFor()
  await settle(page, 600)
  await shot(page, 'm-create-booking')
  await ctx.close()
}

// --- public pages, desktop and phone --------------------------------------
for (const [viewport, prefix] of [
  [{ width: 1440, height: 900 }, ''],
  [{ width: 390, height: 763 }, 'm-'],
]) {
  const { ctx, page } = await open(viewport, { signedIn: false })

  await page.goto(BASE + '/book', { waitUntil: 'networkidle' })
  await settle(page)
  await shot(page, `${prefix}book-1`)
  await page.getByRole('button', { name: /استشارة طبية/ }).click()
  await page.getByRole('button', { name: 'التالي' }).click()
  await settle(page, 500)
  // tomorrow is busy enough to show taken slots struck through
  await page.locator('[role="radio"]').nth(1).click()
  await settle(page, 300)
  await page
    .locator('[role="radio"]:not([disabled])')
    .filter({ hasText: /\d:\d\d/ })
    .nth(4)
    .click()
  await settle(page, 300)
  await shot(page, `${prefix}book-2`)
  await page.getByRole('button', { name: 'التالي' }).click()
  await settle(page, 400)
  await page.getByLabel(/الاسم الكامل/).fill('عبدالرحمن الشهري')
  await page.getByLabel(/رقم الجوال/).fill('0551234567')
  // on a phone the form runs past the fold; show the summary and confirm button
  if (prefix) await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await settle(page, 300)
  await shot(page, `${prefix}book-3`)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.getByRole('button', { name: 'تأكيد الحجز' }).click()
  await settle(page, 900)
  await shot(page, `${prefix}book-done`)
  await ctx.close()
}

await browser.close()
