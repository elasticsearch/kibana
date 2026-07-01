/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiBasicTableColumn } from '@elastic/eui';
import { EuiCallOut, EuiLink, EuiLoadingSpinner, EuiText } from '@elastic/eui';
import { AlertLifecycleStatusBadge } from '@kbn/alerts-ui-shared/src/alert_lifecycle_status_badge';
import type { Cases } from '@kbn/cases-plugin/common';
import { i18n } from '@kbn/i18n';
import type { AlertStatus } from '@kbn/rule-data-utils';
import moment from 'moment';
import React from 'react';
import { Tooltip as CaseTooltip } from '@kbn/cases-components';
import { TagsList } from '@kbn/observability-shared-plugin/public';
import { COMPARATORS } from '@kbn/alerting-comparators';
import { LEGACY_COMPARATORS } from '../../../common/utils/convert_legacy_outside_comparator';
import type { NavigateToCaseView } from '../../hooks/use_case_view_navigation';
import { formatCase } from './helpers/format_cases';
import type { FlyoutThresholdData } from './helpers/map_rules_params_with_flyout';
import { ALERT_SOURCES_ELEMENT, Groups } from '../alert_sources/groups';
import type { Group } from '../../../common/typings';

/**
 * Formats a comparator string for display.
 * Converts NOT_BETWEEN and OUTSIDE_RANGE to 'NOT BETWEEN', otherwise returns uppercase.
 */
const formatComparator = (comparator: string): string => {
  if (comparator === COMPARATORS.NOT_BETWEEN || comparator === LEGACY_COMPARATORS.OUTSIDE_RANGE) {
    return 'NOT BETWEEN';
  }
  if (comparator === COMPARATORS.BETWEEN_INCLUSIVE) {
    return 'BETWEEN (INCLUSIVE)';
  }
  if (comparator === COMPARATORS.NOT_BETWEEN_INCLUSIVE) {
    return 'NOT BETWEEN (INCLUSIVE)';
  }
  return comparator.toUpperCase();
};

/**
 * Renders threshold rows for a list of criteria.
 * Combines alert threshold and warning threshold into one line when warning threshold exists.
 */
const renderThresholdRows = (ruleCriteria: FlyoutThresholdData[]): React.ReactElement => {
  return (
    <div>
      {ruleCriteria.map((criteria, index) => {
        const { threshold, comparator, warningThreshold, warningComparator } = criteria;
        const formattedComparator = formatComparator(comparator);
        // threshold is typed as string[] but is actually a string at runtime
        const thresholdStr = Array.isArray(threshold) ? threshold.join(' AND ') : threshold;

        let thresholdText = i18n.translate(
          'xpack.observability.alertFlyout.overviewTab.thresholdAlert',
          {
            defaultMessage: '{comparator} {threshold}',
            values: {
              comparator: formattedComparator,
              threshold: thresholdStr,
            },
          }
        );

        if (warningThreshold && warningComparator) {
          const formattedWarningComparator = formatComparator(warningComparator);
          thresholdText = i18n.translate(
            'xpack.observability.alertFlyout.overviewTab.thresholdWithWarning',
            {
              defaultMessage:
                'Alert when {comparator} {threshold}, Warning when {warningComparator} {warningThreshold}',
              values: {
                comparator: formattedComparator,
                threshold: thresholdStr,
                warningComparator: formattedWarningComparator,
                warningThreshold,
              },
            }
          );
        }

        return (
          <EuiText size="s" key={`${thresholdStr}-${index}`}>
            <h4>{thresholdText}</h4>
          </EuiText>
        );
      })}
    </div>
  );
};

interface AlertOverviewField {
  id: string;
  key: string;
  value?: string | string[] | number | number[] | Record<string, any>;
  meta?: Record<string, any>;
}
export const ColumnIDs = {
  STATUS: 'status',
  SOURCE: 'source',
  TRIGGERED: 'triggered',
  DURATION: 'duration',
  OBSERVED_VALUE: 'observed_value',
  THRESHOLD: 'threshold',
  RULE_NAME: 'rule_name',
  RULE_TYPE: 'rule_type',
  CASES: 'cases',
  WORKFLOW_TAGS: 'workflow_tags',
} as const;

export const overviewColumns: Array<EuiBasicTableColumn<AlertOverviewField>> = [
  {
    field: 'key',
    name: '',
    width: '30%',
  },
  {
    field: 'value',
    name: '',
    render: (value: AlertOverviewField['value'], { id, meta }: AlertOverviewField) => {
      if (!value && value !== 0 && !meta) return <>{'-'}</>;
      const ruleCriteria = meta?.ruleCriteria as FlyoutThresholdData[];
      switch (id) {
        case ColumnIDs.STATUS:
          const alertStatus = value as string;
          const flapping = meta?.flapping;
          return (
            <AlertLifecycleStatusBadge
              alertStatus={alertStatus as AlertStatus}
              flapping={flapping}
            />
          );

        case ColumnIDs.SOURCE:
          const groups = meta?.groups as Group[];
          if (!groups.length) return <>{'-'}</>;
          const alertEnd = meta?.alertEnd;
          const timeRange = meta?.timeRange;
          const alertRuleTypeId = meta?.alertRuleTypeId;
          return (
            <div>
              <Groups
                groups={groups}
                timeRange={alertEnd ? timeRange : { ...timeRange, to: 'now' }}
                alertRuleTypeId={alertRuleTypeId}
                element={ALERT_SOURCES_ELEMENT.ALERT_FLYOUT}
              />
            </div>
          );
        case ColumnIDs.TRIGGERED:
          const triggeredDate = value as string;
          return <EuiText size="s">{moment(triggeredDate).format(meta?.dateFormat)}</EuiText>;
        case ColumnIDs.DURATION:
          const duration = value as number;
          return (
            <EuiText size="s">
              {/* duration is in μs so divide by 1000 */}
              <h4>{moment.duration(duration / 1000).humanize()}</h4>
            </EuiText>
          );
        case ColumnIDs.RULE_NAME:
          const ruleName = value as string;
          const ruleLink = meta?.ruleLink as string;
          return ruleLink ? (
            <EuiLink data-test-subj="alertFlyoutOverview" href={ruleLink}>
              {ruleName}
            </EuiLink>
          ) : (
            <EuiText size="s" data-test-subj="alertFlyoutOverviewRuleName">
              {ruleName}
            </EuiText>
          );
        case ColumnIDs.OBSERVED_VALUE:
          if (!ruleCriteria) return <>{'-'}</>;
          return (
            <div>
              {ruleCriteria.map((criteria, criteriaIndex) => {
                const observedValue = criteria.observedValue;
                const pctAboveThreshold = criteria.pctAboveThreshold;
                return (
                  <EuiText size="s" key={`${observedValue}-${criteriaIndex}`}>
                    <h4 style={{ display: 'inline' }}>{observedValue}</h4>
                    <span>{pctAboveThreshold}</span>
                  </EuiText>
                );
              })}
              {ruleCriteria.length > 1 && (
                <EuiCallOut
                  announceOnMount
                  size="s"
                  title={i18n.translate(
                    'xpack.observability.columns.euiCallOut.multipleConditionsLabel',
                    { defaultMessage: 'Multiple conditions' }
                  )}
                  iconType="warning"
                />
              )}
            </div>
          );

        case ColumnIDs.THRESHOLD:
          if (!ruleCriteria) return <>{'-'}</>;
          return renderThresholdRows(ruleCriteria);

        case ColumnIDs.RULE_TYPE:
          const ruleType = value as string;
          return <EuiText size="s">{ruleType}</EuiText>;

        case ColumnIDs.CASES:
          const cases = meta?.cases as Cases;
          const isLoading = meta?.isLoading;
          if (isLoading) return <EuiLoadingSpinner size="m" />;
          if (!cases || !cases.length) return <>{'-'}</>;
          const navigateToCaseView = meta?.navigateToCaseView as NavigateToCaseView;
          return cases.map((caseInfo, index) => {
            return [
              index > 0 && index < cases.length && ', ',
              <CaseTooltip loading={false} content={formatCase(caseInfo)} key={caseInfo.id}>
                <EuiLink
                  key={caseInfo.id}
                  onClick={() => navigateToCaseView({ caseId: caseInfo.id })}
                  data-test-subj="o11yAlertFlyoutOverviewTabCasesLink"
                >
                  {caseInfo.title}
                </EuiLink>
              </CaseTooltip>,
            ];
          });
        case ColumnIDs.WORKFLOW_TAGS:
          const workflowTags = value as string[];
          if (!workflowTags || !workflowTags.length) return <>{'-'}</>;
          return <TagsList tags={workflowTags} ignoreEmpty color="default" />;
        default:
          return <>{'-'}</>;
      }
    },
  },
];
