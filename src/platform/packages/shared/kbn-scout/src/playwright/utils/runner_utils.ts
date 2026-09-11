/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import moment from 'moment';
import { exec } from 'child_process';
import { promisify } from 'util';
import { testTargets, type ScoutTestTarget } from '@kbn/scout-info';

export const execPromise = promisify(exec);

const SWC_REGISTER_REQUIRE = '--require=@kbn/swc-register/install';

/**
 * Returns a new env object with `--require=@kbn/swc-register/install` appended
 * to `NODE_OPTIONS`, so that Playwright (spawned as a binary) and any worker
 * processes it forks internally use Kibana's SWC transpilation for CommonJS
 * imports. Idempotent when the flag is already present.
 */
export function withKibanaSwcRegister(
  env: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  const existing = env.NODE_OPTIONS ?? process.env.NODE_OPTIONS ?? '';
  const alreadyPresent = existing.includes(SWC_REGISTER_REQUIRE);
  const NODE_OPTIONS = alreadyPresent
    ? existing
    : [existing, SWC_REGISTER_REQUIRE].filter(Boolean).join(' ');
  return { ...env, NODE_OPTIONS };
}

export const isValidUTCDate = (date: string): boolean => {
  return !isNaN(Date.parse(date)) && new Date(date).toISOString() === date;
};

export function formatTime(date: string, fmt: string = 'MMM D, YYYY @ HH:mm:ss.SSS') {
  return moment.utc(date, fmt).format();
}

export const getPlaywrightGrepTag = (testTarget: ScoutTestTarget): string => {
  const matchingTarget = testTargets.all.find(
    (potentiallyMatchingTarget) => potentiallyMatchingTarget.tag === testTarget.tag
  );

  if (!matchingTarget) {
    throw new Error(`No Playwright tags found for test target '${testTarget.tag}'`);
  }

  return matchingTarget.playwrightTag;
};
