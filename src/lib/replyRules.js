import { addDays, format, startOfDay } from 'date-fns'

/**
 * Reading a customer's reply with rules — the guard's understanding when no
 * language model is configured, and its fallback when one is.
 *
 * Mirrored word for word by RuleUnderstanding.php: the demo and the server
 * must read the same message the same way. Each list below is ordinary Gulf,
 * Levantine and Egyptian usage for the handful of things a reply to "confirm
 * your appointment" actually says.
 *
 * @typedef {object} Understanding
 * @property {'confirm' | 'cancel' | 'late' | 'reschedule' | 'choose' | 'unknown'} intent
 * @property {number} [option]  'choose': which offered time, 1-based.
 * @property {string} [day]     'reschedule': 'YYYY-MM-DD', when one was named.
 * @property {[number, number]} [window] 'reschedule': minutes from midnight.
 * @property {number} [time]    'reschedule': an exact time, minutes from midnight.
 */

// `\b` is ASCII-only in JavaScript — it never matches after an Arabic letter —
// so the end of a word is spelled out: end of text, whitespace or punctuation.
const END = String.raw`(?=$|[\s.!،؟?,])`
const CONFIRM = new RegExp(
  String.raw`^(1|نعم|اي|ايوه|إيوه|ايوا|أكيد|اكيد|تمام|مؤكد|أؤكد|اؤكد|جاي|جاية|راح اجي|بجي|ok|okay|yes)${END}|^(👍|✅)`,
  'iu',
)
const CANCEL = new RegExp(
  String.raw`^(2|لا|ألغ\S*|الغ\S*|إلغاء|الغاء|ما راح|مارح|ما بقدر|ما اقدر|ما أقدر|مش جاي|مب جاي|cancel|no)${END}`,
  'iu',
)
const LATE = /(بتأخر|بتاخر|متأخر|متاخر|راح اتأخر|تأخير|late)/iu
const CHANGE =
  /(أغير|اغير|أغيّر|غير الموعد|غيّر|تغيير|أأجل|اأجل|أجل|أجّل|تأجيل|خليها|خلّيها|خليه|خلّيه|انقل|نقل|أبدل|ابدل|بدّل|بدل|موعد ثاني|وقت ثاني|موعد تاني|وقت تاني|وقت آخر|موعد آخر|موعد اخر|وقت اخر)/u

/** Relative days, longest phrase first so "بعد بكرة" is not read as "بكرة". */
const RELATIVE = [
  [/بعد\s*(بكرة|بكره|بكرا|غد)/u, 2],
  [/(بكرة|بكره|بكرا|غدا|غداً|الغد|بكرى)/u, 1],
  [/(اليوم|هاليوم)/u, 0],
]
const WEEKDAYS = [
  [/(الأحد|الاحد|احد)/u, 0],
  [/(الإثنين|الاثنين|اثنين|الإتنين|الاتنين)/u, 1],
  [/(الثلاثاء|الثلاثا|ثلاثاء|التلات|الثلاث)/u, 2],
  [/(الأربعاء|الاربعاء|اربعاء|الأربعا|الاربع)/u, 3],
  [/(الخميس|خميس)/u, 4],
  [/(الجمعة|الجمعه|جمعة)/u, 5],
  [/(السبت|سبت)/u, 6],
]
const H = 60
const PARTS = [
  [/(الصبح|الصباح|صباحا|صباحاً|بدري)/u, [9 * H, 12 * H]],
  [/(الظهر|الضهر|ظهرا|ظهراً)/u, [12 * H, 15 * H]],
  [/(العصر|عصرا|عصراً)/u, [15 * H, 18 * H]],
  [/(المغرب|المسا|المساء|مساء|مساءً|بالليل|الليل)/u, [17 * H, 21 * H]],
]
const AM = /^(ص|صباح|صباحا|الصبح)$/u
const PM = /^(م|مساء|مساءً|العصر|المسا|المغرب|الظهر|بالليل)$/u
const HOUR = new RegExp(
  String.raw`(الساعة|الساعه|ساعة)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(ص|صباحا|صباح|الصبح|م|مساءً|مساء|العصر|المسا|المغرب|الظهر|بالليل)?${END}`,
  'u',
)

/** Arabic-Indic and Persian digits to ASCII, so "٢" and "2" read the same. */
function asciiDigits(text) {
  return text.replace(/[٠-٩۰-۹]/g, (d) => String(((d.charCodeAt(0) - 0x0660) % 0x90) % 10))
}

/**
 * @param {string} text
 * @param {{ now?: Date, offered?: number }} [ctx] `offered`: how many times an
 *   open offer listed — while one is open, a bare number picks from it.
 * @returns {Understanding}
 */
export function understandReply(text, ctx = {}) {
  const now = ctx.now ?? new Date()
  const t = asciiDigits(text.trim()).replace(/[.!،؟?]+$/u, '')

  if (ctx.offered) {
    const n = /^(\d)$/.exec(t)
    if (n && Number(n[1]) >= 1 && Number(n[1]) <= ctx.offered) {
      return { intent: 'choose', option: Number(n[1]) }
    }
  }

  const when = readWhen(t, now)
  if (CHANGE.test(t)) return { intent: 'reschedule', ...when }
  if (CANCEL.test(t)) return { intent: 'cancel' }
  if (CONFIRM.test(t)) return { intent: 'confirm' }
  if (LATE.test(t)) return { intent: 'late' }
  // A day or a time of day on its own — "الخميس العصر" — is a request to move.
  if (when.day || when.window || when.time !== undefined) return { intent: 'reschedule', ...when }
  return { intent: 'unknown' }
}

/** Kept for callers that only need the intent. */
export const interpretReply = (text, ctx) => understandReply(text, ctx).intent

/** Day, part of day and hour named in the text, if any. */
function readWhen(t, now) {
  /** @type {Omit<Understanding, 'intent'>} */
  const out = {}

  let offset = null
  for (const [re, days] of RELATIVE) {
    if (re.test(t)) {
      offset = days
      break
    }
  }
  if (offset === null) {
    for (const [re, weekday] of WEEKDAYS) {
      if (re.test(t)) {
        // The next one to come — today's own weekday means next week.
        offset = (weekday - now.getDay() + 7) % 7 || 7
        break
      }
    }
  }
  if (offset !== null) out.day = format(addDays(startOfDay(now), offset), 'yyyy-MM-dd')

  for (const [re, window] of PARTS) {
    if (re.test(t)) {
      out.window = window
      break
    }
  }

  // A number counts as a time only with something that says it is one —
  // "الساعة", a part of day, or a day — never a bare "2", which means cancel.
  const m = HOUR.exec(t)
  if (m && (m[1] || m[4] || out.day || out.window)) {
    let hour = Number(m[2])
    const minute = Number(m[3] ?? 0)
    const suffix = m[4] ?? ''
    if (hour <= 23 && minute < 60) {
      if (AM.test(suffix)) {
        if (hour === 12) hour = 0
      } else if (PM.test(suffix) || (out.window && out.window[0] >= 12 * H)) {
        if (hour < 12) hour += 12
      } else if (hour >= 1 && hour <= 7) {
        // Bare 1–7 is afternoon: nobody books a haircut at 3 in the morning.
        hour += 12
      }
      out.time = hour * H + minute
    }
  }
  return out
}
