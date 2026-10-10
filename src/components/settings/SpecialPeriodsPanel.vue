<script setup>
import { computed, ref } from 'vue'
import { addDays, format } from 'date-fns'
import { CalendarOff, CalendarRange, MoonStar, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseDrawer from '@/components/ui/BaseDrawer.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { businessHours, specialPeriods } from '@/data/catalog'
import { useSettingsStore } from '@/stores/settings'
import { nextRamadan } from '@/lib/hijri'
import { fullDate } from '@/lib/format'

/**
 * Dates whose hours replace the week's: Ramadan, Eid, a holiday.
 *
 * Ramadan is the case that matters most here — the whole market changes
 * hours for a month, often into the small hours — so it gets its own button
 * that already knows the dates (Umm al-Qura) and evening hours past midnight.
 * Everything stays editable: moon sightings move a day, and every business
 * keeps its own hours.
 */
const settings = useSettingsStore()
const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const today = format(new Date(), 'yyyy-MM-dd')

const list = computed(() =>
  specialPeriods.map((p) => ({
    ...p,
    state: p.endsOn < today ? 'past' : p.startsOn <= today ? 'now' : 'next',
    summary: summarise(p.hours),
  })),
)

function summarise(rows) {
  const open = rows.filter((h) => !h.isClosed)
  if (!open.length) return 'مغلق طوال الفترة'
  const same = open.every((h) => h.open === open[0].open && h.close === open[0].close)
  const range = `${open[0].open} – ${open[0].close}${open[0].close < open[0].open ? ' (بعد منتصف الليل)' : ''}`
  if (same && open.length === 7) return range
  if (same) return `${range}، ويغلق ${rows.filter((h) => h.isClosed).length} أيام`
  return 'ساعات مختلفة بحسب اليوم'
}

/* ------------------------------------------------------------ editing */
const draft = ref(null)
const isNew = ref(false)

const week = (open, close, closed = false) =>
  Array.from({ length: 7 }, (_, weekday) => ({ weekday, open, close, isClosed: closed }))

function start(kind) {
  isNew.value = true
  if (kind === 'ramadan') {
    const r = nextRamadan()
    draft.value = {
      id: crypto.randomUUID(),
      label: r ? `رمضان ${r.year}` : 'رمضان',
      startsOn: r?.startsOn ?? today,
      endsOn: r?.endsOn ?? today,
      hours: week('20:00', '02:00'),
    }
  } else if (kind === 'holiday') {
    draft.value = {
      id: crypto.randomUUID(),
      label: 'إجازة',
      startsOn: today,
      endsOn: format(addDays(new Date(), 3), 'yyyy-MM-dd'),
      hours: week('09:00', '18:00', true),
    }
  } else {
    draft.value = {
      id: crypto.randomUUID(),
      label: '',
      startsOn: today,
      endsOn: today,
      hours: businessHours.map((h) => ({ ...h })),
    }
  }
}

function edit(id) {
  const p = specialPeriods.find((x) => x.id === id)
  if (!p) return
  isNew.value = false
  draft.value = { ...p, hours: p.hours.map((h) => ({ ...h })) }
}

function sameForAll() {
  const first = draft.value.hours.find((h) => !h.isClosed) ?? draft.value.hours[0]
  draft.value.hours = draft.value.hours.map((h) => ({
    ...h,
    open: first.open,
    close: first.close,
    isClosed: first.isClosed,
  }))
}

const problem = computed(() => {
  const d = draft.value
  if (!d) return null
  if (d.label.trim().length < 2) return 'اكتب اسماً للفترة'
  if (!d.startsOn || !d.endsOn || d.endsOn < d.startsOn) return 'تاريخ النهاية قبل البداية'
  const clash = specialPeriods.find(
    (p) => p.id !== d.id && p.startsOn <= d.endsOn && d.startsOn <= p.endsOn,
  )
  if (clash) return `تتداخل مع «${clash.label}»`
  const empty = d.hours.find((h) => !h.isClosed && h.open === h.close)
  if (empty) return `${WEEKDAYS[empty.weekday]}: وقت الإغلاق لا يساوي وقت الفتح`
  return null
})

function save() {
  if (problem.value) {
    toast.error(problem.value)
    return
  }
  const row = { ...draft.value, label: draft.value.label.trim() }
  settings.savePeriods([...specialPeriods.filter((p) => p.id !== row.id), row])
  toast.success(isNew.value ? `أُضيفت «${row.label}»` : `حُفظت «${row.label}»`)
  draft.value = null
}

function remove(p) {
  const before = specialPeriods.map((x) => ({ ...x }))
  settings.savePeriods(specialPeriods.filter((x) => x.id !== p.id))
  toast.success(`حُذفت «${p.label}»`, {
    action: { label: 'تراجع', onClick: () => settings.savePeriods(before) },
  })
}

const STATE = {
  now: { label: 'سارية الآن', tone: 'bg-primary-soft text-primary-fg' },
  next: { label: 'قادمة', tone: 'bg-surface-sunken text-fg-muted' },
  past: { label: 'انتهت', tone: 'bg-surface-sunken text-fg-faint' },
}
</script>

<template>
  <section class="surface overflow-hidden" aria-labelledby="periods-h">
    <header
      class="border-border flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3"
    >
      <div>
        <h2 id="periods-h" class="text-fg text-sm font-bold">فترات خاصة</h2>
        <p class="text-fg-subtle mt-0.5 text-xs">
          رمضان والعيد والإجازات: ساعات تحل محل الأسبوع في تواريخها فقط، ثم يعود الأسبوع وحده.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <BaseButton size="sm" :icon="MoonStar" @click="start('ramadan')">رمضان</BaseButton>
        <BaseButton size="sm" :icon="CalendarOff" @click="start('holiday')">إجازة</BaseButton>
        <BaseButton size="sm" variant="ghost" :icon="Plus" @click="start('custom')"
          >فترة</BaseButton
        >
      </div>
    </header>

    <p v-if="!list.length" class="text-fg-subtle px-4 py-8 text-center text-sm">
      لا فترات خاصة. أضف رمضان القادم بنقرة، بتواريخه وساعاته المسائية.
    </p>
    <ul v-else class="divide-border divide-y">
      <li v-for="p in list" :key="p.id" class="flex items-center gap-3 px-4 py-3">
        <CalendarRange class="text-fg-subtle h-5 w-5 shrink-0" aria-hidden="true" />
        <div class="min-w-0 flex-1" :class="p.state === 'past' && 'opacity-60'">
          <p class="text-fg flex flex-wrap items-center gap-2 text-sm font-semibold">
            {{ p.label }}
            <span class="rounded-full px-2 py-0.5 text-[11px]" :class="STATE[p.state].tone">{{
              STATE[p.state].label
            }}</span>
          </p>
          <p class="text-fg-subtle text-xs" data-numeric>
            {{ fullDate(`${p.startsOn}T12:00:00`) }} ← {{ fullDate(`${p.endsOn}T12:00:00`) }} ·
            <span dir="ltr">{{ p.summary }}</span>
          </p>
        </div>
        <button
          type="button"
          class="text-fg-subtle hover:text-fg hover:bg-surface-hover grid h-9 w-9 place-items-center rounded-[var(--radius-md)]"
          :aria-label="`تعديل ${p.label}`"
          @click="edit(p.id)"
        >
          <Pencil class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="text-fg-subtle hover:text-danger-700 hover:bg-danger-50 grid h-9 w-9 place-items-center rounded-[var(--radius-md)]"
          :aria-label="`حذف ${p.label}`"
          @click="remove(p)"
        >
          <Trash2 class="h-4 w-4" />
        </button>
      </li>
    </ul>

    <BaseDrawer
      :open="!!draft"
      :title="isNew ? 'فترة خاصة جديدة' : 'تعديل الفترة'"
      subtitle="ساعاتها تحل محل الأسبوع من أول يوم فيها إلى آخره"
      @close="draft = null"
    >
      <form v-if="draft" class="space-y-5" novalidate @submit.prevent="save">
        <BaseInput v-model="draft.label" label="الاسم" placeholder="رمضان، إجازة العيد…" required />
        <div class="grid grid-cols-2 gap-3">
          <label class="block">
            <span class="text-fg-muted mb-1.5 block text-[13px] font-semibold">من</span>
            <input
              v-model="draft.startsOn"
              type="date"
              class="border-border bg-surface text-fg focus:border-primary h-10 w-full rounded-[var(--radius-md)] border px-2 text-sm"
              dir="ltr"
            />
          </label>
          <label class="block">
            <span class="text-fg-muted mb-1.5 block text-[13px] font-semibold">إلى</span>
            <input
              v-model="draft.endsOn"
              type="date"
              class="border-border bg-surface text-fg focus:border-primary h-10 w-full rounded-[var(--radius-md)] border px-2 text-sm"
              dir="ltr"
            />
          </label>
        </div>

        <div>
          <div class="mb-2 flex items-center justify-between">
            <span class="text-fg-muted text-[13px] font-semibold">الساعات في هذه الفترة</span>
            <button
              type="button"
              class="text-fg-subtle hover:text-fg text-xs font-semibold"
              @click="sameForAll"
            >
              نفس ساعات أول يوم لكل الأيام
            </button>
          </div>
          <ul class="border-border divide-border divide-y rounded-[var(--radius-md)] border">
            <li
              v-for="h in draft.hours"
              :key="h.weekday"
              class="flex flex-wrap items-center gap-3 px-3 py-2"
            >
              <span class="text-fg w-16 shrink-0 text-sm">{{ WEEKDAYS[h.weekday] }}</span>
              <label class="text-fg-muted flex items-center gap-2 text-xs">
                <input v-model="h.isClosed" type="checkbox" class="accent-primary h-4 w-4" />
                مغلق
              </label>
              <div v-if="!h.isClosed" class="ms-auto flex items-center gap-2">
                <input
                  v-model="h.open"
                  type="time"
                  :aria-label="`فتح ${WEEKDAYS[h.weekday]}`"
                  class="border-border bg-surface text-fg h-9 rounded-[var(--radius-md)] border px-2 text-sm"
                  dir="ltr"
                />
                <span class="text-fg-subtle">–</span>
                <input
                  v-model="h.close"
                  type="time"
                  :aria-label="`إغلاق ${WEEKDAYS[h.weekday]}`"
                  class="border-border bg-surface text-fg h-9 rounded-[var(--radius-md)] border px-2 text-sm"
                  dir="ltr"
                />
              </div>
            </li>
          </ul>
          <p
            v-if="draft.hours.some((h) => !h.isClosed && h.close < h.open)"
            class="text-fg-subtle mt-2 text-xs"
          >
            الأيام التي يأتي فيها الإغلاق قبل الفتح تغلق بعد منتصف الليل، فجر اليوم التالي.
          </p>
        </div>

        <p v-if="problem" class="text-danger-700 text-xs font-medium" role="alert">
          {{ problem }}
        </p>
      </form>

      <template #footer>
        <div class="flex justify-end gap-2">
          <BaseButton variant="ghost" @click="draft = null">إلغاء</BaseButton>
          <BaseButton variant="primary" @click="save">حفظ الفترة</BaseButton>
        </div>
      </template>
    </BaseDrawer>
  </section>
</template>
