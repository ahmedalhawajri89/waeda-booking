<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, Menu, X } from 'lucide-vue-next'
import AppLogo from '@/components/ui/AppLogo.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * Marketing chrome: a light bar that sits on the sand and only draws a hairline
 * once the page has moved under it. The links live in one pill so they read as
 * a single control, and the section you are reading is the one highlighted.
 * Below `md` they move into a disclosure menu rather than disappearing.
 */
const LINKS = [
  { id: 'sectors', label: 'القطاعات' },
  { id: 'how-it-works', label: 'كيف يعمل' },
  { id: 'calculator', label: 'حاسبة الغياب' },
  { id: 'pricing', label: 'الأسعار' },
  { id: 'faq', label: 'الأسئلة' },
]

const open = ref(false)
const scrolled = ref(false)
const current = ref('')
const route = useRoute()
const auth = useAuthStore()

watch(
  () => route.fullPath,
  () => (open.value = false),
)

/** The phone menu closes on Escape and on a tap outside the bar, like any menu. */
const nav = ref(null)
function onKeydown(e) {
  if (e.key === 'Escape' && open.value) open.value = false
}
function onPointer(e) {
  if (open.value && nav.value && !nav.value.contains(e.target)) open.value = false
}

function onScroll() {
  scrolled.value = window.scrollY > 8
}

let observer
onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('pointerdown', onPointer)

  // A section counts as "current" while it crosses the band just under the bar.
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) current.value = e.target.id
        else if (current.value === e.target.id) current.value = ''
      }
    },
    { rootMargin: '-72px 0px -60% 0px' },
  )
  for (const l of LINKS) {
    const el = document.getElementById(l.id)
    if (el) observer.observe(el)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('pointerdown', onPointer)
  observer?.disconnect()
})
</script>

<template>
  <nav
    ref="nav"
    class="bg-surface/90 sticky top-0 z-50 w-full border-b backdrop-blur-xl transition-[border-color,box-shadow] duration-200"
    :class="scrolled || open ? 'border-border elev-raised' : 'border-transparent'"
    aria-label="الرئيسية"
  >
    <div
      class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
    >
      <AppLogo compact />

      <div
        class="border-border bg-surface hidden items-center gap-0.5 rounded-full border p-1 md:flex"
      >
        <a
          v-for="l in LINKS"
          :key="l.id"
          :href="`#${l.id}`"
          class="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
          :class="
            current === l.id
              ? 'bg-surface-sunken text-fg'
              : 'text-fg-muted hover:text-fg hover:bg-surface-hover'
          "
          :aria-current="current === l.id ? 'true' : undefined"
        >
          {{ l.label }}
        </a>
      </div>

      <div class="flex items-center gap-1 sm:gap-3">
        <RouterLink
          :to="auth.isAuthenticated ? '/app' : '/login'"
          class="text-fg-muted hover:text-fg hidden px-2 py-2 text-sm font-medium transition-colors sm:block"
        >
          {{ auth.isAuthenticated ? 'لوحة التحكم' : 'تسجيل الدخول' }}
        </RouterLink>
        <RouterLink
          to="/register"
          class="btn-brand group inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold"
        >
          ابدأ مجاناً
          <ArrowLeft
            class="h-4 w-4 transition-transform group-hover:-translate-x-0.5 ltr:rotate-180"
            aria-hidden="true"
          />
        </RouterLink>

        <button
          type="button"
          class="text-fg-muted hover:bg-surface-sunken flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] md:hidden"
          :aria-expanded="open"
          aria-controls="mobile-menu"
          :aria-label="open ? 'إغلاق القائمة' : 'فتح القائمة'"
          @click="open = !open"
        >
          <X v-if="open" class="h-5 w-5" />
          <Menu v-else class="h-5 w-5" />
        </button>
      </div>
    </div>

    <Transition name="fade">
      <div v-if="open" id="mobile-menu" class="border-border bg-surface border-t md:hidden">
        <div class="space-y-1 px-4 py-3">
          <a
            v-for="l in LINKS"
            :key="l.id"
            :href="`#${l.id}`"
            class="text-fg hover:bg-surface-sunken block rounded-[var(--radius-md)] px-3 py-2.5 font-medium"
            @click="open = false"
          >
            {{ l.label }}
          </a>
          <RouterLink
            :to="auth.isAuthenticated ? '/app' : '/login'"
            class="text-fg hover:bg-surface-sunken block rounded-[var(--radius-md)] px-3 py-2.5 font-medium"
          >
            {{ auth.isAuthenticated ? 'لوحة التحكم' : 'تسجيل الدخول' }}
          </RouterLink>
        </div>
      </div>
    </Transition>
  </nav>
</template>
