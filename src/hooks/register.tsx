import type { EngineInterface, Register } from 'claude-code'
import type { Engine, FleetTool, ShipName } from '../types/fleet'
import { Result } from '../fleet/logic/result'
import { allowOwnDb } from '../fleet/hook/allow-own-db'
import { forbidPreviewServer } from '../fleet/hook/forbid-preview-server'
import { forbidRawWrite } from '../fleet/hook/forbid-raw-write'
import { joinFleet } from '../fleet/hook/join-fleet'
import { reportStatus } from '../fleet/tool/report-status'
import { reviseDocument } from '../fleet/tool/revise-document'
import { setLinks } from '../fleet/tool/set-links'
import { askUser } from '../skills/flagship/tool/ask-user'
import { recordDecision } from '../skills/flagship/tool/record-decision'
import { setBrief } from '../skills/flagship/tool/set-brief'
import { setRemaining } from '../skills/flagship/tool/set-remaining'
import { reviseBehavior } from '../skills/behavior/tool/revise-behavior'
import { reviseRequirements } from '../skills/requirement/tool/revise-requirements'
import { reviseQuality } from '../skills/qa/tool/revise-quality'
import { forbidStaleMap } from '../skills/coder/hook/forbid-stale-map'
import { reviseModel } from '../skills/coder/tool/revise-model'

// 組み立て役。$ を engine（関数の束）にして tool・hook に渡す。$ と $.state の鍵はこのファイルにだけ書く
const fleet = { plugin: 'software-fleet', key: 'fleet' } as const
const alone = { plugin: 'software-fleet', key: 'alone' } as const
const dashboard = ($: EngineInterface) => `${$.plugin.root}/skills/flagship/dashboard.html`
const engine = ($: EngineInterface): Engine => ({
  now: () => $.clock.now(),
  fleet: async () => (await $.state.get(fleet)).value,
  board: async session => { await $.state.set(fleet, session) },
  alone: async () => (await $.state.get(alone)).value,
  goAlone: async ship => { await $.state.set(alone, ship) },
  offer: async tool => { await $.tool.register(tool) },
  db: async (url, call) => {
    const reply = await $.tool.call({ tool: 'ArtifactData', url, ...call })
    return { text: reply.text, deny: reply.deny, ...(reply.isError === true ? { isError: true as const } : {}) }
  },
  sources: async files => {
    const root = await $.session.root()
    return Object.fromEntries(await Promise.all(files.map(async file => [file, await Result.given($.fs.read(`${root}/${file}`)).then(read => read.either<string | undefined>(text => text, () => undefined))] as const)))
  },
})

// 機能ごとの tool の一覧。join-fleet への一覧と on の行は同じものを指す
const flagshipTools = [setBrief, askUser, recordDecision, setRemaining]
// ship は全員 report_status と set_links を持ち、成果物の tool はその ship だけが持つ
const deliverableTools: Partial<Record<ShipName, readonly FleetTool[]>> = { requirement: [reviseRequirements], behavior: [reviseBehavior], coder: [reviseModel], qa: [reviseQuality], cs: [reviseDocument], ops: [reviseDocument] }
const shipTools = (ship: ShipName) => [reportStatus, setLinks, ...(deliverableTools[ship] ?? [])]
// 単独で起きた ship は flagship がいないので、依頼の要約も自分で出す
const aloneTools = (ship: ShipName) => [setBrief, ...shipTools(ship)]

export const register: Register = on => {
  on('command.run', { command: 'software-fleet:set-afloat' }, async ($, e, next) => { await joinFleet.afloat(engine($), flagshipTools); return next(e) })
  on('tool.call', { tool: 'Artifact' }, async ($, e, next) => {
    const reply = await next(e)
    await joinFleet.published(engine($), { file: e.file_path, dashboard: dashboard($), reply: reply.isError === true ? undefined : reply.text }, aloneTools)
    return reply
  })
  on('command.run', { command: /^software-fleet:/ }, async ($, e, next) => {
    const note = await joinFleet.typed(engine($), e, shipTools, dashboard($))
    const reply = await next(e)
    return note === undefined ? reply : { ...reply, context: [...(reply.context ?? []), note] }
  })
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => { await joinFleet.skill(engine($), { skill: e.skill, args: e.args ?? '' }, shipTools, flagshipTools); return next(e) })
  on('tool.call', { tool: 'ArtifactData' }, async ($, e, next) => {
    const deny = await forbidRawWrite(engine($), e, next.origin.plugin)
    return deny === undefined ? next(e) : { deny }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'fleet の DB への書き込みかを確かめられなかった' }))
  on('tool.call', { tool: 'mcp__Claude_Browser__preview_start' }, async ($, e, next) => {
    const deny = await forbidPreviewServer(engine($), e)
    return deny === undefined ? next(e) : { deny }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'preview_start を確かめられなかった' }))
  on('tool.check', { tool: 'ArtifactData' }, async ($, e, next) => (await allowOwnDb(engine($), e.input, next.origin.plugin, $.plugin.name)) ?? next(e))
  on('tool.call', { tool: setBrief.tool }, ($, e) => setBrief.run(engine($), e))
  on('tool.call', { tool: askUser.tool }, ($, e) => askUser.run(engine($), e))
  on('tool.call', { tool: recordDecision.tool }, ($, e) => recordDecision.run(engine($), e))
  on('tool.call', { tool: setRemaining.tool }, ($, e) => setRemaining.run(engine($), e))
  on('tool.call', { tool: reportStatus.tool }, async ($, e) => {
    const deny = await forbidStaleMap(engine($), e)
    return deny === undefined ? reportStatus.run(engine($), e) : { deny }
  })
  on('tool.call', { tool: setLinks.tool }, ($, e) => setLinks.run(engine($), e))
  on('tool.call', { tool: reviseRequirements.tool }, ($, e) => reviseRequirements.run(engine($), e))
  on('tool.call', { tool: reviseBehavior.tool }, ($, e) => reviseBehavior.run(engine($), e))
  on('tool.call', { tool: reviseQuality.tool }, ($, e) => reviseQuality.run(engine($), e))
  on('tool.call', { tool: reviseModel.tool }, ($, e) => reviseModel.run(engine($), e))
  on('tool.call', { tool: reviseDocument.tool }, ($, e) => reviseDocument.run(engine($), e))
}
