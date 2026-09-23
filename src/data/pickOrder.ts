import type { TeamSide } from '../store/draftStore'

/** Classic MLBB / MPL pick cadence: 1 → 2 → 2 → 2 → 2 → 1 */
export const PICK_BLOCKS = [
  { who: 'first' as const, count: 1 },
  { who: 'second' as const, count: 2 },
  { who: 'first' as const, count: 2 },
  { who: 'second' as const, count: 2 },
  { who: 'first' as const, count: 2 },
  { who: 'second' as const, count: 1 },
]

export type PickTarget = {
  side: TeamSide
  slot: number
  /** Which pick-block in the sequence (0..5) */
  blockIndex: number
  /** 0-based index inside that block */
  indexInBlock: number
  blockSize: number
  /** Global 0..9 pick number */
  orderIndex: number
}

export function oppositeSide(side: TeamSide): TeamSide {
  return side === 'blue' ? 'red' : 'blue'
}

export function buildPickQueue(firstPickSide: TeamSide): PickTarget[] {
  const second = oppositeSide(firstPickSide)
  const used = { blue: 0, red: 0 }
  const queue: PickTarget[] = []
  let orderIndex = 0

  PICK_BLOCKS.forEach((block, blockIndex) => {
    const side = block.who === 'first' ? firstPickSide : second
    for (let i = 0; i < block.count; i++) {
      queue.push({
        side,
        slot: used[side],
        blockIndex,
        indexInBlock: i,
        blockSize: block.count,
        orderIndex,
      })
      used[side] += 1
      orderIndex += 1
    }
  })

  return queue
}

export function describePickBlock(target: PickTarget | undefined, tag: string): string {
  if (!target) return 'DRAFT COMPLETE'
  if (target.blockSize === 1) return `${tag} PICK`
  return `${tag} PICK ${target.indexInBlock + 1}/${target.blockSize}`
}

export function getBlockTargets(
  queue: PickTarget[],
  pickOrderIndex: number,
): PickTarget[] {
  const cur = queue[pickOrderIndex]
  if (!cur) return []
  return queue.filter((t) => t.blockIndex === cur.blockIndex)
}
