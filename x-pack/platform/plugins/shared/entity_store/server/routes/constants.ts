/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AuthzEnabled } from '@kbn/core/server';
import type { z } from '@kbn/zod/v4';
import { HistorySnapshotState, LogExtractionOverride } from '../domain/saved_objects';

export const DEFAULT_ENTITY_STORE_PERMISSIONS: AuthzEnabled = {
  requiredPrivileges: ['securitySolution'],
};

// Matches the requiredPrivileges declared by the Security Solution asset criticality HTTP routes
// (e.g. `.../asset_criticality/routes/upsert.ts`), so callers that bypass Kibana's route-level
// authorization (a synthetic/fake request) can enforce the same Kibana feature privilege.
export const ENTITY_ANALYTICS_KIBANA_FEATURE_PRIVILEGES = [
  'securitySolution',
  'securitySolution-entity-analytics',
];

export const RESOLUTION_ENTITY_STORE_PERMISSIONS: AuthzEnabled = {
  requiredPrivileges: ENTITY_ANALYTICS_KIBANA_FEATURE_PRIVILEGES,
};

export type LogExtractionInstallParams = z.infer<typeof LogExtractionInstallParams>;
// timeout: intentionally excluded — TODO: add once we have a way to set it as a task override param
export const LogExtractionInstallParams = LogExtractionOverride;

export type HistorySnapshotBodyParams = z.infer<typeof HistorySnapshotBodyParams>;
export const HistorySnapshotBodyParams = HistorySnapshotState.pick({
  frequency: true,
}).partial();
