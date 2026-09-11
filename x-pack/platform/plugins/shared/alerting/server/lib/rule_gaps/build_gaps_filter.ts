/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GapReasonType } from '../../../common/constants/gap_reason';
import { GAP_DELETED_FIELD, GAP_EVENT_ACTION, GAP_EVENT_PROVIDER } from './constants';

const FAILED_AUTO_FILL_ATTEMPTS_FIELD = `kibana.alert.rule.gap.failed_auto_fill_attempts`;
const GAP_REASON_TYPE_FIELD = `kibana.alert.rule.gap.reason.type`;

const getFilterForInterval = (hasInterval: boolean | undefined, field: string) => {
  if (hasInterval === undefined) {
    return null;
  }
  const fieldFilter = `kibana.alert.rule.gap.${field}: *`;
  return hasInterval ? fieldFilter : `NOT ${fieldFilter}`;
};

export const buildGapsFilter = ({
  start,
  end,
  statuses,
  hasUnfilledIntervals,
  hasInProgressIntervals,
  hasFilledIntervals,
  updatedBefore,
  failedAutoFillAttemptsLessThan,
  excludedReasons,
}: {
  start?: string;
  end?: string;
  statuses?: string[];
  hasUnfilledIntervals?: boolean;
  hasInProgressIntervals?: boolean;
  hasFilledIntervals?: boolean;
  updatedBefore?: string;
  failedAutoFillAttemptsLessThan?: number;
  excludedReasons?: GapReasonType[];
}) => {
  const baseFilter = `event.action: ${GAP_EVENT_ACTION} AND event.provider: ${GAP_EVENT_PROVIDER} AND not ${GAP_DELETED_FIELD}:true`;

  const endFilter = end ? `kibana.alert.rule.gap.range <= "${end}"` : null;
  const startFilter = start ? `kibana.alert.rule.gap.range >= "${start}"` : null;

  const statusesFilter = statuses?.length
    ? `(${statuses.map((status) => `kibana.alert.rule.gap.status : ${status}`).join(' OR ')})`
    : null;

  const hasUnfilledIntervalsFilter = getFilterForInterval(
    hasUnfilledIntervals,
    'unfilled_intervals'
  );
  const hasInProgressIntervalsFilter = getFilterForInterval(
    hasInProgressIntervals,
    'in_progress_intervals'
  );
  const hasFilledIntervalsFilter = getFilterForInterval(hasFilledIntervals, 'filled_intervals');

  const updatedBeforeFilter = updatedBefore
    ? `kibana.alert.rule.gap.updated_at < "${updatedBefore}"`
    : null;

  const failedAutoAttemptsLessThanFilter = failedAutoFillAttemptsLessThan
    ? `(NOT ${FAILED_AUTO_FILL_ATTEMPTS_FIELD}:* OR ${FAILED_AUTO_FILL_ATTEMPTS_FIELD}:*  AND ${FAILED_AUTO_FILL_ATTEMPTS_FIELD} < ${failedAutoFillAttemptsLessThan})`
    : null;

  const excludedReasonsFilter =
    excludedReasons && excludedReasons.length > 0
      ? `NOT (${excludedReasons
          .map((reason) => `${GAP_REASON_TYPE_FIELD}: "${reason}"`)
          .join(' OR ')})`
      : null;

  return [
    baseFilter,
    endFilter,
    startFilter,
    statusesFilter,
    hasUnfilledIntervalsFilter,
    hasInProgressIntervalsFilter,
    hasFilledIntervalsFilter,
    updatedBeforeFilter,
    failedAutoAttemptsLessThanFilter,
    excludedReasonsFilter,
  ]
    .filter(Boolean)
    .join(' AND ');
};
