/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiButton, EuiContextMenuItem, EuiContextMenuPanel, EuiPopover } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { paths } from '@kbn/slo-shared-plugin/common/locators/paths';
import React, { useCallback, useMemo, useState } from 'react';
import { useCompositeSloEnabled } from '../../../../hooks/use_composite_slo_enabled';
import { useKibana } from '../../../../hooks/use_kibana';
import { usePermissions } from '../../../../hooks/use_permissions';
import { SloTemplatesFlyout } from '../../../../components/slo/slo_templates/slo_templates_flyout';

export function CreateSloBtn() {
  const {
    application: { navigateToUrl },
    http: { basePath },
  } = useKibana().services;

  const { data: permissions } = usePermissions();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false);

  const isDisabled = !permissions?.hasAllWriteRequested;
  const isCompositeSloEnabled = useCompositeSloEnabled();

  const handleClickCreateSlo = useCallback(() => {
    setIsPopoverOpen(false);
    navigateToUrl(basePath.prepend(paths.sloCreate));
  }, [basePath, navigateToUrl]);

  const handleClickCreateFromTemplate = () => {
    setIsPopoverOpen(false);
    setIsFlyoutOpen(true);
  };

  const handleClickCreateCompositeSlo = useCallback(() => {
    setIsPopoverOpen(false);
    navigateToUrl(basePath.prepend(paths.sloCompositeCreate));
  }, [basePath, navigateToUrl]);

  const menuItems = useMemo(() => {
    const items = [
      <EuiContextMenuItem
        key="create"
        icon="plus"
        onClick={handleClickCreateSlo}
        data-test-subj="slosPageCreateNewSloButton"
      >
        {i18n.translate('xpack.slo.sloList.pageHeader.create', { defaultMessage: 'Create SLO' })}
      </EuiContextMenuItem>,
      <EuiContextMenuItem
        key="createFromTemplate"
        icon="document"
        onClick={handleClickCreateFromTemplate}
        data-test-subj="slosPageCreateFromTemplateButton"
      >
        {i18n.translate('xpack.slo.sloList.pageHeader.createFromTemplate', {
          defaultMessage: 'Create from template',
        })}
      </EuiContextMenuItem>,
    ];

    if (isCompositeSloEnabled) {
      items.push(
        <EuiContextMenuItem
          key="createComposite"
          icon="aggregate"
          onClick={handleClickCreateCompositeSlo}
          data-test-subj="slosPageCreateCompositeSloButton"
        >
          {i18n.translate('xpack.slo.sloList.pageHeader.createComposite', {
            defaultMessage: 'Create composite SLO',
          })}
        </EuiContextMenuItem>
      );
    }

    return items;
  }, [handleClickCreateCompositeSlo, handleClickCreateSlo, isCompositeSloEnabled]);

  return (
    <>
      <EuiPopover
        aria-label={i18n.translate('xpack.slo.createSloBtn.popoverAriaLabel', {
          defaultMessage: 'Create SLO options',
        })}
        button={
          <EuiButton
            color="primary"
            data-test-subj="slosPageCreateSloDropdown"
            disabled={isDisabled}
            fill
            iconType="arrowDown"
            iconSide="right"
            onClick={() => setIsPopoverOpen(!isPopoverOpen)}
          >
            {i18n.translate('xpack.slo.sloList.pageHeader.create', {
              defaultMessage: 'Create SLO',
            })}
          </EuiButton>
        }
        isOpen={isPopoverOpen}
        closePopover={() => setIsPopoverOpen(false)}
        panelPaddingSize="none"
        anchorPosition="downRight"
      >
        <EuiContextMenuPanel items={menuItems} />
      </EuiPopover>
      {isFlyoutOpen && <SloTemplatesFlyout onClose={() => setIsFlyoutOpen(false)} />}
    </>
  );
}
