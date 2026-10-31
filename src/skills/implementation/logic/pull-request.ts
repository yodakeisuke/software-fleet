import type { PullRequest as PullRequestDoc, Result as Data } from '../../../types/fleet'
import { Result } from '../../../fleet/logic/result'

// --- public interface
export const PullRequest = {
  of: (pullRequest: PullRequestDoc) => of(pullRequest),
}

// --- business rules
// ユーザがスマホで押すリンクになるので、GitHub の PR の URL だけを通す
const of = (pullRequest: PullRequestDoc) => Result.given<Data<PullRequestDoc, string>>(/^https:\/\/github\.com\/[A-Za-z0-9-]+\/(?!\.{1,2}\/)[A-Za-z0-9._-]+\/pull\/\d+$/.test(pullRequest.url)
  ? { ok: true, value: pullRequest } : { ok: false, error: `GitHub の PR の URL ではない: ${pullRequest.url}` })
