/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { keyBy } from 'lodash';
import type { ToolingLog } from '@kbn/tooling-log';
import { toConfigComparison } from '../report/to_config_comparison';
import { toConfigSummary } from '../report/to_config_summary';
import type { ConfigResult } from '../runner/types';
import type { OnCompareContext } from '../config/types';

export async function runOnCompareCallbacks({
  log,
  leftResults,
  rightResults,
}: {
  log: ToolingLog;
  leftResults: ConfigResult[];
  rightResults: ConfigResult[];
}): Promise<void> {
  const leftConfigs = keyBy(leftResults, (result) => result.config.name);
  const rightConfigs = keyBy(rightResults, (result) => result.config.name);

  for (const [configName, left] of Object.entries(leftConfigs)) {
    const right = rightConfigs[configName];
    const { onCompare } = left.config;

    if (!right || !onCompare) {
      continue;
    }

    const context: OnCompareContext = {
      log: log.withContext(configName),
      left,
      right,
      leftSummary: toConfigSummary(left),
      rightSummary: toConfigSummary(right),
      comparison: toConfigComparison(left, right),
    };

    await onCompare(context);
  }
}
