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

import dedent from 'dedent';
import normalize from 'normalize-path';
import type { ToolingLog } from '@kbn/tooling-log';
import { REPO_ROOT } from '@kbn/repo-info';
import { createFailError } from '@kbn/dev-cli-errors';
import { TS_PROJECTS } from '@kbn/ts-projects';

export const ROOT_REFS_CONFIG_PATH = Path.resolve(REPO_ROOT, 'tsconfig.refs.json');
export const REF_CONFIG_PATHS = [ROOT_REFS_CONFIG_PATH];

async function isRootRefsConfigSelfManaged() {
  try {
    const currentRefsFile = await Fsp.readFile(ROOT_REFS_CONFIG_PATH, 'utf-8');
    return currentRefsFile.trim().startsWith('// SELF MANAGED');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

function generateTsConfig(refs: string[]) {
  return dedent`
    // This file is automatically updated when you run \`node scripts/type_check\`.
    {
      "include": [],
      "references": [
${refs.map((p) => `        { "path": ${JSON.stringify(p)} },`).join('\n')}
      ]
    }
  `;
}

export async function updateRootRefsConfig(log: ToolingLog) {
  if (await isRootRefsConfigSelfManaged()) {
    throw createFailError(
      `tsconfig.refs.json starts with "// SELF MANAGED" but we removed this functinality because of some complexity it caused with TS performance upgrades and we were pretty sure that nobody was using it. Please reach out to operations to discuss options <3`
    );
  }

  const refs = TS_PROJECTS.flatMap((p) => {
    if (p.isTypeCheckDisabled()) {
      return [];
    }

    return `./${normalize(Path.relative(REPO_ROOT, p.typeCheckConfigPath))}`;
  }).sort((a, b) => a.localeCompare(b));

  log.debug('updating', ROOT_REFS_CONFIG_PATH);
  await Fsp.writeFile(ROOT_REFS_CONFIG_PATH, generateTsConfig(refs) + '\n');
}

export async function cleanupRootRefsConfig() {
  await Fsp.rm(ROOT_REFS_CONFIG_PATH, { force: true });
}
