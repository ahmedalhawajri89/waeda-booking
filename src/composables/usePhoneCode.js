import { onBeforeUnmount, ref } from 'vue'
import { toast } from 'vue-sonner'
import { isDemoBackend } from '@/data/repository'

/**
 * The code step: send a four-digit code to a phone, then trade the code the
 * guest types for a token that proves the phone. The booking page and the
 * waitlist both use it, and both hand the token to the server with the phone.
 *
 * On the demo there is no server, so the code is made here and checked here.
 * With the API it is the server's — this page never knows it, unless the
 * server echoes it because no real channel is connected yet (`devCode`), in
 * which case the code step shows it (`shown`, see DemoCode).
 */
export function usePhoneCode() {
  const resendIn = ref(0)
  /** The code, when it is shown on the page rather than sent; '' otherwise. */
  const shown = ref('')
  let timer
  let demoCode = ''

  function countdown() {
    resendIn.value = 30
    clearInterval(timer)
    timer = setInterval(() => {
      resendIn.value -= 1
      if (resendIn.value <= 0) clearInterval(timer)
    }, 1000)
  }
  onBeforeUnmount(() => clearInterval(timer))

  function show(code) {
    shown.value = code
  }

  /** @returns {Promise<boolean>} whether a code went out */
  async function send(phone) {
    if (isDemoBackend) {
      demoCode = String(Math.floor(1000 + Math.random() * 9000))
      show(demoCode)
      countdown()
      return true
    }
    const { sendPhoneCode } = await import('@/data/api/public')
    try {
      const res = await sendPhoneCode(phone)
      if (res?.devCode) show(res.devCode)
      countdown()
      return true
    } catch (e) {
      toast.error(
        e?.status === 429
          ? 'طلبت رموزاً كثيرة. انتظر قليلاً ثم أعد المحاولة.'
          : 'تعذّر إرسال الرمز. حاول مرة أخرى.',
      )
      return false
    }
  }

  /** @returns {Promise<string | null>} the token, or null for a wrong code */
  async function verify(phone, code) {
    if (isDemoBackend) return code === demoCode ? 'demo' : null
    const { verifyPhoneCode } = await import('@/data/api/public')
    try {
      return (await verifyPhoneCode(phone, code)).token
    } catch (e) {
      if (e?.status === 422) return null
      throw e
    }
  }

  return { resendIn, shown, send, verify }
}
