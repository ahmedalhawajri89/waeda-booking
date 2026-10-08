import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { isDemoBackend, repository } from '@/data/repository'
import { effectivePlan, planByKey, trialDaysLeft } from '@/data/plans'

/**
 * The business's own plan, as the console shows it: what it is on, how much
 * of it is used, and the moments worth telling the owner about — a trial
 * ending, messages running low, a team that is full.
 */
export const useSubscriptionStore = defineStore('subscription', () => {
  const raw = ref(null)
  const loaded = ref(false)

  async function load(force = false) {
    if (loaded.value && !force) return
    try {
      raw.value = await repository.loadSubscription()
      loaded.value = true
    } catch {
      // A plan that cannot be read must not block the console.
    }
  }

  const current = computed(() => effectivePlan(raw.value ?? { plan: 'free', trialEndsAt: null }))
  const plan = computed(() => current.value.plan)
  const inTrial = computed(() => current.value.inTrial)
  const daysLeft = computed(() => trialDaysLeft(raw.value))
  /** What is paid for, as distinct from what is running (the trial). */
  const paid = computed(() => planByKey(raw.value?.plan))
  const cycle = computed(() => raw.value?.cycle ?? 'monthly')
  const pending = computed(() => raw.value?.pending ?? null)

  const usage = computed(() => raw.value?.usage ?? { messages: 0, extraMessages: 0, staff: 0 })
  const messageAllowance = computed(() => plan.value.messages + usage.value.extraMessages)
  const messagesLeft = computed(() => Math.max(0, messageAllowance.value - usage.value.messages))
  const messageShare = computed(() =>
    messageAllowance.value ? usage.value.messages / messageAllowance.value : 1,
  )

  /** Only what needs saying, most urgent first. */
  const alert = computed(() => {
    if (!loaded.value) return null
    if (messagesLeft.value === 0)
      return {
        tone: 'danger',
        text: 'انتهت رسائل واتساب لهذا الشهر: الحارس متوقف عن التذكير، والحجز مستمر.',
        action: 'أضف رسائل',
      }
    if (inTrial.value && daysLeft.value <= 3)
      return {
        tone: 'warning',
        text: `تنتهي تجربتك بعد ${daysLeft.value === 1 ? 'يوم واحد' : `${daysLeft.value} أيام`}، ثم تنتقل للباقة المجانية.`,
        action: 'اختر باقتك',
      }
    if (messageShare.value >= 0.8)
      return {
        tone: 'warning',
        text: `بقي ${messagesLeft.value} رسالة لهذا الشهر.`,
        action: 'أضف رسائل',
      }
    return null
  })

  const canAddStaff = (activeCount) => activeCount < plan.value.staff
  const allows = (feature) => !!plan.value.features[feature]

  /**
   * Ask for a plan or a pack. The demo has nobody to wait for, so it is on
   * at once; against the API it waits for activation, and the page says so.
   * @returns {Promise<{ activated: boolean }>}
   */
  async function request({ plan: key = null, cycle: c = 'monthly', extraPack = false }) {
    const next = await repository.requestPlan({ plan: key, cycle: c, extraPack })
    raw.value = next
    return { activated: isDemoBackend || !!next.activated }
  }

  return {
    raw,
    loaded,
    load,
    plan,
    paid,
    cycle,
    inTrial,
    daysLeft,
    pending,
    usage,
    messageAllowance,
    messagesLeft,
    messageShare,
    alert,
    canAddStaff,
    allows,
    request,
  }
})
