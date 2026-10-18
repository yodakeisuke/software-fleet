import type { CommandRunResult, Hook } from 'claude-code'
import { Ask } from '../../../logic/ask/ask'
import { Flagship } from '../../../logic/flagship/flagship'
import { FleetDb } from '../../../logic/fleet-db/fleet-db'

const fleet = { plugin: 'software-fleet', key: 'fleet' } as const


// /set-afloat: ダッシュボードを publish し、その URL を依頼に添えて skill に渡し、flagship の tool を出す
export const setAfloat: Hook<'command.run'> = async ($, e, next) => {
  const published = await $.tool.call({
    tool: 'Artifact', action: 'publish', file_path: `${$.plugin.root}/skills/flagship/dashboard.html`, icon: 'dashboard',
    description: e.args.split('\n')[0]?.slice(0, 200) || 'software-fleet', capabilities: { db: {}, comments: {} },
  })
  return FleetDb.urlOf(published.isError === true ? '' : (published.text ?? '')).either(async (url): Promise<CommandRunResult> => {
    await $.state.set(fleet, { url, role: 'flagship' })
    await $.tool.register({ name: 'set_brief', description: '依頼の要約をダッシュボードの一番上に出す', inputSchema: Flagship.briefSchema(), isDeferred: false })
    await $.tool.register({ name: 'ask_user', description: '無視できないトレードオフやリスクを伴う判断を、ユーザのダッシュボードに上げる。回答はコメントで届く。返る id は record_decision の closes に使う', inputSchema: Ask.schema(), isDeferred: false })
    await $.tool.register({ name: 'record_decision', description: 'flagship が決めたことを残す。ユーザの判断を受けて決めたなら closes にその id', inputSchema: Flagship.decisionSchema(), isDeferred: false })
    return next({ ...e, args: `${e.args}\n\nfleet の artifact（ダッシュボードと DB）: ${url}` })
  }, async (): Promise<CommandRunResult> => ({ text: `ダッシュボードを publish できなかった: ${published.text ?? published.deny ?? ''}` }))
}
