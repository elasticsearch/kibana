/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AppHeaderMenu } from '@kbn/app-header';
import { i18n } from '@kbn/i18n';
import { paths } from '@kbn/slo-shared-plugin/common/locators/paths';
import React, { useCallback, useMemo, useState } from 'react';
import { SloTemplatesFlyout } from '../../../../components/slo/slo_templates/slo_templates_flyout';
import { useCompositeSloEnabled } from '../../../../hooks/use_composite_slo_enabled';
import { useKibana } from '../../../../hooks/use_kibana';
import { usePermissions } from '../../../../hooks/use_permissions';

export function useCreateSloPrimaryAction(): {
  primaryActionItem: NonNullable<AppHeaderMenu['primaryActionItem']>;
  templatesFlyout: React.ReactNode;
} {
  const {
    application: { navigateToUrl },
    http: { basePath },
  } = useKibana().services;

  const { data: permissions } = usePermissions();
  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false);

  const isDisabled = !permissions?.hasAllWriteRequested;
  const isCompositeSloEnabled = useCompositeSloEnabled();

  const handleClickCreateSlo = useCallback(() => {
    navigateToUrl(basePath.prepend(paths.sloCreate));
  }, [basePath, navigateToUrl]);

  const handleClickCreateFromTemplate = useCallback(() => {
    setIsFlyoutOpen(true);
  }, []);

  const handleClickCreateCompositeSlo = useCallback(() => {
    navigateToUrl(basePath.prepend(paths.sloCompositeCreate));
  }, [basePath, navigateToUrl]);

  const primaryActionItem = useMemo<NonNullable<AppHeaderMenu['primaryActionItem']>>(
    () => ({
      id: 'createSlo',
      label: i18n.translate('xpack.slo.sloList.pageHeader.create', {
        defaultMessage: 'Create SLO',
      }),
      iconType: 'plusCircle',
      testId: 'slosPageCreateSloDropdown',
      disableButton: isDisabled,
      items: [
        {
          id: 'create',
          label: i18n.translate('xpack.slo.sloList.pageHeader.create', {
            defaultMessage: 'Create SLO',
          }),
          iconType: 'plus',
          testId: 'slosPageCreateNewSloButton',
          run: handleClickCreateSlo,
        },
        {
          id: 'createFromTemplate',
          label: i18n.translate('xpack.slo.sloList.pageHeader.createFromTemplate', {
            defaultMessage: 'Create from template',
          }),
          iconType: 'pagesSelect',
          testId: 'slosPageCreateFromTemplateButton',
          run: handleClickCreateFromTemplate,
        },
        ...(isCompositeSloEnabled
          ? [
              {
                id: 'createComposite',
                label: i18n.translate('xpack.slo.sloList.pageHeader.createComposite', {
                  defaultMessage: 'Create composite SLO',
                }),
                iconType: 'aggregate' as const,
                testId: 'slosPageCreateCompositeSloButton',
                run: handleClickCreateCompositeSlo,
              },
            ]
          : []),
      ],
    }),
    [
      handleClickCreateCompositeSlo,
      handleClickCreateFromTemplate,
      handleClickCreateSlo,
      isCompositeSloEnabled,
      isDisabled,
    ]
  );

  return {
    primaryActionItem,
    templatesFlyout: isFlyoutOpen ? (
      <SloTemplatesFlyout onClose={() => setIsFlyoutOpen(false)} />
    ) : null,
  };
}
