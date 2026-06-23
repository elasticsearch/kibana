/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { memo, useMemo } from 'react';
import type { EuiButtonEmptyProps } from '@elastic/eui';
import {
  EuiFlexGroup,
  EuiFlexItem,
  useEuiTheme,
  EuiToolTip,
  EuiTitle,
  EuiIcon,
  EuiTextColor,
} from '@elastic/eui';
import { css } from '@emotion/react';

export interface FlyoutTitleProps {
  /**
   * Title text
   */
  title: string;
  /**
   * Optional icon type. If null, no icon is displayed
   */
  iconType?: EuiButtonEmptyProps['iconType'];
  /**
   * Optional icon color
   */
  iconColor?: EuiButtonEmptyProps['color'];
  /**
   * Optional boolean to indicate if title is a link. If true, a popout icon is appended
   * and the title text is changed to link color
   */
  isLink?: boolean;
  /**
   * Optional data test subject string
   */
  'data-test-subj'?: string;
}

/**
 * Title component with optional icon to indicate the type of document, can be used for text or a link
 */
export const FlyoutTitle: FC<FlyoutTitleProps> = memo(
  ({
    title,
    iconType,
    iconColor,
    isLink = false,
    'data-test-subj': dataTestSubj = 'flyoutTitle',
  }) => {
    const { euiTheme } = useEuiTheme();

    const titleIcon = useMemo(() => {
      return iconType ? (
        <EuiIcon
          aria-hidden={true}
          color={iconColor}
          type={iconType}
          size="m"
          className="eui-alignBaseline"
          data-test-subj={`${dataTestSubj}Icon`}
          css={css`
            margin-right: ${euiTheme.size.xs};
          `}
        />
      ) : null;
    }, [iconType, iconColor, dataTestSubj, euiTheme.size.xs]);

    const titleComponent = useMemo(() => {
      return (
        <EuiTitle size="s" data-test-subj={`${dataTestSubj}Text`}>
          <EuiTextColor color={isLink ? euiTheme.colors.textPrimary : undefined}>
            <span>{title}</span>
          </EuiTextColor>
        </EuiTitle>
      );
    }, [dataTestSubj, isLink, title, euiTheme.colors.textPrimary]);

    const linkIcon = useMemo(() => {
      return (
        <EuiIcon
          type="external"
          size="m"
          aria-hidden={true}
          css={css`
            margin-bottom: ${euiTheme.size.xs};
          `}
          data-test-subj={`${dataTestSubj}LinkIcon`}
        />
      );
    }, [dataTestSubj, euiTheme.size.xs]);

    return (
      <EuiToolTip content={title}>
        <EuiFlexGroup alignItems="flexEnd" gutterSize="xs" responsive={false}>
          <EuiFlexItem>
            <div
              css={css`
                word-break: break-word;
                display: -webkit-box;
                -webkit-line-clamp: 3;
                -webkit-box-orient: vertical;
                overflow: hidden;
                text-overflow: ellipsis;
              `}
            >
              {titleIcon}
              {titleComponent}
            </div>
          </EuiFlexItem>
          {isLink && <EuiFlexItem grow={false}>{linkIcon}</EuiFlexItem>}
        </EuiFlexGroup>
      </EuiToolTip>
    );
  }
);

FlyoutTitle.displayName = 'FlyoutTitle';
