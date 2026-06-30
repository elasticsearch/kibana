/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState } from 'react';
import { EuiFlexGroup, EuiFlexItem, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { AppMenuActionButton } from './app_menu_action_button';
import type { AppMenuPrimaryActionItem } from '../types';
import { APP_MENU_TEST_SUBJECTS } from '../test_subjects';

interface AppMenuPopoverActionButtonsProps {
  primaryActionItem?: AppMenuPrimaryActionItem;
  onCloseOverflowButton?: () => void;
}

export const AppMenuPopoverActionButtons = ({
  primaryActionItem,
  onCloseOverflowButton,
}: AppMenuPopoverActionButtonsProps) => {
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const { euiTheme } = useEuiTheme();

  if (!primaryActionItem) {
    return null;
  }

  const handlePopoverToggle = (id: string) => {
    setOpenPopoverId(openPopoverId === id ? null : id);
  };

  const handleOnPopoverClose = () => {
    setOpenPopoverId(null);
  };

  const commonProps = {
    isPopoverOpen: openPopoverId === primaryActionItem.id,
    onPopoverToggle: () => handlePopoverToggle(primaryActionItem.id),
    onPopoverClose: handleOnPopoverClose,
    onCloseOverflowButton,
    fullWidth: true as const,
  };

  const containerCss = css`
    margin-top: ${euiTheme.size.m};
    margin-bottom: ${euiTheme.size.m};
  `;

  const hasRun = 'run' in primaryActionItem && typeof primaryActionItem.run === 'function';

  return (
    <EuiFlexGroup
      direction="column"
      justifyContent="center"
      gutterSize="m"
      alignItems="stretch"
      css={containerCss}
      data-test-subj={APP_MENU_TEST_SUBJECTS.popoverActionButtonsContainer}
    >
      <EuiFlexItem>
        {hasRun ? (
          <AppMenuActionButton
            {...primaryActionItem}
            {...commonProps}
            run={(params) => {
              primaryActionItem.run?.(params);
              onCloseOverflowButton?.();
            }}
          />
        ) : (
          <AppMenuActionButton {...primaryActionItem} {...commonProps} />
        )}
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
