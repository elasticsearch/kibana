/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';

import type { ConnectionConfig } from './get_connection_config';
import { DISCOVERY_TIMEOUT_MS } from './constants';
import {
  configureModelSelectionSettings,
  persistDetectionsForSnapshot,
  persistDiscoveriesForSnapshot,
  triggerDiscovery,
  waitForDiscovery,
} from './significant_events_workflow';

export interface CaptureDiscoveryResult {
  discoveriesIndex: string;
  discoveriesCount: number;
  detectionsIndex: string;
  detectionsCount: number;
}

export async function captureDiscoveryForScenario({
  config,
  esClient,
  log,
  connectorId,
  scenarioId,
  timeoutMs = DISCOVERY_TIMEOUT_MS,
}: {
  config: ConnectionConfig;
  esClient: Client;
  log: ToolingLog;
  connectorId: string;
  scenarioId: string;
  timeoutMs?: number;
}): Promise<CaptureDiscoveryResult> {
  // Idempotent — ensures the discovery feature resolves to the requested connector
  // (the otel-demo flow already configures it earlier).
  await configureModelSelectionSettings(config, log, connectorId);

  await triggerDiscovery(config, log);
  await waitForDiscovery(config, log, timeoutMs);

  const { index: discoveriesIndex, count: discoveriesCount } = await persistDiscoveriesForSnapshot(
    config,
    esClient,
    log,
    scenarioId
  );
  const { index: detectionsIndex, count: detectionsCount } = await persistDetectionsForSnapshot(
    config,
    esClient,
    log,
    scenarioId
  );

  return { discoveriesIndex, discoveriesCount, detectionsIndex, detectionsCount };
}
