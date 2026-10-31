import type { EngineInterface, Register } from 'claude-code'
import type { Engine, FleetTool, ShipName } from '../types/fleet'
import { allowOwnWrite } from '../fleet/hook/allow-own-write'
import { forbidPreview } from '../fleet/hook/forbid-preview'
import { forbidRawWrite } from '../fleet/hook/forbid-raw-write'
import { joinFleet } from '../fleet/hook/join-fleet'
import { reportStatus } from '../fleet/tool/report-status'
import { reviseDocument } from '../fleet/tool/revise-document'
import { askUser } from '../skills/flagship/tool/ask-user'
import { recordDecision } from '../skills/flagship/tool/record-decision'
import { setBrief } from '../skills/flagship/tool/set-brief'
import { setRemaining } from '../skills/flagship/tool/set-remaining'
import { reviseBehavior } from '../skills/behavior/tool/revise-behavior'
import { setPullRequest } from '../skills/implementation/tool/set-pull-request'
import { reviseRequirements } from '../skills/requirement/tool/revise-requirements'
import { reviseQuality } from '../skills/qa/tool/revise-quality'

// 組み立て役。$ を engine（関数の束）にして tool・hook に渡す。$ と $.state の鍵はこのファイルにだけ書く
const fleet = { plugin: 'software-fleet', key: 'fleet' } as const
const engine = ($: EngineInterface): Engine => ({
  root: $.plugin.root,
  now: () => $.clock.now(),
  fleet: async () => (await $.state.get(fleet)).value,
  board: async session => { await $.state.set(fleet, session) },
  offer: async tool => { await $.tool.register(tool) },
  db: async (url, call) => {
    const reply = await $.tool.call({ tool: 'ArtifactData', url, ...call })
    return { text: reply.text, deny: reply.deny, ...(reply.isError === true ? { isError: true as const } : {}) }
  },
})

// 機能ごとの tool の一覧。join-fleet への一覧と on の行は同じものを指す
const flagshipTools = [setBrief, askUser, recordDecision, setRemaining]
// ship は全員 report_status を持ち、成果物の tool はその ship だけが持つ
const deliverableTools: Partial<Record<ShipName, readonly FleetTool[]>> = { requirement: [reviseRequirements], behavior: [reviseBehavior], implementation: [setPullRequest], qa: [reviseQuality], cs: [reviseDocument], ops: [reviseDocument] }
const shipTools = (ship: ShipName) => [reportStatus, ...(deliverableTools[ship] ?? [])]

export const register: Register = on => {
  on('command.run', { command: 'software-fleet:set-afloat' }, async ($, e, next) => { await joinFleet.afloat(engine($), flagshipTools); return next(e) })
  on('tool.call', { tool: 'Artifact' }, async ($, e, next) => {
    const reply = await next(e)
    await joinFleet.published(engine($), { file: e.file_path, dashboard: `${$.plugin.root}/skills/flagship/dashboard.html`, reply: reply.isError === true ? undefined : reply.text })
    return reply
  })
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => { await joinFleet.skill(engine($), { skill: e.skill, args: e.args ?? '' }, shipTools); return next(e) })
  on('tool.call', { tool: 'ArtifactData' }, async ($, e, next) => {
    const deny = await forbidRawWrite(engine($), e, next.origin.plugin)
    return deny === undefined ? next(e) : { deny }
  })
  on('tool.call', { tool: 'mcp__Claude_Browser__preview_start' }, async ($, e, next) => {
    const deny = await forbidPreview(engine($), e)
    return deny === undefined ? next(e) : { deny }
  })
  on('tool.check', { tool: 'ArtifactData' }, async ($, e, next) => (await allowOwnWrite(engine($), e.input, next.origin.plugin, $.plugin.name)) ?? next(e))
  on('tool.call', { tool: setBrief.tool }, ($, e) => setBrief.run(engine($), e))
  on('tool.call', { tool: askUser.tool }, ($, e) => askUser.run(engine($), e))
  on('tool.call', { tool: recordDecision.tool }, ($, e) => recordDecision.run(engine($), e))
  on('tool.call', { tool: setRemaining.tool }, ($, e) => setRemaining.run(engine($), e))
  on('tool.call', { tool: reportStatus.tool }, ($, e) => reportStatus.run(engine($), e))
  on('tool.call', { tool: reviseRequirements.tool }, ($, e) => reviseRequirements.run(engine($), e))
  on('tool.call', { tool: reviseBehavior.tool }, ($, e) => reviseBehavior.run(engine($), e))
  on('tool.call', { tool: reviseQuality.tool }, ($, e) => reviseQuality.run(engine($), e))
  on('tool.call', { tool: setPullRequest.tool }, ($, e) => setPullRequest.run(engine($), e))
  on('tool.call', { tool: reviseDocument.tool }, ($, e) => reviseDocument.run(engine($), e))
}
