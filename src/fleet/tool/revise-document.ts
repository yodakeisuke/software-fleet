import type { DocumentInput, Engine, FleetTool, JsonSchemaNode, ReaderDocument as ReaderDocumentDoc } from '../../types/fleet'
import { FleetDb } from '../db/fleet-db'
import { ReaderDocument } from '../logic/reader-document'
import { JsonSchema } from '../schema/json-schema'

const { text, object, ref, choice, tag, list, changes } = JsonSchema
const kind = (name: string, fields: Record<string, JsonSchemaNode>) => object({ kind: tag(name), ...fields }, ['kind', ...Object.keys(fields)])
const texts = list(text())
const block: JsonSchemaNode = {
  type: 'object',
  oneOf: [
    kind('text', { text: text() }),
    kind('steps', { items: texts }),
    kind('list', { items: texts }),
    kind('table', { head: texts, rows: list(list({ type: 'string' })) }),
    kind('ascii', { ascii: text('等幅で描く図') }),
    kind('svg', { svg: { ...text('viewBox のある <svg>…</svg>。色は var(--fg) var(--muted) var(--bg) var(--surface) var(--line) var(--acc) を使う'), pattern: '^\\s*<svg\\b[^>]*\\sviewBox=' } }),
    kind('warning', { text: text() }),
  ],
}
const section = object({ heading: text('章の見出し。鍵'), blocks: list(block) }, ['heading', 'blocks'])

// 読み手向けの文書。cs と ops が使う
const spec = {
  name: 'revise_document',
  description: '読み手向けの文書を、章を単位に足す・直す・消す。直す章だけ渡し、今の見出しで指す。文字はそのまま出るので、HTML も Markdown も書かない',
  inputSchema: { ...object({
    document: choice(['guide', 'unaskedSpecs', 'operationsDesign'], 'guide: ヘルプガイド、unaskedSpecs: 聞かずに決めた仕様（skill の Decision log）、operationsDesign: 運用設計書'),
    changes: changes(ref('section'), text('今の見出し'), undefined, { after: text('この見出しの章の次に足す。省くと末尾') }),
  }, ['document', 'changes']), $defs: { section } },
  isDeferred: false,
}

// 今の文書に変更を当てて、読んだ版に固定して書き直す。1 件でも問題があれば何も書かない
const run = async (engine: Engine, input: unknown) => JsonSchema.check<DocumentInput>(spec.inputSchema, input).either(
  ({ document, changes }) => FleetDb.revise(engine, FleetDb.paths()[document], doc =>
    ReaderDocument.revise((doc as ReaderDocumentDoc | undefined)?.sections ?? [], changes).and(sections => ({ sections })), 'DocumentRevised'),
  async error => ({ deny: error }))

export const reviseDocument = { tool: 'mcp__software-fleet__revise_document' as const, spec, run } satisfies FleetTool
