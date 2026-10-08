/**
 * Cities a business can take its prayer times from, with the calculation
 * each country uses. Mirrored by api/config/cities.php, key for key — the
 * server checks bookings against the same city and method.
 *
 * `method` names an adhan CalculationMethod; the PHP side maps it to the
 * matching islamic-network method.
 */
export const CITIES = [
  {
    key: 'riyadh',
    name: 'الرياض',
    country: 'السعودية',
    lat: 24.7136,
    lng: 46.6753,
    method: 'UmmAlQura',
  },
  {
    key: 'jeddah',
    name: 'جدة',
    country: 'السعودية',
    lat: 21.4858,
    lng: 39.1925,
    method: 'UmmAlQura',
  },
  {
    key: 'makkah',
    name: 'مكة المكرمة',
    country: 'السعودية',
    lat: 21.3891,
    lng: 39.8579,
    method: 'UmmAlQura',
  },
  {
    key: 'madinah',
    name: 'المدينة المنورة',
    country: 'السعودية',
    lat: 24.5247,
    lng: 39.5692,
    method: 'UmmAlQura',
  },
  {
    key: 'dammam',
    name: 'الدمام والخبر',
    country: 'السعودية',
    lat: 26.4207,
    lng: 50.0888,
    method: 'UmmAlQura',
  },
  {
    key: 'taif',
    name: 'الطائف',
    country: 'السعودية',
    lat: 21.2703,
    lng: 40.4158,
    method: 'UmmAlQura',
  },
  {
    key: 'abha',
    name: 'أبها',
    country: 'السعودية',
    lat: 18.2164,
    lng: 42.5053,
    method: 'UmmAlQura',
  },
  {
    key: 'tabuk',
    name: 'تبوك',
    country: 'السعودية',
    lat: 28.3835,
    lng: 36.5662,
    method: 'UmmAlQura',
  },
  {
    key: 'buraydah',
    name: 'بريدة',
    country: 'السعودية',
    lat: 26.3592,
    lng: 43.9818,
    method: 'UmmAlQura',
  },
  {
    key: 'hail',
    name: 'حائل',
    country: 'السعودية',
    lat: 27.5114,
    lng: 41.7208,
    method: 'UmmAlQura',
  },
  {
    key: 'jazan',
    name: 'جازان',
    country: 'السعودية',
    lat: 16.8892,
    lng: 42.5511,
    method: 'UmmAlQura',
  },
  {
    key: 'najran',
    name: 'نجران',
    country: 'السعودية',
    lat: 17.5656,
    lng: 44.2289,
    method: 'UmmAlQura',
  },
  { key: 'dubai', name: 'دبي', country: 'الإمارات', lat: 25.2048, lng: 55.2708, method: 'Dubai' },
  {
    key: 'abudhabi',
    name: 'أبوظبي',
    country: 'الإمارات',
    lat: 24.4539,
    lng: 54.3773,
    method: 'Dubai',
  },
  {
    key: 'sharjah',
    name: 'الشارقة',
    country: 'الإمارات',
    lat: 25.3463,
    lng: 55.4209,
    method: 'Dubai',
  },
  {
    key: 'kuwait',
    name: 'الكويت',
    country: 'الكويت',
    lat: 29.3759,
    lng: 47.9774,
    method: 'Kuwait',
  },
  { key: 'doha', name: 'الدوحة', country: 'قطر', lat: 25.2854, lng: 51.531, method: 'Qatar' },
  { key: 'cairo', name: 'القاهرة', country: 'مصر', lat: 30.0444, lng: 31.2357, method: 'Egyptian' },
  {
    key: 'alexandria',
    name: 'الإسكندرية',
    country: 'مصر',
    lat: 31.2001,
    lng: 29.9187,
    method: 'Egyptian',
  },
  {
    key: 'amman',
    name: 'عمّان',
    country: 'الأردن',
    lat: 31.9454,
    lng: 35.9284,
    method: 'MuslimWorldLeague',
  },
]

export const cityByKey = (key) => CITIES.find((c) => c.key === key) ?? null

/** The prayers a business can pause for, in the day's order. */
export const PRAYERS = [
  { key: 'fajr', label: 'الفجر' },
  { key: 'dhuhr', label: 'الظهر' },
  { key: 'asr', label: 'العصر' },
  { key: 'maghrib', label: 'المغرب' },
  { key: 'isha', label: 'العشاء' },
]

/** Off until the owner turns it on; the four daytime prayers when they do. */
export const DEFAULT_PRAYER = {
  enabled: false,
  city: 'riyadh',
  prayers: ['dhuhr', 'asr', 'maghrib', 'isha'],
  minutes: 20,
  jumuahMinutes: 45,
}
