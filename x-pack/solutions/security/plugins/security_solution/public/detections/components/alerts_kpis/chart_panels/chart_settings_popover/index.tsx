/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiContextMenuPanelDescriptor } from '@elastic/eui';
import { EuiButtonIcon, EuiContextMenu, EuiPopover, EuiToolTip } from '@elastic/eui';
import React, { useCallback, useMemo } from 'react';

import { BUTTON_CLASS } from '../../../../../common/components/inspect';
import * as i18n from './translations';

interface Props {
  initialPanelId: string;
  isPopoverOpen: boolean;
  panels: EuiContextMenuPanelDescriptor[];
  setIsPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const ChartSettingsPopoverComponent: React.FC<Props> = ({
  initialPanelId,
  isPopoverOpen,
  panels,
  setIsPopoverOpen,
}: Props) => {
  const onButtonClick = useCallback(
    () => setIsPopoverOpen((isOpen) => !isOpen),
    [setIsPopoverOpen]
  );

  const closePopover = useCallback(() => setIsPopoverOpen(false), [setIsPopoverOpen]);

  const button = useMemo(
    () => (
      <EuiToolTip content={i18n.CHART_SETTINGS_POPOVER_ARIA_LABEL} disableScreenReaderOutput>
        <EuiButtonIcon
          aria-label={i18n.CHART_SETTINGS_POPOVER_ARIA_LABEL}
          color="text"
          iconType="boxesVertical"
          onClick={onButtonClick}
          size="xs"
          data-test-subj="chart-settings-popover-button"
        />
      </EuiToolTip>
    ),
    [onButtonClick]
  );

  return (
    <EuiPopover
      aria-label={i18n.CHART_SETTINGS_POPOVER_ARIA_LABEL}
      anchorPosition="downCenter"
      button={button}
      className={BUTTON_CLASS}
      closePopover={closePopover}
      isOpen={isPopoverOpen}
      panelPaddingSize="none"
    >
      <EuiContextMenu initialPanelId={initialPanelId} panels={panels} />
    </EuiPopover>
  );
};

ChartSettingsPopoverComponent.displayName = 'ChartSettingsPopoverComponent';

export const ChartSettingsPopover = React.memo(ChartSettingsPopoverComponent);
