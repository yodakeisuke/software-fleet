// 置き場所と依存のルール（DESIGN.md「コードの置き場所」）。パスの区切りでファイルの居場所を見る
import { dirname, resolve, sep } from 'node:path'

const rule = (description, create) => ({ meta: { type: 'problem', docs: { description } }, create })
// src の下の区切り（src がなければ全部）
const partsOf = file => {
  const parts = file.split(/[\\/]/)
  const at = parts.lastIndexOf('src')
  return at < 0 ? parts : parts.slice(at + 1)
}
const isRegister = parts => parts.at(-2) === 'hooks' && /^register\.[jt]sx?$/.test(parts.at(-1) ?? '')
// skills/<機能> の機能名
const featureOf = parts => (parts[0] === 'skills' ? parts[1] : undefined)
// import 先を、読む側のファイルの位置から解決した区切り（パッケージなら undefined）
const targetOf = (file, source) => (source.startsWith('.') ? partsOf(resolve(dirname(file), source).split(sep).join('/')) : undefined)

// import の向きを 1 つのルールで見る。logic → logic と型だけ／fleet → skills を読まない／skills/A → skills/B を読まない／hooks/register.tsx は誰も読まない
const direction = (from, target, source) => {
  if (target && isRegister([target.at(-2), target.at(-1)?.replace(/(\.[jt]sx?)?$/, '.tsx')])) return 'hooks/register.tsx は組み立て役なので、誰も import しない'
  if (from.includes('logic') && !(target && (target.includes('logic') || target[0] === 'types'))) return `logic が読めるのは、ほかの logic と型だけ（${source}）`
  if (from[0] === 'fleet' && target?.[0] === 'skills') return 'fleet/ は skills/ を読まない。機能ごとの tool の一覧は hooks/register.tsx が集めて渡す'
  const [own, other] = [featureOf(from), target && featureOf(target)]
  if (own && other && own !== other) return `skills の機能どうしは読み合わない（${own} → ${other}）。2 つ以上の機能が使うものは fleet/ に置く`
  return undefined
}

// 総称のファイル名・フォルダ名。名前は中身を言う
const GENERIC = ['utils', 'helpers', 'adapter', 'tools', 'common', 'misc']

const unwrap = node => (['TSAsExpression', 'TSSatisfiesExpression', 'ParenthesizedExpression'].includes(node?.type) ? unwrap(node.expression) : node)
const keysOf = object => object?.type === 'ObjectExpression' ? object.properties.map(p => p.key?.name ?? p.key?.value) : []

export default {
  meta: { name: 'structure' },
  rules: {
    'import-direction': rule('import の向きを一方向に保つ', context => ({
      ImportDeclaration: node => {
        const reason = direction(partsOf(context.filename), targetOf(context.filename, node.source.value), node.source.value)
        if (reason) context.report({ node, message: reason })
      },
    })),
    'engine-in-register': rule('$ と $.state の鍵は hooks/register.tsx だけに書く', context => {
      if (isRegister(partsOf(context.filename))) return {}
      const report = (node, what) => context.report({ node, message: `${what} は hooks/register.tsx だけに書く。tool・hook は engine（関数の束）を受け取る` })
      return {
        Identifier: node => node.name === '$' && report(node, '$'),
        ObjectExpression: node => ['plugin', 'key'].every(k => keysOf(node).includes(k)) && report(node, '$.state の鍵（{ plugin, key }）'),
        ImportDeclaration: node => node.source.value === 'claude-code' && report(node, "'claude-code' の import"),
      }
    }),
    'generic-name': rule('総称のファイル名・フォルダ名を使わない', context => ({
      Program: node => {
        const found = partsOf(context.filename).map(part => part.replace(/\..*$/, '')).find(name => GENERIC.includes(name))
        if (found) context.report({ node, message: `「${found}」は中身を言わない名前。何をするものかで名付ける` })
      },
    })),
    'tool-export': rule('tool/ のファイルは宣言と処理（{ tool, spec, run }）を export する', context => ({
      Program: node => {
        if (!partsOf(context.filename).slice(0, -1).includes('tool')) return
        const exported = node.body.filter(s => s.type.startsWith('Export'))
        const isTool = s => s.type === 'ExportNamedDeclaration' && s.declaration?.type === 'VariableDeclaration' &&
          s.declaration.declarations.every(d => ['tool', 'spec', 'run'].every(k => keysOf(unwrap(d.init)).includes(k)))
        if (exported.length === 0 || !exported.every(isTool)) {
          context.report({ node, message: 'tool/ のファイルは、宣言と処理を 1 つにした `export const x = { tool, spec, run }` だけを export する' })
        }
      },
    })),
  },
}
