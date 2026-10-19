import type { Remaining as RemainingDoc, Result as Data } from '../../../types/fleet'
import { Result } from '../../../fleet/logic/result'

// --- public interface
export const Remaining = {
  of: (remaining: RemainingDoc) => of(remaining),
  limits: () => limits(),
}

// --- operations
const of = (remaining: RemainingDoc) => verdict(remaining, [...count(remaining)])

// --- business rules
// 残りは大きな塊で見せる。スマホで一目に収まるのは 7 件まで
const limits = () => ({ chunks: 7 })
// 問題がなければ通し、あれば全部を 1 つの文にして失敗にする
const verdict = (remaining: RemainingDoc, found: string[]) => Result.given<Data<RemainingDoc, string>>(found.length === 0 ? { ok: true, value: remaining } : { ok: false, error: found.join(' / ') })
// 塊が多すぎる（細かい作業に割りすぎている）
const count = (remaining: RemainingDoc) => (remaining.chunks.length > limits().chunks
  ? [`chunks は ${limits().chunks} 件まで（今 ${remaining.chunks.length} 件）。細かい作業は大きな塊にまとめる`] : [])
