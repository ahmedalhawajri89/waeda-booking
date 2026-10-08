<script setup>
import { computed } from 'vue'
import { MapPin } from 'lucide-vue-next'
import AppLogo from '@/components/ui/AppLogo.vue'
import { business } from '@/data/business'
import { schedule } from '@/data/catalog'
import { openAt, windowFor } from '@/lib/hours'
import { time } from '@/lib/format'

/**
 * The business at the top of every guest page: who, what, open or not, where.
 * The guest is on the business's page; the platform signs it quietly above.
 * "Open now" asks last night's hours too: at 1 a.m. a café open till 2 is.
 */
const current = computed(() => openAt(new Date(), schedule))
const openNow = computed(() => current.value !== null)
const hoursLine = computed(() => {
  if (current.value) return `مفتوح الآن حتى ${time(current.value.close)}`
  const today = windowFor(new Date(), schedule)
  if (!today) return 'مغلق اليوم'
  return today.open > new Date() ? `يفتح ${time(today.open)}` : 'أغلق لهذا اليوم'
})
/** A special period in force (Ramadan, a holiday) is worth saying out loud. */
const period = computed(() => windowFor(new Date(), schedule)?.period ?? null)
</script>

<template>
  <header class="bg-surface border-border border-b">
    <div class="mx-auto max-w-6xl px-4 sm:px-6">
      <div class="flex h-14 items-center justify-end gap-2">
        <span class="text-fg-faint text-xs">الحجز عبر</span>
        <AppLogo compact mark-only class="opacity-80" />
        <span class="text-fg-muted font-display text-sm font-bold">وعدة</span>
      </div>
      <div class="flex items-center gap-4 pt-2 pb-6">
        <span
          class="bg-ink font-display grid h-14 w-14 shrink-0 place-items-center rounded-[var(--radius-lg)] text-2xl font-bold text-white"
          aria-hidden="true"
          >{{ business.initial }}</span
        >
        <div class="min-w-0">
          <p class="font-display text-fg truncate text-xl font-bold sm:text-2xl">
            {{ business.name }}
          </p>
          <p class="text-fg-subtle mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span>{{ business.category }}</span>
            <span class="flex items-center gap-1.5">
              <span
                class="h-2 w-2 rounded-full"
                :class="openNow ? 'bg-success-600' : 'bg-fg-faint'"
                aria-hidden="true"
              />
              {{ hoursLine }}
            </span>
            <span
              v-if="period"
              class="bg-primary-soft text-primary-fg rounded-[var(--radius-sm)] px-2 py-0.5 text-xs font-semibold"
              data-period
              >{{ period.label }}</span
            >
            <a
              :href="business.mapsUrl"
              target="_blank"
              rel="noopener"
              class="hover:text-fg flex items-center gap-1"
            >
              <MapPin class="h-3.5 w-3.5" aria-hidden="true" />{{ business.address }}
            </a>
          </p>
        </div>
      </div>
    </div>
  </header>
</template>
