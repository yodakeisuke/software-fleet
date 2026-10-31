// 本流（本体の指示・返事・描画）を邪魔しないルール。コンテキストに載せない・いじらない、遅い呼び出しで待たせない
const rule = (description, create) => ({ meta: { type: 'problem', docs: { description } }, create })
// hook してよいイベント。block・deny・プロンプトへの注入・tool や agent の書き換えは、どれもこの外でしかできない（ui.close は mod のペインを閉じさせないためだけ）
const EVENTS = ['session.start', 'command.run', 'prompt.submit', 'prompt.edit', 'ui.render', 'ui.close']
// mod 自身が登録したツール。これに答える tool.call は本体のツールに介入しない
const OWN_TOOL = /^mcp__software-fleet__/
// fleet が tool.call で扱う本体のツール。Skill は合図（ship の専用ツールを登録する）、ArtifactData は fleet の DB への生の書き込みを拒否する、Artifact は flagship のダッシュボードの publish を合図にする、preview_start は dev server を起こすとユーザの確認で fleet が止まるので拒否する
const FLEET_TOOLS = ['Skill', 'ArtifactData', 'Artifact', 'mcp__Claude_Browser__preview_start']
// fleet が tool.check で扱う本体のツール。ArtifactData は mod 自身の fleet の DB への書き込みにだけ許可を返す（auto mode の classifier が、ほかのセッションの連絡で始まったターンで判定を付けないため）
const CHECKED_TOOLS = ['ArtifactData']
// 本体のコンテキスト（モデルが読むもの）や会話の流れ・入力欄の提案を変える呼び出し。session.send は fleet の ship 同士の通知に使うので外す
const CONTEXT_CALLS = ['prompt.submit', 'prompt.compose', 'prompt.suggest', 'session.append', 'session.compact', 'turn.abort']
// 待つと本流が目に見えて止まる呼び出し（名詞ごと、または名詞.動詞）。数 ms の読み書きは気にしない
const SLOW = ['model', 'mcp', 'audio', 'ui.ask']
// mod 自身の場所。ここの描画は本流でない
const OWN = ['Pane', 'AbovePrompt']

const isFunction = node => /Function/.test(node?.type ?? '')
// その場で走るノード（中の関数は押したときなどに後で走るので除く）
const ownNodes = node => Object.entries(node).filter(([key]) => key !== 'parent').flatMap(([, value]) => [value].flat())
  .filter(child => typeof child?.type === 'string').flatMap(child => [child, ...(isFunction(child) ? [] : ownNodes(child))])
const bodyOf = fn => (isFunction(fn.body) ? [] : [fn.body, ...ownNodes(fn.body)])
const callsOf = (fn, name) => bodyOf(fn).filter(n => n.type === 'CallExpression' && n.callee.name === name)
// 呼んだ側が待つ値：await するものと、返すもの（式の本体か return の値）
const waitedOf = fn => [...bodyOf(fn).filter(n => n.type === 'AwaitExpression').map(n => n.argument), ...(fn.body.type === 'BlockStatement' ? bodyOf(fn).filter(n => n.type === 'ReturnStatement').map(n => n.argument) : [fn.body])].filter(Boolean)
const memberName = callee => (callee.type === 'MemberExpression' && callee.object.type === 'MemberExpression' ? `${callee.object.property.name}.${callee.property.name}` : undefined)

// on(イベント, [絞り込み], hook)。本流の hook は、本体の指示・入力欄・本体の部品の描画を通すもの
const hookOf = node => {
  const [name, matcher] = node.arguments
  if (node.callee.name !== 'on' || name?.type !== 'Literal') return undefined
  const keyOf = key => (matcher?.type === 'ObjectExpression' ? matcher.properties.find(p => p.key?.name === key)?.value.value : undefined)
  const component = keyOf('component')
  const handler = node.arguments.at(-1)
  const isMain = isFunction(handler) && (['prompt.submit', 'prompt.edit'].includes(name.value) || (name.value === 'ui.render' && !OWN.includes(component)))
  const tool = keyOf('tool') ?? ''
  // { tool: setBrief.tool } は mod 自身の tool（FleetTool の tool は mcp__software-fleet__<name>）
  const toolNode = matcher?.type === 'ObjectExpression' ? matcher.properties.find(p => p.key?.name === 'tool')?.value : undefined
  const isOwnToolRef = toolNode?.type === 'MemberExpression' && !toolNode.computed && toolNode.property.name === 'tool'
  const isAllowedTool = (name.value === 'tool.call' && (OWN_TOOL.test(tool) || FLEET_TOOLS.includes(tool) || isOwnToolRef))
    || (name.value === 'tool.check' && CHECKED_TOOLS.includes(tool))
  return { name, handler, isMain, isAllowedTool }
}

export default {
  meta: { name: 'mainstream' },
  rules: {
    'no-context': rule('本流のコンテキストに載せない・いじらない', context => ({
      CallExpression: node => {
        if (CONTEXT_CALLS.includes(memberName(node.callee))) context.report({ node, message: `$.${memberName(node.callee)} は本流のコンテキストや流れを変える` })
        const hook = hookOf(node)
        if (!hook) return
        if (!EVENTS.includes(hook.name.value) && !hook.isAllowedTool) context.report({ node: hook.name, message: `${hook.name.value} は hook しない。本流に介入できるイベントは許可リスト（lint/mainstream.js の EVENTS）の外` })
        if (!hook.isMain) return
        const e = hook.handler.params[1]?.name
        const nexts = callsOf(hook.handler, 'next')
        if (nexts.length === 0) context.report({ node: hook.handler, message: '本流の hook は next(e) を呼ぶ。本体の指示・描画を置き換えない' })
        nexts.filter(n => !e || n.arguments.length !== 1 || n.arguments[0].name !== e).forEach(n => context.report({ node: n, message: 'next には受け取った e をそのまま渡す。本体の指示・描画をいじらない' }))
      },
    })),
    'no-delay': rule('本流を遅い呼び出しで待たせない', context => {
      const fns = new Map()
      const slow = new Map()
      // 遅い呼び出し（$.model.complete など）か、それを待つ同じファイルの関数。中の関数は後で走るので見ない
      const isSlow = expr => [expr, ...ownNodes(expr)].some(n => n.type === 'CallExpression' && (isSlowCall(memberName(n.callee)) || isSlowFn(n.callee.name)))
      const isSlowCall = name => SLOW.includes(name) || SLOW.includes(name?.split('.')[0])
      const isSlowFn = name => {
        if (!fns.has(name)) return false
        // 調べている途中の関数（再帰）は遅くないとみなす
        if (!slow.has(name)) {
          slow.set(name, false)
          slow.set(name, waitedOf(fns.get(name)).some(isSlow))
        }
        return slow.get(name)
      }
      return {
        Program: node => node.body.map(s => (s.type === 'ExportNamedDeclaration' ? s.declaration : s)).filter(s => s?.type === 'VariableDeclaration')
          .flatMap(s => s.declarations).filter(d => isFunction(d.init)).forEach(d => fns.set(d.id.name, d.init)),
        CallExpression: node => {
          const hook = hookOf(node)
          if (hook?.isMain) waitedOf(hook.handler).filter(isSlow).forEach(n => context.report({ node: n, message: '本流の hook でモデル・外部サーバー・音声・人の返答を待たない。$.clock.after(0, …) で後に回すか、void で投げる' }))
        },
      }
    }),
  },
}
