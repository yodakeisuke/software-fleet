import type { DbPaths, Engine, Result as Data, ToolReply } from '../types/fleet'
import { Result } from './logic/result'

// fleet の DB（claude.ai の artifact の DB を ArtifactData で読み書きする）。文書の置き場所はここが唯一の定義で、ページには DB の fleet/db-paths 経由で渡す
export const FleetDb = {
  paths: () => paths,
  put: (engine: Engine, path: string, data: object, done: string) => put(engine, path, data, done),
  revise: (engine: Engine, path: string, next: Next, done: string) => revise(engine, path, next, done),
  create: (engine: Engine, path: string, data: object, done: string) => create(engine, path, data, done),
  read: (engine: Engine, path: string) => read(engine, path),
  urlOf: (text: string) => urlOf(text),
  isFleet: (url: unknown, fleetUrl: string) => isFleet(url, fleetUrl),
  isSameArtifact: (url: unknown, fleetUrl: string) => isSameArtifact(url, fleetUrl),
  isRead: (action: string) => isRead(action),
  stored: (text: string) => stored(text),
}

// 文書の置き場所。1 つの文書は "collection/id"、それ以外は collection
const paths: DbPaths = {
  brief: 'fleet/flagship',
  ships: 'fleet',
  asks: 'fleet/flagship/asks',
  decisions: 'fleet/flagship/decisions',
  answers: 'fleet/user/answers',
  reviews: 'fleet/user/reviews',
  // ship の成果物は fleet/<ship>/deliverables/<名前>
  requirements: 'fleet/requirement/deliverables/requirements',
  self: 'fleet/db-paths',
}
// "collection/id" を、collection と文書 id に分ける
const split = (path: string) => ({ collection: path.slice(0, path.lastIndexOf('/')), doc_id: path.slice(path.lastIndexOf('/') + 1) })
// 書けなかった理由
const refused = (reply: { text?: string; deny?: string }, path: string): ToolReply => ({ deny: reply.deny ?? reply.text ?? `${path} を書けなかった` })

// 今の中身（なければ undefined）から、新しい中身を作る。作れなければ理由
type Next = (data: Record<string, unknown> | undefined) => { either: <R>(onOk: (value: object) => R, onError: (error: string) => R) => R }

// 文書を 1 つ書く。今の版を読んでから、その版に固定して書く（古い版への書き込みは DB が拒む）
const put = (engine: Engine, path: string, data: object, done: string) => revise(engine, path, () => Result.given<Data<object, string>>({ ok: true, value: data }), done)

// 文書を 1 つ読み、その中身から新しい中身を作って、読んだ版に固定して書く。間に別の書き込みがあれば DB が拒み、何も書かない
const revise = async (engine: Engine, path: string, next: Next, done: string): Promise<ToolReply> => {
  const session = await engine.fleet()
  if (session === undefined) return { deny: 'このセッションは fleet に乗っていない' }
  const got = await engine.db(session.url, { action: 'get', ...split(path) })
  if (got.isError === true) return { deny: got.text ?? `${path} を読めなかった` }
  const doc = (await stored(got.text ?? '')).either(found => found, () => undefined)
  return next(doc?.data).either(async data => {
    const wrote = await engine.db(session.url, { action: 'set', ...split(path), data, ...(doc === undefined ? {} : { if_version: doc.version }) })
    return wrote.isError === true || wrote.deny !== undefined ? refused(wrote, path) : { result: done }
  }, async error => ({ deny: error }))
}

// 新しい文書を 1 つ書く。id は時刻から作るので、まだない
const create = async (engine: Engine, path: string, data: object, done: string): Promise<ToolReply> => {
  const session = await engine.fleet()
  if (session === undefined) return { deny: 'このセッションは fleet に乗っていない' }
  const wrote = await engine.db(session.url, { action: 'set', ...split(path), data })
  return wrote.isError === true || wrote.deny !== undefined ? refused(wrote, path) : { result: done }
}

// 文書を 1 つ読む。なければ undefined
const read = async (engine: Engine, path: string) => {
  const session = await engine.fleet()
  const got = session && (await engine.db(session.url, { action: 'get', ...split(path) }))
  return (await stored(got?.text ?? '')).either(doc => doc?.data, () => undefined)
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
// 宛先が fleet の artifact そのものかを id で比べる。id が取れない宛先は違うとみなす（許す側で使うので、止める側の isFleet とは逆に倒す）
const isSameArtifact = (url: unknown, fleetUrl: string) => {
  const id = idOf(url)
  return id !== undefined && id === idOf(fleetUrl)
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
