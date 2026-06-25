/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { GCS_BUCKET, RE2OB_GCS_BASE_PATH } from './constants';
import type { RcaScenario } from './types';

const FAULT_DESCRIPTIONS: Record<string, string> = {
  cpu: 'CPU stress injection — high CPU load on the target service',
  mem: 'Memory pressure injection — memory exhaustion on the target service',
  disk: 'Disk I/O saturation — heavy disk read/write load on the target service',
  delay: 'Network delay injection — artificial latency added to service traffic',
  loss: 'Packet loss injection — intermittent network packet drops on the target service',
  socket: 'Socket exhaustion — connection/socket resource limits reached on the target service',
};

function scenario(service: string, faultType: string): RcaScenario {
  return {
    snapshotName: `${service}-${faultType}`,
    service,
    faultType,
    faultDescription: FAULT_DESCRIPTIONS[faultType] ?? `fault type: ${faultType}`,
    gcs: { bucket: GCS_BUCKET, basePath: RE2OB_GCS_BASE_PATH },
  };
}

/**
 * Scenarios with local CSV data extracted from the RCAEval RE2-OB Zenodo dataset.
 * Add a row here + capture a GCS snapshot (scripts/capture_re2ob_snapshot) to
 * include a scenario in CI. Local runs only need RCAEVAL_DATA_DIR to point at the
 * extracted RE2-OB directory.
 */

// Original 6-scenario set used for the first round of evals (kept for reference /
// reproducibility of earlier score tables).
export const RE2OB_SCENARIOS_V1: RcaScenario[] = [
  scenario('currencyservice', 'loss'),
  scenario('checkoutservice', 'delay'),
  scenario('checkoutservice', 'mem'),
  scenario('emailservice', 'cpu'),
  scenario('productcatalogservice', 'cpu'),
  scenario('recommendationservice', 'socket'),
];

// Expanded 20-scenario set (distinct service×fault combos, none overlapping V1),
// balanced ~4 per service and covering all 6 fault types — including `disk`, which
// V1 never exercised. Instance "1" of each combo is extracted under RCAEVAL_DATA_DIR.
export const RE2OB_SCENARIOS_V2: RcaScenario[] = [
  scenario('checkoutservice', 'cpu'),
  scenario('checkoutservice', 'disk'),
  scenario('checkoutservice', 'loss'),
  scenario('checkoutservice', 'socket'),
  scenario('currencyservice', 'cpu'),
  scenario('currencyservice', 'delay'),
  scenario('currencyservice', 'disk'),
  scenario('currencyservice', 'socket'),
  scenario('emailservice', 'delay'),
  scenario('emailservice', 'disk'),
  scenario('emailservice', 'loss'),
  scenario('emailservice', 'mem'),
  scenario('productcatalogservice', 'delay'),
  scenario('productcatalogservice', 'disk'),
  scenario('productcatalogservice', 'mem'),
  scenario('productcatalogservice', 'socket'),
  scenario('recommendationservice', 'cpu'),
  scenario('recommendationservice', 'delay'),
  scenario('recommendationservice', 'disk'),
  scenario('recommendationservice', 'mem'),
];

// 10-scenario subset for prompt-iteration runs: 2 per service (1 resource fault +
// 1 network fault), chosen for fault-type coverage, not based on observed scores.
//   checkoutservice:       cpu (resource),   loss (network)
//   currencyservice:       disk (resource),  delay (network)
//   emailservice:          mem (resource),   loss (network)
//   productcatalogservice: socket (resource),delay (network)
//   recommendationservice: mem (resource),   delay (network)
export const RE2OB_SCENARIOS_V2_SUBSET: RcaScenario[] = [
  scenario('checkoutservice', 'cpu'),
  scenario('checkoutservice', 'loss'),
  scenario('currencyservice', 'disk'),
  scenario('currencyservice', 'delay'),
  scenario('emailservice', 'mem'),
  scenario('emailservice', 'loss'),
  scenario('productcatalogservice', 'socket'),
  scenario('productcatalogservice', 'delay'),
  scenario('recommendationservice', 'mem'),
  scenario('recommendationservice', 'delay'),
];

// Active set for the current eval run.
export const RE2OB_SCENARIOS: RcaScenario[] = RE2OB_SCENARIOS_V2;
