/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState } from 'react';
import { EuiButtonIcon, EuiContextMenu, EuiPopover, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { strings } from './strings';

export interface ProjectPickerSettingsProps {
  onResetToDefaults: () => void;
}

export const ProjectPickerSettings = ({ onResetToDefaults }: ProjectPickerSettingsProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const closePopover = () => setIsOpen(false);

  const panels = [
    {
      id: 0,
      items: [
        {
          name: i18n.translate('cpsUtils.projectPicker.revertToSpaceDefaultsLabel', {
            defaultMessage: 'Revert to space defaults',
          }),
          icon: 'clockCounter',
          'data-test-subj': 'projectPickerRevertToSpaceDefaultsMenuItem',
          onClick: () => {
            onResetToDefaults();
            closePopover();
          },
        },
        // TODO: Enable this when cloud CPS management link is ready: https://github.com/elastic/kibana/issues/257859
        // {
        //   isSeparator: true as const,
        // },
        // {
        //   name: strings.getManageCrossProjectSearchLabel(),
        //   icon: 'gear',
        //   'data-test-subj': 'projectPickerManageSettingsMenuItem',
        //   onClick: closePopover, // TODO: redirect to CPS management - UI not ready yet
        // },
      ],
    },
  ];

  return (
    <EuiPopover
      button={
        <EuiToolTip content={strings.getManageCrossProjectSearchLabel()} disableScreenReaderOutput>
          <EuiButtonIcon
            display="empty"
            iconType="ellipsis"
            aria-label={strings.getManageCrossProjectSearchLabel()}
            onClick={() => setIsOpen(!isOpen)}
            size="s"
            color="text"
          />
        </EuiToolTip>
      }
      isOpen={isOpen}
      closePopover={closePopover}
      repositionOnScroll
      anchorPosition="rightCenter"
      ownFocus
      panelPaddingSize="none"
      aria-label={i18n.translate('cpsUtils.projectPicker.settingsPopoverAriaLabel', {
        defaultMessage: 'Cross-project search settings',
      })}
    >
      <EuiContextMenu initialPanelId={0} panels={panels} />
    </EuiPopover>
  );
};
