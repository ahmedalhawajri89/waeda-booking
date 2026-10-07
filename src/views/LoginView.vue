<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Check, Clock, Eye, EyeOff, Loader2, Lock, Mail, Search } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import AppLogo from '@/components/ui/AppLogo.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { useAuthStore } from '@/stores/auth'
import { isDemoBackend } from '@/data/repository'

/**
 * The way into the console, for the people who run a business.
 *
 * Customers never need an account, but some of them land here looking for
 * their booking anyway, so the page answers them too: one field for the
 * reference, straight to the manage page. The demo signs in with one button
 * instead of pre-filled fields, which read as someone else's account.
 */
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const touched = ref(false)
const submitting = ref(false)

const emailError = () =>
  touched.value && !/^\S+@\S+\.\S+$/.test(email.value) ? 'بريد إلكتروني غير صالح' : undefined
const passwordError = () =>
  touched.value && password.value.length < 6 ? 'كلمة المرور 6 أحرف على الأقل' : undefined

async function signIn() {
  submitting.value = true
  try {
    const user = await auth.signIn(email.value.trim(), password.value)
    toast.success(`أهلاً ${user?.name ?? ''}`.trim())
    await router.push(route.query.redirect || '/app')
  } catch (e) {
    // One message for "no such address" and "wrong password", deliberately:
    // telling them apart would show anyone which addresses have accounts.
    toast.error(
      e?.status === 422 || (e instanceof Error && /Invalid login|credentials/i.test(e.message))
        ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
        : 'تعذّر تسجيل الدخول. حاول مرة أخرى.',
    )
  } finally {
    submitting.value = false
  }
}

function submit() {
  touched.value = true
  if (emailError() || passwordError()) return
  signIn()
}

function demo() {
  email.value = 'admin@waeda.app'
  password.value = 'demo1234'
  signIn()
}

/* a customer looking for their booking */
const reference = ref('')
function findBooking() {
  const ref = reference.value.trim().toUpperCase()
  if (ref) router.push(`/booking/${encodeURIComponent(ref)}`)
}

const DAY = [
  { time: '9:00', name: 'منيرة', status: 'مؤكد', ok: true },
  { time: '10:30', name: 'عبدالله', status: 'مؤكد', ok: true },
  { time: '12:00', name: 'ريما', status: 'بانتظار الرد', ok: false },
]
</script>

<template>
  <div class="bg-surface grid min-h-screen lg:grid-cols-2">
    <!-- form -->
    <div class="flex flex-col px-4 py-6 sm:px-10">
      <AppLogo compact />

      <main class="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
        <h1 class="font-display text-fg mb-2 text-2xl font-bold sm:text-3xl">أهلاً بعودتك</h1>
        <p class="text-fg-muted mb-8">ادخل إلى لوحة تحكم منشأتك.</p>

        <button
          v-if="isDemoBackend"
          type="button"
          class="border-border bg-surface-sunken text-fg hover:bg-surface-hover mb-6 flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-start"
          :disabled="submitting"
          @click="demo"
        >
          <span>
            <span class="block text-sm font-bold">ادخل بالحساب التجريبي</span>
            <span class="text-fg-subtle block text-xs">بلا تسجيل، ببيانات تجريبية جاهزة</span>
          </span>
          <ArrowLeft class="h-4 w-4 shrink-0 ltr:rotate-180" aria-hidden="true" />
        </button>

        <div v-if="isDemoBackend" class="text-fg-faint mb-6 flex items-center gap-3 text-xs">
          <span class="bg-border h-px flex-1" />أو بحسابك<span class="bg-border h-px flex-1" />
        </div>

        <form class="space-y-4" novalidate @submit.prevent="submit">
          <BaseInput
            v-model="email"
            label="البريد الإلكتروني"
            type="email"
            :icon="Mail"
            ltr
            required
            :error="emailError()"
          />
          <div class="relative">
            <BaseInput
              v-model="password"
              label="كلمة المرور"
              :type="showPassword ? 'text' : 'password'"
              :icon="Lock"
              ltr
              required
              :error="passwordError()"
            />
            <button
              type="button"
              class="text-fg-subtle hover:text-fg absolute end-3 top-[2.15rem] p-1"
              :aria-label="showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'"
              @click="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" class="h-4 w-4" />
              <Eye v-else class="h-4 w-4" />
            </button>
          </div>
          <button
            type="submit"
            class="btn-brand flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] py-3 text-sm font-bold"
            :disabled="submitting"
          >
            <Loader2 v-if="submitting" class="h-4 w-4 animate-spin" aria-hidden="true" />
            دخول
          </button>
        </form>

        <p class="text-fg-muted mt-6 text-center text-sm">
          ليس لديك حساب؟
          <RouterLink
            to="/register"
            class="text-fg font-semibold underline-offset-4 hover:underline"
          >
            افتح منشأتك مجاناً
          </RouterLink>
        </p>

        <!-- for customers who came here looking for their booking -->
        <div class="border-border mt-10 border-t pt-6">
          <p class="text-fg mb-1 text-sm font-bold">عميل وتبحث عن حجزك؟</p>
          <p class="text-fg-subtle mb-3 text-xs">لا تحتاج حساباً. أدخل رقم الحجز كما وصلك.</p>
          <form class="flex gap-2" @submit.prevent="findBooking">
            <input
              v-model="reference"
              class="border-border bg-surface text-fg focus:border-fg min-w-0 flex-1 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm outline-none"
              placeholder="BK-2026-0000"
              aria-label="رقم الحجز"
              dir="ltr"
            />
            <button
              type="submit"
              class="border-border bg-surface text-fg hover:bg-surface-hover flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border px-4 text-sm font-semibold"
            >
              <Search class="h-4 w-4" aria-hidden="true" /> عرض
            </button>
          </form>
        </div>
      </main>
    </div>

    <!-- what is waiting on the other side -->
    <aside
      class="bg-canvas border-border hidden flex-col justify-center border-s px-12 lg:flex"
      aria-hidden="true"
    >
      <div class="mx-auto w-full max-w-md">
        <div class="border-border bg-surface elev-overlay rounded-[var(--radius-xl)] border p-5">
          <div class="mb-4 flex items-center justify-between">
            <div>
              <p class="text-fg font-bold">مواعيد اليوم</p>
              <p class="text-fg-subtle text-xs">قبل أن تفتح الباب</p>
            </div>
            <span class="bg-success-50 text-success-700 rounded-full px-2.5 py-1 text-xs font-bold"
              >2 من 3 مؤكدة</span
            >
          </div>
          <ul class="space-y-2">
            <li
              v-for="a in DAY"
              :key="a.time"
              class="border-border flex items-center justify-between rounded-[var(--radius-md)] border px-3 py-2.5"
            >
              <span class="flex items-center gap-3">
                <span class="text-fg-subtle w-10 text-xs" dir="ltr" data-numeric>{{ a.time }}</span>
                <span class="text-fg text-sm font-semibold">{{ a.name }}</span>
              </span>
              <span
                class="flex items-center gap-1 text-xs font-semibold"
                :class="a.ok ? 'text-success-700' : 'text-warning-700'"
              >
                <Check v-if="a.ok" class="h-3.5 w-3.5" />
                <Clock v-else class="h-3.5 w-3.5" />
                {{ a.status }}
              </span>
            </li>
          </ul>
        </div>
        <p class="font-display text-fg mt-8 text-xl leading-relaxed font-bold">
          التذكير خرج، والعملاء أكّدوا.<br />
          <span class="text-fg-muted font-medium">أنت تبدأ يومك وجدولك واضح.</span>
        </p>
      </div>
    </aside>
  </div>
</template>
