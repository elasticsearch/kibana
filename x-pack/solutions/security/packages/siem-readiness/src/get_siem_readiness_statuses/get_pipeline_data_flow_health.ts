/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PipelineStats } from '../types';
import { VOLUME_DROP_CRITICAL_PCT, VOLUME_DROP_WARNING_PCT } from '../constants';

/**
 * Represents the data-flow health state of a pipeline, in descending severity order.
 *
 * Silence takes precedence over volume drop: a pipeline that is both silent and has a
 * 100% volume drop is classified as 'silent'. This mirrors the finding-merge logic in
 * get_continuity.ts so the UI badge and the server finding always agree.
 */
export type PipelineDataFlowHealth =
  | 'silent'
  | 'volume_drop_critical'
  | 'volume_drop_warning'
  | 'healthy';

/**
 * Classifies a pipeline into a data-flow health state using the canonical precedence:
 *   silent > volume_drop_critical > volume_drop_warning > healthy
 *
 * This is the single source of truth shared by:
 *   - the UI continuity tab badge column (continuity_tab.tsx)
 *   - the server-side finding classifier (get_continuity.ts)
 *
 * Keeping the logic here ensures both consumers always agree when precedence or thresholds change.
 */
export const getContinuityDataFlowHealth = (p: PipelineStats): PipelineDataFlowHealth => {
  if (p.isSilent) return 'silent';
  if (p.volumeDropPct != null && p.volumeDropPct >= VOLUME_DROP_CRITICAL_PCT) {
    return 'volume_drop_critical';
  }
  if (p.volumeDropPct != null && p.volumeDropPct >= VOLUME_DROP_WARNING_PCT) {
    return 'volume_drop_warning';
  }
  return 'healthy';
};
