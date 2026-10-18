import type { Result as Data, ShipName } from '../../types/fleet'
import { Result } from '../primitive/result'

// --- public interface
export const Ship = {
  names: () => names(),
  of: (skill: string) => of(skill),
}

// --- business rules
// fleet の ship。skill の名前と同じ
const names = (): readonly ShipName[] => ['requirement', 'behavior', 'code-design', 'implementation', 'qa', 'cs', 'security', 'ops']
// 同梱 skill の呼び出し（software-fleet:<ship>）から、どの ship かを知る
const of = (skill: string) => {
  const name = names().find(ship => skill === `software-fleet:${ship}`)
  return Result.given<Data<ShipName, string>>(name ? { ok: true, value: name } : { ok: false, error: `fleet の ship の skill ではない: ${skill}` })
}
