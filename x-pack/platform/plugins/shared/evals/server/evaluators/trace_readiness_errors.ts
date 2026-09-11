/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InstrumentationProfileProbeResult } from './evidence/evidence_service';

export type TraceReadinessErrorKind = 'not_ready' | 'unresolvable';

export const getNoTraceDocumentsMessage = (traceId: string): string =>
  `Trace ${traceId} is not ready: no documents indexed in traces-* or logs-* yet`;

export class TraceReadinessError extends Error {
  constructor(
    message: string,
    public readonly kind: TraceReadinessErrorKind,
    public readonly profiles: InstrumentationProfileProbeResult[] = []
  ) {
    super(message);
    this.name = 'TraceReadinessError';
  }
}
