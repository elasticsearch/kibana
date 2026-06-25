/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DATA_STREAM_PHASE_ORDER,
  DATA_STREAM_PHASES,
  getDataStreamPhaseProgress,
} from '../../../../../../common';
import type { DataStreamResponse, DataStreamPhase } from '../../../../../../common';
import * as i18n from '../translations';

export const STATUS_COLOR_MAP: Record<DataStreamResponse['status'], string> = {
  pending: 'default',
  processing: 'primary',
  completed: 'success',
  failed: 'danger',
  cancelled: 'warning',
  approved: 'success',
  deleting: 'default',
};

export const STATUS_ICON_MAP: Record<DataStreamResponse['status'], string> = {
  pending: '',
  processing: '',
  completed: 'dot',
  failed: 'cross',
  cancelled: 'minusCircle',
  approved: 'check',
  deleting: '',
};

export const STATUS_TEXT_MAP: Record<DataStreamResponse['status'], string> = {
  pending: i18n.STATUS_LABELS.analyzing,
  processing: i18n.STATUS_LABELS.analyzing,
  completed: i18n.STATUS_LABELS.success,
  failed: i18n.STATUS_LABELS.failed,
  cancelled: i18n.STATUS_LABELS.cancelled,
  approved: i18n.STATUS_LABELS.approved,
  deleting: i18n.STATUS_LABELS.deleting,
};

export const PHASE_TEXT_MAP: Record<DataStreamPhase, string> = {
  [DATA_STREAM_PHASES.analyzingLogs]: i18n.PHASE_LABELS.analyzing_logs,
  [DATA_STREAM_PHASES.mappingToEcs]: i18n.PHASE_LABELS.mapping_to_ecs,
  [DATA_STREAM_PHASES.buildingPipeline]: i18n.PHASE_LABELS.building_pipeline,
  [DATA_STREAM_PHASES.fixingPipeline]: i18n.PHASE_LABELS.fixing_pipeline,
  [DATA_STREAM_PHASES.mappingEventFields]: i18n.PHASE_LABELS.mapping_event_fields,
  [DATA_STREAM_PHASES.mappingRelatedFields]: i18n.PHASE_LABELS.mapping_related_fields,
  [DATA_STREAM_PHASES.reviewing]: i18n.PHASE_LABELS.reviewing,
  [DATA_STREAM_PHASES.finalizing]: i18n.PHASE_LABELS.finalizing,
};

export const getPhaseLabel = (phase: string | undefined): string => {
  if (phase && phase in PHASE_TEXT_MAP) {
    return PHASE_TEXT_MAP[phase as DataStreamPhase];
  }
  return i18n.STATUS_LABELS.analyzing;
};

export const getPhaseProgressValue = (phase: string | undefined): number => {
  if (phase && (DATA_STREAM_PHASE_ORDER as readonly string[]).includes(phase)) {
    return getDataStreamPhaseProgress(phase as DataStreamPhase);
  }
  return 1;
};

export const DATA_STREAM_PHASE_PROGRESS_MAX = DATA_STREAM_PHASE_ORDER.length;
