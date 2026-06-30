/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AlertStatus } from '@kbn/rule-data-utils';
import { ALERT_FLAPPING, ALERT_STATUS, ALERT_WORKFLOW_STATUS } from '@kbn/rule-data-utils';
import React, { memo } from 'react';
import { EuiBadge, EuiFlexGroup, EuiToolTip, useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import { AlertLifecycleStatusBadge } from '@kbn/alerts-ui-shared';
import { buildSnoozeSummary } from '@kbn/response-ops-alert-snooze';
import { DefaultCell } from './default_cell';
import { useAlertMutedState } from '../hooks/use_alert_muted_state';
import { useAlertSnoozedState } from '../hooks/use_alert_snoozed_state';
import type { CellComponent } from '../types';

export const AlertLifecycleStatusCell: CellComponent = memo((props) => {
  const { euiTheme } = useEuiTheme();
  const { alert, showAlertStatusWithFlapping } = props;
  const { isMuted } = useAlertMutedState(alert);
  const { isSnoozed, expiresAt, snoozedInstance } = useAlertSnoozedState(alert);
  const workflowStatus = alert?.[ALERT_WORKFLOW_STATUS]?.[0] as string | undefined;
  const isAcknowledged = workflowStatus === 'acknowledged';

  if (!showAlertStatusWithFlapping) {
    return null;
  }

  const alertStatus = (alert?.[ALERT_STATUS] ?? []) as string[] | undefined;

  const snoozedTooltip = buildSnoozeSummary({
    isMuted,
    expiresAt: isMuted ? null : expiresAt,
    conditions: snoozedInstance?.conditions,
    conditionOperator: snoozedInstance?.conditionOperator,
  });

  if (Array.isArray(alertStatus) && alertStatus.length) {
    const flapping = alert?.[ALERT_FLAPPING]?.[0] as boolean | undefined;

    return (
      <EuiFlexGroup gutterSize="s">
        <AlertLifecycleStatusBadge
          alertStatus={alertStatus.join() as AlertStatus}
          flapping={flapping}
        />
        {(isMuted || isSnoozed) && (
          <EuiToolTip content={snoozedTooltip}>
            <EuiBadge
              data-test-subj="alertSnoozedBadge"
              iconType="bellSlash"
              tabIndex={0}
              css={css`
                padding-inline: ${euiTheme.size.xs};
              `}
            />
          </EuiToolTip>
        )}
        {isAcknowledged && (
          <EuiToolTip
            content={i18n.translate(
              'xpack.triggersActionsUI.sections.alertsTable.alertAcknowledged',
              { defaultMessage: 'Alert acknowledged' }
            )}
          >
            <EuiBadge
              data-test-subj="alertAcknowledgedBadge"
              iconType="check"
              color="hollow"
              tabIndex={0}
              css={css`
                padding-inline: ${euiTheme.size.xs};
              `}
            />
          </EuiToolTip>
        )}
      </EuiFlexGroup>
    );
  }

  return <DefaultCell {...props} />;
});
