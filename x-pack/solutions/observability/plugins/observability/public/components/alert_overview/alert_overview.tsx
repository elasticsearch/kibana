/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  EuiTitle,
  EuiSpacer,
  EuiText,
  EuiLink,
  EuiHorizontalRule,
  EuiInMemoryTable,
} from '@elastic/eui';
import type { AlertStatus } from '@kbn/rule-data-utils';
import {
  ALERT_CASE_IDS,
  ALERT_DURATION,
  ALERT_END,
  ALERT_EVALUATION_VALUE,
  ALERT_EVALUATION_VALUES,
  ALERT_FLAPPING,
  ALERT_RULE_CATEGORY,
  ALERT_RULE_CONSUMER,
  ALERT_RULE_NAME,
  ALERT_RULE_TYPE_ID,
  ALERT_RULE_UUID,
  ALERT_START,
  ALERT_STATUS,
} from '@kbn/rule-data-utils';
import { useUiSetting } from '@kbn/kibana-react-plugin/public';
import { i18n } from '@kbn/i18n';
import { getPaddedAlertTimeRange } from '@kbn/observability-get-padded-alert-time-range-util';

import { get } from 'lodash';
import { paths } from '../../../common/locators/paths';
import type { TopAlert } from '../../typings/alerts';
import { useFetchBulkCases } from '../../hooks/use_fetch_bulk_cases';
import { useCaseViewNavigation } from '../../hooks/use_case_view_navigation';
import { useKibana } from '../../utils/kibana_react';
import { useAuthorizedToReadRuleType } from '../../hooks/use_authorized_to_read_rule_type';
import type { FlyoutThresholdData } from './helpers/map_rules_params_with_flyout';
import { mapRuleParamsWithFlyout } from './helpers/map_rules_params_with_flyout';
import { ColumnIDs, overviewColumns } from './overview_columns';
import { getSources } from '../alert_sources/get_sources';
import { RULE_DETAILS_PAGE_ID } from '../../pages/rule_details/constants';
import type { TimeRange } from '../../../common/typings';

export const AlertOverview = memo(
  ({
    alert,
    pageId,
    alertStatus,
  }: {
    alert: TopAlert;
    pageId?: string;
    alertStatus?: AlertStatus;
  }) => {
    const {
      http: {
        basePath: { prepend },
      },
    } = useKibana().services;
    const authorizedToReadRuleType = useAuthorizedToReadRuleType();
    const { cases, isLoading } = useFetchBulkCases({ ids: alert.fields[ALERT_CASE_IDS] || [] });
    const dateFormat = useUiSetting<string>('dateFormat');

    const [timeRange, setTimeRange] = useState<TimeRange>({ from: 'now-15m', to: 'now' });
    const [ruleCriteria, setRuleCriteria] = useState<FlyoutThresholdData[] | undefined>([]);

    const alertRuleTypeId = alert.fields[ALERT_RULE_TYPE_ID];
    const alertConsumer = alert.fields[ALERT_RULE_CONSUMER];
    const alertStart = alert.fields[ALERT_START];
    const alertEnd = alert.fields[ALERT_END];
    const ruleId = get(alert.fields, ALERT_RULE_UUID) ?? null;

    // Rule read is authorized per rule type (and consumer), so gate the rule links
    // on the specific rule behind this alert rather than a coarse "any rules" flag.
    const canReadAlertRule = Boolean(
      alertRuleTypeId && authorizedToReadRuleType(alertRuleTypeId, alertConsumer)
    );

    const linkToRule =
      canReadAlertRule && pageId !== RULE_DETAILS_PAGE_ID && ruleId
        ? prepend(paths.observability.ruleDetails(ruleId))
        : null;

    useEffect(() => {
      const mappedRuleParams = mapRuleParamsWithFlyout(alert);
      setRuleCriteria(mappedRuleParams);
    }, [alert]);

    useEffect(() => {
      setTimeRange(getPaddedAlertTimeRange(alertStart!, alertEnd));
    }, [alertStart, alertEnd]);

    const { navigateToCaseView } = useCaseViewNavigation();
    const items = useMemo(() => {
      return [
        {
          id: ColumnIDs.STATUS,
          key: i18n.translate('xpack.observability.alertFlyout.overviewTab.status', {
            defaultMessage: 'Status',
          }),
          value: alertStatus || alert.fields[ALERT_STATUS],
          meta: {
            flapping: alert.fields[ALERT_FLAPPING],
          },
        },
        {
          id: ColumnIDs.WORKFLOW_TAGS,
          key: i18n.translate('xpack.observability.alertFlyout.overviewTab.workflowTags', {
            defaultMessage: 'Workflow tags',
          }),
          value: alert.fields['kibana.alert.workflow_tags'] as string[],
        },
        {
          id: ColumnIDs.SOURCE,
          key: i18n.translate('xpack.observability.alertFlyout.overviewTab.sources', {
            defaultMessage: 'Affected entity / source',
          }),
          value: [],
          meta: {
            alertEnd,
            timeRange,
            alertRuleTypeId,
            groups: getSources(alert) || [],
          },
        },
        {
          id: ColumnIDs.TRIGGERED,
          key: i18n.translate('xpack.observability.alertFlyout.overviewTab.triggered', {
            defaultMessage: 'Triggered',
          }),
          value: alert.fields[ALERT_START],
          meta: {
            dateFormat,
          },
        },
        {
          id: ColumnIDs.DURATION,
          key: i18n.translate('xpack.observability.alertFlyout.overviewTab.duration', {
            defaultMessage: 'Duration',
          }),
          value: alert.fields[ALERT_DURATION],
        },
        {
          id: ColumnIDs.OBSERVED_VALUE,
          key: i18n.translate('xpack.observability.alertFlyout.overviewTab.observedValue', {
            defaultMessage: 'Observed value',
          }),
          value: alert.fields[ALERT_EVALUATION_VALUES] || [alert.fields[ALERT_EVALUATION_VALUE]],
          meta: {
            ruleCriteria,
          },
        },
        {
          id: ColumnIDs.THRESHOLD,
          key: i18n.translate('xpack.observability.alertFlyout.overviewTab.threshold', {
            defaultMessage: 'Threshold',
          }),
          value: [],
          meta: {
            ruleCriteria,
          },
        },
        {
          id: ColumnIDs.RULE_NAME,
          key: i18n.translate('xpack.observability.alertFlyout.overviewTab.ruleName', {
            defaultMessage: 'Rule name',
          }),
          value: alert.fields[ALERT_RULE_NAME],
          meta: {
            ruleLink:
              canReadAlertRule &&
              alert.fields[ALERT_RULE_UUID] &&
              prepend(paths.observability.ruleDetails(alert.fields[ALERT_RULE_UUID])),
          },
        },
        {
          id: ColumnIDs.RULE_TYPE,
          key: i18n.translate('xpack.observability.alertFlyout.overviewTab.ruleType', {
            defaultMessage: 'Rule type',
          }),
          value: alert.fields[ALERT_RULE_CATEGORY],
        },
        {
          id: ColumnIDs.CASES,
          key: i18n.translate('xpack.observability.alertFlyout.overviewTab.cases', {
            defaultMessage: 'Cases',
          }),
          value: [],
          meta: {
            cases,
            navigateToCaseView,
            isLoading,
          },
        },
      ];
    }, [
      alertStatus,
      alert,
      alertEnd,
      alertRuleTypeId,
      timeRange,
      dateFormat,
      ruleCriteria,
      prepend,
      cases,
      navigateToCaseView,
      isLoading,
      canReadAlertRule,
    ]);

    return (
      <>
        <EuiTitle size="xs">
          <h4>
            {i18n.translate('xpack.observability.alertsFlyout.reasonTitle', {
              defaultMessage: 'Reason',
            })}
          </h4>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText size="s">{alert.reason}</EuiText>
        <EuiSpacer size="s" />
        {!!linkToRule && (
          <EuiLink href={linkToRule} data-test-subj="viewRuleDetailsFlyout">
            {i18n.translate('xpack.observability.alertsFlyout.viewRulesDetailsLinkText', {
              defaultMessage: 'View rule details',
            })}
          </EuiLink>
        )}
        <EuiHorizontalRule size="full" />
        <EuiTitle size="xs">
          <h4>
            {i18n.translate('xpack.observability.alertsFlyout.documentSummaryTitle', {
              defaultMessage: 'Document Summary',
            })}
          </h4>
        </EuiTitle>
        <EuiSpacer size="m" />
        <EuiInMemoryTable
          width={'80%'}
          columns={overviewColumns}
          itemId="key"
          items={items}
          tableCaption={i18n.translate('xpack.observability.alertFlyout.alertOverviewCaption', {
            defaultMessage: 'Alert overview',
          })}
        />
      </>
    );
  }
);
