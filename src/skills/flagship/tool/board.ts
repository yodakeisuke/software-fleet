import type { MatchedHook } from 'claude-code'
import { FleetDb } from '../../../logic/fleet-db/fleet-db'
import { Ship } from '../../../logic/ship/ship'
import { Status } from '../../../logic/status/status'

const fleet = { plugin: 'software-fleet', key: 'fleet' } as const


// ship の合図: Skill software-fleet:<ship> が artifact の URL 付きで呼ばれたら、そのセッションをその ship にし、report_status を出す
export const board: MatchedHook<'tool.call', { tool: 'Skill' }> = async ($, e, next) => {
  const boarding = Ship.of(e.skill).and(role => FleetDb.urlOf(e.args ?? '').and(url => ({ url, role })))
  await boarding.either(async session => {
    await $.state.set(fleet, session)
    await $.tool.register({ name: 'report_status', description: 'この ship の今をダッシュボードに出す。状態が変わるたびに呼ぶ', inputSchema: Status.schema(), isDeferred: false })
  }, async () => undefined)
  return next(e)
}
