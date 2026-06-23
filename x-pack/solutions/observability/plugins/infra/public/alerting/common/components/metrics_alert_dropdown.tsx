/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import React, { useState, useCallback, useMemo, useRef } from 'react';
import { EuiPopover, EuiHeaderLink, EuiContextMenu } from '@elastic/eui';
import type {
  EuiContextMenuPanelDescriptor,
  EuiContextMenuPanelItemDescriptor,
  EuiFlyoutResizableProps,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { createFocusTrapProps } from '../../../utils/create_focus_trap_props';
import { usePluginConfig } from '../../../containers/plugin_config_context';
import { PrefilledInventoryAlertFlyout } from '../../inventory/components/alert_flyout';
import { PrefilledMetricThresholdAlertFlyout } from '../../metric_threshold/components/alert_flyout';
import { AlertFlyout as CustomThresholdAlertFlyout } from '../../custom_threshold';
import type { InfraClientStartDeps } from '../../../types';

type VisibleFlyoutType = 'inventory' | 'metricThreshold' | 'customThreshold';

interface ContextMenuEntries {
  items: EuiContextMenuPanelItemDescriptor[];
  panels: EuiContextMenuPanelDescriptor[];
}

function useInfrastructureMenu(
  onCreateRuleClick: (flyoutType: VisibleFlyoutType) => void
): ContextMenuEntries {
  const { featureFlags } = usePluginConfig();

  return useMemo(() => {
    if (!featureFlags.inventoryThresholdAlertRuleEnabled) {
      return { items: [], panels: [] };
    }

    return {
      items: [
        {
          'data-test-subj': 'inventory-alerts-menu-option',
          name: i18n.translate('xpack.infra.alerting.infrastructureDropdownMenu', {
            defaultMessage: 'Infrastructure',
          }),
          panel: 1,
        },
      ],
      panels: [
        {
          id: 1,
          title: i18n.translate('xpack.infra.alerting.infrastructureDropdownTitle', {
            defaultMessage: 'Infrastructure rules',
          }),
          items: [
            {
              'data-test-subj': 'inventory-alerts-create-rule',
              name: i18n.translate('xpack.infra.alerting.createInventoryRuleButton', {
                defaultMessage: 'Create inventory rule',
              }),
              onClick: () => onCreateRuleClick('inventory'),
            },
          ],
        },
      ],
    };
  }, [featureFlags.inventoryThresholdAlertRuleEnabled, onCreateRuleClick]);
}

function useMetricsMenu(
  onCreateRuleClick: (flyoutType: VisibleFlyoutType) => void
): ContextMenuEntries {
  const { featureFlags } = usePluginConfig();

  return useMemo(() => {
    if (!featureFlags.metricThresholdAlertRuleEnabled) {
      return { items: [], panels: [] };
    }

    return {
      items: [
        {
          'data-test-subj': 'metrics-threshold-alerts-menu-option',
          name: i18n.translate('xpack.infra.alerting.metricsDropdownMenu', {
            defaultMessage: 'Metrics',
          }),
          panel: 2,
        },
      ],
      panels: [
        {
          id: 2,
          title: i18n.translate('xpack.infra.alerting.metricsDropdownTitle', {
            defaultMessage: 'Metrics rules',
          }),
          items: [
            {
              'data-test-subj': 'metrics-threshold-alerts-create-rule',
              name: i18n.translate('xpack.infra.alerting.createThresholdRuleButton', {
                defaultMessage: 'Create threshold rule',
              }),
              onClick: () => onCreateRuleClick('metricThreshold'),
            },
          ],
        },
      ],
    };
  }, [featureFlags.metricThresholdAlertRuleEnabled, onCreateRuleClick]);
}

function useCustomThresholdMenu(
  onCreateRuleClick: (flyoutType: VisibleFlyoutType) => void
): ContextMenuEntries {
  const { featureFlags } = usePluginConfig();

  return useMemo(() => {
    if (!featureFlags.customThresholdAlertsEnabled) {
      return { items: [], panels: [] };
    }

    return {
      items: [
        {
          'data-test-subj': 'custom-threshold-alerts-menu-option',
          name: i18n.translate('xpack.infra.alerting.customThresholdDropdownMenu', {
            defaultMessage: 'Create custom threshold rule',
          }),
          onClick: () => onCreateRuleClick('customThreshold'),
        },
      ],
      panels: [],
    };
  }, [featureFlags.customThresholdAlertsEnabled, onCreateRuleClick]);
}

export const MetricsAlertDropdown = () => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [visibleFlyoutType, setVisibleFlyoutType] = useState<VisibleFlyoutType | null>(null);
  const alertsButtonRef = useRef<HTMLButtonElement>(null);
  const uiCapabilities = useKibana().services.application?.capabilities;
  const {
    services: { observability },
  } = useKibana<InfraClientStartDeps>();
  const canCreateAlerts = useMemo(
    () => Boolean(uiCapabilities?.infrastructure?.save),
    [uiCapabilities]
  );
  const closeFlyout = useCallback(() => setVisibleFlyoutType(null), [setVisibleFlyoutType]);

  const closePopover = useCallback(() => {
    setPopoverOpen(false);
  }, [setPopoverOpen]);

  const togglePopover = useCallback(() => {
    setPopoverOpen(!popoverOpen);
  }, [setPopoverOpen, popoverOpen]);

  const onCreateRuleClick = useCallback(
    (flyoutType: VisibleFlyoutType) => {
      closePopover();
      setVisibleFlyoutType(flyoutType);
    },
    [closePopover]
  );

  const infrastructureMenu = useInfrastructureMenu(onCreateRuleClick);
  const metricsMenu = useMetricsMenu(onCreateRuleClick);
  const customThresholdMenu = useCustomThresholdMenu(onCreateRuleClick);

  const manageRulesLinkProps = observability.useRulesLink();
  const focusTrapProps = createFocusTrapProps(alertsButtonRef.current);

  const manageAlertsMenuItem = useMemo(
    () => ({
      name: i18n.translate('xpack.infra.alerting.manageRules', {
        defaultMessage: 'Manage rules',
      }),
      icon: 'tableOfContents',
      onClick: manageRulesLinkProps.onClick,
    }),
    [manageRulesLinkProps]
  );

  const panels: EuiContextMenuPanelDescriptor[] = useMemo(
    () => [
      {
        id: 0,
        title: i18n.translate('xpack.infra.alerting.alertDropdownTitle', {
          defaultMessage: 'Alerts and rules',
        }),
        items: canCreateAlerts
          ? [
              ...infrastructureMenu.items,
              ...metricsMenu.items,
              ...customThresholdMenu.items,
              manageAlertsMenuItem,
            ]
          : [manageAlertsMenuItem],
      },
      ...(canCreateAlerts
        ? [...infrastructureMenu.panels, ...metricsMenu.panels, ...customThresholdMenu.panels]
        : []),
    ],
    [canCreateAlerts, infrastructureMenu, metricsMenu, customThresholdMenu, manageAlertsMenuItem]
  );

  return (
    <>
      <EuiPopover
        panelPaddingSize="none"
        anchorPosition="downLeft"
        aria-label={i18n.translate('xpack.infra.alerting.alertDropdownAriaLabel', {
          defaultMessage: 'Alerts and rules',
        })}
        button={
          <EuiHeaderLink
            buttonRef={alertsButtonRef}
            color="primary"
            iconSide={'right'}
            iconType={'chevronSingleDown'}
            onClick={togglePopover}
            data-test-subj="infrastructure-alerts-and-rules"
          >
            <FormattedMessage id="xpack.infra.alerting.alertsButton" defaultMessage="Alerts" />
          </EuiHeaderLink>
        }
        isOpen={popoverOpen}
        closePopover={closePopover}
      >
        <EuiContextMenu initialPanelId={0} panels={panels} data-test-subj="metrics-alert-menu" />
      </EuiPopover>
      <AlertFlyout
        visibleFlyoutType={visibleFlyoutType}
        onClose={closeFlyout}
        focusTrapProps={focusTrapProps}
      />
    </>
  );
};

interface AlertFlyoutProps {
  visibleFlyoutType: VisibleFlyoutType | null;
  onClose(): void;
  focusTrapProps?: EuiFlyoutResizableProps['focusTrapProps'];
}

const AlertFlyout = ({ visibleFlyoutType, onClose, focusTrapProps }: AlertFlyoutProps) => {
  switch (visibleFlyoutType) {
    case 'inventory':
      return <PrefilledInventoryAlertFlyout onClose={onClose} focusTrapProps={focusTrapProps} />;
    case 'metricThreshold':
      return (
        <PrefilledMetricThresholdAlertFlyout onClose={onClose} focusTrapProps={focusTrapProps} />
      );
    case 'customThreshold':
      return <CustomThresholdAlertFlyout onClose={onClose} focusTrapProps={focusTrapProps} />;
    default:
      return null;
  }
};
