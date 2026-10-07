import { describe, expect, it } from 'vitest'
import { assignLanes } from '../lanes'

const shape = (blocks) => assignLanes(blocks).map((b) => [b.id, b.lane, b.lanes])

describe('assignLanes', () => {
  it('gives blocks that do not overlap the full width', () => {
    expect(
      shape([
        { id: 'a', top: 0, height: 10 },
        { id: 'b', top: 10, height: 10 },
      ]),
    ).toEqual([
      ['a', 0, 1],
      ['b', 0, 1],
    ])
  })

  it('splits overlapping blocks into side-by-side lanes', () => {
    expect(
      shape([
        { id: 'b', top: 5, height: 20 },
        { id: 'a', top: 0, height: 10 },
      ]),
    ).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
    ])
  })

  it('reuses a lane once it frees up, and sizes the whole run alike', () => {
    // a and b overlap; c starts after a ends but while b is still running.
    expect(
      shape([
        { id: 'a', top: 0, height: 10 },
        { id: 'b', top: 5, height: 30 },
        { id: 'c', top: 12, height: 10 },
        { id: 'd', top: 50, height: 10 },
      ]),
    ).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 2],
      ['d', 0, 1],
    ])
  })
})
