/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { ReactNode } from 'react';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiPopoverTitle,
  EuiToolTip,
} from '@elastic/eui';
import { css } from '@emotion/react';

import { i18n } from '@kbn/i18n';
import { LinksList } from '../links_list';
import { Footer } from '../footer';
import type { ActionConfig, LinksListItem } from '../types';

const BACK_BUTTON_ARIA_LABEL = i18n.translate(
  'contextSwitcherComponents.contextSubmenuView.backButtonAriaLabel',
  {
    defaultMessage: 'Back',
  }
);
export interface ContextSubmenuViewProps {
  readonly title: ReactNode;
  readonly onBack: () => void;
  readonly items: ReadonlyArray<LinksListItem>;
  readonly footerAction?: ActionConfig;
}

/**
 * The submenu view for the environment context that contains the title, the links list and the footer action.
 */

export const ContextSubmenuView = ({
  title,
  onBack,
  items,
  footerAction,
}: ContextSubmenuViewProps) => {
  return (
    <>
      <EuiPopoverTitle
        // Remove separator between title and list
        css={css`
          border-bottom: 0;
          padding-bottom: 0;
        `}
      >
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiToolTip content={BACK_BUTTON_ARIA_LABEL} disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="arrowLeft"
                aria-label={BACK_BUTTON_ARIA_LABEL}
                color="text"
                display="empty"
                size="s"
                onClick={onBack}
                data-test-subj="contextSwitcherSubmenuBackButton"
              />
            </EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>{title}</EuiFlexItem>
        </EuiFlexGroup>
      </EuiPopoverTitle>

      <LinksList items={items} />

      {footerAction && (
        <>
          <EuiHorizontalRule margin="xs" />
          <Footer action={footerAction} />
        </>
      )}
    </>
  );
};
