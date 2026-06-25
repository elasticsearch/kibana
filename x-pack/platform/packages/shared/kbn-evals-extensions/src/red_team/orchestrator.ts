/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { RedTeamConfig, RedTeamReport } from './types';

export const runRedTeam = async (
  config: RedTeamConfig,
  log: ToolingLog
): Promise<RedTeamReport> => {
  log.warning(
    'Red-team orchestrator is not fully implemented yet. Returning a stub report and delegating to evals run.'
  );

  if (config.modules?.length) {
    log.info(`Red-team modules: ${config.modules.join(', ')}`);
  }
  if (config.count !== undefined) {
    log.info(`Red-team attack count: ${config.count}`);
  }

  return {
    suite: config.suite,
    attackCount: 0,
    passCount: 0,
    failCount: 0,
  };
};
