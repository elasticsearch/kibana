/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with,
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export interface WarmStartMemoryRegressionMetricReport {
  readonly baselineBytes: number;
  readonly targetBytes: number;
  readonly deltaBytes: number;
  readonly allowedDeltaBytes: number;
  readonly regressed: boolean;
}

export interface WarmStartMemoryDiagnosticMetricReport {
  readonly baselineBytes: number;
  readonly targetBytes: number;
  readonly deltaBytes: number;
}

export interface WarmStartMemoryRegressionReport {
  readonly metrics: {
    readonly tailRss: WarmStartMemoryRegressionMetricReport;
    readonly maxRss: WarmStartMemoryRegressionMetricReport;
    readonly tailHeapUsed?: WarmStartMemoryRegressionMetricReport;
  };
  readonly diagnosticMetrics?: Partial<{
    readonly tailHeapTotal: WarmStartMemoryDiagnosticMetricReport;
    readonly tailExternal: WarmStartMemoryDiagnosticMetricReport;
    readonly tailArrayBuffers: WarmStartMemoryDiagnosticMetricReport;
  }>;
  readonly triggeredMetrics: Array<'tailRss' | 'maxRss' | 'tailHeapUsed'>;
  readonly context?: {
    readonly baselineCommit?: string;
    readonly targetCommit?: string;
    readonly baselineBuildId?: string;
    readonly targetBuildId?: string;
  };
}
