/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { execFileSync } from 'child_process';
import { mkdtemp, rm, stat } from 'fs/promises';
import os from 'os';
import path from 'path';
import { downloadAndExtractKibanaDistributable } from './download_and_extract_kibana_distributable';

describe('downloadAndExtractKibanaDistributable', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'warm-start-memory-bench-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('downloads and extracts the reusable Kibana distributable into the requested directory', async () => {
    const execFile = jest.fn();
    const extractDir = path.join(tempDir, 'left');
    const artifactPath = path.join(tempDir, 'kibana-default.tar.zst');

    await downloadAndExtractKibanaDistributable({
      buildId: 'build-id-123',
      extractDir,
      kibanaDir: '/repo',
      execFileSync: execFile as unknown as typeof execFileSync,
    });

    await expect(stat(extractDir)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
    expect(execFile).toHaveBeenCalledWith(
      'bash',
      [
        '-lc',
        [
          'set -euo pipefail',
          'source .buildkite/scripts/common/util.sh',
          `download_tmp_artifact "kibana-default.tar.zst" "${tempDir}" "build-id-123"`,
          `tar -xf "${artifactPath}" -I zstd -C "${extractDir}" --strip=1`,
          `rm -f "${artifactPath}"`,
        ].join('\n'),
      ],
      {
        cwd: '/repo',
        stdio: 'inherit',
      }
    );
  });
});
