import type { DocumentChange, Section } from '../../types/fleet'
import { Result } from './result'

// --- public interface
export const ReaderDocument = {
  revise: (current: readonly Section[], changes: readonly DocumentChange[]) => revise(current, changes),
}

// --- operations
const revise = (current: readonly Section[], changes: readonly DocumentChange[]) =>
  verdict(changes.reduce(applied, { list: [...current], missing: [] as string[] }), current)

// --- business rules
// 章は今の見出しで指す。指した章がなければ、見つからなかったものに残す
const edited = (draft: { list: Section[]; missing: string[] }, which: string, splice: { offset: number; removed: number; sections: Section[] }) => {
  const at = draft.list.findIndex(s => s.heading === which)
  return at < 0 ? { ...draft, missing: [...draft.missing, which] } : { ...draft, list: draft.list.toSpliced(at + splice.offset, splice.removed, ...splice.sections) }
}
// 足すは指定の章の次か末尾に、直すはその場で差し替え、消すは取り除く
const applied = (draft: { list: Section[]; missing: string[] }, change: DocumentChange) => {
  if (change.op === 'remove') return edited(draft, change.which, { offset: 0, removed: 1, sections: [] })
  if (change.op === 'replace') return edited(draft, change.which, { offset: 0, removed: 1, sections: [change.to] })
  return change.after === undefined ? { ...draft, list: [...draft.list, change.to] } : edited(draft, change.after, { offset: 1, removed: 0, sections: [change.to] })
}
// 問題が 1 つでもあれば何も変えずに、全部を 1 つの文にして失敗にする
const verdict = (draft: { list: Section[]; missing: string[] }, before: readonly Section[]) =>
  Result.checked(draft.list, [...missing(draft.missing, before), ...duplicated(draft.list), ...misshapen(draft.list)])
// 指した章がない。今の見出しを忘れた LLM が呼び直せるよう、今ある見出しを全部挙げる
const missing = (which: string[], before: readonly Section[]) =>
  (which.length === 0 ? [] : [`見つからない: ${which.join('、')}。今ある章: ${before.length === 0 ? 'なし' : before.map(s => s.heading).join('、')}`])
// 章は見出しで指すので、同じ見出しは 1 つだけ
const duplicated = (list: Section[]) => list.filter((s, at) => list.findIndex(other => other.heading === s.heading) !== at).map(s => `章「${s.heading}」が重なっている`)
// 表の行は見出しと同じ列数
const misshapen = (list: Section[]) => list.flatMap(s => s.blocks.filter(b => b.kind === 'table' && b.rows.some(row => row.length !== b.head.length)).map(() => `章「${s.heading}」の表の列数がそろっていない`))
