/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import execa from 'execa';
import { promises as Fs } from 'fs';
import Path from 'path';
import chalk from 'chalk';
import { REPO_ROOT } from '@kbn/repo-info';
import { createDirIfNotExists } from './file_utils';

const REPOS_DIR = Path.join(REPO_ROOT, 'data', 'demo_environments', 'repos');

export interface ImageBuildConfig {
  gitUrl: string;
  images: Array<{
    name: string;
    context: string;
    dockerfile?: string;
  }>;
  preBuildCommand?: string;
}

async function dirExists(dir: string): Promise<boolean> {
  try {
    const stat = await Fs.stat(dir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function repoUsesLfs(repoDir: string): Promise<boolean> {
  try {
    const gitattributes = await Fs.readFile(Path.join(repoDir, '.gitattributes'), 'utf-8');
    return gitattributes.includes('filter=lfs');
  } catch {
    return false;
  }
}

async function isGitLfsInstalled(): Promise<boolean> {
  try {
    await execa.command('git lfs version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function ensureLfsFiles(log: ToolingLog, repoDir: string): Promise<void> {
  if (!(await repoUsesLfs(repoDir))) {
    return;
  }

  if (!(await isGitLfsInstalled())) {
    throw new Error(
      'This repository uses Git LFS but git-lfs is not installed.\n' +
        'Install it with: brew install git-lfs && git lfs install'
    );
  }

  log.info('Pulling Git LFS files...');
  await execa.command('git lfs pull', { cwd: repoDir, stdio: 'pipe' });
}

async function cloneOrUpdateRepo(
  log: ToolingLog,
  gitUrl: string,
  targetDir: string
): Promise<void> {
  if (await dirExists(targetDir)) {
    log.debug(`Repository already exists at ${targetDir}, pulling latest...`);
    try {
      await execa.command('git pull --ff-only', {
        cwd: targetDir,
        stdio: 'pipe',
      });
    } catch {
      log.warning('Could not pull latest changes, using existing checkout');
    }
    await ensureLfsFiles(log, targetDir);
    return;
  }

  log.info(`Cloning ${gitUrl} (shallow)...`);
  await createDirIfNotExists(REPOS_DIR);
  await execa.command(`git clone --depth 1 ${gitUrl} ${targetDir}`, {
    stdio: 'pipe',
  });
  await ensureLfsFiles(log, targetDir);
}

async function imageExistsInMinikube(imageName: string): Promise<boolean> {
  try {
    const { stdout } = await execa.command(`minikube image ls`);
    return stdout.includes(imageName);
  } catch {
    return false;
  }
}

async function buildImageWithMinikube(
  log: ToolingLog,
  imageName: string,
  context: string,
  dockerfile?: string
): Promise<void> {
  const dockerfilePath = dockerfile || 'Dockerfile';
  const fullDockerfilePath = Path.join(context, dockerfilePath);

  if (!(await dirExists(context))) {
    throw new Error(`Build context does not exist: ${context}`);
  }

  try {
    await Fs.access(fullDockerfilePath);
  } catch {
    throw new Error(`Dockerfile not found: ${fullDockerfilePath}`);
  }

  log.info(`  Building ${chalk.cyan(imageName)}...`);
  const { stdout, stderr } = await execa.command(
    `minikube image build -t ${imageName} -f ${dockerfilePath} ${context}`,
    {
      stdio: 'pipe',
    }
  );
  const buildOutput = `${stdout}\n${stderr}`;
  if (
    buildOutput.includes('ERROR: failed to build') ||
    buildOutput.includes('failed to solve') ||
    buildOutput.includes('did not complete successfully')
  ) {
    throw new Error(`Failed to build ${imageName}:\n${buildOutput}`);
  }

  if (!(await imageExistsInMinikube(imageName))) {
    throw new Error(`Image ${imageName} was not found in minikube after build:\n${buildOutput}`);
  }
}

export async function buildImagesFromRepo(
  log: ToolingLog,
  repoDir: string,
  images: ImageBuildConfig['images'],
  forceRebuild = false
): Promise<void> {
  log.info('Building images with minikube...');
  for (const image of images) {
    const imageName = image.name;
    const context = Path.join(repoDir, image.context);

    if (!forceRebuild && (await imageExistsInMinikube(imageName))) {
      log.info(`  ${chalk.green('✔')} ${imageName} already exists, skipping`);
      continue;
    }

    await buildImageWithMinikube(log, imageName, context, image.dockerfile);
    log.info(`  ${chalk.green('✔')} ${imageName} built successfully`);
  }
}

export async function buildCustomImages(
  log: ToolingLog,
  demoId: string,
  config: ImageBuildConfig,
  forceRebuild = false
): Promise<void> {
  const repoDir = Path.join(REPOS_DIR, demoId);

  await cloneOrUpdateRepo(log, config.gitUrl, repoDir);

  if (config.preBuildCommand) {
    log.info(`Running pre-build command: ${config.preBuildCommand}`);
    await execa.command(config.preBuildCommand, {
      cwd: repoDir,
      stdio: 'inherit',
      shell: true,
    });
  }

  await buildImagesFromRepo(log, repoDir, config.images, forceRebuild);
}

export function getRepoDir(demoId: string): string {
  return Path.join(REPOS_DIR, demoId);
}
