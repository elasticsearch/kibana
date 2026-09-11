/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiFieldNumber,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { RunQuotaGroup } from '@kbn/significant-events-plugin/common';
import {
  MAX_RUN_LIMIT,
  MIN_RUN_LIMIT,
  isFiniteRunLimit,
  isValidRunLimitDraft,
  parseRunLimitDraft,
  type RunLimitDraft,
} from './run_limit_draft';

export const RUN_QUOTA_GROUP_LABELS: Record<RunQuotaGroup, string> = {
  detection: i18n.translate('xpack.significantEventsApp.settings.runLimits.discoveryRowTitle', {
    defaultMessage: 'Discovery',
  }),
  investigation: i18n.translate(
    'xpack.significantEventsApp.settings.runLimits.investigationRowTitle',
    { defaultMessage: 'Investigation' }
  ),
  ki_extraction: i18n.translate(
    'xpack.significantEventsApp.settings.runLimits.knowledgeIndicatorExtractionRowTitle',
    { defaultMessage: 'Knowledge indicator extraction' }
  ),
};

interface RunLimitRowProps {
  group: RunQuotaGroup;
  count: number;
  limit: RunLimitDraft;
  enforcementEnabled: boolean;
  disabled: boolean;
  onChange: (limit: RunLimitDraft) => void;
}

export const RunLimitRow = ({
  group,
  count,
  limit,
  enforcementEnabled,
  disabled,
  onChange,
}: RunLimitRowProps) => {
  const { euiTheme } = useEuiTheme();
  const invalid = !isValidRunLimitDraft(limit);
  const reached = enforcementEnabled && isFiniteRunLimit(limit) && count >= limit;

  return (
    <EuiFlexGroup
      alignItems="flexStart"
      gutterSize="l"
      data-test-subj={`significantEventsRunLimitRow-${group}`}
    >
      <EuiFlexItem>
        <EuiTitle size="xxs">
          <h4>{RUN_QUOTA_GROUP_LABELS[group]}</h4>
        </EuiTitle>
        <EuiText size="s">
          <p data-test-subj={`significantEventsRunLimitCount-${group}`}>
            {i18n.translate('xpack.significantEventsApp.settings.runLimits.countDescription', {
              defaultMessage:
                '{count, plural, one {# counted scheduled admission today} other {# counted scheduled admissions today}}',
              values: { count },
            })}
          </p>
        </EuiText>
        {reached && (
          <EuiText size="xs" color="warning">
            <p data-test-subj={`significantEventsRunLimitReached-${group}`}>
              {i18n.translate(
                'xpack.significantEventsApp.settings.runLimits.workerReachedDescription',
                {
                  defaultMessage:
                    'The limit is reached. New scheduled work in this category can be denied until the UTC day resets.',
                }
              )}
            </p>
          </EuiText>
        )}
      </EuiFlexItem>
      <EuiFlexItem grow={false} css={{ minWidth: `calc(${euiTheme.size.xxl} * 4)` }}>
        <EuiFormRow
          fullWidth
          label={i18n.translate(
            'xpack.significantEventsApp.settings.runLimits.dailyLimitInputLabel',
            {
              defaultMessage: 'Daily limit',
            }
          )}
          helpText={i18n.translate(
            'xpack.significantEventsApp.settings.runLimits.unlimitedInputDescription',
            {
              defaultMessage: '0 means unlimited.',
            }
          )}
          isInvalid={invalid}
          error={
            invalid
              ? i18n.translate(
                  'xpack.significantEventsApp.settings.runLimits.invalidLimitErrorMessage',
                  {
                    defaultMessage: 'Enter a whole number from {minimum} to {maximum}.',
                    values: { minimum: MIN_RUN_LIMIT, maximum: MAX_RUN_LIMIT },
                  }
                )
              : undefined
          }
        >
          <EuiFieldNumber
            fullWidth
            aria-label={i18n.translate(
              'xpack.significantEventsApp.settings.runLimits.dailyLimitInputAriaLabel',
              {
                defaultMessage: 'Daily limit for {group}',
                values: { group: RUN_QUOTA_GROUP_LABELS[group] },
              }
            )}
            data-test-subj={`significantEventsRunLimitInput-${group}`}
            value={limit}
            min={MIN_RUN_LIMIT}
            max={MAX_RUN_LIMIT}
            step={1}
            isInvalid={invalid}
            disabled={disabled}
            onChange={(event) => onChange(parseRunLimitDraft(event.target.value))}
          />
        </EuiFormRow>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
