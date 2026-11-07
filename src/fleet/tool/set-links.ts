import type { Engine, FleetTool, Links as LinksDoc } from '../../types/fleet'
import { FleetDb } from '../db/fleet-db'
import { JsonSchema } from '../schema/json-schema'
import { Boarding } from '../logic/boarding'
import { Links } from '../logic/links'

const { text, object } = JsonSchema
const limits = Links.limits()

// ship の成果物へのリンク。成果物の置き場所は ship が決め（自前の artifact・fleet の artifact の asset・ブランチの文書・PR）、ページは top の一覧とその ship のページにボタンで出す。全 ship が使う
const spec = {
  name: 'set_links',
  description: 'この ship の成果物へのリンクを、今の全体で置き換えてダッシュボードに出す。ユーザはスマホでそこから開く',
  inputSchema: object({
    links: {
      type: 'array',
      description: '成果物ごとに 1 本。無くなった成果物は外す',
      items: object({
        url: { ...text('https の URL'), pattern: '^https://' },
        label: text(`ボタンの文言。${limits.label} 文字まで`),
      }, ['url', 'label']),
    },
  }, ['links']),
  isDeferred: false,
}

const run = async (engine: Engine, input: unknown) => {
  const session = await engine.fleet()
  const ship = Boarding.ships().find(name => name === session?.role)
  if (ship === undefined) return { deny: 'このセッションは fleet の ship として乗っていない' }
  const where = FleetDb.paths()
  return JsonSchema.check<LinksDoc>(spec.inputSchema, input)
    .and(links => Links.of(links))
    .either(links => FleetDb.put(engine, `${where.links}/${ship}`, links, 'LinksSet'), async error => ({ deny: error }))
}

export const setLinks = { tool: 'mcp__software-fleet__set_links' as const, spec, run } satisfies FleetTool
