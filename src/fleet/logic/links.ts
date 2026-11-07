import type { Links as LinksDoc, Result as Data } from '../../types/fleet'
import { Result } from './result'

// --- public interface
export const Links = {
  of: (links: LinksDoc) => of(links),
  limits: () => limits(),
}

// --- operations
const of = (links: LinksDoc) => verdict(links, [...long(links)])

// --- business rules
// ボタンの文言はスマホの幅に収まる 20 文字まで（ask の選択肢と同じ）
const limits = () => ({ label: 20 })
// 問題がなければ通し、あれば全部を 1 つの文にして失敗にする
const verdict = (links: LinksDoc, found: string[]) => Result.given<Data<LinksDoc, string>>(found.length === 0 ? { ok: true, value: links } : { ok: false, error: found.join(' / ') })
// 文言が長すぎる（文字数はコードポイントで数える）
const long = (links: LinksDoc) => links.links.flatMap((link, index) =>
  ([...link.label].length > limits().label ? [`links[${index}].label は ${limits().label} 文字まで（今 ${[...link.label].length} 文字）`] : []))
