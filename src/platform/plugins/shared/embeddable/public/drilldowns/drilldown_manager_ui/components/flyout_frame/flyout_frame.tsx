/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FC, PropsWithChildren } from 'react';
import React from 'react';
import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { txtClose, txtBack } from './i18n';

export interface FlyoutFrameProps {
  title?: React.ReactNode;
  footer?: React.ReactNode;
  banner?: React.ReactNode;
  onClose?: () => void;
  onBack?: () => void;
}

/**
 * @todo This component can be moved to `kibana_react`.
 */
export const FlyoutFrame: FC<PropsWithChildren<FlyoutFrameProps>> = ({
  title = '',
  footer,
  onClose,
  children,
  onBack,
  banner,
}) => {
  const headerFragment = (title || onBack) && (
    <EuiFlyoutHeader hasBorder>
      <EuiTitle size="s">
        <EuiFlexGroup alignItems="center" gutterSize={'s'} responsive={false}>
          {onBack && (
            <EuiFlexItem grow={false}>
              <div css={{ marginLeft: '-8px', marginTop: '-4px' }}>
                <EuiToolTip content={txtBack} disableScreenReaderOutput>
                  <EuiButtonIcon
                    color="text"
                    onClick={onBack}
                    iconType="chevronSingleLeft"
                    aria-label={txtBack}
                  />
                </EuiToolTip>
              </div>
            </EuiFlexItem>
          )}
          {title && (
            <EuiFlexItem grow={true}>
              <h1 id="drilldownFlyoutTitleAriaId">{title}</h1>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiTitle>
    </EuiFlyoutHeader>
  );

  const footerFragment = (onClose || footer) && (
    <EuiFlyoutFooter>
      <EuiFlexGroup responsive={false} justifyContent="spaceBetween">
        <EuiFlexItem grow={false}>
          {onClose && (
            <EuiButtonEmpty
              iconType="cross"
              onClick={onClose}
              flush="left"
              data-test-subj="flyoutCloseButton"
            >
              {txtClose}
            </EuiButtonEmpty>
          )}
        </EuiFlexItem>
        <EuiFlexItem grow={false} data-test-subj="flyoutFooter">
          {footer}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlyoutFooter>
  );

  return (
    <>
      {headerFragment}
      <EuiFlyoutBody banner={banner}>{children}</EuiFlyoutBody>
      {footerFragment}
    </>
  );
};
