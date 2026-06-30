/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { execFileSync } from 'child_process';

export interface GetParentCommitShaDeps {
  readonly execFileSync?: typeof execFileSync;
  readonly kibanaDir?: string;
}

export const getParentCommitSha = async (
  commitSha: string,
  { execFileSync: execFile = execFileSync, kibanaDir = process.cwd() }: GetParentCommitShaDeps = {}
): Promise<string | null> => {
  try {
    const parentSha = execFile('git', ['rev-parse', `${commitSha}^`], {
      cwd: kibanaDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return parentSha.length > 0 ? parentSha : null;
  } catch {
    try {
      const parentSha = execFile(
        'gh',
        ['api', `repos/elastic/kibana/commits/${commitSha}`, '--jq', '.parents[0].sha'],
        {
          cwd: kibanaDir,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }
      ).trim();

      if (!parentSha || parentSha === 'null') {
        return null;
      }

      return parentSha;
    } catch {
      return null;
    }
  }
};
