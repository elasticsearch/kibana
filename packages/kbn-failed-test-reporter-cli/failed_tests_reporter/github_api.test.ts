/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ToolingLog } from '@kbn/tooling-log';

import { GithubApi, nextPageUrl } from './github_api';

const log = new ToolingLog();

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GithubApi#getIssueComments()', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('follows pagination until a short page and normalizes missing bodies', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ body: `comment ${i}` }));
    const page2 = [{ body: 'last comment' }, {}];

    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (url) =>
        jsonResponse(new URL(String(url)).searchParams.get('page') === '1' ? page1 : page2)
      );

    const api = new GithubApi({ log, token: 'secret', dryRun: false });
    const comments = await api.getIssueComments(1234);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requestedUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(requestedUrls[0]).toContain('issues/1234/comments?per_page=100&page=1');
    expect(requestedUrls[1]).toContain('issues/1234/comments?per_page=100&page=2');

    expect(comments).toHaveLength(102);
    expect(comments[0]).toEqual({ body: 'comment 0' });
    expect(comments[100]).toEqual({ body: 'last comment' });
    expect(comments[101]).toEqual({ body: '' });
  });

  it('stops after a single page when it is not full', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse([{ body: 'only comment' }]));

    const api = new GithubApi({ log, token: 'secret', dryRun: false });
    const comments = await api.getIssueComments(42);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(comments).toEqual([{ body: 'only comment' }]);
  });

  it('returns an empty list without requests in dry-run mode', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');

    const api = new GithubApi({ log, token: undefined, dryRun: true });

    expect(await api.getIssueComments(42)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('nextPageUrl()', () => {
  it('returns the rel="next" link', () => {
    expect(
      nextPageUrl(
        '<https://api.github.com/repositories/1/issues?page=2>; rel="next", <https://api.github.com/repositories/1/issues?page=16>; rel="last"'
      )
    ).toBe('https://api.github.com/repositories/1/issues?page=2');
  });

  it('is undefined on the last page or without a Link header', () => {
    expect(
      nextPageUrl(
        '<https://api.github.com/repositories/1/issues?page=15>; rel="prev", <https://api.github.com/repositories/1/issues?page=1>; rel="first"'
      )
    ).toBeUndefined();
    expect(nextPageUrl(null)).toBeUndefined();
  });
});

describe('GithubApi#listIssues()', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const issue = (number: number, extra: Record<string, unknown> = {}) => ({
    number,
    html_url: `https://github.com/elastic/kibana/issues/${number}`,
    node_id: `n${number}`,
    title: `#${number}`,
    labels: [],
    body: `body ${number}`,
    state: 'open',
    ...extra,
  });

  const page = (items: unknown[], nextUrl?: string) =>
    new Response(JSON.stringify(items), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...(nextUrl ? { Link: `<${nextUrl}>; rel="next"` } : {}),
      },
    });

  /** No pause between pages, so tests do not need timers for a plain listing. */
  const list = (api: GithubApi, options: Partial<Parameters<GithubApi['listIssues']>[0]> = {}) =>
    api.listIssues({ state: 'open', pageIntervalMs: 0, ...options });

  it('lists the issues of the repository with the given filters, 100 a page', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () => page([issue(5), issue(6)]));

    const api = new GithubApi({ log, token: 'secret', dryRun: false, repo: 'elastic/sandbox' });
    const since = new Date('2025-09-10T12:00:00.000Z');
    const issues = await list(api, {
      state: 'closed',
      labels: ['failed-test', 'skipped-test'],
      since,
      sort: 'updated',
      direction: 'asc',
    });

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe('https://api.github.com/repos/elastic/sandbox/issues');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      state: 'closed',
      labels: 'failed-test,skipped-test',
      since: '2025-09-10T12:00:00.000Z',
      sort: 'updated',
      direction: 'asc',
      per_page: '100',
    });
    expect(issues.map(({ number }) => number)).toEqual([5, 6]);
  });

  it('sends only the state and page size when no filter is given', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () => page([]));

    const api = new GithubApi({ log, token: 'secret', dryRun: false });
    await list(api);

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(Object.fromEntries(url.searchParams)).toEqual({ state: 'open', per_page: '100' });
  });

  it('follows the Link header, drops pull requests and normalizes missing bodies', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (new URL(String(url)).searchParams.get('page') === '2') {
        return page([issue(3, { body: null })]);
      }
      // A short first page that is not the last one
      return page(
        [issue(1), issue(2, { pull_request: {} })],
        'https://api.github.com/repositories/7833168/issues?state=open&per_page=100&page=2'
      );
    });

    const api = new GithubApi({ log, token: 'secret', dryRun: false });
    const issues = await list(api);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(issues.map(({ number, body }) => [number, body])).toEqual([
      [1, 'body 1'],
      [3, ''],
    ]);
  });

  it('pauses between pages but not before the first one', async () => {
    jest.useFakeTimers();
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const pageNumber = new URL(String(url)).searchParams.get('page') ?? '1';
      return pageNumber === '3'
        ? page([issue(3)])
        : page(
            [issue(Number(pageNumber))],
            `https://api.github.com/repos/elastic/kibana/issues?page=${Number(pageNumber) + 1}`
          );
    });

    const api = new GithubApi({ log, token: 'secret', dryRun: false });
    const pending = api.listIssues({ state: 'open', pageIntervalMs: 300 });

    await jest.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(300);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(300);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    expect((await pending).map(({ number }) => number)).toEqual([1, 2, 3]);
  });

  it('still fetches in dry-run mode because listing is read-only', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () => page([issue(1)]));

    const api = new GithubApi({ log, token: undefined, dryRun: true });
    const issues = await list(api);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(issues).toHaveLength(1);
  });

  it('waits as long as retry-after says when rate limited', async () => {
    jest.useFakeTimers();
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementationOnce(
        async () => new Response('rate limited', { status: 403, headers: { 'Retry-After': '7' } })
      )
      .mockImplementationOnce(async () => page([issue(1)]));
    jest.spyOn(log, 'warning').mockImplementation(() => {});

    const api = new GithubApi({ log, token: 'secret', dryRun: false });
    const pending = list(api);
    await jest.advanceTimersByTimeAsync(7000);
    const issues = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(issues).toHaveLength(1);
  });

  it('waits until the primary rate limit resets when only the x-ratelimit headers are sent', async () => {
    jest.useFakeTimers();
    const resetInSeconds = 20;
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementationOnce(
        async () =>
          new Response('API rate limit exceeded', {
            status: 403,
            headers: {
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + resetInSeconds),
            },
          })
      )
      .mockImplementationOnce(async () => page([issue(1)]));
    const warning = jest.spyOn(log, 'warning').mockImplementation(() => {});

    const api = new GithubApi({ log, token: 'secret', dryRun: false });
    const pending = list(api);
    await jest.advanceTimersByTimeAsync(resetInSeconds * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2000);
    const issues = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(issues).toHaveLength(1);
    expect(warning).toHaveBeenCalledWith(expect.stringMatching(/rate limited, waiting 2[12]s/));
  });

  it('backs off from a minute when a secondary rate limit sends no headers at all', async () => {
    jest.useFakeTimers();
    const secondaryLimit = () =>
      new Response(
        JSON.stringify({
          message:
            'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.',
        }),
        { status: 403 }
      );
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementationOnce(async () => secondaryLimit())
      .mockImplementationOnce(async () => secondaryLimit())
      .mockImplementationOnce(async () => page([issue(1)]));
    const warning = jest.spyOn(log, 'warning').mockImplementation(() => {});

    const api = new GithubApi({ log, token: 'secret', dryRun: false });
    const pending = list(api);

    await jest.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(120_000);
    const issues = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(issues).toHaveLength(1);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('rate limited, waiting 60s'));
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('rate limited, waiting 120s'));
  });

  it('does not retry a 403 that is not a rate limit', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ message: 'Resource not accessible by integration' }), {
          status: 403,
        })
    );

    const api = new GithubApi({ log, token: 'secret', dryRun: false });

    await expect(list(api)).rejects.toThrow('Resource not accessible by integration');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
