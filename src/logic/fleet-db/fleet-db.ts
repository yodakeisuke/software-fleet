import type { Result as Data } from '../../engine-protocol'
import { Result } from '../primitive/result'

// --- public interface
export const FleetDb = {
  urlOf: (text: string) => urlOf(text),
  isFleet: (url: unknown, fleetUrl: string) => isFleet(url, fleetUrl),
  isWrite: (action: string) => isWrite(action),
  stored: (text: string) => stored(text),
}

// --- business rules
// fleet の DB は claude.ai の artifact の URL で指す。文の中の最初の URL を取る
const urlOf = (text: string) => {
  const url = /https:\/\/claude\.ai\/(code\/)?artifact\/[\w-]+/.exec(text)?.[0]
  return Result.given<Data<string, string>>(url ? { ok: true, value: url } : { ok: false, error: `artifact の URL がない: ${text.slice(0, 200)}` })
}
// 同じ artifact かどうかは、URL の最後の区切り（artifact の id）で比べる。末尾の / や ? # の違いは同じとみなす
const isFleet = (url: unknown, fleetUrl: string) => typeof url === 'string' && idOf(url) === idOf(fleetUrl)
// URL の最後の区切り
const idOf = (url: string) => url.split(/[?#]/)[0]?.replace(/\/+$/, '').split('/').at(-1)
// 書き込みの action（読むのは止めない）
const isWrite = (action: string) => ['set', 'update', 'delete', 'str_replace', 'batch'].includes(action)
// ArtifactData の get の結果の文から、文書の版と中身を取り出す。文書がなければ undefined
const stored = (text: string) => Result.given(Promise.resolve(text).then(parse))
// 結果の文は、文書 1 つを 1 行の JSON で書く
const parse = (text: string) => {
  const line = text.split('\n').find(row => row.startsWith('{"id":'))
  return line === undefined ? undefined : (JSON.parse(line) as { version: number; data: Record<string, unknown> })
}
