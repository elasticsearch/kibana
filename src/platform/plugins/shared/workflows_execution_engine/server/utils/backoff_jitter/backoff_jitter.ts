/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { random } from 'lodash';

/**
 * Backoff jitter shared by on-failure retry delays (`computeRetryDelayMs` when
 * `jitter` is true) and poll exponential policy when `jitter` is true.
 *
 * Picks a uniform delay in `[delayMs / 2, delayMs]` milliseconds (inclusive on
 * both ends per lodash `random`), then floors the result — spreads wake-ups
 * without waiting longer than the nominal delay.
 */
export function applyBackoffJitter(delayMs: number): number {
  return Math.floor(random(delayMs / 2, delayMs));
}
