import { describe, expect, it } from 'vitest'
import { hijriOf, nextRamadan } from '../hijri'

// Umm al-Qura, as published: Ramadan 1447 began 18 Feb 2026, 1448 on 8 Feb 2027.
describe('nextRamadan', () => {
  it('finds the coming Ramadan from before it', () => {
    const r = nextRamadan(new Date(2026, 9, 8))
    expect(r.startsOn).toBe('2027-02-08')
    expect(r.year).toBe(1448)
    expect(hijriOf(new Date(`${r.endsOn}T12:00:00`)).month).toBe(9)
  })

  it('returns the one in progress from inside it', () => {
    expect(nextRamadan(new Date(2026, 1, 25)).startsOn).toBe('2026-02-18')
  })

  it('lasts 29 or 30 days', () => {
    const r = nextRamadan(new Date(2026, 9, 8))
    const days = (new Date(r.endsOn) - new Date(r.startsOn)) / 86_400_000 + 1
    expect([29, 30]).toContain(days)
  })
})
