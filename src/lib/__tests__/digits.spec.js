import { expect, it } from 'vitest'
import { digitsOnly, toLatinDigits } from '../digits'
import { samePhone } from '../guestIdentity'

it('reads Arabic and Persian digits as Latin ones', () => {
  expect(toLatinDigits('٠٥٥١٢٣٤٥٦٧')).toBe('0551234567')
  expect(toLatinDigits('۰۵۵ ۱۲۳')).toBe('055 123')
  expect(toLatinDigits('رقم 05')).toBe('رقم 05')
})

it('keeps a phone typed on an Arabic keyboard instead of emptying it', () => {
  expect(digitsOnly('٠٥٠ ١٢٣ ٤٥٦٧')).toBe('0501234567')
  expect(digitsOnly(undefined)).toBe('')
})

it('knows the same number in either script', () => {
  expect(samePhone('٠٥٠١٢٣٤٥٦٧', '050 123 4567')).toBe(true)
})
