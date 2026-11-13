import { describe, expect, test } from 'claude-code/testing'

import type { Engine, FleetSession } from '../../types/fleet'
import { allowOwnWrite } from './allow-own-write'

const fleet = 'https://claude.ai/artifact/abc'
const engine = (session: FleetSession | undefined): Engine => ({
  root: '/p', now: async () => 0, fleet: async () => session, board: async () => {}, alone: async () => undefined, goAlone: async () => {}, offer: async () => {}, db: async () => ({ text: '' }),
})
const onBoard = engine({ url: fleet, role: 'flagship' })
const allowed = { decision: 'allow', reason: 'fleet の専用 tool による fleet の DB への書き込み' }

describe('allow-own-write', () => {
  test('mod 自身が fleet の DB に書くときだけ許可する', async () => {
    expect(await allowOwnWrite(onBoard, { action: 'set', url: fleet }, 'software-fleet', 'software-fleet')).toEqual(allowed)
    expect(await allowOwnWrite(onBoard, { action: 'batch', url: `${fleet}/` }, 'software-fleet', 'software-fleet')).toEqual(allowed)
  })

  test('LLM やほかの plugin の書き込みは engine の判定に任せる', async () => {
    expect(await allowOwnWrite(onBoard, { action: 'set', url: fleet }, 'engine', 'software-fleet')).toBe(undefined)
    expect(await allowOwnWrite(onBoard, { action: 'set', url: fleet }, 'other-plugin', 'software-fleet')).toBe(undefined)
  })

  test('読み取り・ほかの artifact・宛先の id が取れない・fleet に乗っていないときは engine の判定に任せる', async () => {
    expect(await allowOwnWrite(onBoard, { action: 'get', url: fleet }, 'software-fleet', 'software-fleet')).toBe(undefined)
    expect(await allowOwnWrite(onBoard, { action: 'set', url: 'https://claude.ai/artifact/other' }, 'software-fleet', 'software-fleet')).toBe(undefined)
    expect(await allowOwnWrite(onBoard, { action: 'set' }, 'software-fleet', 'software-fleet')).toBe(undefined)
    expect(await allowOwnWrite(onBoard, undefined, 'software-fleet', 'software-fleet')).toBe(undefined)
    expect(await allowOwnWrite(engine(undefined), { action: 'set', url: fleet }, 'software-fleet', 'software-fleet')).toBe(undefined)
  })
})
