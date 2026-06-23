/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { access, link, unlink, chmod } from 'fs';
import { resolve, basename } from 'path';
import { promisify } from 'util';

import type { ToolingLog } from '@kbn/tooling-log';
import { kibanaPackageJson } from '@kbn/repo-info';

import { write, copyAll, mkdirp, exec } from '../../../lib';
import type { Config, Build, Solution } from '../../../lib';
import * as dockerTemplates from './templates';
import type { TemplateContext } from './template_context';
import { bundleDockerFiles } from './bundle_dockerfiles';

const accessAsync = promisify(access);
const linkAsync = promisify(link);
const unlinkAsync = promisify(unlink);
const chmodAsync = promisify(chmod);

export async function runDockerGenerator(
  config: Config,
  log: ToolingLog,
  build: Build,
  flags: {
    architecture?: string;
    baseImage: 'none' | 'wolfi' | 'ubi';
    context: boolean;
    image: boolean;
    ironbank?: boolean;
    cloud?: boolean;
    serverless?: boolean;
    dockerBuildDate?: string;
    fips?: boolean;
    solution?: Solution;
  }
) {
  let baseImageName = '';
  if (flags.baseImage === 'ubi') baseImageName = 'redhat/ubi9-minimal:latest';
  /**
   * Renovate config contains a regex manager to automatically update both Chainguard references
   *
   * If this logic moves to another file or under another name, then the Renovate regex manager
   * for automatic Chainguard updates will break.
   */
  if (flags.baseImage === 'wolfi')
    baseImageName =
      'docker.elastic.co/wolfi/chainguard-base:latest@sha256:ce1e3ed54cd5acf812617dfdac35038655309bf4f62f0821fd48bafdf695349f';

  let imageFlavor = '';
  if (flags.baseImage === 'wolfi' && !flags.serverless && !flags.cloud) imageFlavor += `-wolfi`;
  if (flags.ironbank) imageFlavor += '-ironbank';
  if (flags.cloud) imageFlavor += '-cloud';
  if (flags.serverless) imageFlavor += '-serverless';
  if (flags.solution) imageFlavor += `-${flags.solution.artifact}`;
  if (flags.fips) {
    imageFlavor += '-fips';
    baseImageName =
      'docker.elastic.co/wolfi/chainguard-base-fips:latest@sha256:278de9601862fec07772cc560eb77402e2a36edbbe5de64940ed354507aae9ec';
  }

  // General docker var config
  const license = 'Elastic License';
  const configuredNamespace = config.getDockerNamespace();
  const imageNamespace = configuredNamespace
    ? configuredNamespace
    : flags.cloud || flags.serverless
    ? 'kibana-ci'
    : 'kibana';
  const imageTag = `docker.elastic.co/${imageNamespace}/kibana`;
  const version = config.getBuildVersion();
  const artifactArchitecture = flags.architecture === 'aarch64' ? 'aarch64' : 'x86_64';
  let artifactVariant = '';
  let artifactSolution = '';
  if (flags.serverless) artifactVariant = '-serverless';
  if (flags.solution) artifactSolution = `-${flags.solution.artifact}`;
  const artifactPrefix = `kibana${artifactVariant}${artifactSolution}-${version}-linux`;
  const tarExt = config.getTarZstd() ? 'tar.zst' : 'tar.gz';
  const artifactTarball = `${artifactPrefix}-${artifactArchitecture}.${tarExt}`;
  const beatsArchitecture = flags.architecture === 'aarch64' ? 'arm64' : 'x86_64';
  const metricbeatTarball = `metricbeat${
    flags.fips ? '-fips' : ''
  }-${version}-linux-${beatsArchitecture}.tar.gz`;
  const filebeatTarball = `filebeat${
    flags.fips ? '-fips' : ''
  }-${version}-linux-${beatsArchitecture}.tar.gz`;
  const artifactsDir = config.resolveFromTarget('.');
  const beatsDir = config.resolveFromRepo('.beats');
  const dockerBuildDate = flags.dockerBuildDate || new Date().toISOString();
  const dockerBuildDir = config.resolveFromRepo('build', 'kibana-docker', `default${imageFlavor}`);
  const imageArchitecture = flags.architecture === 'aarch64' ? '-arm64' : '-amd64';
  const dockerTargetFilename = config.resolveFromTarget(
    `kibana${imageFlavor}-${version}-docker-image${imageArchitecture}.tar.gz`
  );
  const dependencies = [
    resolve(artifactsDir, artifactTarball),
    ...(flags.cloud
      ? [resolve(beatsDir, metricbeatTarball), resolve(beatsDir, filebeatTarball)]
      : []),
  ];

  const dockerPush = config.getDockerPush();
  const dockerTag = config.getDockerTag();
  const dockerTagQualifier = config.getDockerTagQualfiier();
  const dockerCrossCompile = config.getDockerCrossCompile();
  const publicArtifactSubdomain = config.isRelease ? 'artifacts' : 'snapshots-no-kpi';

  const scope: TemplateContext = {
    artifactPrefix,
    artifactTarball,
    imageFlavor,
    version,
    branch: kibanaPackageJson.branch,
    license,
    artifactsDir,
    imageTag,
    dockerBuildDir,
    dockerTargetFilename,
    dockerPush,
    dockerTag,
    dockerTagQualifier,
    dockerCrossCompile,
    baseImageName,
    dockerBuildDate,
    baseImage: flags.baseImage,
    cloud: flags.cloud,
    serverless: flags.serverless,
    metricbeatTarball,
    filebeatTarball,
    ironbank: flags.ironbank,
    architecture: flags.architecture,
    revision: config.getBuildSha(),
    publicArtifactSubdomain,
    fips: flags.fips,
    tarZstd: config.getTarZstd(),
    tarExt,
  };

  type HostArchitectureToDocker = Record<string, string>;
  const hostTarget: HostArchitectureToDocker = {
    x64: 'x64',
    arm64: 'aarch64',
  };
  const buildArchitectureSupported = hostTarget[process.arch] === flags.architecture;
  if (flags.architecture && !buildArchitectureSupported && !dockerCrossCompile) {
    return;
  }

  // Create the docker build target folder
  await mkdirp(dockerBuildDir);

  // Write all the needed docker config files
  // into kibana-docker folder
  for (const [, dockerTemplate] of Object.entries(dockerTemplates)) {
    let filename: string;
    if (!dockerTemplate.name.includes('kibana.yml')) {
      filename = `${dockerTemplate.name}.${artifactArchitecture}`;
    } else {
      filename = dockerTemplate.name;
    }

    await write(resolve(dockerBuildDir, filename), dockerTemplate.generator(scope));
  }

  // Copy serverless-only configuration files
  if (flags.serverless) {
    await mkdirp(resolve(dockerBuildDir, 'config'));
    await copyAll(config.resolveFromRepo('config'), resolve(dockerBuildDir, 'config'), {
      select: ['serverless*.yml'],
    });
  }

  // Copy all the needed resources into kibana-docker folder
  // in order to build the docker image accordingly the dockerfile defined
  // under templates/kibana_yml.template/js
  await copyAll(
    config.resolveFromRepo('src/dev/build/tasks/os_packages/docker_generator/resources/base'),
    dockerBuildDir
  );

  // Copy fips related resources
  if (flags.fips) {
    await copyAll(
      config.resolveFromRepo('src/dev/build/tasks/os_packages/docker_generator/resources/fips'),
      dockerBuildDir
    );
  }

  // Build docker image into the target folder
  // In order to do this we just call the file we
  // created from the templates/build_docker_sh.template.js
  // and we just run that bash script
  const dockerBuildScript = `build_docker.sh.${artifactArchitecture}`;
  await chmodAsync(`${resolve(dockerBuildDir, dockerBuildScript)}`, '755');

  // Only build images on native targets
  if (flags.image) {
    // Link dependencies
    for (const src of dependencies) {
      const file = basename(src);
      const dest = resolve(dockerBuildDir, file);
      try {
        await accessAsync(src);
        await unlinkAsync(dest);
      } catch (e) {
        if (e && e.code === 'ENOENT' && e.syscall === 'access') {
          throw new Error(`${src} is needed in order to build the docker image.`);
        }
      }
      await linkAsync(src, dest);
    }

    await exec(log, `./${dockerBuildScript}`, [], {
      cwd: dockerBuildDir,
      level: 'info',
      build,
    });
  }

  // Pack Dockerfiles and create a target for them
  if (flags.context) {
    await bundleDockerFiles(config, log, scope);
  }
}
