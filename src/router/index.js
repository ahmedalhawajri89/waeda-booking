import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { setPublicOrg } from '@/data/api/client'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    /* ---------------------------------------------------------- guest */
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
      meta: { title: 'نظام الحجوزات الاحترافي' },
    },
    {
      path: '/book',
      name: 'book',
      component: () => import('@/views/BookingView.vue'),
      meta: { title: 'احجز موعدك' },
    },
    { path: '/booking', redirect: '/book' },
    // A business's own booking link, and the manage page under it.
    {
      path: '/b/:slug',
      name: 'business-book',
      component: () => import('@/views/BookingView.vue'),
      meta: { title: 'احجز موعدك' },
    },
    {
      path: '/b/:slug/booking/:reference',
      name: 'business-my-booking',
      component: () => import('@/views/MyBookingView.vue'),
      meta: { title: 'حجزي' },
    },
    {
      path: '/booking/:reference',
      name: 'my-booking',
      component: () => import('@/views/MyBookingView.vue'),
      meta: { title: 'حجزي' },
    },

    /* ----------------------------------------------------------- auth */
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { title: 'تسجيل الدخول', guestOnly: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { title: 'إنشاء حساب', guestOnly: true },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('@/views/ForgotPasswordView.vue'),
      meta: { title: 'استعادة كلمة المرور', guestOnly: true },
    },
    {
      // Not guest-only: the emailed link has to work even in a browser that
      // is still signed in.
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('@/views/ResetPasswordView.vue'),
      meta: { title: 'كلمة مرور جديدة' },
    },

    /* ------------------------------------------------------- operator */
    {
      path: '/app',
      component: () => import('@/layouts/OperatorLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'today',
          component: () => import('@/views/app/TodayView.vue'),
          meta: { title: 'اليوم' },
        },
        {
          path: 'calendar',
          name: 'calendar',
          component: () => import('@/views/app/CalendarView.vue'),
          meta: { title: 'التقويم' },
        },
        {
          path: 'guard',
          name: 'guard',
          component: () => import('@/views/app/GuardView.vue'),
          meta: { title: 'حارس المواعيد' },
        },
        {
          path: 'analytics',
          name: 'analytics',
          component: () => import('@/views/app/AnalyticsView.vue'),
          meta: { title: 'التحليلات' },
        },
        {
          path: 'bookings',
          name: 'bookings',
          component: () => import('@/views/app/BookingsView.vue'),
          meta: { title: 'الحجوزات' },
        },
        {
          path: 'customers',
          name: 'customers',
          component: () => import('@/views/app/CustomersView.vue'),
          meta: { title: 'العملاء' },
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/app/SettingsView.vue'),
          meta: { title: 'الإعدادات' },
        },
      ],
    },
    /* legacy link from the previous build — it meant "the numbers screen",
       which now exists, so send it there rather than to Today */
    { path: '/dashboard', redirect: '/app/analytics' },

    /* A wrong URL is told it is wrong — never silently redirected. */
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { title: 'الصفحة غير موجودة' },
    },
  ],
  scrollBehavior(to, from, savedPosition) {
    // Opening or closing a drawer only changes the query — don't jump.
    if (to.path === from.path) return
    return savedPosition ?? { top: 0 }
  },
})

/**
 * Async because the session may not exist yet.
 *
 * Restoring a session means asking the server whether the stored token is
 * still good. A synchronous `isAuthenticated` check therefore runs *before*
 * the answer is known, and a hard load of /app bounces a signed-in operator
 * straight to the login screen — the single most common way this migration
 * goes wrong. Awaiting init() costs nothing on the demo backend, where it
 * resolves immediately.
 */
router.beforeEach(async (to) => {
  // Guest pages speak for the business in their link; every other page,
  // the console included, must not carry it.
  setPublicOrg(to.params.slug ? String(to.params.slug) : null)

  const auth = useAuthStore()
  await auth.init()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  // Signed in is not the same as allowed in. A customer account reached the
  // whole operator console before this — the API refused its writes, but the
  // screens rendered. The console is for operators; customers go to booking.
  if (to.meta.requiresAuth && !auth.isOperator) {
    return { path: '/book' }
  }
  if (to.meta.guestOnly && auth.isAuthenticated) {
    return auth.isOperator ? { name: 'today' } : { path: '/book' }
  }
  return true
})

router.afterEach((to) => {
  const title = to.meta.title
  document.title = title ? `${title} · وعدة` : 'وعدة'
})

export default router
