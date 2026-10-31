import type { Engine } from '../../types/fleet'

// fleet のセッションが preview_start で dev server を起こすことを拒む理由を返す。止めないなら undefined
// name で起こすと毎回ユーザの確認が出て、答えるまでセッションが止まる（電車のスマホからは答えられない）。url で開くだけなら通す
export const forbidPreview = async (engine: Engine, call: { name?: unknown }) =>
  (call.name === undefined || (await engine.fleet()) === undefined ? undefined : 'preview_start で dev server を起こすとユーザの確認で止まるので fleet では使わない。サーバは Bash の run_in_background で起こし、preview_start の url で開く')
