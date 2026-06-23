/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  EuiButton,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiPopover,
  EuiToolTip,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';

import type { InstalledPackageUIPackageListItem } from '../types';
import { useInstalledIntegrationsActions } from '../hooks/use_installed_integrations_actions';
import { ExperimentalFeaturesService } from '../../../../../services';
import { useLicense, useStartServices } from '../../../../../hooks';

import { useRollbackAvailablePackages } from '../hooks/use_rollback_available';

import { IntegrationKnowledgeFlyout } from './integration_knowledge_flyout';
import { EisCostTour } from './eis_cost_tour';

export const InstalledIntegrationsActionMenu: React.FunctionComponent<{
  selectedItems: InstalledPackageUIPackageListItem[];
}> = ({ selectedItems }) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [showIntegrationKnowledgeFlyout, setShowIntegrationKnowledgeFlyout] = useState(false);
  const { enablePackageRollback } = ExperimentalFeaturesService.get();
  const licenseService = useLicense();
  const { cloud, docLinks } = useStartServices();
  const button = (
    <EisCostTour
      ctaLink={docLinks.links.enterpriseSearch.elasticInferenceService}
      isCloudEnabled={cloud?.isCloudEnabled ?? false}
    >
      <EuiButton
        iconType="chevronSingleDown"
        iconSide="right"
        onClick={() => setIsPopoverOpen((s) => !s)}
      >
        <FormattedMessage
          id="xpack.fleet.epmInstalledIntegrations.actionButton"
          defaultMessage="Actions"
        />
      </EuiButton>
    </EisCostTour>
  );

  const {
    actions: {
      bulkUpgradeIntegrationsWithConfirmModal,
      bulkUninstallIntegrationsWithConfirmModal,
      bulkRollbackIntegrationsWithConfirmModal,
    },
  } = useInstalledIntegrationsActions();

  const openUpgradeModal = useCallback(() => {
    setIsPopoverOpen(false);
    return bulkUpgradeIntegrationsWithConfirmModal(selectedItems);
  }, [selectedItems, bulkUpgradeIntegrationsWithConfirmModal]);

  const openUninstallModal = useCallback(async () => {
    setIsPopoverOpen(false);
    return bulkUninstallIntegrationsWithConfirmModal(selectedItems);
  }, [selectedItems, bulkUninstallIntegrationsWithConfirmModal]);

  const openRollbackModal = useCallback(async () => {
    setIsPopoverOpen(false);
    return bulkRollbackIntegrationsWithConfirmModal(selectedItems);
  }, [selectedItems, bulkRollbackIntegrationsWithConfirmModal]);

  const openManageIntegrationKnowledgeFlyout = useCallback(() => {
    setIsPopoverOpen(false);
    setShowIntegrationKnowledgeFlyout(true);
  }, []);
  const isRollbackAvailablePackages: Record<string, boolean> =
    useRollbackAvailablePackages(selectedItems);

  const items = useMemo(() => {
    const hasUpgreadableIntegrations = selectedItems.some(
      (item) =>
        item.ui.installation_status === 'upgrade_available' ||
        item.ui.installation_status === 'upgrade_failed' ||
        item.ui.installation_status === 'install_failed'
    );

    const hasUninstallableIntegrations = selectedItems.some(
      (item) => (item.packagePoliciesInfo?.count ?? 0) > 0
    );

    const hasRollbackableIntegrations = selectedItems.some(
      (item) => isRollbackAvailablePackages[item.name]
    );

    const menuItems = [
      <EuiContextMenuItem
        key="integrationKnowledge"
        icon="gear"
        onClick={openManageIntegrationKnowledgeFlyout}
        disabled={!licenseService.isEnterprise()}
      >
        <FormattedMessage
          id="xpack.fleet.epmInstalledIntegrations.manageIntegrationKnowledgeButton"
          defaultMessage={'Manage integration knowledge'}
        />
      </EuiContextMenuItem>,
    ];

    if (selectedItems.length > 0) {
      menuItems.push(
        ...[
          <EuiContextMenuItem
            key="upgrade"
            icon="refresh"
            disabled={!hasUpgreadableIntegrations}
            onClick={openUpgradeModal}
          >
            <FormattedMessage
              id="xpack.fleet.epmInstalledIntegrations.bulkUpgradeButton"
              defaultMessage={'Upgrade {count, plural, one {# integration} other {# integrations}}'}
              values={{
                count: selectedItems.length,
              }}
            />
          </EuiContextMenuItem>,
          <EuiContextMenuItem
            key="uninstall"
            icon="trash"
            disabled={hasUninstallableIntegrations}
            onClick={openUninstallModal}
          >
            {hasUninstallableIntegrations ? (
              <EuiToolTip
                position="right"
                content={
                  <FormattedMessage
                    id="xpack.fleet.epmInstalledIntegrations.uninstallDisabledTooltip"
                    defaultMessage="Can't uninstall integrations that are attached to agent policies"
                  />
                }
              >
                <FormattedMessage
                  id="xpack.fleet.epmInstalledIntegrations.bulkUninstallButton"
                  defaultMessage={
                    'Uninstall {count, plural, one {# integration} other {# integrations}}'
                  }
                  values={{
                    count: selectedItems.length,
                  }}
                />
              </EuiToolTip>
            ) : (
              <FormattedMessage
                id="xpack.fleet.epmInstalledIntegrations.bulkUninstallButton"
                defaultMessage={
                  'Uninstall {count, plural, one {# integration} other {# integrations}}'
                }
                values={{
                  count: selectedItems.length,
                }}
              />
            )}
          </EuiContextMenuItem>,
          ...(enablePackageRollback
            ? [
                <EuiContextMenuItem
                  key="rollback"
                  icon="return"
                  disabled={!hasRollbackableIntegrations}
                  onClick={openRollbackModal}
                >
                  <FormattedMessage
                    id="xpack.fleet.epmInstalledIntegrations.bulkRollbackButton"
                    defaultMessage={
                      'Roll back {count, plural, one {# integration} other {# integrations}}'
                    }
                    values={{
                      count: selectedItems.length,
                    }}
                  />
                </EuiContextMenuItem>,
              ]
            : []),
        ]
      );
    }

    return menuItems;
  }, [
    selectedItems,
    openUninstallModal,
    openUpgradeModal,
    openRollbackModal,
    enablePackageRollback,
    licenseService,
    openManageIntegrationKnowledgeFlyout,
    isRollbackAvailablePackages,
  ]);

  return (
    <>
      <EuiPopover
        aria-label={i18n.translate(
          'xpack.fleet.epmInstalledIntegrations.bulkActionPopoverAriaLabel',
          { defaultMessage: 'Actions menu' }
        )}
        id="fleet.epmInstalledIntegrations.bulkActionPopover"
        button={button}
        isOpen={isPopoverOpen}
        closePopover={() => setIsPopoverOpen(false)}
        panelPaddingSize="none"
        anchorPosition="downLeft"
      >
        <EuiContextMenuPanel items={items} />
      </EuiPopover>
      {showIntegrationKnowledgeFlyout && (
        <IntegrationKnowledgeFlyout onClose={() => setShowIntegrationKnowledgeFlyout(false)} />
      )}
    </>
  );
};
