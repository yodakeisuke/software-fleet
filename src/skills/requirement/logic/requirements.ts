import type { Requirement, RequirementChange, RequirementKind, Which } from '../../../types/fleet'
import { Result } from '../../../fleet/logic/result'

// --- public interface
export const Requirements = {
  revise: (current: readonly Requirement[], changes: readonly RequirementChange[]) => revise(current, changes),
  kinds: () => kinds(),
}

// --- operations
const revise = (current: readonly Requirement[], changes: readonly RequirementChange[]) =>
  verdict(changes.reduce(applied, { list: [...current], missing: [] as Which[] }), current)

// --- business rules
// 区分はこの 6 つで、この順に並べる（IPA 非機能要求グレードの大項目から「システム環境・エコロジー」を除いたもの）
const kinds = (): readonly RequirementKind[] => ['機能', 'セキュリティ', '性能', '可用性', '運用・監視', '移行']
// 要求は「誰が」と「何をできる」の組で指す
const same = (a: Which, b: Which) => a.who === b.who && a.can === b.can
// 足すは末尾に、直すはその場で差し替え、消すは取り除く。指した要求がなければ、見つからなかったものに残す
const applied = (draft: { list: Requirement[]; missing: Which[] }, change: RequirementChange) => {
  if (change.op === 'add') return { ...draft, list: [...draft.list, change.to] }
  const found = draft.list.some(r => same(r, change.which))
  if (!found) return { ...draft, missing: [...draft.missing, change.which] }
  const to = change.op === 'replace' ? [change.to] : []
  return { ...draft, list: draft.list.flatMap(r => (same(r, change.which) ? to : [r])) }
}
// 問題が 1 つでもあれば何も変えずに、全部を 1 つの文にして失敗にする。なければ区分の順に並べて通す
const verdict = (draft: { list: Requirement[]; missing: Which[] }, before: readonly Requirement[]) =>
  Result.checked(draft.list, [...missing(draft.missing, before), ...duplicated(draft.list), ...untested(draft.list)]).and(sorted)
// 指した要求がない。今の文を忘れた LLM が呼び直せるよう、今ある要求を全部挙げる
const missing = (which: Which[], before: readonly Requirement[]) =>
  which.length === 0 ? [] : [`見つからない: ${which.map(quoted).join('、')}。今ある要求: ${before.length === 0 ? 'なし' : before.map(quoted).join('、')}`]
// 同じ「誰が」と「何をできる」の要求は 1 つだけ（それが鍵なので）
const duplicated = (list: Requirement[]) => list.filter((r, at) => list.findIndex(other => same(other, r)) !== at).map(r => `${quoted(r)} が重なっている`)
// 要求には裏返しのテストが 1 件以上ある
const untested = (list: Requirement[]) => list.filter(r => r.tests.length === 0).map(r => `${quoted(r)} にテストがない`)
// 区分の順に並べる。区分の中は足した順のまま
const sorted = (list: Requirement[]) => [...list].sort((a, b) => kinds().indexOf(a.kind) - kinds().indexOf(b.kind))
// 要求を、ページと同じ 1 文で引く
const quoted = (r: Which) => `「${r.who}、${r.can}」`
