<script setup>
import { onBeforeUnmount, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowRight, KeyRound, Loader2, Mail, MailCheck } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import AppLogo from '@/components/ui/AppLogo.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { useAuthStore } from '@/stores/auth'
import { isDemoBackend } from '@/data/repository'

/**
 * A forgotten password, step one: where to send the link.
 *
 * The page says "sent" whatever the address, the way the server answers —
 * it never confirms who has an account. Resending waits a minute, which is
 * about how long mail takes to show up and stops a nervous double-click
 * from filling an inbox. The demo has no mail, so it shows the link instead.
 */
const auth = useAuthStore()
const route = useRoute()

const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const touched = ref(false)
const submitting = ref(false)
const sent = ref(false)
const demoLink = ref(null)

const emailError = () =>
  touched.value && !/^\S+@\S+\.\S+$/.test(email.value.trim())
    ? 'أدخل بريداً إلكترونياً صحيحاً'
    : undefined

const wait = ref(0)
let timer = null
function startWait() {
  wait.value = 60
  clearInterval(timer)
  timer = setInterval(() => {
    wait.value -= 1
    if (wait.value <= 0) clearInterval(timer)
  }, 1000)
}
onBeforeUnmount(() => clearInterval(timer))

async function send() {
  touched.value = true
  if (emailError()) return
  submitting.value = true
  try {
    const r = await auth.requestPasswordReset(email.value.trim())
    demoLink.value = r.demoLink ?? null
    sent.value = true
    startWait()
  } catch (e) {
    toast.error(
      e?.status === 429
        ? 'طلبات كثيرة خلال وقت قصير. انتظر دقيقة ثم حاول.'
        : 'تعذّر الإرسال. حاول مرة أخرى.',
    )
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="bg-canvas flex min-h-screen flex-col px-4 py-6 sm:px-10">
    <AppLogo compact />

    <main class="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
      <div
        class="border-border bg-surface elev-overlay rounded-[var(--radius-xl)] border p-6 sm:p-8"
      >
        <!-- where to send it -->
        <template v-if="!sent">
          <span
            class="bg-surface-sunken text-fg mb-5 grid h-11 w-11 place-items-center rounded-full"
            aria-hidden="true"
          >
            <KeyRound class="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 class="font-display text-fg mb-2 text-2xl font-bold">نسيت كلمة المرور؟</h1>
          <p class="text-fg-muted mb-6 text-sm leading-relaxed">
            أدخل بريد حسابك، ونرسل لك رابطاً تعيّن منه كلمة مرور جديدة.
          </p>

          <form class="space-y-4" novalidate @submit.prevent="send">
            <BaseInput
              v-model="email"
              label="البريد الإلكتروني"
              type="email"
              :icon="Mail"
              autocomplete="email"
              ltr
              required
              :error="emailError()"
            />
            <button
              type="submit"
              class="btn-brand flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] py-3 text-sm font-bold"
              :disabled="submitting"
            >
              <Loader2 v-if="submitting" class="h-4 w-4 animate-spin" aria-hidden="true" />
              أرسل رابط الاستعادة
            </button>
          </form>
        </template>

        <!-- sent -->
        <template v-else>
          <span
            class="bg-success-50 text-success-700 mb-5 grid h-11 w-11 place-items-center rounded-full"
            aria-hidden="true"
          >
            <MailCheck class="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 class="font-display text-fg mb-2 text-2xl font-bold" role="status">تحقق من بريدك</h1>
          <p class="text-fg-muted mb-1 text-sm leading-relaxed">
            إن كان لهذا البريد حساب في وعدة، فقد أرسلنا إليه رابط الاستعادة:
          </p>
          <p class="text-fg mb-5 text-sm font-semibold" dir="ltr" style="text-align: start">
            {{ email.trim() }}
          </p>
          <p class="text-fg-subtle mb-6 text-xs leading-relaxed">
            الرابط صالح لمدة ساعة. لم يصلك؟ انظر في مجلد الرسائل غير المرغوبة، أو تأكد من البريد.
          </p>

          <div
            v-if="demoLink"
            class="border-border bg-surface-sunken mb-4 rounded-[var(--radius-md)] border border-dashed p-3"
          >
            <p class="text-fg-subtle mb-2 text-xs">
              نسخة تجريبية بلا بريد فعلي، فهذا هو الرابط الذي كان سيصلك:
            </p>
            <RouterLink
              :to="demoLink"
              class="text-fg text-sm font-semibold underline underline-offset-4"
              >افتح رابط الاستعادة</RouterLink
            >
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="border-border text-fg hover:bg-surface-hover rounded-[var(--radius-md)] border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              :disabled="wait > 0 || submitting"
              @click="send"
            >
              <template v-if="wait > 0"
                >أعد الإرسال بعد <span data-numeric>{{ wait }}</span> ث</template
              >
              <template v-else>أعد الإرسال</template>
            </button>
            <button
              type="button"
              class="text-fg-subtle hover:text-fg px-2 text-sm font-semibold"
              @click="sent = false"
            >
              بريد آخر
            </button>
          </div>
        </template>
      </div>

      <RouterLink
        :to="{ path: '/login', query: email.trim() ? { email: email.trim() } : {} }"
        class="text-fg-muted hover:text-fg mt-6 flex items-center justify-center gap-1.5 text-sm font-semibold"
      >
        <ArrowRight class="h-4 w-4 ltr:rotate-180" aria-hidden="true" />
        العودة لتسجيل الدخول
      </RouterLink>
    </main>
  </div>
</template>
