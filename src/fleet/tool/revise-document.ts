import type { Engine, FleetTool, JsonSchemaNode, ReaderDocument as ReaderDocumentDoc, ReviseDocument } from '../../types/fleet'
import { FleetDb } from '../db/fleet-db'
import { ReaderDocument } from '../logic/reader-document'
import { JsonSchema } from '../schema/json-schema'

const { text, object } = JsonSchema
const tagged = (key: string, name: string, fields: Record<string, JsonSchemaNode>, optional: Record<string, JsonSchemaNode> = {}) =>
  object({ [key]: { type: 'string', enum: [name] }, ...fields, ...optional }, [key, ...Object.keys(fields)])
const texts = (description?: string): JsonSchemaNode => ({ type: 'array', items: text(), ...(description ? { description } : {}) })
const block: JsonSchemaNode = {
  type: 'object',
  oneOf: [
    tagged('kind', 'text', { text: text() }),
    tagged('kind', 'steps', { items: texts('番号付きの手順') }),
    tagged('kind', 'list', { items: texts() }),
    tagged('kind', 'table', { head: texts(), rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } } }),
    tagged('kind', 'ascii', { ascii: text('等幅で描く図') }),
    tagged('kind', 'svg', { svg: text('viewBox のある <svg>…</svg>。script と外部の読み込みは動かない。色は var(--fg) var(--muted) var(--bg) var(--surface) var(--line) var(--acc) を使う') }),
    tagged('kind', 'note', { tone: { type: 'string', enum: ['note', 'warning', 'tip'] }, text: text() }),
  ],
}
const section = object({
  heading: text('章の見出し。文書の中で重ならない。章はこれで指す'),
  folded: { type: 'boolean', description: '一部の読み手にだけ要る章を畳む' },
  blocks: { type: 'array', items: block },
}, ['heading', 'blocks'])

// 読み手向けの文書。見た目はページが描くので、HTML は書かない。cs と ops が使う
const spec = {
  name: 'revise_document',
  description: '読み手向けの文書を、章を単位に足す・直す・消す。直す章だけ渡す。見た目はダッシュボードが描くので、HTML は書かない',
  inputSchema: object({
    document: { type: 'string', enum: ReaderDocument.names(), description: 'guide: ヘルプガイド、decisionLog: 聞かずに決めた仕様、operationsDesign: 運用設計書' },
    title: text('文書の題。変えるときだけ'),
    changes: {
      type: 'array',
      items: {
        type: 'object',
        oneOf: [
          tagged('op', 'add', { section }, { after: text('この見出しの章の次に足す。省略すると末尾') }),
          tagged('op', 'replace', { heading: text('直す章の今の見出し'), section }),
          tagged('op', 'remove', { heading: text('消す章の今の見出し') }),
        ],
      },
    },
  }, ['document', 'changes']),
  isDeferred: false,
}

// 今の文書に変更を当てて、読んだ版に固定して書き直す。1 件でも問題があれば何も書かない
const run = async (engine: Engine, input: unknown) => {
  const session = await engine.fleet()
  return JsonSchema.check<ReviseDocument>(spec.inputSchema, input).either(
    call => FleetDb.revise(engine, FleetDb.paths()[call.document], doc => ReaderDocument.revise(session?.role, doc as ReaderDocumentDoc | undefined, call), 'DocumentRevised'),
    async error => ({ deny: error }))
}

export const reviseDocument = { tool: 'mcp__software-fleet__revise_document' as const, spec, run } satisfies FleetTool
