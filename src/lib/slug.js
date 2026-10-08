/**
 * A link-safe slug from a business name, Arabic included.
 *
 * "صالون لمسة" → "salon-lmsa". Arabic is written without short vowels, so the
 * result is a reasonable starting point rather than a spelling; the owner sees
 * it and can change it before it is taken.
 */
const AR = {
  ا: 'a',
  أ: 'a',
  إ: 'i',
  آ: 'a',
  ب: 'b',
  ت: 't',
  ث: 'th',
  ج: 'j',
  ح: 'h',
  خ: 'kh',
  د: 'd',
  ذ: 'th',
  ر: 'r',
  ز: 'z',
  س: 's',
  ش: 'sh',
  ص: 's',
  ض: 'd',
  ط: 't',
  ظ: 'z',
  ع: 'a',
  غ: 'gh',
  ف: 'f',
  ق: 'q',
  ك: 'k',
  ل: 'l',
  م: 'm',
  ن: 'n',
  ه: 'h',
  ة: 'a',
  و: 'w',
  ي: 'y',
  ى: 'a',
  ئ: 'e',
  ؤ: 'o',
  ء: '',
}

/** Common words a reader would expect spelled the usual way. */
const WORDS = {
  صالون: 'salon',
  مركز: 'center',
  عيادة: 'clinic',
  عيادات: 'clinics',
  مطعم: 'restaurant',
  نادي: 'club',
  ملاعب: 'courts',
  بادل: 'padel',
  مقهى: 'cafe',
  أكاديمية: 'academy',
  مكتب: 'office',
  استوديو: 'studio',
}

export function slugify(name) {
  return String(name ?? '')
    .trim()
    .split(/\s+/)
    .map((w) => {
      const bare = w.replace(/^ال/, '')
      if (WORDS[w]) return WORDS[w]
      return [...bare].map((c) => AR[c] ?? c).join('')
    })
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/
