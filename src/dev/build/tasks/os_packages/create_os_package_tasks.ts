/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Task } from '../../lib';
import { runFpm } from './run_fpm';
import { runDockerGenerator } from './docker_generator';
import { createOSPackageKibanaYML } from './create_os_package_kibana_yml';

const X64 = '[x64]';
const ARM64 = '[ARM64]';

export const CreatePackageConfig: Task = {
  description: 'Creating OS package kibana.yml',

  async run(config, log, build) {
    await createOSPackageKibanaYML(config, build);
  },
};

const debDesc = 'Creating deb package';
export const CreateDebPackageX64: Task = {
  description: `${debDesc} ${X64}`,

  async run(config, log, build) {
    await runFpm(config, log, build, 'deb', 'x64', [
      '--architecture',
      'amd64',
      '--deb-priority',
      'optional',
      '--depends',
      ' adduser',
    ]);
  },
};

export const CreateDebPackageARM64: Task = {
  description: `${debDesc} ${ARM64}`,

  async run(config, log, build) {
    await runFpm(config, log, build, 'deb', 'arm64', [
      '--architecture',
      'arm64',
      '--deb-priority',
      'optional',
      '--depends',
      ' adduser',
    ]);
  },
};

const rpmDesc = 'Creating rpm package';
export const CreateRpmPackageX64: Task = {
  description: `${rpmDesc} ${X64}`,

  async run(config, log, build) {
    await runFpm(config, log, build, 'rpm', 'x64', [
      '--architecture',
      'x86_64',
      '--rpm-os',
      'linux',
    ]);
  },
};

export const CreateRpmPackageARM64: Task = {
  description: `${rpmDesc} ${ARM64}`,

  async run(config, log, build) {
    await runFpm(config, log, build, 'rpm', 'arm64', [
      '--architecture',
      'aarch64',
      '--rpm-os',
      'linux',
    ]);
  },
};

const dockerBuildDate = new Date().toISOString();

const dockerWolfiDesc = 'Creating Docker Wolfi image';
export const CreateDockerWolfiX64: Task = {
  description: `${dockerWolfiDesc} ${X64}`,

  async run(config, log, build) {
    await runDockerGenerator(config, log, build, {
      architecture: 'x64',
      baseImage: 'wolfi',
      context: false,
      image: true,
      dockerBuildDate,
    });
  },
};

export const CreateDockerWolfiARM64: Task = {
  description: `${dockerWolfiDesc} ${ARM64}`,

  async run(config, log, build) {
    await runDockerGenerator(config, log, build, {
      architecture: 'aarch64',
      baseImage: 'wolfi',
      context: false,
      image: true,
      dockerBuildDate,
    });
  },
};

export const CreateDockerServerless = function (architecture: 'x64' | 'aarch64'): Task {
  const architectureDesc = architecture === 'x64' ? X64 : ARM64;
  return {
    description: `Creating Docker Serverless image ${architectureDesc}`,

    async run(config, log, build) {
      await runDockerGenerator(config, log, build, {
        architecture,
        baseImage: 'wolfi',
        context: false,
        serverless: true,
        image: true,
        dockerBuildDate,
      });
    },
  };
};

const dockerUbiDesc = 'Creating Docker UBI image';
export const CreateDockerUBIX64: Task = {
  description: `${dockerUbiDesc} ${X64}`,

  async run(config, log, build) {
    await runDockerGenerator(config, log, build, {
      architecture: 'x64',
      baseImage: 'ubi',
      context: false,
      image: true,
    });
  },
};

export const CreateDockerUBIARM64: Task = {
  description: `${dockerUbiDesc} ${ARM64}`,

  async run(config, log, build) {
    await runDockerGenerator(config, log, build, {
      architecture: 'aarch64',
      baseImage: 'ubi',
      context: false,
      image: true,
    });
  },
};

const dockerCloudDesc = 'Creating Docker Cloud image';
export const CreateDockerCloudX64: Task = {
  description: `${dockerCloudDesc} ${X64}`,

  async run(config, log, build) {
    await runDockerGenerator(config, log, build, {
      architecture: 'x64',
      baseImage: 'wolfi',
      context: false,
      cloud: true,
      image: true,
    });
  },
};

export const CreateDockerCloudARM64: Task = {
  description: `${dockerCloudDesc} ${ARM64}`,

  async run(config, log, build) {
    await runDockerGenerator(config, log, build, {
      architecture: 'aarch64',
      baseImage: 'wolfi',
      context: false,
      cloud: true,
      image: true,
    });
  },
};

const dockerCloudFipsDesc = 'Creating Docker Cloud FIPS image';
export const CreateDockerCloudFIPSX64: Task = {
  description: `${dockerCloudFipsDesc} ${X64}`,

  async run(config, log, build) {
    await runDockerGenerator(config, log, build, {
      architecture: 'x64',
      baseImage: 'wolfi',
      context: false,
      image: true,
      fips: true,
      cloud: true,
    });
  },
};

export const CreateDockerCloudFIPSARM64: Task = {
  description: `${dockerCloudFipsDesc} ${ARM64}`,

  async run(config, log, build) {
    await runDockerGenerator(config, log, build, {
      architecture: 'aarch64',
      baseImage: 'wolfi',
      context: false,
      image: true,
      fips: true,
      cloud: true,
    });
  },
};

const dockerFipsDesc = 'Creating Docker FIPS image';
export const CreateDockerFIPSX64: Task = {
  description: `${dockerFipsDesc} ${X64}`,

  async run(config, log, build) {
    await runDockerGenerator(config, log, build, {
      architecture: 'x64',
      baseImage: 'wolfi',
      context: false,
      image: true,
      fips: true,
    });
  },
};

export const CreateDockerContexts: Task = {
  description: 'Creating Docker build contexts',

  async run(config, log, build) {
    await runDockerGenerator(config, log, build, {
      baseImage: 'wolfi',
      context: true,
      image: false,
      dockerBuildDate,
    });
    await runDockerGenerator(config, log, build, {
      baseImage: 'ubi',
      context: true,
      image: false,
    });
    await runDockerGenerator(config, log, build, {
      ironbank: true,
      baseImage: 'none',
      context: true,
      image: false,
    });
    await runDockerGenerator(config, log, build, {
      baseImage: 'wolfi',
      cloud: true,
      context: true,
      image: false,
    });
    await runDockerGenerator(config, log, build, {
      baseImage: 'wolfi',
      serverless: true,
      context: true,
      image: false,
    });
    await runDockerGenerator(config, log, build, {
      baseImage: 'wolfi',
      context: true,
      image: false,
      fips: true,
    });
    await runDockerGenerator(config, log, build, {
      baseImage: 'wolfi',
      context: true,
      image: false,
      fips: true,
      cloud: true,
    });
  },
};
