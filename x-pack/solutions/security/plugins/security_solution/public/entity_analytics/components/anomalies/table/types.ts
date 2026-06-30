/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface TableRow {
  id: string;
  jobId: string;
  jobDisplayName: string;
  recordId: string;
  mitreTactics: string[];
  timestamp: number;
  detectorIndex: number;
  baseline: string;
  anomaly: string;
  anomalyScore: number;
  description: string;
  anomalyCount: number;
  keyFields: string[];
}
