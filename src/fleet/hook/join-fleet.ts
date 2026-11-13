import type { Engine, FleetSession, FleetTool, ShipName } from '../../types/fleet'
import { FleetDb } from '../db/fleet-db'
import { Boarding } from '../logic/boarding'

// セッションが fleet に乗る入口。役割は起動のコマンドか Skill で、fleet は artifact の URL（渡されたものか、自分が publish したダッシュボード）で決まる
// 乗れるかどうかと「乗るのは一度だけ」は logic の Boarding が決める
const board = async (engine: Engine, wanted: FleetSession, tools: readonly FleetTool[]) =>
  Boarding.join(await engine.fleet(), wanted).either(async session => {
    await engine.board(session)
    for (const tool of tools) await engine.offer(tool.spec)
    return true
  }, async () => false)

type ShipTools = (ship: ShipName) => readonly FleetTool[]
// skill とコマンドの名前は software-fleet:<ship>
const shipOf = (name: string) => Boarding.ships().find(ship => name === `software-fleet:${ship}`)
// 単独で起きた ship への指示。skill の本文は flagship とダッシュボードがある前提で書いてあるので、その差だけを伝える
const aloneNote = (dashboard: string) => `fleet の URL が渡されていないので、flagship もダッシュボードもない単独で動く。専用の tool（report_status・set_links・revise_*）はまだ無いので、成果物はブランチ・自前の artifact・チャットに出す。flagship に上げる・flagship から届くとあることは、このセッションでユーザと直接やりとりする。他の ship と成果物を共有するとき、またはユーザがスマホで見たいと言ったときだけ、Artifact で ${dashboard} を capabilities { db: {}, comments: {}, assets: {} } で publish する（中身は読まない・書かない）。その URL がダッシュボードと共有の DB になり、専用の tool が出る。set_brief で依頼の要約を出し、それまでの成果物を専用の tool で出し直し、URL をユーザに伝える（他の ship はその URL で同じ fleet に乗る）。`

export const joinFleet = {
  // /set-afloat: flagship の tool を出す。登録した tool は次のプロンプト（この skill の展開）から呼べる
  afloat: async (engine: Engine, tools: readonly FleetTool[]) => {
    for (const tool of tools) await engine.offer(tool.spec)
  },

  // 同梱のダッシュボードを publish したセッションを flagship（単独で起きた ship ならその ship）として乗せ、DB の置き場所を DB に置く（publish し直すたびに置き直す。ページはそれを読む）
  // publish は LLM のターンで行う（auto モードの判定が、ユーザの /command を依頼として照らし合わせられるように）
  published: async (engine: Engine, publish: { file: unknown; dashboard: string; reply: string | undefined }, aloneTools: ShipTools) => {
    if (publish.file !== publish.dashboard || publish.reply === undefined) return
    await FleetDb.urlOf(publish.reply).either(async url => {
      const alone = await engine.alone()
      await board(engine, { url, role: Boarding.publisher(alone) }, alone === undefined ? [] : aloneTools(alone))
      const session = await engine.fleet()
      if (session === undefined || !FleetDb.isFleet(url, session.url)) return
      const where = FleetDb.paths()
      await FleetDb.put(engine, where.self, where, 'DbPathsSet')
    }, async () => undefined)
  },

  // ship の合図: Skill software-fleet:<ship> が artifact の URL 付きで呼ばれたら、そのセッションをその ship にし、ship の tool を出す
  // set-afloat が Skill で呼ばれたときは command.run が起きないので、ここで /set-afloat と同じく flagship の tool を出す（乗るのはダッシュボードの publish のとき）
  skill: async (engine: Engine, call: { skill: string; args: string }, tools: ShipTools, flagshipTools: readonly FleetTool[]): Promise<void> => {
    // Skill tool は前後の空白と先頭の / を落としてから skill を引くので、同じように落として比べる
    const name = call.skill.trim().replace(/^\//, '')
    if (name === 'software-fleet:set-afloat') return joinFleet.afloat(engine, flagshipTools)
    const role = shipOf(name)
    if (role === undefined) return
    await FleetDb.urlOf(call.args).either(url => board(engine, { url, role }, tools(role)), async () => false)
  },

  // ユーザが /software-fleet:<ship> を打った。URL 付きならその fleet に乗る。URL がなければ単独で起き、LLM への指示を返す（fleet に乗るのは、共有か閲覧のために publish したとき）
  typed: async (engine: Engine, call: { command: string; args: string }, tools: ShipTools, dashboard: string) => {
    const role = shipOf(call.command)
    if (role === undefined || (await engine.fleet()) !== undefined) return undefined
    return FleetDb.urlOf(call.args).either<Promise<string | undefined>>(async url => { await board(engine, { url, role }, tools(role)); return undefined }, async () => {
      await engine.goAlone(role)
      return aloneNote(dashboard)
    })
  },
}
