/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';
import type { SnoozeCondition } from '../components/types';
import { SNOOZE_DATE_DISPLAY_FORMAT } from '../components/constants';
import {
  INDEFINITELY_MESSAGE,
  PREVIEW_CONNECTOR_AND,
  PREVIEW_CONNECTOR_OR,
  PREVIEW_SEVERITY_CHANGE,
  getPreviewFieldChange,
  getPreviewSeverityEquals,
} from '../components/translations';
import { composeSnoozeSentence } from './conditional_snooze_schedule';

const getConditionPreviewText = (condition: SnoozeCondition): string => {
  if (condition.type === 'field_change') return getPreviewFieldChange(condition.field as string);
  if (condition.type === 'severity_change') return PREVIEW_SEVERITY_CHANGE;
  return getPreviewSeverityEquals((condition as { value: string }).value);
};

export interface BuildSnoozeSummaryParams {
  isMuted?: boolean | null;
  expiresAt?: string | null;
  conditions?: SnoozeCondition[];
  conditionOperator?: 'any' | 'all';
}

/**
 * Builds a human-readable summary string for an alert's snooze state, matching
 * the language used in the snooze popover's preview sentence.
 */
export const buildSnoozeSummary = ({
  isMuted,
  expiresAt,
  conditions,
  conditionOperator,
}: BuildSnoozeSummaryParams): string => {
  const hasConditions = conditions && conditions.length > 0;

  if (isMuted || (expiresAt === null && !hasConditions)) {
    return INDEFINITELY_MESSAGE;
  }

  const connector = conditionOperator === 'all' ? PREVIEW_CONNECTOR_AND : PREVIEW_CONNECTOR_OR;
  const conditionsPart = hasConditions
    ? conditions.map(getConditionPreviewText).reduce((acc, part) => `${acc} ${connector} ${part}`)
    : null;

  const formattedDate = expiresAt ? moment(expiresAt).format(SNOOZE_DATE_DISPLAY_FORMAT) : null;

  return composeSnoozeSentence(conditionsPart, formattedDate) ?? INDEFINITELY_MESSAGE;
};
