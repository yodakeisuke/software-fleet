import type { Engine, FleetSession, FleetTool, ShipName } from '../../types/fleet'
import { FleetDb } from '../db/fleet-db'
import { Boarding } from '../logic/boarding'

// セッションが fleet に乗る入口。flagship は /set-afloat とダッシュボードの publish、ship は同梱 skill の呼び出し（Skill）で乗る
// 乗れるかどうかと「乗るのは一度だけ」は logic の Boarding が決める
const board = async (engine: Engine, wanted: FleetSession, tools: readonly FleetTool[]) =>
  Boarding.join(await engine.fleet(), wanted).either(async session => {
    await engine.board(session)
    for (const tool of tools) await engine.offer(tool.spec)
    return true
  }, async () => false)

export const joinFleet = {
  // /set-afloat: flagship の tool を出す。登録した tool は次のプロンプト（この skill の展開）から呼べる
  afloat: async (engine: Engine, tools: readonly FleetTool[]) => {
    for (const tool of tools) await engine.offer(tool.spec)
  },

  // flagship が同梱のダッシュボードを publish したら、その URL で flagship にし、DB の置き場所を DB に置く（publish し直すたびに置き直す。ページはそれを読む）
  // publish は LLM のターンで行う（auto モードの判定が、ユーザの /set-afloat を依頼として照らし合わせられるように）
  published: async (engine: Engine, publish: { file: unknown; dashboard: string; reply: string | undefined }) => {
    if (publish.file !== publish.dashboard || publish.reply === undefined) return
    await FleetDb.urlOf(publish.reply).either(async url => {
      await board(engine, { url, role: 'flagship' }, [])
      const session = await engine.fleet()
      if (session === undefined || !FleetDb.isFleet(url, session.url)) return
      const where = FleetDb.paths()
      await FleetDb.put(engine, where.self, where, 'DbPathsSet')
    }, async () => undefined)
  },

  // ship の合図: Skill software-fleet:<ship> が artifact の URL 付きで呼ばれたら、そのセッションをその ship にし、ship の tool を出す
  // set-afloat が Skill で呼ばれたときは command.run が起きないので、ここで /set-afloat と同じく flagship の tool を出す（乗るのはダッシュボードの publish のとき）
  skill: async (engine: Engine, call: { skill: string; args: string }, tools: (ship: ShipName) => readonly FleetTool[], flagshipTools: readonly FleetTool[]): Promise<void> => {
    // Skill tool は前後の空白と先頭の / を落としてから skill を引くので、同じように落として比べる
    const name = call.skill.trim().replace(/^\//, '')
    if (name === 'software-fleet:set-afloat') return joinFleet.afloat(engine, flagshipTools)
    // skill の名前は software-fleet:<ship>
    const role = Boarding.ships().find(ship => name === `software-fleet:${ship}`)
    if (role === undefined) return
    await FleetDb.urlOf(call.args).either(url => board(engine, { url, role }, tools(role)), async () => false)
  },
}
