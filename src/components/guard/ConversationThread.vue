<script setup>
import { computed, ref } from 'vue'
import { Bot, Send, UserRound } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useGuardStore } from '@/stores/guard'
import { TEMPLATE_LABEL } from '@/lib/guardEngine'
import { time, relativeDay } from '@/lib/format'

/**
 * The guard's conversation with one customer about one booking, and a way to
 * answer as the customer.
 *
 * The reply box is a simulator: it delivers text exactly as the messaging
 * channel would, through the same backend path, so what happens next — the
 * booking confirmed, cancelled, or handed to staff — is the real behaviour,
 * not a mock of it. It is what lets the guard be tried without a WhatsApp
 * account.
 */
const props = defineProps({
  bookingId: { type: String, required: true },
  live: { type: Boolean, required: false, default: true },
})

const guard = useGuardStore()
const thread = computed(() => guard.thread(props.bookingId))
const draft = ref('')
const sending = ref(false)

const INTENT = {
  confirm: { label: 'فُهم: تأكيد', tone: 'text-success-700' },
  cancel: { label: 'فُهم: إلغاء', tone: 'text-danger-700' },
  late: { label: 'فُهم: سيتأخر — أُبلغ الفريق', tone: 'text-warning-700' },
  unknown: { label: 'لم يُفهم تلقائياً — أُحيل للفريق', tone: 'text-warning-700' },
  reschedule: { label: 'فُهم: يريد موعداً آخر', tone: 'text-primary-fg' },
  choose: { label: 'فُهم: اختار وقتاً', tone: 'text-success-700' },
}

const QUICK = ['1', '2', 'بتأخر ربع ساعة', 'خلّيها بكرة العصر']

/** The newest offer of times still waiting for an answer — its options become buttons. */
const openOffer = computed(() => {
  for (let i = thread.value.length - 1; i >= 0; i--) {
    const m = thread.value[i]
    if (m.direction === 'out' && m.template === 'reschedule_offer')
      return m.payload?.used ? null : m
  }
  return null
})

async function send(text = draft.value) {
  const body = text.trim()
  if (!body || sending.value) return
  sending.value = true
  try {
    const intent = await guard.reply(props.bookingId, body)
    draft.value = ''
    if (intent === 'confirm') toast.success('أكّد العميل حضوره')
    else if (intent === 'choose') toast.success('نُقل الموعد إلى الوقت الذي اختاره العميل')
    else if (intent === 'cancel') toast.success('ألغى العميل الحجز — الوقت متاح الآن')
  } catch {
    toast.error('تعذّر إرسال الرد.')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <section aria-labelledby="thread-heading">
    <h3
      id="thread-heading"
      class="text-fg-muted mb-2 flex items-center gap-1.5 text-[13px] font-semibold"
    >
      <Bot class="text-primary-fg h-4 w-4" aria-hidden="true" />
      محادثة الحارس
    </h3>

    <div class="bg-surface-sunken space-y-2 rounded-[var(--radius-md)] p-3">
      <p v-if="thread.length === 0" class="text-fg-subtle py-2 text-center text-xs">
        لم تُرسل رسائل لهذا الحجز بعد — تُرسل تلقائياً حسب سياسة الحماية.
      </p>

      <div
        v-for="m in thread"
        :key="m.id"
        class="flex"
        :class="m.direction === 'out' ? 'justify-start' : 'justify-end'"
      >
        <div
          class="max-w-[85%] rounded-[var(--radius-md)] px-3 py-2 text-sm shadow-xs"
          :class="
            m.direction === 'out'
              ? 'bg-primary-soft text-fg rounded-ss-sm'
              : 'border-border text-fg bg-surface rounded-se-sm border'
          "
        >
          <p class="text-fg-subtle mb-1 flex items-center gap-1 text-[10px] font-semibold">
            <component
              :is="m.direction === 'out' ? Bot : UserRound"
              class="h-3 w-3"
              aria-hidden="true"
            />
            {{ m.direction === 'out' ? TEMPLATE_LABEL[m.template] : 'العميل' }}
          </p>
          <p class="leading-relaxed whitespace-pre-line">{{ m.body }}</p>
          <div
            v-if="live && m.id === openOffer?.id"
            class="mt-2 flex flex-wrap gap-1.5"
            role="group"
            aria-label="اختر كعميل"
          >
            <button
              v-for="(at, i) in m.payload.options"
              :key="at"
              type="button"
              class="border-primary-line text-primary-fg hover:bg-primary-soft bg-surface rounded-full border px-2.5 py-1 text-xs font-semibold"
              :disabled="sending"
              @click="send(String(i + 1))"
            >
              {{ i + 1 }} · {{ relativeDay(at) }} {{ time(at) }}
            </button>
          </div>
          <p class="text-fg-faint mt-1 flex items-center justify-between gap-3 text-[10px]">
            <span v-if="m.intent" :class="INTENT[m.intent].tone" class="font-semibold">
              {{ INTENT[m.intent].label }}
            </span>
            <time :datetime="m.at" class="ms-auto">{{ relativeDay(m.at) }} {{ time(m.at) }}</time>
          </p>
        </div>
      </div>
    </div>

    <form v-if="live" class="mt-2" @submit.prevent="send()">
      <label for="sim-reply" class="text-fg-subtle mb-1 block text-[11px]">محاكاة رد العميل</label>
      <div class="flex gap-2">
        <input
          id="sim-reply"
          v-model="draft"
          type="text"
          placeholder="اكتب كما يكتب العميل…"
          class="border-border focus:border-primary bg-surface h-10 min-w-0 flex-1 rounded-[var(--radius-md)] border px-3 text-sm outline-none"
          autocomplete="off"
        />
        <button
          type="submit"
          class="bg-primary hover:bg-primary-hover inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-white disabled:opacity-50"
          :disabled="!draft.trim() || sending"
          aria-label="إرسال الرد"
        >
          <Send class="h-4 w-4 rotate-180" aria-hidden="true" />
        </button>
      </div>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <button
          v-for="q in QUICK"
          :key="q"
          type="button"
          class="border-border hover:border-primary-line bg-surface text-fg-muted rounded-full border px-2.5 py-1 text-xs"
          :disabled="sending"
          @click="send(q)"
        >
          {{ q }}
        </button>
      </div>
    </form>
  </section>
</template>
