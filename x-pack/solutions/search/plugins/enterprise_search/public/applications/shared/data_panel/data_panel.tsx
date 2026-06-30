/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import classNames from 'classnames';

import type { EuiIconProps, EuiTitleProps } from '@elastic/eui';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiSplitPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { _EuiPanelDivlike } from '@elastic/eui/src/components/panel/panel';

import { LoadingOverlay } from '../loading';

import * as Styles from './styles';

type Props = Omit<_EuiPanelDivlike, 'title'> & {
  title: React.ReactElement; // e.g., h2 tag
  titleSize?: EuiTitleProps['size'];
  subtitle?: React.ReactNode;
  iconType?: EuiIconProps['type'];
  action?: React.ReactNode;
  footerDocLink?: React.ReactNode;
  filled?: boolean;
  isLoading?: boolean;
  className?: string;
};

export const DataPanel: React.FC<Props> = ({
  title,
  titleSize = 'xs',
  subtitle,
  iconType,
  action,
  filled,
  isLoading,
  footerDocLink,
  className,
  children,
  ...props // e.g., data-test-subj
}) => {
  const classes = classNames(className, {
    'dataPanel--filled': filled,
  });

  return (
    <EuiSplitPanel.Outer
      color={filled ? 'subdued' : 'plain'}
      className={classes}
      css={Styles.dataPanel}
      hasShadow={false}
      hasBorder={!filled}
      aria-busy={isLoading}
      {...props}
    >
      <EuiSplitPanel.Inner>
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow>
            <EuiFlexGroup
              className="eui-textNoWrap"
              gutterSize="s"
              alignItems="center"
              responsive={false}
            >
              {iconType && (
                <EuiFlexItem grow={false}>
                  <EuiIcon type={iconType} aria-hidden />
                </EuiFlexItem>
              )}
              <EuiFlexItem>
                <EuiTitle size={titleSize}>{title}</EuiTitle>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          {action && <EuiFlexItem grow={false}>{action}</EuiFlexItem>}
        </EuiFlexGroup>
        {subtitle && (
          <>
            <EuiSpacer size="xs" />
            <EuiText size="s" color="subdued">
              <p>{subtitle}</p>
            </EuiText>
          </>
        )}
        {children && (
          <>
            <EuiSpacer size={filled || subtitle ? 'l' : 's'} />
            {children}
          </>
        )}
        {isLoading && <LoadingOverlay />}
      </EuiSplitPanel.Inner>
      {!!footerDocLink && (
        <EuiSplitPanel.Inner color="subdued">{footerDocLink}</EuiSplitPanel.Inner>
      )}
    </EuiSplitPanel.Outer>
  );
};
