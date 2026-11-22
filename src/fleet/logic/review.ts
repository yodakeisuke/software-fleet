import type { Review as ReviewDoc, Ship, ShipName, Status } from '../../types/fleet'

// --- public interface
export const Review = {
  since: (status: Status, now: string) => since(status, now),
  required: (ship: ShipName, review: ReviewDoc | undefined) => required(ship, review),
  awaiting: (ship: ShipName, status: Ship, review: ReviewDoc | undefined) => awaiting(ship, status, review),
}

// --- business rules
// ship の状態は報告した時刻から始まる（報告のたびに新しくなるので、収束し直せば承認も取り直しになる）
const since = (status: Status, now: string): Ship => ({ ...status, since: now })
// ユーザが決めない限り、構造の品質（システムは architect、コードの中は coder の地図）と QA の十分さ（qa）だけ人がレビューする
const required = (ship: ShipName, review: ReviewDoc | undefined) => review?.required ?? ['architect', 'coder', 'qa'].includes(ship)
// 収束して、レビューが要り、今の収束をまだ承認していない
const awaiting = (ship: ShipName, status: Ship, review: ReviewDoc | undefined) =>
  status.state === 'converged' && required(ship, review) && review?.approved_since !== status.since
