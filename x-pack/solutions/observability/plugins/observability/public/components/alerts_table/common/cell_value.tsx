/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { EuiLink, EuiText, EuiFlexGroup } from '@elastic/eui';
import type { ReactNode } from 'react';
import React from 'react';
import {
  ALERT_DURATION,
  ALERT_SEVERITY,
  ALERT_STATUS,
  ALERT_STATUS_ACTIVE,
  ALERT_STATUS_RECOVERED,
  ALERT_REASON,
  TIMESTAMP,
  ALERT_EVALUATION_VALUE,
  ALERT_EVALUATION_VALUES,
  ALERT_RULE_NAME,
  ALERT_RULE_CATEGORY,
  ALERT_START,
  ALERT_RULE_EXECUTION_TIMESTAMP,
  ALERT_RULE_UUID,
  ALERT_RULE_TYPE_ID,
  ALERT_RULE_CONSUMER,
  ALERT_CASE_IDS,
} from '@kbn/rule-data-utils';
import { isEmpty } from 'lodash';
import type { Alert } from '@kbn/alerting-types';
import type { JsonValue } from '@kbn/utility-types';
import {
  RELATED_ACTIONS_COL,
  RELATED_ALERT_REASON,
  RELATION_COL,
} from '../../../pages/alert_details/components/related_alerts/get_related_columns';
import { RelationCol } from '../../../pages/alert_details/components/related_alerts/relation_col';
import { paths } from '../../../../common/locators/paths';
import { asDuration } from '../../../../common/utils/formatters';
import { AlertSeverityBadge } from '../../alert_severity_badge';
import { AlertStatusIndicator } from '../../alert_status_indicator';
import { parseAlert } from '../../../pages/alerts/helpers/parse_alert';
import { useAuthorizedToReadRuleType } from '../../../hooks/use_authorized_to_read_rule_type';
import { CellTooltip } from './cell_tooltip';
import { TimestampTooltip } from './timestamp_tooltip';
import type { GetObservabilityAlertsTableProp } from '../types';
import AlertActions from '../../alert_actions/alert_actions';
import { ElapsedTimestampTooltip } from '../../../../common';

export const getAlertFieldValue = (alert: Alert, fieldName: string) => {
  // can be updated when working on https://github.com/elastic/kibana/issues/140819
  const rawValue = alert[fieldName] as JsonValue[];
  const value = Array.isArray(rawValue) ? rawValue.join() : rawValue;

  if (!isEmpty(value)) {
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (e) {
        return 'Error: Unable to parse JSON value.';
      }
    }
    return value;
  }

  return '--';
};

export type AlertCellRenderers = Record<string, (value: string) => ReactNode>;

/**
 * This implementation of `EuiDataGrid`'s `renderCellValue`
 * accepts `EuiDataGridCellValueElementProps`, plus `data`
 * from the TGrid
 */
// eslint-disable-next-line react/function-component-definition
export const AlertsTableCellValue: GetObservabilityAlertsTableProp<'renderCellValue'> = (props) => {
  const {
    tableId,
    columnId,
    alert,
    rowIndex,
    onExpandedAlertIndexChange,
    observabilityRuleTypeRegistry,
    services: { http },
    parentAlert,
  } = props;

  const authorizedToReadRuleType = useAuthorizedToReadRuleType();

  const cellRenderers: AlertCellRenderers = {
    [ALERT_STATUS]: (value) => {
      if (value !== ALERT_STATUS_ACTIVE && value !== ALERT_STATUS_RECOVERED) {
        // NOTE: This should only be needed to narrow down the type.
        // Status should be either "active" or "recovered".
        return null;
      }
      return <AlertStatusIndicator alertStatus={value} />;
    },
    [TIMESTAMP]: (value) => (
      <TimestampTooltip time={new Date(value ?? '').getTime()} timeUnit="milliseconds" />
    ),
    [ALERT_START]: (value) =>
      tableId === 'xpack.observability.alerts.relatedAlerts' ? (
        <ElapsedTimestampTooltip time={new Date(value ?? '').getTime()} timeUnit="milliseconds" />
      ) : (
        <TimestampTooltip time={new Date(value ?? '').getTime()} timeUnit="milliseconds" />
      ),
    [ALERT_RULE_EXECUTION_TIMESTAMP]: (value) => (
      <TimestampTooltip time={new Date(value ?? '').getTime()} timeUnit="milliseconds" />
    ),
    [ALERT_DURATION]: (value) => <>{asDuration(Number(value))}</>,
    [ALERT_SEVERITY]: (value) => <AlertSeverityBadge severityLevel={value ?? undefined} />,
    [ALERT_EVALUATION_VALUE]: (value) => {
      const multipleValues = getAlertFieldValue(alert, ALERT_EVALUATION_VALUES);
      return <>{multipleValues ?? value}</>;
    },
    [ALERT_REASON]: (value) => {
      if (!observabilityRuleTypeRegistry) return <>{value}</>;
      const parsedAlert = parseAlert(observabilityRuleTypeRegistry)(alert);
      return (
        <EuiLink
          data-test-subj="o11yGetRenderCellValueLink"
          css={{ ':hover': { textDecoration: 'none' } }}
          onClick={() => onExpandedAlertIndexChange(rowIndex)}
        >
          {parsedAlert.reason}
        </EuiLink>
      );
    },
    [ALERT_RULE_NAME]: (value) => {
      const ruleCategory = getAlertFieldValue(alert, ALERT_RULE_CATEGORY);
      const ruleId = getAlertFieldValue(alert, ALERT_RULE_UUID);
      const ruleTypeId = getAlertFieldValue(alert, ALERT_RULE_TYPE_ID);
      const ruleConsumer = getAlertFieldValue(alert, ALERT_RULE_CONSUMER);
      const ruleLink = ruleId ? http.basePath.prepend(paths.observability.ruleDetails(ruleId)) : '';
      // Rule read is authorized per rule type (and consumer), so gate the link on
      // the specific rule behind this alert rather than a coarse "any rules" flag.
      const canReadRule = authorizedToReadRuleType(
        ruleTypeId,
        ruleConsumer === '--' ? undefined : ruleConsumer
      );
      return (
        <CellTooltip
          value={
            canReadRule && ruleLink ? (
              <EuiLink data-test-subj="o11yCellRenderersLink" href={ruleLink}>
                {value}
              </EuiLink>
            ) : (
              <EuiText size="s" data-test-subj="o11yCellRenderersRuleName">
                {value}
              </EuiText>
            )
          }
          tooltipContent={ruleCategory}
        />
      );
    },
    [RELATION_COL]: (value) => {
      return <RelationCol alert={alert} parentAlert={parentAlert!} />;
    },
    [RELATED_ALERT_REASON]: (value) => {
      const val = getAlertFieldValue(alert, ALERT_REASON);
      return <EuiText size="s">{val}</EuiText>;
    },
    [RELATED_ACTIONS_COL]: (val) => {
      return (
        <EuiFlexGroup gutterSize="none">
          <AlertActions {...props} />
        </EuiFlexGroup>
      );
    },
    [ALERT_CASE_IDS]: (value) => {
      return <>{value}</>;
    },
  };

  const val = getAlertFieldValue(alert, columnId);

  return cellRenderers[columnId] ? cellRenderers[columnId](val) : <>{val}</>;
};
