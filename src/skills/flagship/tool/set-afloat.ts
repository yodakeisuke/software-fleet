import type { CommandRunResult, Hook } from 'claude-code'
import { ArtifactDb } from './artifact-db'
import { askUserTool, recordDecisionTool, setBriefTool } from './tools'

const fleet = { plugin: 'software-fleet', key: 'fleet' } as const


// /set-afloat: ダッシュボードを publish し、その URL を依頼に添えて skill に渡し、flagship の tool を出す
export const setAfloat: Hook<'command.run'> = async ($, e, next) => {
  const published = await $.tool.call({
    tool: 'Artifact', action: 'publish', file_path: `${$.plugin.root}/skills/flagship/dashboard.html`, icon: 'dashboard',
    description: e.args.split('\n')[0]?.slice(0, 200) || 'software-fleet', capabilities: { db: {}, comments: {} },
  })
  return ArtifactDb.urlOf(published.isError === true ? '' : (published.text ?? '')).either(async (url): Promise<CommandRunResult> => {
    await $.state.set(fleet, { url, role: 'flagship' })
    await $.tool.register(setBriefTool)
    await $.tool.register(askUserTool)
    await $.tool.register(recordDecisionTool)
    return next({ ...e, args: `${e.args}\n\nfleet の artifact（ダッシュボードと DB）: ${url}` })
  }, async (): Promise<CommandRunResult> => ({ text: `ダッシュボードを publish できなかった: ${published.text ?? published.deny ?? ''}` }))
}
