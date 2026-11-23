import type { Engine, Model } from '../../../types/fleet'
import { FleetDb } from '../../../fleet/db/fleet-db'
import { Pointers } from '../logic/pointers'

// coder が収束（＝レビュー待ち）を報告するとき、地図の code をいまのコードと照合し直し、ずれていれば報告を拒む理由を返す。止めないなら undefined
// 地図を出した後にコードを直すと、実線の箱が指す物が消えていることがある。設計図を読めなかったときも、照合できていないので拒む（まだ無いのとは分ける）
export const forbidStaleMap = async (engine: Engine, report: { status?: { state?: unknown } }) => {
  if (report.status?.state !== 'converged' || (await engine.fleet())?.role !== 'coder') return undefined
  return (await FleetDb.load(engine, FleetDb.paths().model)).either(async doc => {
    const model = doc as Model | undefined
    const found = model === undefined ? [] : Pointers.problems(model, await engine.sources(Pointers.files(model)))
    return found.length === 0 ? undefined : `地図がいまのコードとずれている。revise_model で直してから報告する: ${found.join(' / ')}`
  }, async error => `設計図を読めず、地図をいまのコードと照合できなかった（${error}）。もう一度報告する`)
}
