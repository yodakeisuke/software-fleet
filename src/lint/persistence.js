// 永続化のルール。ユーザーのディスクに残してよいのは設定と、fleet の状態だけ。
const MESSAGE = 'ディスクに残してよいのは設定（$.store の settings）と fleet の状態（$.fs.write で ~/.software-fleet の下）だけ。それ以外はセッションの間だけ atom に持つ'
// $.store は settings の set・delete だけ通す。$.fs.write は fleet の状態の書き出しに使う。$.config.set・$.process は書き込みの抜け道
const isAllowed = (area, action, key) => area !== 'store' || !['set', 'delete'].includes(action) || key?.value === 'settings'
const isWrite = (area, action) => (area === 'config' && action === 'set') || area === 'process'
const nameOf = node => (node?.type === 'MemberExpression' && !node.computed ? node.property.name : undefined)

export default {
  meta: { name: 'persistence' },
  rules: {
    'settings-only': {
      meta: { type: 'problem', docs: { description: '設定と fleet の状態のほかは永続化しない' } },
      create: context => ({
        CallExpression: node => {
          const [area, action] = [nameOf(node.callee.object), nameOf(node.callee)]
          if (isWrite(area, action) || !isAllowed(area, action, node.arguments[0])) context.report({ node, message: MESSAGE })
        },
      }),
    },
  },
}
