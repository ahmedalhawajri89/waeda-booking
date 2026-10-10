/**
 * Digits as people actually type them.
 *
 * An Arabic keyboard types ٠٥٥١٢٣٤٥٦٧, a Persian one ۰۵۵…, and JavaScript's
 * \d knows neither: `phone.replace(/\D/g, '')` turned a perfectly typed
 * number into "", and the booking page said the phone was missing. Every
 * phone or code goes through here first.
 */

/** ٠–٩ and ۰–۹ to 0–9; everything else untouched. */
export const toLatinDigits = (s) =>
  String(s ?? '').replace(/[٠-٩۰-۹]/g, (d) => String(((d.charCodeAt(0) - 0x0660) % 0x90) % 10))

/** Only the digits, in Latin: "٠٥٠ ١٢٣" → "050123". */
export const digitsOnly = (s) => toLatinDigits(s).replace(/\D/g, '')
