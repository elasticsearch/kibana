/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Detection, Discovery, SigEventStatus } from '@kbn/streams-schema';
import { SIG_EVENT_STATUS_OPTIONS } from '@kbn/streams-schema';
import { DETECTION_KIND_COLORS, DISCOVERY_KIND_COLORS, SIG_EVENT_STATUS_COLORS } from './constants';
import {
  DETECTION_KIND_LABELS,
  DISCOVERY_KIND_LABELS,
  SIG_EVENT_STATUS_LABELS,
} from './translations';

export type LifecycleDisplayStatus = Exclude<
  Detection['kind'] | Discovery['kind'] | SigEventStatus,
  'handled'
>;

export const isSigEventStatus = (status: string): status is SigEventStatus =>
  (SIG_EVENT_STATUS_OPTIONS as ReadonlyArray<string>).includes(status);

export const getSigEventStatusColor = (status: string): string =>
  isSigEventStatus(status) ? SIG_EVENT_STATUS_COLORS[status] : 'default';

export const isVisibleDiscoveryKind = (
  kind: Discovery['kind']
): kind is Exclude<Discovery['kind'], 'handled'> => kind !== 'handled';

export const getLifecycleStatusLabel = (status: LifecycleDisplayStatus): string => {
  switch (status) {
    case 'detection':
    case 'quiet':
      return DETECTION_KIND_LABELS[status];
    case 'discovery':
    case 'clearance':
      return DISCOVERY_KIND_LABELS[status];
    case 'promoted':
    case 'acknowledged':
    case 'demoted':
    case 'resolved':
      return SIG_EVENT_STATUS_LABELS[status];
    default:
      return status;
  }
};

export const getLifecycleStatusColor = (status: LifecycleDisplayStatus): string => {
  switch (status) {
    case 'detection':
    case 'quiet':
      return DETECTION_KIND_COLORS[status];
    case 'discovery':
    case 'clearance':
      return DISCOVERY_KIND_COLORS[status];
    case 'promoted':
    case 'acknowledged':
    case 'demoted':
    case 'resolved':
      return SIG_EVENT_STATUS_COLORS[status];
    default:
      return 'hollow';
  }
};
