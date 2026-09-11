/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { execFileSync } from 'child_process';
import type { ToolingLog } from '@kbn/tooling-log';

export interface LocalGitState {
  sha?: string;
  dirty?: boolean;
}

/**
 * Read the generator's own git state so the artifact says which code produced
 * it. `BUILDKITE_COMMIT` covers CI; locally it is unset, which is precisely
 * where an artifact gets regenerated, compared against an older one, and
 * mistaken for a reproduction of it.
 *
 * Never throws: provenance is a label on the artifact, not a reason to fail a
 * run that otherwise succeeded.
 */
export function readLocalGitState(repoRoot: string, log: ToolingLog): LocalGitState {
  const git = (args: string[]) =>
    execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

  try {
    return {
      sha: git(['rev-parse', 'HEAD']).trim(),
      // Untracked files are excluded: they cannot change generator behaviour,
      // and scratch files in a worktree would otherwise flag every local run.
      dirty: git(['status', '--porcelain', '--untracked-files=no']).trim().length > 0,
    };
  } catch (error) {
    log.debug(
      `Could not read local git state for provenance: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return {};
  }
}
