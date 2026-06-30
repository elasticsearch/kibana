/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';
import Fsp from 'fs/promises';

import { REPO_ROOT } from '../../lib/paths.mjs';

/**
 * @param {import('@kbn/repo-packages').Package[]} packages
 * @param {import('src/platform/packages/private/kbn-some-dev-log').SomeDevLog} log
 */
export async function regenerateBaseTsconfig(packages, log) {
  const tsconfigPath = Path.resolve(REPO_ROOT, 'tsconfig.base.json');
  const current = await Fsp.readFile(tsconfigPath, 'utf8');
  const lines = current.split('\n');

  const start = lines.findIndex((l) => l.trim() === '// START AUTOMATED PACKAGE LISTING');
  const end = lines.findIndex((l) => l.trim() === '// END AUTOMATED PACKAGE LISTING');

  const updated = [
    ...lines.slice(0, start + 1),
    ...packages.flatMap((p) => [
      `      "${p.id}": ["./${p.normalizedRepoRelativeDir}"],`,
      `      "${p.id}/*": ["./${p.normalizedRepoRelativeDir}/*"],`,
    ]),
    ...lines.slice(end),
  ].join('\n');

  if (updated !== current) {
    await Fsp.writeFile(tsconfigPath, updated);
    log.warning('updated tsconfig.base.json');
  }
}
