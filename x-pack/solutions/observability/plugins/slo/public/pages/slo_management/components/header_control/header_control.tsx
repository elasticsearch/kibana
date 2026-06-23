/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiButton, EuiContextMenuItem, EuiContextMenuPanel, EuiPopover } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React, { useState } from 'react';
import { useActionModal } from '../../../../context/action_modal';
import { usePermissions } from '../../../../hooks/use_permissions';

export function HeaderControl() {
  const { triggerAction } = useActionModal();
  const { data: permissions } = usePermissions();

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const handleActionsClick = () => setIsPopoverOpen((value) => !value);
  const closePopover = () => setIsPopoverOpen(false);

  const handlePurgeInstances = () => {
    triggerAction({
      type: 'purge_instances',
      onConfirm: () => {},
    });
    setIsPopoverOpen(false);
  };

  const handleHealthScan = () => {
    triggerAction({
      type: 'health_scan',
    });
    setIsPopoverOpen(false);
  };

  return (
    <EuiPopover
      aria-label={i18n.translate('xpack.slo.sloManagementHeaderControl.popoverAriaLabel', {
        defaultMessage: 'SLO management actions',
      })}
      data-test-subj="headerControlPopover"
      panelPaddingSize="none"
      button={
        <EuiButton
          data-test-subj="headerControlActionsButton"
          fill
          iconSide="right"
          iconType="chevronSingleDown"
          iconSize="s"
          onClick={handleActionsClick}
        >
          {i18n.translate('xpack.slo.sloManagementPage.headerControl.actions', {
            defaultMessage: 'Actions',
          })}
        </EuiButton>
      }
      isOpen={isPopoverOpen}
      closePopover={closePopover}
    >
      <EuiContextMenuPanel
        items={[
          <EuiContextMenuItem
            key="healthScan"
            icon="inspect"
            onClick={handleHealthScan}
            data-test-subj="healthScanItem"
          >
            {i18n.translate('xpack.slo.sloManagement.headerControl.healthScanItem', {
              defaultMessage: 'Health scan',
            })}
          </EuiContextMenuItem>,
          <EuiContextMenuItem
            key="purgeStaleInstances"
            icon="broom"
            disabled={!permissions?.hasAllWriteRequested}
            onClick={handlePurgeInstances}
            data-test-subj="purgeStaleInstancesItem"
          >
            {i18n.translate('xpack.slo.sloManagement.headerControl.purgeStaleInstancesItem', {
              defaultMessage: 'Purge stale instances',
            })}
          </EuiContextMenuItem>,
        ]}
      />
    </EuiPopover>
  );
}
