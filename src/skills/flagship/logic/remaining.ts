import type { Remaining as RemainingDoc } from '../../../types/fleet'
import { Result } from '../../../fleet/logic/result'

// --- public interface
export const Remaining = {
  of: (remaining: RemainingDoc) => of(remaining),
  limits: () => limits(),
}

// --- operations
const of = (remaining: RemainingDoc) => Result.checked(remaining, count(remaining))

// --- business rules
// 残りは大きな塊で見せる。スマホで一目に収まるのは 7 件まで
const limits = () => ({ chunks: 7 })
// 塊が多すぎる（細かい作業に割りすぎている）
const count = (remaining: RemainingDoc) => (remaining.chunks.length > limits().chunks
  ? [`chunks は ${limits().chunks} 件まで（今 ${remaining.chunks.length} 件）。細かい作業は大きな塊にまとめる`] : [])
