/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { i18n } from '@kbn/i18n';
import { CANCEL_DISCOVERY_LABEL, FIND_SIGNIFICANT_EVENTS_LABEL } from '../shared/translations';
import { ContextMenuSplitButton } from '../shared/context_menu_split_button';
import type { MenuHelpers, ContextMenuSplitButtonProps } from '../shared/context_menu_split_button';

const SECONDARY_ARIA_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.findSignificantEventsSecondaryAriaLabel',
  { defaultMessage: 'Discovery options' }
);

interface FindSignificantEventsButtonProps {
  onRun: () => void;
  onCancel: () => void;
  isRunning: boolean;
  isCanceling?: boolean;
  isDisabled: boolean;
  size?: ContextMenuSplitButtonProps['size'];
  primaryDataTestSubj?: string;
}

export const FindSignificantEventsButton = ({
  onRun,
  onCancel,
  isRunning,
  isCanceling = false,
  isDisabled,
  size = 's',
  primaryDataTestSubj = 'significant_events_discovery_button',
}: FindSignificantEventsButtonProps) => {
  const buildPanels = useCallback(
    ({ closeMenu }: MenuHelpers) => [
      {
        items: [
          {
            name: CANCEL_DISCOVERY_LABEL,
            icon: 'cross' as const,
            disabled: !isRunning || isCanceling,
            onClick: () => {
              onCancel();
              closeMenu();
            },
            'data-test-subj': 'significant_events_cancel_discovery_button',
          },
        ],
      },
    ],
    [isRunning, isCanceling, onCancel]
  );

  return (
    <ContextMenuSplitButton
      primaryLabel={FIND_SIGNIFICANT_EVENTS_LABEL}
      primaryIconType="significantEvents"
      onPrimaryClick={onRun}
      isPrimaryDisabled={isDisabled || isRunning}
      isPrimaryLoading={isRunning}
      primaryDataTestSubj={primaryDataTestSubj}
      secondaryAriaLabel={SECONDARY_ARIA_LABEL}
      secondaryDataTestSubj="significant_events_discovery_options_trigger"
      buildPanels={buildPanels}
      color="text"
      size={size}
      hideModelSettings
      data-test-subj="significant_events_discovery_split_button"
    />
  );
};
