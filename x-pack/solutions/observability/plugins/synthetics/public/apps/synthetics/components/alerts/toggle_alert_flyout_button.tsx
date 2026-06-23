/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { EuiContextMenuPanelDescriptor } from '@elastic/eui';
import { EuiContextMenu, EuiHeaderLink, EuiPopover } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { RuleNameWithLoading } from './rule_name_with_loading';
import {
  SYNTHETICS_STATUS_RULE,
  SYNTHETICS_TLS_RULE,
} from '../../../../../common/constants/synthetics_alerts';
import { ManageRulesLink } from '../common/links/manage_rules_link';
import type { ClientPluginsStart } from '../../../../plugin';
import { STATUS_RULE_NAME, TLS_RULE_NAME, ToggleFlyoutTranslations } from './hooks/translations';
import { useSyntheticsRules } from './hooks/use_synthetics_rules';
import {
  selectAlertFlyoutVisibility,
  selectMonitorListState,
  setAlertFlyoutVisible,
} from '../../state';

export const ToggleAlertFlyoutButton = () => {
  const dispatch = useDispatch();

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const { application } = useKibana<ClientPluginsStart>().services;
  const hasUptimeWrite = application?.capabilities.uptime?.save ?? false;

  const { EditAlertFlyout, loading, NewRuleFlyout, defaultRules } = useSyntheticsRules(isOpen);
  const { loaded, data: monitors } = useSelector(selectMonitorListState);

  const hasMonitors = loaded && monitors.absoluteTotal && monitors.absoluteTotal > 0;
  const statusRuleExists = Boolean(defaultRules?.statusRule);
  const tlsRuleExists = Boolean(defaultRules?.tlsRule);

  const panels: EuiContextMenuPanelDescriptor[] = [
    {
      id: 0,
      items: [
        {
          name: STATUS_RULE_NAME,
          'data-test-subj': 'manageStatusRuleName',
          panel: 1,
        },
        {
          name: TLS_RULE_NAME,
          'data-test-subj': 'manageTlsRuleName',
          panel: 2,
        },
        {
          'aria-label': ToggleFlyoutTranslations.navigateToAlertingUIAriaLabel,
          'data-test-subj': 'xpack.synthetics.navigateToAlertingUi',
          name: <ManageRulesLink />,
          icon: 'tableOfContents',
        },
      ],
    },
    {
      id: 1,
      title: STATUS_RULE_NAME,
      items: [
        {
          name: CREATE_STATUS_RULE,
          'data-test-subj': 'createNewStatusRule',
          icon: 'plusCircle',
          onClick: () => {
            dispatch(setAlertFlyoutVisible({ id: SYNTHETICS_STATUS_RULE, isNewRuleFlyout: true }));
            setIsOpen(false);
          },
        },
        {
          'aria-label': ToggleFlyoutTranslations.toggleMonitorStatusAriaLabel,
          'data-test-subj': 'editDefaultStatusRule',
          name: <RuleNameWithLoading ruleName={EDIT_STATUS_RULE} isLoading={loading} />,
          onClick: () => {
            dispatch(setAlertFlyoutVisible({ id: SYNTHETICS_STATUS_RULE, isNewRuleFlyout: false }));
            setIsOpen(false);
          },
          toolTipContent: !hasUptimeWrite
            ? noWritePermissionsTooltipContent
            : !statusRuleExists
            ? statusRuleNotAvailableTooltipContent
            : null,
          disabled: !hasUptimeWrite || loading || !statusRuleExists,
          icon: 'bell',
        },
      ],
    },
    {
      id: 2,
      title: TLS_RULE_NAME,
      items: [
        {
          name: CREATE_TLS_RULE_NAME,
          'data-test-subj': 'createNewTLSRule',
          icon: 'plusCircle',
          onClick: () => {
            dispatch(setAlertFlyoutVisible({ id: SYNTHETICS_TLS_RULE, isNewRuleFlyout: true }));
            setIsOpen(false);
          },
        },
        {
          'aria-label': ToggleFlyoutTranslations.toggleMonitorStatusAriaLabel,
          'data-test-subj': 'editDefaultTlsRule',
          name: <RuleNameWithLoading ruleName={EDIT_TLS_RULE_NAME} isLoading={loading} />,
          onClick: () => {
            dispatch(setAlertFlyoutVisible({ id: SYNTHETICS_TLS_RULE, isNewRuleFlyout: false }));
            setIsOpen(false);
          },
          toolTipContent: !hasUptimeWrite
            ? noWritePermissionsTooltipContent
            : !tlsRuleExists
            ? tlsRuleNotAvailableTooltipContent
            : null,
          disabled: !hasUptimeWrite || loading || !tlsRuleExists,
          icon: 'bell',
        },
      ],
    },
  ];

  const alertFlyoutVisible = useSelector(selectAlertFlyoutVisibility);

  return (
    <>
      <EuiPopover
        button={
          <EuiHeaderLink
            color="primary"
            aria-label={ToggleFlyoutTranslations.toggleButtonAriaLabel}
            data-test-subj="syntheticsAlertsRulesButton"
            iconType="chevronSingleDown"
            iconSide="right"
            onClick={() => setIsOpen(!isOpen)}
            disabled={!hasMonitors}
          >
            {ToggleFlyoutTranslations.alertsAndRules}
          </EuiHeaderLink>
        }
        closePopover={() => setIsOpen(false)}
        isOpen={isOpen}
        ownFocus
        panelPaddingSize="none"
        aria-label={i18n.translate('xpack.synthetics.toggleAlertFlyoutButton.popoverAriaLabel', {
          defaultMessage: 'Alerts and rules menu',
        })}
      >
        <EuiContextMenu initialPanelId={0} panels={panels} />
      </EuiPopover>
      {alertFlyoutVisible && EditAlertFlyout}
      {alertFlyoutVisible && NewRuleFlyout}
    </>
  );
};

const noWritePermissionsTooltipContent = i18n.translate(
  'xpack.synthetics.alertDropdown.noPermissions',
  {
    defaultMessage: 'You do not have sufficient permissions to perform this action.',
  }
);

const statusRuleNotAvailableTooltipContent = i18n.translate(
  'xpack.synthetics.alerts.statusRuleNotAvailableTooltip',
  {
    defaultMessage: 'Status rule does not exist. Create the rule before editing.',
  }
);

const tlsRuleNotAvailableTooltipContent = i18n.translate(
  'xpack.synthetics.alerts.tlsRuleNotAvailableTooltip',
  {
    defaultMessage: 'TLS rule does not exist. Create the rule before editing.',
  }
);

export const EDIT_TLS_RULE_NAME = i18n.translate(
  'xpack.synthetics.toggleTlsAlertButton.label.default',
  {
    defaultMessage: 'Edit default TLS rule',
  }
);

export const EDIT_STATUS_RULE = i18n.translate(
  'xpack.synthetics.toggleStatusAlertButton.label.default',
  {
    defaultMessage: 'Edit default status rule',
  }
);

export const CREATE_TLS_RULE_NAME = i18n.translate(
  'xpack.synthetics.toggleTlsAlertButton.createRule',
  {
    defaultMessage: 'Create TLS rule',
  }
);

export const CREATE_STATUS_RULE = i18n.translate(
  'xpack.synthetics.toggleStatusAlertButton.createRule',
  {
    defaultMessage: 'Create status rule',
  }
);
