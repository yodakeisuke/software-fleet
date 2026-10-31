import { describe, expect, test } from 'claude-code/testing'

import type { Engine, FleetSession } from '../../types/fleet'
import { forbidPreview } from './forbid-preview'

const engine = (session: FleetSession | undefined): Engine => ({
  root: '/p', now: async () => 0, fleet: async () => session, board: async () => {}, offer: async () => {}, db: async () => ({ text: '' }),
})
const onBoard = engine({ url: 'https://claude.ai/artifact/abc', role: 'qa' })

describe('forbid-preview', () => {
  test('fleet に乗っているセッションが dev server を起こすときは拒む理由を返す', async () => {
    expect(await forbidPreview(onBoard, { name: 'dash' })).toContain('preview_start')
  })

  test('url で開くだけなら止めない', async () => {
    expect(await forbidPreview(onBoard, { url: 'http://localhost:3000' } as { name?: unknown })).toBe(undefined)
  })

  test('fleet に乗っていないセッションは止めない', async () => {
    expect(await forbidPreview(engine(undefined), { name: 'dash' })).toBe(undefined)
  })
})
