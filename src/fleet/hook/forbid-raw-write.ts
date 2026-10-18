import type { Engine } from '../../types/fleet'
import { FleetDb } from '../fleet-db'

// LLM が生の ArtifactData で fleet の DB に書くことを拒む理由を返す。止めないなら undefined
// 読み取り以外の action はすべて書き込みとみなし、宛先の id が取れなければ fleet とみなす。mod 自身の書き込み（origin が plugin 名）と、他の artifact は通す
export const forbidRawWrite = async (engine: Engine, call: { action: string; url?: unknown }, origin: string) => {
  if (origin !== 'engine' || FleetDb.isRead(call.action)) return undefined
  const session = await engine.fleet()
  return session !== undefined && FleetDb.isFleet(call.url, session.url)
    ? 'fleet の DB は専用の tool（set_brief / ask_user / record_decision / report_status）で書く。生の ArtifactData では書かない'
    : undefined
}
