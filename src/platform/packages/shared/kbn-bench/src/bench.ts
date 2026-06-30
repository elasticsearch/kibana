/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { IWorkspace } from '@kbn/workspaces';
import { activateWorktreeOrUseSourceRepo } from '@kbn/workspaces';
import Fs from 'fs/promises';
import Path from 'path';
import { runOnCompareCallbacks } from './compare/run_on_compare_callbacks';
import { collectAndRun } from './collect_and_run';
import { collectAndRunForRightHandSide } from './collect_and_run_for_right_hand_side';
import { getGlobalConfig } from './config/get_global_config';
import type { GlobalBenchConfig } from './config/types';
import { getDefaultDataDir } from './filesystem/get_default_data_dir';
import { reportDiffTerminal } from './report/terminal/report_diff_terminal';
import { reportSingleTerminal } from './report/terminal/report_single_terminal';
import type { GlobalRunContext } from './types';
import { writeResults } from './write_results';

export async function bench({
  log,
  config: configGlob,
  left,
  right,
  leftBuildDir,
  rightBuildDir,
  profile,
  openProfile,
  grep,
  runs,
  monitorInterval,
  configFromCwd,
}: {
  log: ToolingLog;
  config?: string | string[];
  left?: string;
  right?: string;
  leftBuildDir?: string;
  rightBuildDir?: string;
  profile?: boolean;
  openProfile?: boolean;
  grep?: string | string[];
  runs?: number;
  monitorInterval?: number;
  configFromCwd?: boolean;
}) {
  const buildDirOverrides = await resolveBuildDirOverrides({ leftBuildDir, rightBuildDir });

  if (buildDirOverrides && (left || right)) {
    throw new Error(
      '--left/--right git refs cannot be combined with --left-build-dir/--right-build-dir artifact comparison overrides'
    );
  }

  log.info(`Creating workspace for ${left || 'current working directory'}`);

  const sourceWorkspace = await activateWorktreeOrUseSourceRepo({
    log,
    ref: left,
  });
  const leftWorkspace = buildDirOverrides
    ? withComparisonIdentity(sourceWorkspace, 'left build-dir', buildDirOverrides.left)
    : sourceWorkspace;

  let rightWorkspace: IWorkspace | undefined;

  if (right || buildDirOverrides) {
    log.info(`Creating workspace for ${right || 'current working directory'}`);

    rightWorkspace = right
      ? await activateWorktreeOrUseSourceRepo({
          log,
          ref: right,
        })
      : withComparisonIdentity(sourceWorkspace, 'right build-dir', buildDirOverrides!.right);
  }

  const globalConfig = getGlobalConfig();
  const grepArray = Array.isArray(grep) ? grep : grep ? [grep] : undefined;
  const runtimeOverrides: Partial<GlobalBenchConfig> = {
    profile,
    openProfile,
    grep: grepArray,
    runs,
    monitorInterval,
  };

  const globalRunContext: Omit<GlobalRunContext, 'workspace' | 'log'> = {
    dataDir: getDefaultDataDir(),
    globalConfig,
    runtimeOverrides,
  };

  const leftLog = log.withContext(leftWorkspace.getDisplayName());

  const leftContext: GlobalRunContext = {
    ...globalRunContext,
    buildDir: buildDirOverrides?.left,
    workspace: leftWorkspace,
    log: leftLog,
  };

  leftLog.info(`Running benchmarks`);

  const leftResults = await collectAndRun({
    configGlob,
    context: leftContext,
    configFromCwd,
  });

  leftLog.info(`Completed benchmarks`);

  await writeResults(leftContext, leftResults);
  leftLog.debug(`Wrote results to disk`);

  if (!rightWorkspace) {
    log.debug('No right-hand side ref provided; reporting single-run results');
    log.info('\n' + reportSingleTerminal(leftResults));
    return;
  }

  leftLog.debug('\n' + reportSingleTerminal(leftResults));

  const rightLog = log.withContext(rightWorkspace.getDisplayName());

  const rightContext: GlobalRunContext = {
    ...globalRunContext,
    buildDir: buildDirOverrides?.right,
    workspace: rightWorkspace,
    log: rightLog,
  };

  rightLog.info(`Running benchmarks`);

  const rightResults = await collectAndRunForRightHandSide({
    configGlob,
    context: rightContext,
    leftResults,
    configFromCwd,
  });

  rightLog.info(`Completed benchmarks`);

  await writeResults(rightContext, rightResults);

  rightLog.debug(`Wrote results to disk`);

  rightLog.debug('\n' + reportSingleTerminal(leftResults));

  log.info(
    '\n' +
      reportDiffTerminal(
        {
          name: leftWorkspace.getDisplayName(),
          title: await leftWorkspace.getCommitLine(),
          results: leftResults,
        },
        {
          name: rightWorkspace.getDisplayName(),
          title: await rightWorkspace.getCommitLine(),
          results: rightResults,
        }
      )
  );

  await runOnCompareCallbacks({
    log,
    leftResults,
    rightResults,
  });
}

function withComparisonIdentity(
  workspace: IWorkspace,
  displayName: string,
  title: string
): IWorkspace {
  const workspaceWithComparisonIdentity = Object.create(workspace) as IWorkspace;

  workspaceWithComparisonIdentity.getDisplayName = () => displayName;
  workspaceWithComparisonIdentity.getCommitLine = async () => title;

  return workspaceWithComparisonIdentity;
}

async function resolveBuildDirOverrides({
  leftBuildDir,
  rightBuildDir,
}: {
  leftBuildDir?: string;
  rightBuildDir?: string;
}): Promise<{ left: string; right: string } | undefined> {
  if (!leftBuildDir && !rightBuildDir) {
    return;
  }

  if (!leftBuildDir || !rightBuildDir) {
    throw new Error(
      'Both --left-build-dir and --right-build-dir are required for build directory comparison overrides'
    );
  }

  return {
    left: await resolveBuildDirOverride('left', leftBuildDir),
    right: await resolveBuildDirOverride('right', rightBuildDir),
  };
}

async function resolveBuildDirOverride(side: 'left' | 'right', buildDir: string): Promise<string> {
  const resolvedBuildDir = Path.resolve(buildDir);

  let stat: Awaited<ReturnType<typeof Fs.stat>>;
  try {
    stat = await Fs.stat(resolvedBuildDir);
  } catch {
    throw new Error(`${side} build directory override does not exist: ${resolvedBuildDir}`);
  }

  if (!stat.isDirectory()) {
    throw new Error(`${side} build directory override is not a directory: ${resolvedBuildDir}`);
  }

  return resolvedBuildDir;
}
