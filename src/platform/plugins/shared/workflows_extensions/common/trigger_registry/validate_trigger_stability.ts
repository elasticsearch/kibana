/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { StabilityLevel } from '@kbn/workflows';

/**
 * Until event-driven triggers GA, stability is required and only tech_preview is accepted.
 */
export function validateTriggerStability(
  triggerId: string,
  stability: StabilityLevel | undefined
): void {
  if (stability === undefined) {
    throw new Error(
      `Trigger "${triggerId}": "stability" is required. Set stability: 'tech_preview' for new triggers.`
    );
  }

  if (stability === 'tech_preview') {
    return;
  }

  throw new Error(
    `Trigger "${triggerId}": stability "${stability}" is not supported until event-driven triggers GA. Use "tech_preview".`
  );
}
