import type { MatchedHook } from 'claude-code'
import { ArtifactDb } from './artifact-db'
import { Ship } from '../../../logic/ship/ship'
import { reportStatusTool } from './tools'

const fleet = { plugin: 'software-fleet', key: 'fleet' } as const

// ship の合図: Skill software-fleet:<ship> が artifact の URL 付きで呼ばれたら、そのセッションをその ship にし、report_status を出す
// すでに fleet に乗っているセッションは乗り換えさせない（別の URL や役割で呼ばれても state を書き換えない）
export const board: MatchedHook<'tool.call', { tool: 'Skill' }> = async ($, e, next) => {
  const { value: aboard } = await $.state.get(fleet)
  if (aboard !== undefined) return next(e)
  await Ship.of(e.skill).and(role => ArtifactDb.urlOf(e.args ?? '').and(url => ({ url, role }))).either(async session => {
    await $.state.set(fleet, session)
    await $.tool.register(reportStatusTool)
  }, async () => undefined)
  return next(e)
}
