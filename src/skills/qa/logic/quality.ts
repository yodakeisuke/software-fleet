import type { Behavior, CaseRef, Quality as QualityDoc, QualityInput, Requirement, Verdict } from '../../../types/fleet'
import { Result } from '../../../fleet/logic/result'

// --- public interface
export const Quality = {
  revise: (current: QualityDoc, input: QualityInput, context: Context) => revise(current, input, context),
  cases: (requirements: readonly Requirement[], behavior: Behavior | undefined) => cases(requirements, behavior),
}

// --- I/O
type Context = { cases: readonly CaseRef[]; now: string } // 書くときの前提: 今あるケースと、今の時刻

// --- operations
const revise = (current: QualityDoc, input: QualityInput, context: Context) => verdict(applied(current, input, context.now), input, context.cases)

// --- business rules
// ケースは持ち主の ship の成果物にあるテストそのもの
const cases = (requirements: readonly Requirement[], behavior: Behavior | undefined): CaseRef[] => [...requirementCases(requirements), ...behaviorCases(behavior)]
// requirement のケースは、要求の 1 文とテストの act で指す
const requirementCases = (requirements: readonly Requirement[]) => requirements.flatMap(r => r.tests.map(t => ({ ship: 'requirement' as const, of: `${r.who}、${r.can}`, name: t.act })))
// behavior のケースは、本流と別の流れのコマンド、リードモデルの例で、持ち主の名前と例の名前で指す
const behaviorCases = (behavior: Behavior | undefined) => {
  const { moments = [], flows = [], readModels = [] } = behavior ?? {}
  const owners: { of: string; tests: { name: string }[] }[] = [
    ...[...moments, ...flows.flatMap(flow => flow.moments)].map(m => ({ of: m.command.name, tests: m.tests })),
    ...readModels.map(r => ({ of: r.name, tests: r.tests })),
  ]
  return owners.flatMap(({ of, tests }) => tests.map(t => ({ ship: 'behavior' as const, of, name: t.name })))
}
// 結果・発見・探索は、渡した分だけ鍵で上書きする。結果には書いた時刻を付ける
const applied = (current: QualityDoc, input: QualityInput, now: string) => withVerdict({
  checks: upsert(current.checks, (input.checks ?? []).map(check => ({ ...check, at: now })), same),
  findings: upsert(current.findings, input.findings ?? [], (a, b) => a.title === b.title),
  charters: upsert(current.charters, input.charters ?? [], (a, b) => a.aim === b.aim),
}, judged(current.verdict, input.verdict, now))
// 判定は渡せば丸ごと置き換えて時刻を付け、渡さなければ今のまま
const judged = (current: Verdict | undefined, given: QualityInput['verdict'], now: string) => (given === undefined ? current : { ...given, at: now })
// 判定がまだなければ、文書に判定を持たない
const withVerdict = (doc: QualityDoc, judgement: Verdict | undefined): QualityDoc => (judgement === undefined ? doc : { ...doc, verdict: judgement })
// ケースは ship・持ち主・名前の組で指す
const same = (a: CaseRef, b: CaseRef) => a.ship === b.ship && a.of === b.of && a.name === b.name
// 鍵が同じものは差し替え、新しいものは末尾に足す
const upsert = <T>(list: readonly T[], given: readonly T[], key: (a: T, b: T) => boolean) =>
  given.reduce((acc, item) => (acc.some(old => key(old, item)) ? acc.map(old => (key(old, item) ? item : old)) : [...acc, item]), [...list])
// 問題が 1 つでもあれば何も書かずに、全部を 1 つの文にして失敗にする
const verdict = (next: QualityDoc, input: QualityInput, all: readonly CaseRef[]) =>
  Result.checked(next, [...(input.checks ?? []).flatMap(check => missing(check, all)), ...premature(next, input, all)])
// 結果は今あるケースにだけ付ける。見つからなければ、呼び直せるよう近くのケースを挙げる
const missing = (check: CaseRef, all: readonly CaseRef[]) => {
  if (all.some(c => same(c, check))) return []
  const siblings = all.filter(c => c.ship === check.ship && c.of === check.of).map(c => c.name)
  if (siblings.length > 0) return [`${check.ship}「${check.of}」にケース「${check.name}」はない。あるのは: ${siblings.join('、')}`]
  return [`${check.ship} に「${check.of}」はない。あるのは: ${[...new Set(all.filter(c => c.ship === check.ship).map(c => c.of))].join('、') || 'なし'}`]
}
// 「可」は、今あるケースが全部合格で、未解決の発見がないときだけ
const premature = (quality: QualityDoc, input: QualityInput, all: readonly CaseRef[]) => (input.verdict?.merge === '可' ? [...unpassed(quality, all), ...unresolved(quality)] : [])
// 合格していないケース。結果がなければ未実行
const unpassed = (quality: QualityDoc, all: readonly CaseRef[]) => {
  const names = all.map(c => ({ c, outcome: outcomeOf(quality, c) })).filter(({ outcome }) => outcome !== '合格').map(({ c, outcome }) => `「${c.name}」(${outcome})`)
  return names.length === 0 ? [] : [`合格していないケースがあるので「可」にできない: ${names.join('、')}`]
}
// ケースの今の結果
const outcomeOf = (quality: QualityDoc, c: CaseRef) => quality.checks.find(check => same(check, c))?.outcome ?? '未実行'
// 片づいていない発見
const unresolved = (quality: QualityDoc) => {
  const titles = quality.findings.filter(f => f.state === '未解決').map(f => `「${f.title}」`)
  return titles.length === 0 ? [] : [`未解決の発見があるので「可」にできない: ${titles.join('、')}`]
}
