import type { Model } from '../../../types/fleet'

// --- public interface
export const Pointers = {
  files: (model: Model) => files(model),
  problems: (model: Model, sources: Sources) => problems(model, sources),
}

// --- I/O
// いまのコード: ファイル（プロジェクトのルートからのパス）→ 中身。読めなければ undefined
type Sources = Readonly<Record<string, string | undefined>>

// --- operations
const files = (model: Model) => [...new Set(pointers(model).map(pointer => pointer.file))].filter(file => file !== '')
const problems = (model: Model, sources: Sources) => pointers(model).flatMap(pointer => broken(pointer, sources))

// --- business rules
// 照合するのは code を言った型。削 は消した物なので、コードに無くてよい
const pointers = (model: Model) => model.types.flatMap(type => (type.code === undefined || type.change === '削' ? [] : [{ type: type.name, code: type.code, ...split(type.code) }]))
// code は「ファイル#名前」。最初の # で分ける（# が無ければファイルは空）
const split = (code: string) => ({ file: code.slice(0, Math.max(code.indexOf('#'), 0)), name: code.slice(code.indexOf('#') + 1) })
// 地図の実線は、いまのコードに在る物だけ: code の形が合い、ファイルが読めて、その中に名前が在る
const broken = (pointer: { type: string; code: string; file: string; name: string }, sources: Sources) => {
  if (pointer.file === '' || pointer.name === '') return [`型「${pointer.type}」の code「${pointer.code}」は「ファイル#名前」の形（例: src/order/state.ts#OrderState）`]
  const source = sources[pointer.file]
  if (source === undefined) return [`型「${pointer.type}」の code のファイル「${pointer.file}」が読めない（プロジェクトのルートからのパス）`]
  return present(source, pointer.name) ? [] : [`型「${pointer.type}」の code の名前「${pointer.name}」が ${pointer.file} に無い`]
}
// 名前は 1 語として在る（前後が識別子の字でない）。言語を問わず見られる範囲で、宣言かどうかまでは見ない
const present = (source: string, name: string) => new RegExp(`(?<![\\p{L}\\p{N}_$])${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![\\p{L}\\p{N}_$])`, 'u').test(source)
