import { describe, expect, test } from 'claude-code/testing'

import type { DbCall, Engine } from '../../types/fleet'
import { setLinks } from './set-links'

// 書いた先と中身。書かずに拒んだら deny
const written = async (input: unknown, role = 'architect') => {
  const calls: DbCall[] = []
  const engine = {
    fleet: async () => ({ url: 'https://claude.ai/artifact/abc', role }),
    db: async (_url: string, call: DbCall) => { calls.push(call); return { text: call.action === 'get' ? '' : 'ok' } },
  } as unknown as Engine
  const reply = await setLinks.run(engine, input)
  const set = calls.find(call => call.action === 'set')
  return 'deny' in reply ? reply : { at: `${set?.collection}/${set?.doc_id}`, data: set?.data }
}

describe('set-links', () => {
  test('成果物へのリンクを、その ship の文書に今の全体で書く', async () => {
    const links = [{ url: 'https://claude.ai/artifact/xyz', label: '構成図' }, { url: 'https://github.com/owner/repo/blob/main/docs/adr.md', label: '判断の記録' }]
    expect(await written({ links })).toEqual({ at: 'fleet/ships/links/architect', data: { links } })
    expect(await written({ links: [] }, 'coder')).toEqual({ at: 'fleet/ships/links/coder', data: { links: [] } })
  })

  test('fleet の artifact の asset は、上げたときに返る /_blob/… の url で書ける', async () => {
    const links = [{ url: '/_blob/4f2a9c', label: '構成図' }]
    expect(await written({ links })).toEqual({ at: 'fleet/ships/links/architect', data: { links } })
  })

  test('https の URL か /_blob/… でなければ書かずに拒む', async () => {
    for (const url of ['javascript:alert(1)', 'http://example.com/a', 'example.com/a', '//example.com/_blob/1', '/x/_blob/1']) {
      expect(await written({ links: [{ url, label: '図' }] })).toHaveProperty('deny', expect.stringContaining('入力.links[0].url は'))
    }
  })

  test('文言が長すぎれば書かずに拒む', async () => {
    expect(await written({ links: [{ url: 'https://example.com/a', label: 'あ'.repeat(21) }] })).toEqual({ deny: 'links[0].label は 20 文字まで（今 21 文字）' })
  })

  test('ship として乗っていないセッションは書けない', async () => {
    expect(await written({ links: [] }, 'flagship')).toEqual({ deny: 'このセッションは fleet の ship として乗っていない' })
  })
})
