import type { EngineInterface, Register } from 'claude-code'
import type { Engine, FleetTool, ShipName } from '../types/fleet'
import { allowOwnWrite } from '../fleet/hook/allow-own-write'
import { forbidRawWrite } from '../fleet/hook/forbid-raw-write'
import { joinFleet } from '../fleet/hook/join-fleet'
import { reportStatus } from '../fleet/tool/report-status'
import { askUser } from '../skills/flagship/tool/ask-user'
import { recordDecision } from '../skills/flagship/tool/record-decision'
import { setBrief } from '../skills/flagship/tool/set-brief'
import { reviseGuide } from '../skills/cs/tool/revise-guide'
import { setRemaining } from '../skills/flagship/tool/set-remaining'
import { reviseBehavior } from '../skills/behavior/tool/revise-behavior'
import { reviseRequirements } from '../skills/requirement/tool/revise-requirements'

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
  read: path => $.fs.read(path),
  realPath: async path => (await $.fs.stat(path, { resolve: true })).realPath,
  readable: async path => (await $.tool.check({ tool: 'Read', input: { file_path: path } })).decision === 'allow',
})

// 機能ごとの tool の一覧。join-fleet への一覧と on の行は同じものを指す
const flagshipTools = [setBrief, askUser, recordDecision, setRemaining]
// ship は全員 report_status を持ち、成果物の tool はその ship だけが持つ
const deliverableTools: Partial<Record<ShipName, readonly FleetTool[]>> = { requirement: [reviseRequirements], cs: [reviseGuide], behavior: [reviseBehavior] }
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
  on('tool.check', { tool: 'ArtifactData' }, async ($, e, next) => (await allowOwnWrite(engine($), e.input, next.origin.plugin, $.plugin.name)) ?? next(e))
  on('tool.call', { tool: setBrief.tool }, ($, e) => setBrief.run(engine($), e))
  on('tool.call', { tool: askUser.tool }, ($, e) => askUser.run(engine($), e))
  on('tool.call', { tool: recordDecision.tool }, ($, e) => recordDecision.run(engine($), e))
  on('tool.call', { tool: setRemaining.tool }, ($, e) => setRemaining.run(engine($), e))
  on('tool.call', { tool: reportStatus.tool }, ($, e) => reportStatus.run(engine($), e))
  on('tool.call', { tool: reviseRequirements.tool }, ($, e) => reviseRequirements.run(engine($), e))
  on('tool.call', { tool: reviseGuide.tool }, ($, e) => reviseGuide.run(engine($), e))
  on('tool.call', { tool: reviseBehavior.tool }, ($, e) => reviseBehavior.run(engine($), e))
}
