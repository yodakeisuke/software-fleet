import type { Hook, MatchedHook } from 'claude-code'
import { ArtifactDb } from './artifact-db'
import { askUserTool, recordDecisionTool, setBriefTool } from './tools'

const fleet = { plugin: 'software-fleet', key: 'fleet' } as const

// /set-afloat: flagship の tool を出す。登録した tool は次のプロンプト（この skill の展開）から呼べる
export const setAfloat: Hook<'command.run'> = async ($, e, next) => {
  await $.tool.register(setBriefTool)
  await $.tool.register(askUserTool)
  await $.tool.register(recordDecisionTool)
  return next(e)
}

// flagship が同梱のダッシュボードを publish したら、その URL でこのセッションを flagship にする
// publish は LLM のターンで行う（auto モードの判定が、ユーザの /set-afloat を依頼として照らし合わせられるように）
export const dashboard: MatchedHook<'tool.call', { tool: 'Artifact' }> = async ($, e, next) => {
  const published = await next(e)
  const { value: aboard } = await $.state.get(fleet)
  const isDashboard = typeof e.file_path === 'string' && e.file_path === `${$.plugin.root}/skills/flagship/dashboard.html`
  if (aboard !== undefined || !isDashboard || published.isError === true) return published
  await ArtifactDb.urlOf(published.text ?? '').either(async url => { await $.state.set(fleet, { url, role: 'flagship' }) }, async () => undefined)
  return published
}
