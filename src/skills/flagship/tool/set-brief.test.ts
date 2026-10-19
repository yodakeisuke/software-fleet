import { describe, expect, test } from 'claude-code/testing'

import type { DbCall, Engine } from '../../../types/fleet'
import { setBrief } from './set-brief'

const problems = [{ problem: '差し戻し理由が残らない', solution: '理由をカテゴリで残す' }]
// 今の文書が stored の engine。書いた中身を返す
const written = async (stored: string, input: unknown) => {
  const calls: DbCall[] = []
  const engine = {
    fleet: async () => ({ url: 'https://claude.ai/artifact/abc', role: 'flagship' }),
    db: async (_url: string, call: DbCall) => { calls.push(call); return { text: call.action === 'get' ? stored : 'ok' } },
  } as unknown as Engine
  await setBrief.run(engine, input)
  return calls.at(-1)?.data
}

describe('set-brief', () => {
  test('課題と解決は後から足せる。省けば今の表を残し、渡せば置き換える', async () => {
    const stored = `{"id":"flagship","data":${JSON.stringify({ brief: '前の要約', problems })},"version":2}`
    expect(await written('', { brief: '要約' })).toEqual({ brief: '要約', problems: [] })
    expect(await written(stored, { brief: '新しい要約' })).toEqual({ brief: '新しい要約', problems })
    expect(await written(stored, { brief: '要約', problems: [] })).toEqual({ brief: '要約', problems: [] })
  })
})
