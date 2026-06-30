/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { execFileSync } from 'child_process';
import { mkdir, rm } from 'fs/promises';
import path from 'path';

import { KIBANA_DISTRIBUTABLE_ARTIFACT } from './constants';

export interface DownloadAndExtractKibanaDistributableOptions {
  readonly buildId: string;
  readonly extractDir: string;
  readonly kibanaDir?: string;
  readonly execFileSync?: typeof execFileSync;
}

export const downloadAndExtractKibanaDistributable = async ({
  buildId,
  extractDir,
  kibanaDir = process.cwd(),
  execFileSync: execFile = execFileSync,
}: DownloadAndExtractKibanaDistributableOptions): Promise<void> => {
  const workDir = path.dirname(extractDir);
  const artifactPath = path.join(workDir, KIBANA_DISTRIBUTABLE_ARTIFACT);

  await rm(extractDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });
  await mkdir(extractDir, { recursive: true });

  execFile(
    'bash',
    [
      '-lc',
      [
        'set -euo pipefail',
        'source .buildkite/scripts/common/util.sh',
        `download_tmp_artifact "${KIBANA_DISTRIBUTABLE_ARTIFACT}" "${workDir}" "${buildId}"`,
        `tar -xf "${artifactPath}" -I zstd -C "${extractDir}" --strip=1`,
        `rm -f "${artifactPath}"`,
      ].join('\n'),
    ],
    {
      cwd: kibanaDir,
      stdio: 'inherit',
    }
  );
};
