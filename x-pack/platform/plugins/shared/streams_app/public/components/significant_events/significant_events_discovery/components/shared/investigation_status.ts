/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type {
  SignificantEvent,
  SignificantEventInvestigationStatus,
} from '@kbn/significant-events-schema';

export const INVESTIGATION_STATUS_COLORS: Record<SignificantEventInvestigationStatus, string> = {
  pending: 'warning',
  success: 'success',
  failed: 'danger',
};

export const INVESTIGATION_STATUS_LABELS: Record<SignificantEventInvestigationStatus, string> = {
  pending: i18n.translate('xpack.streams.investigation.status.pending', {
    defaultMessage: 'Running',
  }),
  success: i18n.translate('xpack.streams.investigation.status.success', {
    defaultMessage: 'Completed',
  }),
  failed: i18n.translate('xpack.streams.investigation.status.failed', {
    defaultMessage: 'Failed',
  }),
};

/** Returns true when the event has at least one investigation currently in flight. */
export const hasPendingInvestigation = (event: SignificantEvent): boolean =>
  event.investigations?.some((i) => i.status === 'pending') ?? false;
