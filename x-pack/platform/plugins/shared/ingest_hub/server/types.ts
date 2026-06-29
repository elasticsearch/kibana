/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FleetStartContract } from '@kbn/fleet-plugin/server';

// No setup-time plugin dependencies required.
export type IngestHubServerSetupDeps = Record<string, never>;

export interface IngestHubServerStartDeps {
  fleet: FleetStartContract;
}
