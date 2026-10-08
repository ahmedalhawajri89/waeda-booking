import { chromium } from 'playwright'

// The dev server's default, overridable — 5173 is a popular port and this
// script silently walked a different project that happened to own it.
const BASE = process.env.QA_BASE_URL || 'http://localhost:5173'
const OUT = './qa-screenshots'
// Playwright resolves its own browser. This used to hard-code a path inside
// the container it was written in, which meant `npm run qa` could not run on
// a developer's machine at all — a QA script that only works in one place is
// a QA script nobody runs. PLAYWRIGHT_CHROMIUM overrides it where the browser
// really does live somewhere else.
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
  args: ['--no-sandbox'],
})

const errors = []
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar' })
const page = await ctx.newPage()
page.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error' && !t.includes('ERR_TUNNEL') && !t.includes('fonts.googleapis'))
    errors.push(`[console] ${t}`)
})
page.on('pageerror', (e) => errors.push(`[pageerror] ${e}`))

async function go(path, name, waitMs = 900) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(waitMs)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('✓', name, '→', page.url().replace(BASE, '') || '/')
}

// --- guard: /app must bounce to /login when signed out ------------------
await page.goto(BASE + '/app', { waitUntil: 'networkidle' })
console.log(page.url().includes('/login') ? '✓ guard redirects /app → /login' : '✗ GUARD FAILED')

// --- 404 ---------------------------------------------------------------
await go('/definitely-not-a-page', '404')
console.log(
  (await page.getByText('الصفحة غير موجودة').count()) > 0 ? '✓ 404 page renders' : '✗ 404 missing',
)

// --- guest -------------------------------------------------------------
await go('/', 'guest-home')
await go('/book', 'guest-book-1')

// walk the guest wizard end to end
// one page: service → nearest time → details → code → done
await page.getByRole('radio', { name: /استشارة جلدية/ }).click()
// A day ahead, so the booking is still outside the two-hour change cutoff
// when the manage page is exercised below — "nearest" could be minutes away.
for (const id of ['#day-1', '#day-2', '#day-3']) {
  if (await page.locator(`${id}:not([disabled])`).count()) {
    await page.locator(id).click()
    break
  }
}
await page.waitForTimeout(300)
await page
  .locator('[role="radiogroup"][aria-label^="أوقات"] [role="radio"]:not([disabled])')
  .first()
  .click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/guest-book-2.png` })
await page.getByLabel(/الاسم الكامل/).fill('اختبار تلقائي')
await page.getByLabel(/رقم الجوال/).fill('0501112222')
await page.screenshot({ path: `${OUT}/guest-book-3.png` })
await page.getByRole('button', { name: 'تأكيد الحجز' }).first().click()
await page.waitForTimeout(500)
// The demo shows the WhatsApp code in a toast; a returning device skips this.
if (await page.getByText('أدخل رمز التحقق').count()) {
  const toastText = await page.locator('[data-sonner-toast]').last().innerText()
  await page.keyboard.type(toastText.match(/\d{4}/)?.[0] ?? '')
}
await page.waitForTimeout(900)
await page.screenshot({ path: `${OUT}/guest-confirmed.png` })
const ref = await page.locator('[dir="ltr"][data-numeric]').first().innerText()
console.log('✓ guest booking created:', ref.trim())

// --- my booking lookup --------------------------------------------------
// This device just booked, so it is recognised and the phone is not asked.
await go(`/booking/${ref.trim()}`, 'my-booking')
console.log(
  (await page.getByText('بانتظار التأكيد').count()) > 0
    ? '✓ manage page opens straight onto the booking'
    : '✗ manage page did not recognise the device',
)
console.log(
  /أُرسل إلى/.test(
    (await page
      .locator('[data-receipt]')
      .innerText()
      .catch(() => '')) || '',
  )
    ? '✓ the guest sees it is sent, not yet seen by the business'
    : '✗ receipt line missing on a fresh booking',
)

// move it to the first free time
await page.getByRole('button', { name: 'تعديل الموعد' }).click()
await page.waitForTimeout(500)
await page
  .locator('#move [role="radiogroup"][aria-label^="أوقات"] [role="radio"]:not([disabled])')
  .first()
  .click()
await page.getByRole('button', { name: 'تأكيد الموعد الجديد' }).click()
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/my-booking-moved.png` })
console.log(
  (await page.getByText(/نُقل موعدك/).count()) > 0
    ? '✓ booking rescheduled'
    : '✗ reschedule failed',
)

// Forget this device: now the phone has to be proven, and the wrong one is
// refused. (Same browser, because the demo's bookings live in its storage.)
await page.evaluate(() => localStorage.removeItem('bookingpro:guest:v1'))
await page.reload({ waitUntil: 'networkidle' })
await page.getByLabel(/رقم الجوال/).fill('0509999999')
await page.getByRole('button', { name: 'عرض الحجز' }).click()
await page.waitForTimeout(500)
const refused = (await page.getByText('بانتظار التأكيد').count()) === 0
await page.getByLabel(/رقم الجوال/).fill('0501112222')
await page.getByRole('button', { name: 'عرض الحجز' }).click()
await page.waitForTimeout(500)
const shown = (await page.getByText('بانتظار التأكيد').count()) > 0
console.log(refused && shown ? '✓ lookup needs the right phone' : '✗ phone check broken')

// --- a forgotten password, end to end ----------------------------------
await go('/login', 'login')
{
  await page.getByRole('link', { name: 'نسيت كلمة المرور؟' }).click()
  await page.waitForURL('**/forgot-password**')
  await page.getByRole('heading', { name: 'نسيت كلمة المرور؟' }).waitFor()
  await page.getByLabel('البريد الإلكتروني').fill('owner@example.com')
  await page.getByRole('button', { name: 'أرسل رابط الاستعادة' }).click()
  await page.getByRole('link', { name: 'افتح رابط الاستعادة' }).click()
  await page.waitForURL('**/reset-password**')
  await page.getByRole('heading', { name: 'كلمة مرور جديدة' }).waitFor()
  const resetUrl = page.url()
  await page.getByLabel('كلمة المرور الجديدة').fill('waeda2026')
  await page.getByLabel('أعد كتابتها').fill('waeda2026')
  await page.getByRole('button', { name: 'احفظ كلمة المرور' }).click()
  await page.waitForURL('**/login**')
  await page.getByRole('heading', { name: 'أهلاً بعودتك' }).waitFor()
  const filled = await page.getByLabel('البريد الإلكتروني').inputValue()
  // the same link a second time is dead
  await page.goto(resetUrl)
  await page.getByRole('heading', { name: 'كلمة مرور جديدة' }).waitFor()
  await page.getByLabel('كلمة المرور الجديدة').fill('waeda2026')
  await page.getByLabel('أعد كتابتها').fill('waeda2026')
  await page.getByRole('button', { name: 'احفظ كلمة المرور' }).click()
  await page.waitForTimeout(400)
  const dead = (await page.getByText('الرابط لم يعد صالحاً').count()) > 0
  console.log(
    filled === 'owner@example.com' && dead
      ? '✓ forgot password: link, new password, back to sign-in; the link works once'
      : `✗ forgot password (email="${filled}", dead link shown=${dead})`,
  )
}

// --- sign in ------------------------------------------------------------
await go('/login', 'login')
await page.getByRole('button', { name: /ادخل بالحساب التجريبي/ }).click()
// Wait for the route, not a fixed time: a slow machine made this flaky.
await page.waitForURL('**/app', { timeout: 15000 }).catch(() => {})
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/app-today.png` })
console.log(page.url().endsWith('/app') ? '✓ signed in → /app' : `✗ landed on ${page.url()}`)

// the guest booking must be visible to the operator — the two halves are joined
await page.goto(BASE + '/app/bookings', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.getByPlaceholder(/ابحث/).first().fill('اختبار تلقائي')
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/app-bookings-search.png` })
console.log(
  (await page.getByText('اختبار تلقائي').count()) > 0
    ? '✓ guest booking is visible in the operator list'
    : '✗ booking did not propagate',
)

// open the detail drawer
await page.getByText('اختبار تلقائي').first().click()
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/app-detail-drawer.png` })
console.log(
  (await page.getByRole('dialog').count()) > 0 ? '✓ detail drawer opens' : '✗ drawer failed',
)
console.log(
  (await page.getByRole('dialog').getByText('جديد من صفحة الحجز').count()) > 0
    ? '✓ the drawer marks a guest booking nobody had opened'
    : '✗ new-booking tag missing',
)

// confirm it, then check the status changed (scoped to the drawer)
const drawer = page.getByRole('dialog')
await drawer.getByRole('button', { name: 'تأكيد', exact: true }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/app-detail-confirmed.png` })
console.log(
  (await drawer.getByText('مؤكد', { exact: true }).count()) > 0
    ? '✓ confirm action works — status is now مؤكد'
    : '✗ confirm failed',
)
// reschedule it: the drawer used to keep its submit button disabled forever
await drawer.getByRole('button', { name: /إعادة جدولة/ }).click()
await page.waitForTimeout(600)
const form = page.getByRole('dialog').last()
await form
  .locator('[role="radio"]:not([disabled])')
  .filter({ hasText: /\d:\d\d/ })
  .last()
  .click()
await form.getByRole('button', { name: 'تأكيد الموعد الجديد' }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/app-rescheduled.png` })
console.log(
  (await page.getByText(/أُعيدت جدولة الحجز من/).count()) > 0
    ? '✓ reschedule works — the log records from and to'
    : '✗ reschedule failed',
)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// opening it was seeing it: the guest's page now says it reached the business
await go(`/booking/${ref.trim()}`, 'my-booking-received', 800)
console.log(
  /وصل حجزك/.test(
    (await page
      .locator('[data-receipt]')
      .innerText()
      .catch(() => '')) || '',
  )
    ? '✓ once opened, the guest sees the booking reached the business'
    : '✗ receipt did not turn to received',
)

// --- other operator screens --------------------------------------------
await go('/app', 'app-today-full', 1200)
await go('/app/calendar', 'app-calendar', 1000)
await go('/app/customers', 'app-customers', 900)
await go('/app/settings', 'app-settings', 800)

// the appointment guard: learned risk, explained, on its own screen
await go('/app/guard', 'app-guard', 1200)
console.log(
  (await page.getByText(/يحتاج متابعتك/).count()) > 0 &&
    (await page.getByText(/لماذا يغيب عملاؤك/).count()) > 0 &&
    (await page.getByRole('heading', { name: /حارس المواعيد/ }).count()) > 0
    ? '✓ guard scores this week and explains why'
    : '✗ guard screen missing risk badges',
)
await go('/app/settings?tab=guard', 'app-settings-guard', 800)

// create drawer via keyboard shortcut
await page.goto(BASE + '/app', { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await page.keyboard.press('n')
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/app-create-drawer.png` })
console.log(
  (await page.getByRole('dialog').count()) > 0
    ? '✓ "n" opens the create drawer'
    : '✗ shortcut failed',
)

// --- the console's own tools ------------------------------------------
await page.keyboard.press('Escape')
await page.goto(BASE + '/app', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
console.log(
  (await page.getByText(/waeda\.app\/b\//).count()) > 0
    ? '✓ the rail shows the business booking link'
    : '✗ booking link card missing',
)

// the bell opens in place, and a booking that needs a decision opens its drawer
{
  await page.locator('[data-bell]').click()
  await page.waitForTimeout(400)
  const panel = page.getByRole('dialog', { name: 'الإشعارات' })
  const inPlace = new URL(page.url()).pathname === '/app' && (await panel.count()) > 0
  const item = panel.locator('section').first().getByRole('button').filter({ hasNotText: /^ردّ/ })
  let opens = true
  if (await item.count()) {
    await item.first().click()
    await page.waitForTimeout(700)
    opens = !!new URL(page.url()).searchParams.get('booking')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
  console.log(
    inPlace && opens
      ? '✓ the bell opens a panel in place, and its items open where they are handled'
      : '✗ bell navigated away or its item went nowhere',
  )
}

// the guard opens on the tab the link names
await go('/app/guard?tab=conversations', 'app-guard-conversations', 900)
console.log(
  (await page.getByRole('tab', { name: /المحادثات/, selected: true }).count()) > 0
    ? '✓ guard opens on the conversations tab'
    : '✗ guard tab from the URL ignored',
)

// the inbox: a customer message the guard cannot read reaches the team, and
// answering it closes the hand-off
{
  const needs = async () =>
    Number((await page.getByRole('tab', { name: /تحتاجك/ }).innerText()).replace(/\D/g, '') || 0)
  await page.getByRole('tab', { name: /الكل/ }).click()
  await page.waitForTimeout(300)
  await page.getByRole('radio', { name: /كأنك العميل/ }).click()
  await page.getByRole('textbox', { name: /رد العميل التجريبي/ }).fill('ممكن أجي مع أختي؟')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(900)
  const waiting = await needs()
  await page.getByRole('tab', { name: /تحتاجك/ }).click()
  await page.waitForTimeout(300)
  await page.getByRole('radio', { name: /رد الفريق/ }).click()
  await page.getByRole('button', { name: 'التأخير مقبول' }).click()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/app-guard-inbox.png` })
  console.log(
    waiting > 0 && (await needs()) === waiting - 1
      ? '✓ inbox: hand-off reaches the team, and a reply closes it'
      : '✗ inbox hand-off / reply',
  )
}

// calendar: a click on empty time starts a booking with that person at that time
await go('/app/calendar?view=day', 'app-calendar-day', 900)
{
  const cols = page.locator('.cursor-copy')
  let opened = false
  for (let c = 0; c < (await cols.count()) && !opened; c++) {
    const box = await cols.nth(c).boundingBox()
    for (let y = box.y + 20; y < Math.min(box.y + box.height, 880) && !opened; y += 40) {
      const x = box.x + box.width / 2
      const free = await page.evaluate(
        ([px, py]) => !document.elementFromPoint(px, py)?.closest('[data-block]'),
        [x, y],
      )
      if (!free) continue
      await page.mouse.click(x, y)
      await page.waitForTimeout(600)
      opened = (await page.getByRole('dialog').count()) > 0
    }
  }
  await page.screenshot({ path: `${OUT}/app-calendar-click-create.png` })
  console.log(opened ? '✓ empty slot opens a prefilled booking' : '✗ click-to-create failed')
  await page.keyboard.press('Escape')
  // The drawer's backdrop fades out; a drag that starts on it moves nothing.
  await page
    .getByRole('dialog')
    .waitFor({ state: 'detached', timeout: 4000 })
    .catch(() => {})
  await page.waitForTimeout(300)
}

// calendar: dragging a booking moves it (or is refused on a clash, with a reason)
{
  const blk = page.locator('[data-block].cursor-grab').first()
  if (await blk.count()) {
    const box = await blk.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + 8)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + 60, { steps: 6 })
    await page.mouse.move(box.x + box.width / 2, box.y + 90, { steps: 6 })
    await page.mouse.up()
    // Wait for the drag's own answer, not whichever toast happens to be last.
    const said = await page
      .locator('[data-sonner-toast]')
      .filter({ hasText: /نُقل|محجوز|لا يقدّم/ })
      .last()
      .innerText({ timeout: 4000 })
      .catch(() => '')
    await page.screenshot({ path: `${OUT}/app-calendar-drag.png` })
    console.log(
      /نُقل|محجوز|لا يقدّم/.test(said)
        ? `✓ drag moves a booking — «${said.split('\n')[0]}»`
        : '✗ drag did nothing',
    )
  } else console.log('· no movable booking on the calendar today, drag not exercised')
}

// settings → booking page: the business name an owner saves is what guests see
await go('/app/settings?tab=business', 'app-settings-business', 700)
{
  const name = page.getByRole('textbox', { name: /^اسم المنشأة/ })
  const before = await name.inputValue()
  await name.fill('مركز الريحان للتجربة')
  await page.getByRole('button', { name: 'حفظ', exact: true }).click()
  await page.waitForTimeout(500)
  await page.goto(BASE + '/book', { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const shown = (await page.getByText('مركز الريحان للتجربة').count()) > 0
  console.log(
    shown
      ? '✓ business name saved in settings shows on the booking page'
      : '✗ business name did not reach the booking page',
  )
  // put it back
  await page.goto(BASE + '/app/settings?tab=business', { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.getByRole('textbox', { name: /^اسم المنشأة/ }).fill(before)
  await page.getByRole('button', { name: 'حفظ', exact: true }).click()
  await page.waitForTimeout(400)
}

// --- local hours: a late night, and Ramadan ------------------------------
await go('/app/settings?tab=hours', 'app-settings-hours', 700)
{
  // Thursday runs 16:00 to 02:00: the booking page offers times after midnight.
  await page.getByLabel('فتح الخميس').first().fill('16:00')
  await page.getByLabel('إغلاق الخميس').first().fill('02:00')
  const noted = (await page.locator('[data-overnight]').count()) > 0
  await page.getByRole('button', { name: 'حفظ ساعات العمل' }).click()
  await page.waitForTimeout(500)
  await go('/book', 'guest-book-late', 800)
  await page.getByRole('radio', { name: /استشارة جلدية/ }).click()
  await page.waitForTimeout(300)
  await page.locator(`#day-${(4 - new Date().getDay() + 7) % 7}`).click()
  await page.waitForTimeout(500)
  const late = await page.getByRole('radiogroup', { name: 'أوقات بعد منتصف الليل' }).count()
  console.log(
    noted && late > 0
      ? '✓ a day can close after midnight, and the booking page offers those times'
      : `✗ late night (note shown=${noted}, late group=${late})`,
  )

  // Ramadan: one click proposes the coming one, with its dates.
  await go('/app/settings?tab=hours', 'app-settings-periods', 700)
  await page.getByRole('button', { name: 'رمضان' }).click()
  await page.waitForTimeout(400)
  const label = await page.getByLabel('الاسم').inputValue()
  await page.getByRole('button', { name: 'حفظ الفترة' }).click()
  await page.waitForTimeout(500)
  console.log(
    /^رمضان \d{4}$/.test(label) && (await page.getByText(label).count()) > 0
      ? `✓ Ramadan is one click, dated from Umm al-Qura — «${label}»`
      : `✗ Ramadan period (${label})`,
  )
}

// --- prayer pauses: on, the booking page stops offering those times ------
{
  const times = async () => {
    await go('/book', 'guest-book-prayer', 700)
    await page.getByRole('radio', { name: /استشارة جلدية/ }).click()
    await page.waitForTimeout(300)
    // The coming Sunday: open 09:00–18:00, so dhuhr and asr fall inside.
    await page
      .locator(`#day-${(7 - new Date().getDay()) % 7 || 7}`)
      .click()
      .catch(() => {})
    await page.waitForTimeout(400)
    return page.locator('[role="radiogroup"][aria-label^="أوقات"] [role="radio"]').allInnerTexts()
  }
  const before = await times()
  await go('/app/settings?tab=hours', 'app-settings-prayer', 700)
  await page.getByRole('switch', { name: 'حجب أوقات الصلاة' }).check()
  await page.getByRole('button', { name: 'حفظ أوقات الصلاة' }).click()
  await page.waitForTimeout(400)
  const after = await times()
  const removed = before.filter((t) => !after.includes(t))
  const added = after.filter((t) => !before.includes(t))
  console.log(
    removed.length > 0 && added.length === 0
      ? `✓ prayer pauses hide ${removed.length} times from the booking page`
      : `✗ prayer pauses (removed ${removed.length}, added ${added.length})`,
  )
}

// --- choosing a female or male specialist ----------------------------------
await go('/book', 'guest-book-gender', 700)
{
  await page.getByRole('radio', { name: /استشارة جلدية/ }).click()
  await page.waitForTimeout(300)
  const chips = page.locator('[data-gender]')
  await chips.getByRole('radio', { name: 'مختصات' }).click()
  await page.waitForTimeout(300)
  const names = await page.getByRole('radiogroup', { name: 'اختر المختص' }).count()
  const summary = await page.locator('main').innerText()
  console.log(
    (await chips.count()) > 0 &&
      names === 0 &&
      !/خالد المطيري/.test(summary.split('مع من')[1] ?? '')
      ? '✓ the booking page can narrow to female specialists'
      : '✗ gender filter',
  )
}

// --- responsive ---------------------------------------------------------
for (const [w, h, tag] of [
  [390, 844, 'mobile'],
  [768, 1024, 'tablet'],
  [1280, 800, 'laptop'],
]) {
  await page.setViewportSize({ width: w, height: h })
  await page.goto(BASE + '/app', { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/responsive-today-${tag}.png` })
  await page.goto(BASE + '/app/bookings', { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/responsive-bookings-${tag}.png` })
  console.log('✓ responsive', tag, `${w}×${h}`)
}

console.log(
  '\n' + (errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : '✓ zero console errors'),
)
await browser.close()
