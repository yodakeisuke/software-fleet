import type { Links as LinksDoc } from '../../types/fleet'
import { Result } from './result'

// --- public interface
export const Links = {
  of: (links: LinksDoc) => of(links),
  limits: () => limits(),
}

// --- operations
const of = (links: LinksDoc) => Result.checked(links, long(links))

// --- business rules
// ボタンの文言はスマホの幅に収まる 20 文字まで（ask の選択肢と同じ）
const limits = () => ({ label: 20 })
// 文言が長すぎる（文字数はコードポイントで数える）
const long = (links: LinksDoc) => links.links.flatMap((link, index) =>
  ([...link.label].length > limits().label ? [`links[${index}].label は ${limits().label} 文字まで（今 ${[...link.label].length} 文字）`] : []))
