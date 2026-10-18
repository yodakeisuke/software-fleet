import type { MatchedHook } from 'claude-code'
import { FleetDb } from '../../../logic/fleet-db/fleet-db'

const fleet = { plugin: 'software-fleet', key: 'fleet' } as const


// LLM が生の ArtifactData で fleet の DB に書くことを拒む。mod 自身の書き込み（origin が plugin 名）と読み取り、他の artifact は通す
export const guard: MatchedHook<'tool.call', { tool: 'ArtifactData' }> = async ($, e, next) => {
  if (next.origin.plugin !== 'engine' || !FleetDb.isWrite(e.action)) return next(e)
  const { value: session } = await $.state.get(fleet)
  return session !== undefined && FleetDb.isFleet(e.url, session.url)
    ? { deny: 'fleet の DB は専用の tool（set_brief / ask_user / record_decision / report_status）で書く。生の ArtifactData では書かない' }
    : next(e)
}
