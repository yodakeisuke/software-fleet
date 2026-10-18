import type { Review, Ship as ShipStatus, ShipName } from '../../engine-protocol'

// --- public interface
export const Turn = {
  required: (ship: ShipName, review: Review | undefined) => required(ship, review),
  awaiting: (ship: ShipName, status: ShipStatus, review: Review | undefined) => awaiting(ship, status, review),
}

// --- business rules
// ユーザが決めない限り、構造の品質（code-design）と QA の十分さ（qa）だけ人がレビューする
const required = (ship: ShipName, review: Review | undefined) => review?.required ?? ['code-design', 'qa'].includes(ship)
// 収束して、レビューが要り、今の収束をまだ承認していない
const awaiting = (ship: ShipName, status: ShipStatus, review: Review | undefined) =>
  status.state === 'converged' && required(ship, review) && review?.approved_since !== status.since
