import type { NonEmptyList as List, Result as Data } from '../../types/fleet'
import { Result } from './result'

// --- public interface
export const NonEmptyList = {
  of: <T>(items: readonly T[]) => of(items),
}

// --- business rules
// 1 つ以上の要素を持つ配列だけ通す
const of = <T>(items: readonly T[]) => Result.given<Data<List<T>, string>>(items.length > 0 ? { ok: true, value: items as List<T> } : { ok: false, error: 'empty list' })
