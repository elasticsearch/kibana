/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import chalk from 'chalk';
import execa from 'execa';
import Fs from 'fs';
import Os from 'os';
import Path from 'path';
import type { CodeScenario, DemoConfig, PatchEntry } from './types';
import { CODE_SCENARIO_DECOYS } from './code_scenario_decoys';
import { ensureOtelDemoAtVersion, getCodeScenarioRepoDir } from './otel_demo_source';
import { buildImagesFromRepo } from './util/build_custom_images';

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function getCommitSequence(scenario: CodeScenario): PatchEntry[] {
  const entries = shuffled(CODE_SCENARIO_DECOYS);
  const bugIndex = Math.floor(Math.random() * (entries.length + 1));
  entries.splice(bugIndex, 0, scenario.bugPatch);
  return entries;
}

async function applyPatch(repoDir: string, entry: PatchEntry): Promise<void> {
  const tmpDir = await Fs.promises.mkdtemp(Path.join(Os.tmpdir(), 'kbn-otel-code-scenario-'));
  const patchPath = Path.join(tmpDir, 'patch.diff');
  try {
    await Fs.promises.writeFile(patchPath, entry.patch, 'utf8');
    await execa('git', ['apply', '--check', patchPath], { cwd: repoDir, stdio: 'pipe' });
    await execa('git', ['apply', '--index', patchPath], { cwd: repoDir, stdio: 'pipe' });
    await execa('git', ['commit', '-m', entry.commitMessage], { cwd: repoDir, stdio: 'pipe' });
  } finally {
    await Fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function applyCodeScenario({
  version,
  scenario,
  log,
}: {
  version: string;
  scenario: CodeScenario;
  log: ToolingLog;
}): Promise<string> {
  const cleanRepoDir = await ensureOtelDemoAtVersion(version, log);
  const scenarioRepoDir = getCodeScenarioRepoDir(version, scenario.id);

  log.info(`Preparing code scenario source: ${chalk.yellow(scenario.id)}`);
  await Fs.promises.rm(scenarioRepoDir, { recursive: true, force: true });
  await Fs.promises.mkdir(Path.dirname(scenarioRepoDir), { recursive: true });
  await execa('git', ['clone', '--local', cleanRepoDir, scenarioRepoDir], { stdio: 'pipe' });
  await execa('git', ['config', 'user.name', 'Kibana OTel Demo'], {
    cwd: scenarioRepoDir,
    stdio: 'pipe',
  });
  await execa('git', ['config', 'user.email', 'kibana-otel-demo@example.invalid'], {
    cwd: scenarioRepoDir,
    stdio: 'pipe',
  });

  const commitSequence = getCommitSequence(scenario);
  for (const [index, entry] of commitSequence.entries()) {
    log.debug(
      `  Applying code patch ${index + 1}/${commitSequence.length}: ${entry.commitMessage}`
    );
    await applyPatch(scenarioRepoDir, entry);
  }

  log.info(`Code scenario source ready at ${scenarioRepoDir}`);
  return scenarioRepoDir;
}

export async function buildCodeScenarioImages({
  repoDir,
  scenario,
  config,
  log,
}: {
  repoDir: string;
  scenario: CodeScenario;
  config: DemoConfig;
  log: ToolingLog;
}): Promise<Record<string, string>> {
  if (!config.serviceSourcePaths) {
    throw new Error(`Demo ${config.id} does not define service source paths for code scenarios`);
  }

  const { serviceSourcePaths } = config;
  const imageOverrides: Record<string, string> = {};
  const images = scenario.affectedServices.map((service) => {
    const sourcePath = serviceSourcePaths[service];
    if (!sourcePath) {
      throw new Error(`No source path configured for service ${service}`);
    }

    const imageTag = `otel-demo-scenario/${service}:latest`;
    imageOverrides[service] = imageTag;
    return {
      name: imageTag,
      context: sourcePath.context,
      dockerfile: sourcePath.dockerfile,
    };
  });

  log.info(
    `Building ${
      scenario.affectedServices.length
    } code scenario image(s): ${scenario.affectedServices.join(', ')}`
  );
  await buildImagesFromRepo(log, repoDir, images, true);
  return imageOverrides;
}
