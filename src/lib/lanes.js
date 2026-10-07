/**
 * Side-by-side lanes for blocks on a time axis.
 *
 * Bookings in different rooms run at the same time; drawn full-width on one
 * column they covered each other. Each run of overlapping blocks shares the
 * column, split into as many lanes as the run needs at its busiest.
 *
 * Takes blocks with `top` and `height` (any unit) and returns them sorted by
 * `top`, each with `lane` (0-based) and `lanes` (lane count of its run).
 *
 * @template {{ top: number, height: number }} T
 * @param {T[]} blocks
 * @returns {(T & { lane: number, lanes: number })[]}
 */
export function assignLanes(blocks) {
  const sorted = blocks.map((b) => ({ ...b, lane: 0, lanes: 1 })).sort((a, b) => a.top - b.top)

  let run = []
  let runEnd = -Infinity
  let laneEnds = []
  const closeRun = () => run.forEach((b) => (b.lanes = laneEnds.length))

  for (const b of sorted) {
    if (b.top >= runEnd) {
      closeRun()
      run = []
      laneEnds = []
      runEnd = -Infinity
    }
    let lane = laneEnds.findIndex((end) => end <= b.top)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = b.top + b.height
    b.lane = lane
    run.push(b)
    runEnd = Math.max(runEnd, b.top + b.height)
  }
  closeRun()
  return sorted
}
