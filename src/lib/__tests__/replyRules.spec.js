import { describe, expect, it } from 'vitest'
import { understandReply } from '../replyRules'

// Tuesday 5 March 2030, 10:00 local time.
const NOW = new Date(2030, 2, 5, 10, 0)
const read = (text, ctx = {}) => understandReply(text, { now: NOW, ...ctx })
const H = 60

describe('understandReply — moving an appointment', () => {
  it.each([
    ['ممكن أغير الموعد لبكرة؟', { intent: 'reschedule', day: '2030-03-06' }],
    ['خلّيها بعد بكرة', { intent: 'reschedule', day: '2030-03-07' }],
    ['خلّيها الخميس العصر', { intent: 'reschedule', day: '2030-03-07', window: [15 * H, 18 * H] }],
    ['الخميس العصر', { intent: 'reschedule', day: '2030-03-07', window: [15 * H, 18 * H] }],
    ['أجّلها للسبت الصبح', { intent: 'reschedule', day: '2030-03-09', window: [9 * H, 12 * H] }],
    ['بكرة الساعة 5', { intent: 'reschedule', day: '2030-03-06', time: 17 * H }],
    [
      'بكرة ٤:٣٠ العصر',
      { intent: 'reschedule', day: '2030-03-06', window: [15 * H, 18 * H], time: 16 * H + 30 },
    ],
    ['الساعة 10 ص', { intent: 'reschedule', time: 10 * H }],
    ['لا، خلّيها بكرة', { intent: 'reschedule', day: '2030-03-06' }],
    ['بدي وقت ثاني', { intent: 'reschedule' }],
  ])('%s', (text, expected) => {
    expect(read(text)).toEqual(expected)
  })

  it("reads today's own weekday as next week", () => {
    expect(read('خلّيها الثلاثاء').day).toBe('2030-03-12')
  })
})

describe('understandReply — answering an offer', () => {
  it('reads a number as a choice while an offer is open', () => {
    expect(read('2', { offered: 3 })).toEqual({ intent: 'choose', option: 2 })
    expect(read('٣', { offered: 3 })).toEqual({ intent: 'choose', option: 3 })
  })

  it('reads the same number as cancel when no offer is open', () => {
    expect(read('2').intent).toBe('cancel')
  })

  it('does not take a number beyond the offer as a choice', () => {
    expect(read('4', { offered: 3 }).intent).not.toBe('choose')
  })
})

describe('understandReply — the rest is unchanged', () => {
  it.each([
    ['1', 'confirm'],
    ['أكيد جاي', 'confirm'],
    ['ما بقدر اجي', 'cancel'],
    ['بتأخر ربع ساعة', 'late'],
    ['مين معي؟', 'unknown'],
    ['10 دقائق', 'unknown'],
  ])('%s → %s', (text, intent) => {
    expect(read(text).intent).toBe(intent)
  })
})
