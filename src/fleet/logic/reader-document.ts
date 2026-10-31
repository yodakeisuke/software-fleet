import type { Block, DocumentChange, DocumentName, ReaderDocument as ReaderDocumentDoc, Result as Data, ReviseDocument, Role, Section } from '../../types/fleet'
import { Result } from './result'

// --- public interface
export const ReaderDocument = {
  names: () => names(),
  revise: (role: Role | undefined, current: ReaderDocumentDoc | undefined, input: ReviseDocument) => revise(role, current, input),
}

// --- operations
const revise = (role: Role | undefined, current: ReaderDocumentDoc | undefined, input: ReviseDocument) =>
  verdict(titled(input.title, current, input.changes.reduce(applied, drafted(current))), role, input.document)

// --- business rules
// 文書と、それを書く ship
const owners = (): Record<DocumentName, Role> => ({ guide: 'cs', decisionLog: 'cs', operationsDesign: 'ops' })
// 文書の名前は持ち主の表にあるものだけ
const names = () => Object.keys(owners()) as DocumentName[]
// まだない文書は章なしから始める
const sectionsOf = (current: ReaderDocumentDoc | undefined) => current?.sections ?? []
// 今の章から直し始める
const drafted = (current: ReaderDocumentDoc | undefined) => ({ list: [...sectionsOf(current)], missing: [] as string[] })
// 題は渡したときだけ変わる
const titled = (title: string | undefined, current: ReaderDocumentDoc | undefined, draft: { list: Section[]; missing: string[] }) => {
  const kept = title ?? current?.title
  return { draft, before: sectionsOf(current), doc: { ...(kept === undefined ? {} : { title: kept }), sections: draft.list } }
}
// 章は今の見出しで指す。指した章がなければ、見つからなかったものに残す
const edited = (draft: { list: Section[]; missing: string[] }, heading: string, splice: { offset: number; removed: number; sections: Section[] }) => {
  const at = draft.list.findIndex(s => s.heading === heading)
  return at < 0 ? { ...draft, missing: [...draft.missing, heading] } : { ...draft, list: draft.list.toSpliced(at + splice.offset, splice.removed, ...splice.sections) }
}
// 足すは指定の章の次か末尾に、直すはその場で差し替え、消すは取り除く
const applied = (draft: { list: Section[]; missing: string[] }, change: DocumentChange) => {
  if (change.op === 'remove') return edited(draft, change.heading, { offset: 0, removed: 1, sections: [] })
  if (change.op === 'replace') return edited(draft, change.heading, { offset: 0, removed: 1, sections: [change.section] })
  return change.after === undefined ? { ...draft, list: [...draft.list, change.section] } : edited(draft, change.after, { offset: 1, removed: 0, sections: [change.section] })
}
// 問題が 1 つでもあれば何も変えずに、全部を 1 つの文にして失敗にする
const verdict = ({ draft, doc, before }: { draft: { list: Section[]; missing: string[] }; doc: ReaderDocumentDoc; before: readonly Section[] }, role: Role | undefined, document: DocumentName) => {
  const found = [...notOwner(role, document), ...missing(draft.missing, before), ...duplicated(draft.list), ...empty(draft.list), ...broken(draft.list)]
  return Result.given<Data<ReaderDocumentDoc, string>>(found.length === 0 ? { ok: true, value: doc } : { ok: false, error: found.join(' / ') })
}
// 文書を書けるのは、その持ち主だけ
const notOwner = (role: Role | undefined, document: DocumentName) => (owners()[document] === role ? [] : [`${document} を書けるのは ${owners()[document]} だけ`])
// 指した章がない。今の見出しを忘れた LLM が呼び直せるよう、今ある見出しを全部挙げる
const missing = (headings: string[], before: readonly Section[]) =>
  (headings.length === 0 ? [] : [`見つからない: ${headings.join('、')}。今ある章: ${before.length === 0 ? 'なし' : before.map(s => s.heading).join('、')}`])
// 章は見出しで指すので、同じ見出しは 1 つだけ
const duplicated = (list: Section[]) => list.filter((s, at) => list.findIndex(other => other.heading === s.heading) !== at).map(s => `章「${s.heading}」が重なっている`)
// 中身のない章は読み手に何も伝えない
const empty = (list: Section[]) => list.filter(s => s.blocks.length === 0).map(s => `章「${s.heading}」に中身がない`)
// 部品は描ける形でなければならない
const broken = (list: Section[]) => list.flatMap(s => s.blocks.flatMap(b => brokenBlock(s.heading, b)))
// 表の行は見出しと同じ列数。SVG は viewBox があれば幅に合わせて縮められる
const brokenBlock = (heading: string, block: Block) => {
  if (block.kind === 'table') return block.rows.some(row => row.length !== block.head.length) ? [`章「${heading}」の表の列数がそろっていない`] : []
  if (block.kind === 'svg') return /^\s*<svg\b[^>]*\bviewBox=(?:(?!<\/svg>)[\s\S])*<\/svg>\s*$/.test(block.svg) ? [] : [`章「${heading}」の svg は viewBox のある <svg>…</svg> だけにする`]
  return []
}
