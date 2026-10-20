import type { Engine } from '../../types/fleet'
import { FleetDb } from '../db/fleet-db'

// mod 自身が専用 tool から fleet の DB に書くときだけ、permission の判定に許可を返す。許可しないなら undefined（判定は engine に任せる）
// auto mode の classifier はターンの依頼から書き込みを裏付けるので、ほかのセッションの連絡で始まったターンでは判定が付かず止まるため
export const allowOwnWrite = async (engine: Engine, input: unknown, origin: string, plugin: string) => {
  const call = (input ?? {}) as { action?: unknown; url?: unknown }
  if (origin !== plugin || typeof call.action !== 'string' || FleetDb.isRead(call.action)) return undefined
  const session = await engine.fleet()
  return session !== undefined && FleetDb.isSameArtifact(call.url, session.url)
    ? { decision: 'allow' as const, reason: 'fleet の専用 tool による fleet の DB への書き込み' }
    : undefined
}
