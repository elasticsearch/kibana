/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { execFileSync } from 'child_process';
import { getParentCommitSha } from './get_parent_commit_sha';

const COMMIT_SHA = 'a'.repeat(40);
const PARENT_SHA = 'b'.repeat(40);

describe('getParentCommitSha', () => {
  it('returns the first parent from git when it is available locally', async () => {
    const execFile = jest.fn().mockReturnValue(`${PARENT_SHA}\n`);

    await expect(
      getParentCommitSha(COMMIT_SHA, {
        execFileSync: execFile as unknown as typeof execFileSync,
        kibanaDir: '/repo',
      })
    ).resolves.toBe(PARENT_SHA);

    expect(execFile).toHaveBeenCalledWith('git', ['rev-parse', `${COMMIT_SHA}^`], {
      cwd: '/repo',
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  });

  it('falls back to GitHub when the parent is not available locally', async () => {
    const execFile = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('missing local commit');
      })
      .mockReturnValueOnce(`${PARENT_SHA}\n`);

    await expect(
      getParentCommitSha(COMMIT_SHA, {
        execFileSync: execFile as unknown as typeof execFileSync,
        kibanaDir: '/repo',
      })
    ).resolves.toBe(PARENT_SHA);

    expect(execFile).toHaveBeenNthCalledWith(
      2,
      'gh',
      ['api', `repos/elastic/kibana/commits/${COMMIT_SHA}`, '--jq', '.parents[0].sha'],
      {
        cwd: '/repo',
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    );
  });

  it('returns null when neither git nor GitHub can resolve the parent', async () => {
    const execFile = jest.fn().mockImplementation(() => {
      throw new Error('lookup failed');
    });

    await expect(
      getParentCommitSha(COMMIT_SHA, {
        execFileSync: execFile as unknown as typeof execFileSync,
        kibanaDir: '/repo',
      })
    ).resolves.toBeNull();
  });
});
