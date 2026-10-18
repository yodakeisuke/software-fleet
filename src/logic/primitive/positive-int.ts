import type { PositiveInt as Count, Result as Data } from '../../engine-protocol'
import { Result } from './result'

// --- public interface
export const PositiveInt = {
  of: (value: number) => of(value),
}

// --- business rules
// 1 以上の整数だけ通す
const of = (value: number) => Result.given<Data<Count, string>>(Number.isInteger(value) && value > 0 ? { ok: true, value: value as Count } : { ok: false, error: `not a positive int: ${value}` })
