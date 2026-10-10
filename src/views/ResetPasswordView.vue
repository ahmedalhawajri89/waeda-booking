<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Link2Off,
  Loader2,
  Lock,
  LockKeyhole,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import AppLogo from '@/components/ui/AppLogo.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * A forgotten password, step two: the page the emailed link opens.
 *
 * The link carries the token and the address; this page only asks for the
 * new password, twice. What makes a password acceptable is shown as it is
 * typed rather than after a failed submit. A link that is missing, used, or
 * expired gets its own state with the way forward, not a bare error.
 */
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const token = typeof route.query.token === 'string' ? route.query.token : ''
const email = typeof route.query.email === 'string' ? route.query.email : ''
const dead = ref(!token || !email)

const password = ref('')
const confirm = ref('')
const show = ref(false)
const touched = ref(false)
const submitting = ref(false)

const RULES = [
  { key: 'len', label: '8 أحرف على الأقل', test: (p) => p.length >= 8 },
  { key: 'letter', label: 'حرف واحد على الأقل', test: (p) => /\p{L}/u.test(p) },
  { key: 'digit', label: 'رقم واحد على الأقل', test: (p) => /\d/.test(p) },
]
// Length is the one rule the server enforces; short is weak whatever else.
const passed = computed(() => {
  const n = RULES.filter((r) => r.test(password.value)).length
  return RULES[0].test(password.value) ? n : Math.min(n, 1)
})
const strength = computed(
  () =>
    [
      { label: '', bar: 'bg-border' },
      { label: 'ضعيفة', bar: 'bg-danger-600' },
      { label: 'مقبولة', bar: 'bg-warning-600' },
      { label: 'قوية', bar: 'bg-success-600' },
    ][passed.value],
)

const passwordError = computed(() =>
  touched.value && !RULES[0].test(password.value) ? 'كلمة المرور 8 أحرف على الأقل' : undefined,
)
const confirmError = computed(() =>
  touched.value && confirm.value !== password.value ? 'كلمتا المرور غير متطابقتين' : undefined,
)

async function submit() {
  touched.value = true
  if (passwordError.value || confirmError.value) return
  submitting.value = true
  try {
    await auth.resetPassword({ token, email, password: password.value })
    toast.success('تم تعيين كلمة المرور. ادخل بها الآن.')
    await router.replace({ path: '/login', query: { email } })
  } catch (e) {
    // A 422 about the token is a dead link; one about the password is not.
    if (e?.status === 422 && !e?.body?.errors?.password) dead.value = true
    else toast.error('تعذّر الحفظ. حاول مرة أخرى.')
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
        <!-- the link is no good -->
        <template v-if="dead">
          <span
            class="bg-warning-50 text-warning-700 mb-5 grid h-11 w-11 place-items-center rounded-full"
            aria-hidden="true"
          >
            <Link2Off class="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 class="font-display text-fg mb-2 text-2xl font-bold" role="alert">
            الرابط لم يعد صالحاً
          </h1>
          <p class="text-fg-muted mb-6 text-sm leading-relaxed">
            ربما انتهت مدته، أو استُخدم من قبل، أو لم يُنسخ كاملاً. اطلب رابطاً جديداً ويصلك خلال
            دقيقة.
          </p>
          <RouterLink
            :to="{ path: '/forgot-password', query: email ? { email } : {} }"
            class="btn-brand flex w-full items-center justify-center rounded-[var(--radius-md)] py-3 text-sm font-bold"
            >اطلب رابطاً جديداً</RouterLink
          >
        </template>

        <!-- the new password -->
        <template v-else>
          <span
            class="bg-surface-sunken text-fg mb-5 grid h-11 w-11 place-items-center rounded-full"
            aria-hidden="true"
          >
            <LockKeyhole class="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 class="font-display text-fg mb-2 text-2xl font-bold">كلمة مرور جديدة</h1>
          <p class="text-fg-muted mb-6 text-sm">
            للحساب
            <span class="text-fg font-semibold" dir="ltr">{{ email }}</span>
          </p>

          <form class="space-y-4" novalidate @submit.prevent="submit">
            <div>
              <div class="relative">
                <BaseInput
                  v-model="password"
                  label="كلمة المرور الجديدة"
                  :type="show ? 'text' : 'password'"
                  :icon="Lock"
                  autocomplete="new-password"
                  ltr
                  required
                  :error="passwordError"
                />
                <button
                  type="button"
                  class="text-fg-subtle hover:text-fg absolute end-3 top-[2.15rem] p-1"
                  :aria-label="show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'"
                  @click="show = !show"
                >
                  <EyeOff v-if="show" class="h-4 w-4" />
                  <Eye v-else class="h-4 w-4" />
                </button>
              </div>

              <!-- how good it is, while typing -->
              <div v-if="password" class="mt-2.5" aria-live="polite">
                <div class="flex items-center gap-2">
                  <div class="flex flex-1 gap-1" aria-hidden="true">
                    <span
                      v-for="i in 3"
                      :key="i"
                      class="h-1 flex-1 rounded-full transition-colors"
                      :class="i <= passed ? strength.bar : 'bg-border'"
                    />
                  </div>
                  <span class="text-fg-subtle w-12 text-end text-xs font-semibold">{{
                    strength.label
                  }}</span>
                </div>
                <ul class="mt-2 space-y-1">
                  <li
                    v-for="r in RULES"
                    :key="r.key"
                    class="flex items-center gap-1.5 text-xs"
                    :class="r.test(password) ? 'text-success-700' : 'text-fg-subtle'"
                  >
                    <Check v-if="r.test(password)" class="h-3.5 w-3.5" aria-hidden="true" />
                    <span
                      v-else
                      class="bg-border mx-1 h-1.5 w-1.5 rounded-full"
                      aria-hidden="true"
                    />
                    {{ r.label }}
                  </li>
                </ul>
              </div>
            </div>

            <BaseInput
              v-model="confirm"
              label="أعد كتابتها"
              :type="show ? 'text' : 'password'"
              :icon="Lock"
              autocomplete="new-password"
              ltr
              required
              :error="confirmError"
            />

            <button
              type="submit"
              class="btn-brand flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] py-3 text-sm font-bold"
              :disabled="submitting"
            >
              <Loader2 v-if="submitting" class="h-4 w-4 animate-spin" aria-hidden="true" />
              احفظ كلمة المرور
            </button>
          </form>
          <p class="text-fg-subtle mt-4 text-xs leading-relaxed">
            بعد الحفظ نُخرج حسابك من كل الأجهزة، فتدخل من جديد بكلمة المرور الجديدة.
          </p>
        </template>
      </div>

      <RouterLink
        to="/login"
        class="text-fg-muted hover:text-fg mt-6 flex items-center justify-center gap-1.5 text-sm font-semibold"
      >
        <ArrowRight class="h-4 w-4 ltr:rotate-180" aria-hidden="true" />
        العودة لتسجيل الدخول
      </RouterLink>
    </main>
  </div>
</template>
