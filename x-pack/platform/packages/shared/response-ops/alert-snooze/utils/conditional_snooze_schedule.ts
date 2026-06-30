/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';
import type {
  ConditionalSnoozeSchedule,
  DataConditionEntry,
  DataConditionTypeDescriptor,
  SnoozeCondition,
} from '../components/types';
import type { TimeConditionState } from '../components/time_condition_panel';
import { SNOOZE_DATE_DISPLAY_FORMAT, SNOOZE_UNIT_OPTIONS } from '../components/constants';
import * as i18n from '../components/translations';

/**
 * Human-readable label for the chip shown next to a confirmed time condition,
 * e.g. "after 2 hours" or "May 20, 2026 at 4:00 AM".
 */
export const buildTimeChipLabel = (timeCondition: TimeConditionState | null): string => {
  if (!timeCondition) return '';
  if (timeCondition.mode === 'datetime') {
    return timeCondition.dateTime?.format(SNOOZE_DATE_DISPLAY_FORMAT) ?? '';
  }
  const unitText = (
    SNOOZE_UNIT_OPTIONS.find((o) => o.value === timeCondition.unit)?.text ?? timeCondition.unit
  ).toLowerCase();
  return i18n.getAfterDurationLabel(timeCondition.value, unitText);
};

export interface BuildPreviewSentencesArgs {
  confirmedDataConditions: readonly DataConditionEntry[];
  descriptorById: ReadonlyMap<string, DataConditionTypeDescriptor>;
  conditionOperator: 'any' | 'all';
  /**
   * ISO string of the time condition's resolved end date, or `null` when the
   * time condition is missing/invalid/unconfirmed.
   */
  timeEndDate: string | null;
}

/**
 * Composes the unsnooze sentence from pre-computed parts. Returns `null` when
 * neither part is available so callers can apply their own fallback.
 */
export const composeSnoozeSentence = (
  conditionsPart: string | null,
  formattedDate: string | null
): string | null => {
  if (conditionsPart && formattedDate) {
    return i18n.getUnsnoozeIfConditionsOrOnDateMessage(conditionsPart, formattedDate);
  }
  if (conditionsPart) {
    return i18n.getUnsnoozeIfConditionsMessage(conditionsPart);
  }
  if (formattedDate) {
    return i18n.getUnsnoozeOnDateMessage(formattedDate);
  }
  return null;
};

/**
 * Compose the user-facing preview sentence(s) for the confirmed snooze
 * conditions. Returns the i18n footer hint when there's nothing to preview,
 * so the caller can render a stable array.
 */
export const buildPreviewSentences = ({
  confirmedDataConditions,
  descriptorById,
  conditionOperator,
  timeEndDate,
}: BuildPreviewSentencesArgs): string[] => {
  const formattedTimeDate = timeEndDate
    ? moment(timeEndDate).format(SNOOZE_DATE_DISPLAY_FORMAT)
    : null;

  const dataConnector =
    conditionOperator === 'all' ? i18n.PREVIEW_CONNECTOR_AND : i18n.PREVIEW_CONNECTOR_OR;

  const dataPreviewPart =
    confirmedDataConditions.length > 0
      ? confirmedDataConditions
          .map((c) => descriptorById.get(c.type)?.getPreviewText(c) ?? c.type)
          .reduce((acc, part) => `${acc} ${dataConnector} ${part}`)
      : null;

  const sentence = composeSnoozeSentence(dataPreviewPart, formattedTimeDate);
  return sentence ? [sentence] : [i18n.CONDITIONS_FOOTER_HINT];
};

export interface BuildConditionalSnoozeScheduleArgs {
  /**
   * `true` when the user has confirmed a time condition AND it is valid.
   */
  hasConfirmedTimeCondition: boolean;
  /**
   * ISO string of the time condition's resolved end date, or `null`.
   * Required when `hasConfirmedTimeCondition` is true.
   */
  timeEndDate: string | null;
  dataConditions: readonly DataConditionEntry[];
  descriptorById: ReadonlyMap<string, DataConditionTypeDescriptor>;
  conditionOperator: 'any' | 'all';
}

/**
 * Build the final `ConditionalSnoozeSchedule` payload from raw panel state.
 * Returns `undefined` when there is nothing valid to emit so the caller can
 * disable the apply button without further branching.
 */
export const buildConditionalSnoozeSchedule = ({
  hasConfirmedTimeCondition,
  timeEndDate,
  dataConditions,
  descriptorById,
  conditionOperator,
}: BuildConditionalSnoozeScheduleArgs): ConditionalSnoozeSchedule | undefined => {
  const confirmed = dataConditions.filter((c) => c.confirmed);
  const hasTimePart = hasConfirmedTimeCondition && timeEndDate !== null;

  if (!hasTimePart && confirmed.length === 0) {
    return undefined;
  }

  const schedule: ConditionalSnoozeSchedule = {};

  if (hasTimePart) {
    schedule.expiresAt = timeEndDate;
  }

  if (confirmed.length > 0) {
    schedule.conditions = confirmed
      .map((entry) => descriptorById.get(entry.type)?.serialize(entry) ?? null)
      .filter((c): c is SnoozeCondition => c !== null);
    schedule.conditionOperator = conditionOperator;
  }

  return schedule;
};
