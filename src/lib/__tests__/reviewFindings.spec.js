import { describe, expect, it } from 'vitest'
import { understandReply } from '../replyRules'

// The code review's G2, on the client: the same word lists as RuleUnderstanding.php.
const NOW = new Date(2030, 2, 5, 10, 0)

describe('review G2: a reply that is not a cancel', () => {
  it.each([['ما راح اتأخر'], ['لا مشكلة، جاي']])('«%s» is not read as cancel', (text) => {
    expect(understandReply(text, { now: NOW }).intent).not.toBe('cancel')
  })
})
