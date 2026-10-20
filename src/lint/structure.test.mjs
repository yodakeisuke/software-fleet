import { describe, it } from 'node:test'
import { RuleTester } from 'oxlint/plugins-dev'
import plugin from './structure.js'

RuleTester.describe = describe
RuleTester.it = it
const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } })
const at = (filename, code) => ({ filename: `/repo/src/${filename}`, code })
const run = (name, valid, invalid) => tester.run(name, plugin.rules[name], { valid, invalid: invalid.map(c => ({ ...c, errors: 1 })) })

run('import-direction', [
  at('fleet/logic/boarding.ts', "import { Result } from './result'"),
  at('fleet/logic/boarding.ts', "import type { Role } from '../../types/fleet'"),
  at('skills/flagship/logic/ask.ts', "import { Result } from '../../../fleet/logic/result'"),
  at('fleet/tool/report-status.ts', "import { FleetDb } from '../db/fleet-db'"),
  at('skills/flagship/tool/ask-user.ts', "import { Ask } from '../logic/ask'"),
  at('skills/flagship/tool/ask-user.ts', "import { FleetDb } from '../../../fleet/db/fleet-db'"),
  at('hooks/register.tsx', "import { askUser } from '../skills/flagship/tool/ask-user'"),
], [
  at('fleet/logic/boarding.ts', "import { FleetDb } from '../db/fleet-db'"),
  at('fleet/logic/boarding.ts', "import { readFileSync } from 'node:fs'"),
  at('fleet/hook/join-fleet.ts', "import { askUser } from '../../skills/flagship/tool/ask-user'"),
  at('skills/flagship/tool/ask-user.ts', "import { x } from '../../qa/logic/x'"),
  at('fleet/tool/report-status.ts', "import { register } from '../../hooks/register'"),
])

run('engine-in-register', [
  at('hooks/register.tsx', "const fleet = { plugin: 'software-fleet', key: 'fleet' } as const\nconst engine = ($: unknown) => $"),
  at('hooks/register.tsx', "import type { Register } from 'claude-code'"),
  at('fleet/db/fleet-db.ts', "const call = { action: 'get', key: 'x' }"),
], [
  at('fleet/hook/join-fleet.ts', 'export const f = ($: unknown) => 1'),
  at('fleet/hook/join-fleet.ts', "const fleet = { plugin: 'software-fleet', key: 'fleet' }"),
  at('skills/flagship/tool/set-brief.ts', "import type { EngineInterface } from 'claude-code'"),
])

run('generic-name', [
  at('fleet/db/fleet-db.ts', 'export const x = 1'),
  at('skills/flagship/tool/ask-user.ts', 'export const x = 1'),
], [
  at('fleet/utils.ts', 'export const x = 1'),
  at('fleet/adapter/db.ts', 'export const x = 1'),
  at('hooks/tools.ts', 'export const x = 1'),
])

run('tool-export', [
  at('skills/flagship/tool/set-brief.ts', "const spec = {}\nconst run = async () => ({ result: '' })\nexport const setBrief = { tool: 'mcp__x__y' as const, spec, run } satisfies T"),
  at('fleet/hook/join-fleet.ts', 'export const joinFleet = { afloat: async () => {} }'),
], [
  at('skills/flagship/tool/set-brief.ts', 'export const run = async () => 1'),
  at('fleet/tool/report-status.ts', "export const reportStatus = { tool: 'x', spec: {}, run }\nexport const extra = 1"),
  at('fleet/tool/report-status.ts', 'const x = 1'),
])
