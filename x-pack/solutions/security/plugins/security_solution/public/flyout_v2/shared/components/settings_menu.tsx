/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useState } from 'react';
import {
  EuiButtonGroup,
  EuiButtonIcon,
  EuiPopover,
  EuiSpacer,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { SystemFlyoutType } from '@kbn/core-overlays-browser';
import { useFlyoutPushVsOverlay } from '../hooks/use_flyout_push_vs_overlay';
import {
  FLYOUT_HEADER_FLYOUT_TYPE_BUTTON_GROUP_TEST_ID,
  FLYOUT_HEADER_FLYOUT_TYPE_OVERLAY_OPTION_TEST_ID,
  FLYOUT_HEADER_FLYOUT_TYPE_PUSH_OPTION_TEST_ID,
  FLYOUT_HEADER_FLYOUT_TYPE_TITLE_TEST_ID,
  FLYOUT_HEADER_SETTINGS_BUTTON_TEST_ID,
  FLYOUT_HEADER_SETTINGS_MENU_TEST_ID,
} from './test_ids';

const SETTINGS_MENU_BUTTON_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.flyoutV2.settingsMenu.buttonAriaLabel',
  { defaultMessage: 'Open flyout settings menu' }
);
const SETTINGS_MENU_BUTTON_TOOLTIP = i18n.translate(
  'xpack.securitySolution.flyoutV2.settingsMenu.buttonTooltip',
  { defaultMessage: 'Flyout settings' }
);
const SETTINGS_MENU_TITLE = i18n.translate('xpack.securitySolution.flyoutV2.settingsMenu.title', {
  defaultMessage: 'Flyout settings',
});
const FLYOUT_TYPE_TITLE = i18n.translate(
  'xpack.securitySolution.flyoutV2.settingsMenu.flyoutTypeTitle',
  { defaultMessage: 'Flyout type' }
);
const FLYOUT_TYPE_OVERLAY_LABEL = i18n.translate(
  'xpack.securitySolution.flyoutV2.settingsMenu.overlayLabel',
  { defaultMessage: 'Overlay' }
);
const FLYOUT_TYPE_PUSH_LABEL = i18n.translate(
  'xpack.securitySolution.flyoutV2.settingsMenu.pushLabel',
  { defaultMessage: 'Push' }
);
const FLYOUT_TYPE_OVERLAY_TOOLTIP = i18n.translate(
  'xpack.securitySolution.flyoutV2.settingsMenu.overlayTooltip',
  { defaultMessage: 'Displays the flyout over the page' }
);
const FLYOUT_TYPE_PUSH_TOOLTIP = i18n.translate(
  'xpack.securitySolution.flyoutV2.settingsMenu.pushTooltip',
  { defaultMessage: 'Displays the flyout next to the page' }
);

const OPTIONS = [
  {
    id: 'overlay',
    label: FLYOUT_TYPE_OVERLAY_LABEL,
    toolTipContent: FLYOUT_TYPE_OVERLAY_TOOLTIP,
    'data-test-subj': FLYOUT_HEADER_FLYOUT_TYPE_OVERLAY_OPTION_TEST_ID,
  },
  {
    id: 'push',
    label: FLYOUT_TYPE_PUSH_LABEL,
    toolTipContent: FLYOUT_TYPE_PUSH_TOOLTIP,
    'data-test-subj': FLYOUT_HEADER_FLYOUT_TYPE_PUSH_OPTION_TEST_ID,
  },
];

/**
 * Gear button + popover that lets the user switch the flyout between `overlay`
 * and `push` mode. Rendered in the flyout header (Security Solution only).
 * The choice applies to the open flyout immediately and is remembered for the
 * next open.
 */
export const SettingsMenu = memo(() => {
  const { type, setType } = useFlyoutPushVsOverlay();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const togglePopover = useCallback(() => setIsPopoverOpen((open) => !open), []);
  const closePopover = useCallback(() => setIsPopoverOpen(false), []);

  const onFlyoutTypeChange = useCallback(
    (id: string) => {
      setType(id as SystemFlyoutType);
    },
    [setType]
  );

  const button = (
    <EuiToolTip content={SETTINGS_MENU_BUTTON_TOOLTIP}>
      <EuiButtonIcon
        aria-label={SETTINGS_MENU_BUTTON_ARIA_LABEL}
        iconType="gear"
        color="text"
        onClick={togglePopover}
        data-test-subj={FLYOUT_HEADER_SETTINGS_BUTTON_TEST_ID}
      />
    </EuiToolTip>
  );

  return (
    <EuiPopover
      aria-label={SETTINGS_MENU_TITLE}
      button={button}
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      panelPaddingSize="s"
      anchorPosition="downLeft"
      data-test-subj={FLYOUT_HEADER_SETTINGS_MENU_TEST_ID}
    >
      <EuiTitle size="xxs" data-test-subj={FLYOUT_HEADER_FLYOUT_TYPE_TITLE_TEST_ID}>
        <h3>{FLYOUT_TYPE_TITLE}</h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiButtonGroup
        legend={FLYOUT_TYPE_TITLE}
        options={OPTIONS}
        idSelected={type}
        onChange={onFlyoutTypeChange}
        data-test-subj={FLYOUT_HEADER_FLYOUT_TYPE_BUTTON_GROUP_TEST_ID}
      />
    </EuiPopover>
  );
});

SettingsMenu.displayName = 'SettingsMenu';
