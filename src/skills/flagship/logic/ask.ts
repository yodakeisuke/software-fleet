import type { Ask as AskDoc } from '../../../types/fleet'
import { Result } from '../../../fleet/logic/result'

// --- public interface
export const Ask = {
  of: (ask: AskDoc) => of(ask),
  limits: () => limits(),
}

// --- operations
const of = (ask: AskDoc) => Result.checked(ask, [...count(ask), ...duplicated(ask), ...unknownRecommended(ask), ...long(ask), ...misshapen(ask)])

// --- business rules
// スマホのドックに収まるのは、選択肢 2〜4 件、ボタンの文言と「選んだら何が起きるか」はそれぞれ 20 文字まで
const limits = () => ({ options: { min: 2, max: 4 }, label: 20, consequence: 20 })
// 選択肢の数が範囲の外
const count = (ask: AskDoc) => {
  const { min, max } = limits().options
  return ask.options.length < min || ask.options.length > max ? [`options は ${min}〜${max} 件（今 ${ask.options.length} 件）`] : []
}
// 選択肢の id が重なっている
const duplicated = (ask: AskDoc) => (new Set(ask.options.map(o => o.id)).size === ask.options.length ? [] : ['options の id が重なっている'])
// 推奨が選択肢のどれでもない
const unknownRecommended = (ask: AskDoc) => (ask.options.some(o => o.id === ask.recommended) ? [] : [`recommended（${ask.recommended}）が options の id のどれでもない`])
// ボタンの文言か「選んだら何が起きるか」が長すぎる（文字数はコードポイントで数える）
const long = (ask: AskDoc) => ask.options.flatMap((option, index) => (['label', 'consequence'] as const)
  .filter(key => [...option[key]].length > limits()[key])
  .map(key => `options[${index}].${key} は ${limits()[key]} 文字まで（今 ${[...option[key]].length} 文字）`))
// 評価表の行が選択肢の数と、各行のマスが評価軸の数と合っていない
const misshapen = (ask: AskDoc) => {
  const table = ask.evaluation
  const fits = !table || (table.cells.length === ask.options.length && table.cells.every(row => row.length === table.axes.length))
  return fits ? [] : ['evaluation.cells は options と同じ行数で、各行は axes と同じ数']
}
