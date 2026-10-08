/**
 * Where a new business starts: the services places like it usually sell,
 * what their staff are called, and the hours they usually keep.
 *
 * Starting points, not settings. Every line is shown to the owner during
 * sign-up to keep, change or drop, and all of it can be edited later. The
 * sector keys match the ones on the landing page.
 */

/**
 * @typedef {{ name: string, category: string, durationMin: number, price: number, iconKey: string,
 *   durationOptions?: number[], peakFrom?: string, peakPrice?: number,
 *   capacity?: number, sessions?: { weekday: number, time: string }[] }} TemplateService
 */

export const SECTORS = [
  {
    key: 'clinic',
    category: 'عيادة',
    label: 'عيادة أو مركز طبي',
    icon: 'Stethoscope',
    staffRole: 'طبيب',
    staffPlaceholder: 'د. سارة العتيبي',
    services: [
      { name: 'كشف عام', category: 'الكشف', durationMin: 20, price: 150, iconKey: 'Stethoscope' },
      {
        name: 'استشارة متخصصة',
        category: 'الكشف',
        durationMin: 30,
        price: 250,
        iconKey: 'Stethoscope',
      },
      { name: 'مراجعة', category: 'المتابعة', durationMin: 15, price: 80, iconKey: 'HeartPulse' },
    ],
  },
  {
    key: 'salon',
    category: 'صالون تجميل',
    label: 'صالون أو مركز تجميل',
    icon: 'Scissors',
    staffRole: 'أخصائية',
    staffPlaceholder: 'أ. ريم',
    services: [
      { name: 'قص وتصفيف', category: 'الشعر', durationMin: 45, price: 120, iconKey: 'Scissors' },
      { name: 'صبغة كاملة', category: 'الشعر', durationMin: 90, price: 350, iconKey: 'Scissors' },
      { name: 'تنظيف بشرة', category: 'البشرة', durationMin: 60, price: 220, iconKey: 'Sparkles' },
    ],
  },
  {
    key: 'training',
    category: 'مركز تدريب',
    label: 'مركز تدريب أو تعليم',
    icon: 'GraduationCap',
    staffRole: 'مدرّب',
    staffPlaceholder: 'أ. فهد',
    services: [
      { name: 'حصة خصوصية', category: 'الحصص', durationMin: 60, price: 120, iconKey: 'Sparkles' },
      {
        // A class: twelve seats, Sunday and Tuesday evenings.
        name: 'ورشة جماعية',
        category: 'الورش',
        durationMin: 120,
        price: 300,
        iconKey: 'Sparkles',
        capacity: 12,
        sessions: [
          { weekday: 0, time: '18:00' },
          { weekday: 2, time: '18:00' },
        ],
      },
      { name: 'تحديد مستوى', category: 'الحصص', durationMin: 30, price: 0, iconKey: 'Sparkles' },
    ],
  },
  {
    key: 'services',
    category: 'خدمات واستشارات',
    label: 'شركة أو مقدّم خدمات',
    icon: 'Briefcase',
    staffRole: 'مستشار',
    staffPlaceholder: 'م. عبدالله',
    services: [
      {
        name: 'استشارة أولية',
        category: 'الاستشارات',
        durationMin: 30,
        price: 0,
        iconKey: 'Sparkles',
      },
      {
        name: 'جلسة استشارية',
        category: 'الاستشارات',
        durationMin: 60,
        price: 400,
        iconKey: 'Sparkles',
      },
      {
        name: 'زيارة ميدانية',
        category: 'الزيارات',
        durationMin: 120,
        price: 750,
        iconKey: 'Wrench',
      },
    ],
  },
  {
    key: 'restaurant',
    category: 'مطعم ومقهى',
    label: 'مطعم أو مقهى',
    icon: 'UtensilsCrossed',
    staffRole: 'القسم',
    staffPlaceholder: 'الصالة الرئيسية',
    services: [
      { name: 'طاولة لشخصين', category: 'الطاولات', durationMin: 90, price: 0, iconKey: 'Coffee' },
      {
        name: 'طاولة عائلية',
        category: 'الطاولات',
        durationMin: 120,
        price: 50,
        iconKey: 'Coffee',
      },
      { name: 'جلسة خاصة', category: 'الجلسات', durationMin: 120, price: 150, iconKey: 'Coffee' },
    ],
  },
  {
    // A place is booked, not a person: courts, by the hour, dearer in the evening.
    key: 'sports',
    category: 'ملاعب ونادي رياضي',
    label: 'ملاعب أو نادي رياضي',
    icon: 'Trophy',
    staffRole: 'ملعب',
    staffPlaceholder: 'ملعب 1',
    resourceKind: 'place',
    staffTitle: 'ملاعبك',
    staffHint: 'كل ملعب له جدول مستقل، والعميل يحجز أول ملعب متاح أو يختار.',
    hoursKey: 'late',
    services: [
      {
        name: 'حجز ملعب بادل',
        category: 'البادل',
        durationMin: 60,
        durationOptions: [60, 90, 120],
        price: 150,
        peakFrom: '17:00',
        peakPrice: 200,
        iconKey: 'Trophy',
      },
      {
        name: 'ملعب كرة خماسي',
        category: 'كرة القدم',
        durationMin: 60,
        durationOptions: [60, 90],
        price: 250,
        peakFrom: '18:00',
        peakPrice: 300,
        iconKey: 'Trophy',
      },
    ],
  },
  {
    key: 'any',
    category: 'حجز مواعيد',
    label: 'نشاط آخر',
    icon: 'CalendarDays',
    staffRole: 'موظف',
    staffPlaceholder: 'اسم الموظف',
    services: [
      { name: 'موعد قصير', category: 'المواعيد', durationMin: 30, price: 100, iconKey: 'Sparkles' },
      { name: 'موعد عادي', category: 'المواعيد', durationMin: 60, price: 180, iconKey: 'Sparkles' },
    ],
  },
]

export const sectorByKey = (key) =>
  SECTORS.find((s) => s.key === key) ?? SECTORS[SECTORS.length - 1]

/** 0 = Sunday … 6 = Saturday. */
const week = (open, close, closed = []) =>
  Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    open,
    close,
    isClosed: closed.includes(weekday),
  }))

export const HOURS_PRESETS = [
  {
    key: 'sat-thu',
    label: 'السبت إلى الخميس',
    detail: '9 ص إلى 9 م، والجمعة إجازة',
    hours: week('09:00', '21:00', [5]),
  },
  {
    key: 'daily',
    label: 'كل أيام الأسبوع',
    detail: '10 ص إلى 10 م',
    hours: week('10:00', '22:00'),
  },
  {
    // Courts, cafés in Ramadan: the evening runs into the small hours.
    key: 'late',
    label: 'مسائي حتى الفجر',
    detail: '4 م إلى 2 فجراً، كل الأيام',
    hours: week('16:00', '02:00'),
  },
  {
    key: 'office',
    label: 'الأحد إلى الخميس',
    detail: '8 ص إلى 4 م، دوام مكتبي',
    hours: week('08:00', '16:00', [5, 6]),
  },
]

export const DURATIONS = [15, 20, 30, 45, 60, 90, 120]
