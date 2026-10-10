import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { repository } from '@/data/repository'
import { digitsOnly } from '@/lib/digits'

/** Digits only, so "٠٥٠ ١٢٣ ٤٥٦٧", "050-123-4567" and "0501234567" all match. */
function normalisePhone(phone) {
  return digitsOnly(phone)
}

export const useCustomersStore = defineStore('customers', () => {
  const items = ref([])
  const isLoading = ref(false)
  const error = ref(null)
  const loaded = ref(false)

  async function load(force = false) {
    if (loaded.value && !force) return
    isLoading.value = true
    error.value = null
    try {
      items.value = await repository.loadCustomers()
      loaded.value = true
    } catch {
      error.value = 'تعذّر تحميل العملاء.'
    } finally {
      isLoading.value = false
    }
  }

  function byId(id) {
    return items.value.find((c) => c.id === id) ?? null
  }

  function byPhone(phone) {
    const n = normalisePhone(phone)
    return items.value.find((c) => normalisePhone(c.phone) === n) ?? null
  }

  const sorted = computed(() => [...items.value].sort((a, b) => a.name.localeCompare(b.name, 'ar')))

  function search(query) {
    const q = query.trim()
    if (!q) return sorted.value
    const digits = normalisePhone(q)
    return sorted.value.filter(
      (c) =>
        c.name.includes(q) ||
        (digits.length > 0 && normalisePhone(c.phone).includes(digits)) ||
        (c.email?.toLowerCase().includes(q.toLowerCase()) ?? false),
    )
  }

  /**
   * Returns the existing customer when the phone already exists — never duplicates.
   *
   * Awaits the save for a new customer: a booking written for them must not
   * reach the API before they do, or it is refused for an unknown customer.
   * @param {{ name: string, phone: string, email?: string }} input
   * @returns {Promise<import('@/types').Customer>}
   */
  async function upsert(input) {
    const existing = byPhone(input.phone)
    if (existing) return existing

    const customer = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: input.email?.trim() || undefined,
      createdAt: new Date().toISOString(),
    }
    items.value.push(customer)
    try {
      await repository.saveCustomers(items.value)
    } catch (e) {
      items.value = items.value.filter((c) => c.id !== customer.id)
      throw e
    }
    return customer
  }

  /** Back to nothing loaded — on sign-out, so the next operator never sees these. */
  function reset() {
    items.value = []
    error.value = null
    loaded.value = false
  }

  return { reset, items, isLoading, error, loaded, load, byId, byPhone, sorted, search, upsert }
})
