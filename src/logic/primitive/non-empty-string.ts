import type { NonEmptyString as Text, Result as Data } from '../../types/fleet'
import { Result } from './result'

// --- public interface
export const NonEmptyString = {
  of: (text: string) => of(text),
}

// --- business rules
// 1 文字以上の文字列だけ通す
const of = (text: string) => Result.given<Data<Text, string>>(text.length > 0 ? { ok: true, value: text as Text } : { ok: false, error: 'empty string' })
