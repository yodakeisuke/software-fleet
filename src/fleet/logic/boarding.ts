import type { FleetSession, Result as Data, Role, ShipName } from '../../types/fleet'
import { Result } from './result'

// --- public interface
export const Boarding = {
  ships: () => ships(),
  join: (aboard: FleetSession | undefined, wanted: FleetSession) => join(aboard, wanted),
  publisher: (alone: ShipName | undefined) => publisher(alone),
}

// --- business rules
// fleet に乗れるのは flagship と、この 8 隻の ship
const ships = (): readonly ShipName[] => ['requirement', 'behavior', 'architect', 'coder', 'qa', 'cs', 'security', 'ops']
// 乗るのは一度だけ。乗ったセッションは、別の fleet にも別の役割にも乗り換えない
const join = (aboard: FleetSession | undefined, wanted: FleetSession) =>
  Result.given<Data<FleetSession, string>>(aboard !== undefined ? { ok: false, error: `すでに ${aboard.role} として乗っている` }
    : isRole(wanted.role) ? { ok: true, value: wanted } : { ok: false, error: `fleet の役割ではない: ${wanted.role}` })
// ダッシュボードを publish して fleet を起こした者の役割。単独で起きた ship はその ship、そうでなければ flagship
const publisher = (alone: ShipName | undefined): Role => alone ?? 'flagship'
// flagship か ship のどれか
const isRole = (role: string): role is Role => role === 'flagship' || (ships() as readonly string[]).includes(role)
