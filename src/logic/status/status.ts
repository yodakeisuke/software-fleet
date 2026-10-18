import type { Ship, Status as StatusDoc } from '../../types/fleet'

// --- public interface
export const Status = {
  since: (status: StatusDoc, now: string) => since(status, now),
}

// --- business rules
// ship の状態は、報告した時刻から始まる（報告のたびに新しくなるので、収束し直せば承認も取り直しになる）
const since = (status: StatusDoc, now: string): Ship => ({ ...status, since: now })
