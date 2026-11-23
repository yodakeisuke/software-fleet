import type { Engine, Model } from '../../../types/fleet'
import { FleetDb } from '../../../fleet/db/fleet-db'
import { Pointers } from '../logic/pointers'

// coder が収束（＝レビュー待ち）を報告するとき、地図の code をいまのコードと照合し直し、ずれていれば報告を拒む理由を返す。止めないなら undefined
// 地図を出した後にコードを直すと、実線の箱が指す物が消えていることがある。ユーザが地図を見るのは収束の後
export const forbidStaleMap = async (engine: Engine, report: { status?: { state?: unknown } }) => {
  if (report.status?.state !== 'converged' || (await engine.fleet())?.role !== 'coder') return undefined
  const model = await FleetDb.read(engine, FleetDb.paths().model) as Model | undefined
  const found = model === undefined ? [] : Pointers.problems(model, await engine.sources(Pointers.files(model)))
  return found.length === 0 ? undefined : `地図がいまのコードとずれている。revise_model で直してから報告する: ${found.join(' / ')}`
}
