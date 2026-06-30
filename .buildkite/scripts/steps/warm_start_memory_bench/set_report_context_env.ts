/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export interface WarmStartMemoryReportContext {
  readonly baselineCommit: string;
  readonly targetCommit: string;
  readonly baselineBuildId: string;
  readonly targetBuildId: string;
  readonly baselineBuildUrl?: string;
  readonly regressionReportPath: string;
}

export const setWarmStartMemoryReportContextEnv = (context: WarmStartMemoryReportContext): void => {
  process.env.KIBANA_CI_WARM_START_MEMORY_BASELINE_COMMIT = context.baselineCommit;
  process.env.KIBANA_CI_WARM_START_MEMORY_TARGET_COMMIT = context.targetCommit;
  process.env.KIBANA_CI_WARM_START_MEMORY_BASELINE_BUILD_ID = context.baselineBuildId;
  process.env.KIBANA_CI_WARM_START_MEMORY_TARGET_BUILD_ID = context.targetBuildId;
  process.env.KIBANA_CI_WARM_START_MEMORY_REPORT_PATH = context.regressionReportPath;

  if (context.baselineBuildUrl) {
    process.env.KIBANA_CI_WARM_START_MEMORY_BASELINE_BUILD_URL = context.baselineBuildUrl;
  }
};
