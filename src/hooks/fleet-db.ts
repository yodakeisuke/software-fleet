import type { Result as Data } from '../types/fleet'
import { Result } from '../logic/primitive/result'

// claude.ai の artifact と、その DB を扱う ArtifactData tool の約束事
export const ArtifactDb = {
  urlOf: (text: string) => urlOf(text),
  isFleet: (url: unknown, fleetUrl: string) => isFleet(url, fleetUrl),
  isRead: (action: string) => isRead(action),
  stored: (text: string) => stored(text),
}

// 文の中の最初の artifact の URL を取る
const urlOf = (text: string) => {
  const url = /https:\/\/claude\.ai\/(code\/)?artifact\/[\w-]+/.exec(text)?.[0]
  return Result.given<Data<string, string>>(url ? { ok: true, value: url } : { ok: false, error: `artifact の URL がない: ${text.slice(0, 200)}` })
}
// fleet の artifact かどうかを id で比べる。id が取れない宛先は fleet とみなす（止める側に倒す）
const isFleet = (url: unknown, fleetUrl: string) => {
  const id = idOf(url)
  return id === undefined || id === idOf(fleetUrl)
}
// URL の pathname が /artifact/<id> か /code/artifact/<id> そのものなら id を取る。../ などを含む別の形は取らない（fleet とみなして止める）
const idOf = (url: unknown) => {
  const pathname = typeof url === 'string' ? /^https?:\/\/[^/?#]+(\/[^?#]*)/.exec(url)?.[1] : undefined
  return pathname === undefined ? undefined : /^\/(code\/)?artifact\/([\w-]+)\/?$/.exec(pathname)?.[2]
}
// 読み取りの action。これ以外（書き込みと、将来増える action）はすべて書き込みとみなす
const isRead = (action: string) => ['get', 'list', 'query', 'profiles'].includes(action)
// get の結果の文から、文書の版と中身を取り出す。文書がなければ undefined
const stored = (text: string) => Result.given(Promise.resolve(text).then(parse))
// 結果の文は、文書 1 つを 1 行の JSON で書く
const parse = (text: string) => {
  const line = text.split('\n').find(row => row.startsWith('{"id":'))
  return line === undefined ? undefined : (JSON.parse(line) as { version: number; data: Record<string, unknown> })
}
