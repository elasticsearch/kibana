/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButtonIcon,
  EuiFlexItem,
  EuiContextMenuPanel,
  EuiPopover,
  EuiToolTip,
} from '@elastic/eui';

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { i18n } from '@kbn/i18n';
import { useRouteMatch } from 'react-router-dom';
import { SLO_ALERTS_TABLE_ID } from '@kbn/observability-shared-plugin/common';
import {
  ALERT_RULE_CONSUMER,
  ALERT_RULE_TYPE_ID,
  getRulesAppDetailsRoute,
  rulesAppRoute,
} from '@kbn/rule-data-utils';
import { DefaultAlertActions } from '@kbn/response-ops-alerts-table/components/default_alert_actions';
import { useCaseAlertActionItems } from '@kbn/response-ops-alerts-table/hooks/use_case_alert_action_items';
import { useKibana } from '../../utils/kibana_react';
import { useCanModifyAlerts } from '../../hooks/use_can_modify_alerts';
import { useAuthorizedToReadRuleType } from '../../hooks/use_authorized_to_read_rule_type';
import { RULE_DETAILS_PAGE_ID } from '../../pages/rule_details/constants';
import { SLO_DETAIL_PATH } from '../../../common/locators/paths';
import { parseAlert } from '../../pages/alerts/helpers/parse_alert';
import type { GetObservabilityAlertsTableProp, ObservabilityAlertsTableContext } from '../..';
import { observabilityFeatureId } from '../..';

export function AlertActions(
  props: React.ComponentProps<GetObservabilityAlertsTableProp<'renderActionsCell'>>
) {
  const {
    observabilityRuleTypeRegistry,
    alert,
    tableId,
    refresh,
    parentAlert,
    rowIndex,
    onExpandedAlertIndexChange,
    services,
  } = props;
  const {
    http: {
      basePath: { prepend },
    },
    cases,
  } = services;

  const canModifyAlerts = useCanModifyAlerts();

  const authorizedToReadRuleType = useAuthorizedToReadRuleType();

  // Rule read is authorized per rule type (and consumer), so gate the row's
  // "View rule details" action on the specific rule behind this alert rather
  // than always offering it.
  const alertRuleTypeId = alert[ALERT_RULE_TYPE_ID]?.[0] as string | undefined;
  const alertConsumer = alert[ALERT_RULE_CONSUMER]?.[0] as string | undefined;
  const canReadAlertRule = Boolean(
    alertRuleTypeId && authorizedToReadRuleType(alertRuleTypeId, alertConsumer)
  );
  const { telemetryClient } = useKibana().services;
  const isSLODetailsPage = useRouteMatch(SLO_DETAIL_PATH);

  const isInApp = Boolean(tableId === SLO_ALERTS_TABLE_ID && isSLODetailsPage);

  const [viewInAppUrl, setViewInAppUrl] = useState<string>();

  const parseObservabilityAlert = useMemo(
    () => parseAlert(observabilityRuleTypeRegistry),
    [observabilityRuleTypeRegistry]
  );

  const observabilityAlert = parseObservabilityAlert(alert);

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const closeActionsPopover = useCallback(() => {
    setIsPopoverOpen(false);
  }, []);

  const toggleActionsPopover = useCallback(() => {
    setIsPopoverOpen((open) => !open);
  }, []);

  const caseAlertActionItems = useCaseAlertActionItems({
    alert,
    cases,
    refresh,
    onAddToCase({ isNewCase }) {
      telemetryClient.reportAlertAddedToCase(
        isNewCase,
        tableId || 'unknown',
        observabilityAlert.fields['kibana.alert.rule.rule_type_id']
      );
      refresh?.();
    },
    onActionExecuted: closeActionsPopover,
    owner: [observabilityFeatureId],
  });

  useEffect(() => {
    const alertLink = observabilityAlert.link;
    if (!observabilityAlert.hasBasePath && prepend) {
      setViewInAppUrl(prepend(alertLink ?? ''));
    } else {
      setViewInAppUrl(alertLink);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleViewInAppUrl = useCallback(() => {
    const alertLink = observabilityAlert.link as unknown as string;
    if (!observabilityAlert.hasBasePath) {
      setViewInAppUrl(prepend(alertLink ?? ''));
    } else {
      setViewInAppUrl(alertLink);
    }
  }, [observabilityAlert.link, observabilityAlert.hasBasePath, prepend]);

  const actionsMenuItems = [
    ...caseAlertActionItems,

    useMemo(
      () => (
        <DefaultAlertActions<ObservabilityAlertsTableContext>
          {...props}
          key="defaultRowActions"
          onActionExecuted={closeActionsPopover}
          canModifyAlerts={canModifyAlerts}
          resolveRulePagePath={(ruleId, currentPageId) =>
            canReadAlertRule && currentPageId !== RULE_DETAILS_PAGE_ID
              ? `${rulesAppRoute}${getRulesAppDetailsRoute(ruleId)}`
              : null
          }
        />
      ),
      [closeActionsPopover, props, canModifyAlerts, canReadAlertRule]
    ),
  ];

  const actionsToolTip =
    actionsMenuItems.length <= 0
      ? i18n.translate('xpack.observability.alertsTable.notEnoughPermissions', {
          defaultMessage: 'Additional privileges required',
        })
      : i18n.translate('xpack.observability.alertsTable.moreActionsTextLabel', {
          defaultMessage: 'More actions',
        });

  const onExpandEvent = () => {
    onExpandedAlertIndexChange(rowIndex);
  };

  const hideViewInApp = isInApp || viewInAppUrl === '' || parentAlert;

  return (
    <>
      {!parentAlert && (
        <EuiFlexItem>
          <EuiToolTip
            data-test-subj="expand-event-tool-tip"
            content={VIEW_DETAILS}
            disableScreenReaderOutput
          >
            <EuiButtonIcon
              data-test-subj="expand-event"
              iconType="maximize"
              onClick={onExpandEvent}
              size="s"
              color="text"
              aria-label={VIEW_DETAILS}
            />
          </EuiToolTip>
        </EuiFlexItem>
      )}
      {!hideViewInApp && (
        <EuiFlexItem>
          <EuiToolTip
            content={i18n.translate('xpack.observability.alertsTable.viewInAppTextLabel', {
              defaultMessage: 'View in app',
            })}
            disableScreenReaderOutput
          >
            <EuiButtonIcon
              data-test-subj="o11yAlertActionsButton"
              aria-label={i18n.translate('xpack.observability.alertsTable.viewInAppTextLabel', {
                defaultMessage: 'View in app',
              })}
              color="text"
              onMouseOver={handleViewInAppUrl}
              onClick={() => window.open(viewInAppUrl)}
              iconType="eye"
              size="s"
            />
          </EuiToolTip>
        </EuiFlexItem>
      )}

      <EuiFlexItem
        css={{
          textAlign: 'center',
        }}
        grow={parentAlert ? false : undefined}
      >
        <EuiPopover
          anchorPosition="downLeft"
          button={
            <EuiToolTip content={actionsToolTip} disableScreenReaderOutput>
              <EuiButtonIcon
                aria-label={actionsToolTip}
                color="text"
                data-test-subj="alertsTableRowActionMore"
                display="empty"
                iconType="boxesVertical"
                onClick={toggleActionsPopover}
                size="s"
              />
            </EuiToolTip>
          }
          closePopover={closeActionsPopover}
          isOpen={isPopoverOpen}
          panelPaddingSize="none"
        >
          <EuiContextMenuPanel items={actionsMenuItems} data-test-subj="alertsTableActionsMenu" />
        </EuiPopover>
      </EuiFlexItem>
    </>
  );
}

// Default export used for lazy loading
// eslint-disable-next-line import/no-default-export
export default AlertActions;

const VIEW_DETAILS = i18n.translate('xpack.observability.alertsTable.viewDetailsTextLabel', {
  defaultMessage: 'Alert details',
});

export type AlertActions = typeof AlertActions;
