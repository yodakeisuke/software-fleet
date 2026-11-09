import type { Engine } from '../../types/fleet'
import { FleetDb } from '../db/fleet-db'

// mod 自身が専用 tool から fleet の DB を読み書きするときだけ、permission の判定に許可を返す。許可しないなら undefined（判定は engine に任せる）
// auto mode の classifier はほかのセッションの連絡で始まったターンの書き込みを裏付けられず、新しいコメントの通知で始まったターン（ユーザの回答が flagship に届く道）では engine が DB の読み取りにも確認を求める（常に許可が効かない）ため
export const allowOwnDb = async (engine: Engine, input: unknown, origin: string, plugin: string) => {
  const call = (input ?? {}) as { url?: unknown }
  if (origin !== plugin) return undefined
  const session = await engine.fleet()
  return session !== undefined && FleetDb.isSameArtifact(call.url, session.url)
    ? { decision: 'allow' as const, reason: 'fleet の専用 tool による fleet の DB の読み書き' }
    : undefined
}
