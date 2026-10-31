import { describe, expect, test } from 'claude-code/testing'

import { PullRequest } from './pull-request'

const verdict = (url: string) => PullRequest.of({ url }).either<unknown>(value => value, error => error)

describe('pull-request', () => {
  test('GitHub の PR の URL は通す', () => {
    expect(verdict('https://github.com/owner/repo/pull/12')).toEqual({ url: 'https://github.com/owner/repo/pull/12' })
  })

  test('それ以外の URL は理由を付けて拒む', () => {
    for (const url of ['javascript:alert(1)', 'http://github.com/owner/repo/pull/12', 'https://github.com/owner/repo', 'https://example.com/owner/repo/pull/12']) {
      expect(verdict(url)).toBe(`GitHub の PR の URL ではない: ${url}`)
    }
  })
})
