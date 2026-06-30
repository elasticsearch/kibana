/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AuthzEnabled } from '@kbn/core/server';
import { z } from '@kbn/zod/v4';
import { HistorySnapshotState, LogExtractionConfig } from '../domain/saved_objects';

export const DEFAULT_ENTITY_STORE_PERMISSIONS: AuthzEnabled = {
  requiredPrivileges: ['securitySolution'],
};

export const RESOLUTION_ENTITY_STORE_PERMISSIONS: AuthzEnabled = {
  requiredPrivileges: ['securitySolution', 'securitySolution-entity-analytics'],
};

export type LogExtractionInstallParams = z.infer<typeof LogExtractionInstallParams>;
// timeout: intentionally excluded from LogExtractionBodyParams
// TODO: add timeout once we have a way to set it as a task override param
export const LogExtractionInstallParams = LogExtractionConfig.pick({
  fieldHistoryLength: true,
  additionalIndexPatterns: true,
  excludedIndexPatterns: true,
  useDiscoveredIndexSource: true,
  lookbackPeriod: true,
  frequency: true,
  delay: true,
  docsLimit: true,
  maxLogsPerPage: true,
  maxTimeWindowSize: true,
  maxLogsPerWindow: true,
  maxLogsPerWindowCapBehavior: true,
}).partial();

export type LogExtractionUpdateParams = z.infer<typeof LogExtractionUpdateParams>;

export const LogExtractionUpdateParams = z.object({
  fieldHistoryLength: z.number().int().optional(),
  additionalIndexPatterns: z.array(z.string()).optional(),
  excludedIndexPatterns: z.array(z.string()).optional(),
  useDiscoveredIndexSource: z.boolean().optional(),
  lookbackPeriod: z
    .string()
    .regex(/[smdh]$/)
    .optional(),
  frequency: z
    .string()
    .regex(/[smdh]$/)
    .optional(),
  delay: z
    .string()
    .regex(/[smdh]$/)
    .optional(),
  docsLimit: z.number().int().min(1).optional(),
  maxLogsPerPage: z.number().int().min(1).optional(),
  maxTimeWindowSize: z
    .string()
    .regex(/[smdh]$/)
    .optional(),
  maxLogsPerWindow: z.number().int().min(0).optional(),
  maxLogsPerWindowCapBehavior: z.enum(['defer', 'drop']).optional(),
});

export type LogExtractionBodyParams = LogExtractionInstallParams | LogExtractionUpdateParams;

export type HistorySnapshotBodyParams = z.infer<typeof HistorySnapshotBodyParams>;
export const HistorySnapshotBodyParams = HistorySnapshotState.pick({
  frequency: true,
}).partial();
