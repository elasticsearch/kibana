/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AppHeaderMenu } from '@kbn/app-header';
import { i18n } from '@kbn/i18n';
import { useMemo } from 'react';
import { useActionModal } from '../../../../context/action_modal';
import { usePermissions } from '../../../../hooks/use_permissions';

export function useSloManagementActionsPrimary(): NonNullable<AppHeaderMenu['primaryActionItem']> {
  const { triggerAction } = useActionModal();
  const { data: permissions } = usePermissions();

  return useMemo(
    () => ({
      id: 'actions',
      label: i18n.translate('xpack.slo.sloManagementPage.headerControl.actions', {
        defaultMessage: 'Actions',
      }),
      iconType: 'plusCircle',
      testId: 'headerControlActionsButton',
      items: [
        {
          id: 'healthScan',
          label: i18n.translate('xpack.slo.sloManagement.headerControl.healthScanItem', {
            defaultMessage: 'Health scan',
          }),
          iconType: 'inspect',
          testId: 'healthScanItem',
          run: () => {
            triggerAction({
              type: 'health_scan',
            });
          },
        },
        {
          id: 'purgeStaleInstances',
          label: i18n.translate('xpack.slo.sloManagement.headerControl.purgeStaleInstancesItem', {
            defaultMessage: 'Purge stale instances',
          }),
          iconType: 'broom',
          testId: 'purgeStaleInstancesItem',
          disableButton: !permissions?.hasAllWriteRequested,
          run: () => {
            triggerAction({
              type: 'purge_instances',
              onConfirm: () => {},
            });
          },
        },
      ],
    }),
    [permissions?.hasAllWriteRequested, triggerAction]
  );
}
