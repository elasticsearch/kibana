/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IconSize, IconType } from '@elastic/eui';
import { EuiIcon, EuiLink, useEuiTheme } from '@elastic/eui';
import type { LinkAnchorProps } from '@elastic/eui/src/components/link/link';
import type { ReactNode } from 'react';
import React from 'react';
import { css } from '@emotion/react';

export interface LinkIconProps {
  children: string | ReactNode;
  iconSize?: IconSize;
  iconType: IconType;
  dataTestSubj?: string;
  ariaLabel?: string;
  color?: LinkAnchorProps['color'];
  disabled?: boolean;
  iconSide?: 'left' | 'right';
  onClick?: () => void;
}

export const LinkIcon = React.memo<LinkIconProps>(
  ({
    ariaLabel,
    children,
    color,
    dataTestSubj,
    disabled,
    iconSide = 'left',
    iconSize = 's',
    iconType,
    onClick,
    ...rest
  }) => {
    const { euiTheme } = useEuiTheme();

    return (
      <EuiLink
        css={css`
          align-items: center;
          display: inline-flex;
          vertical-align: top;
          white-space: nowrap;
          flex-direction: ${iconSide === 'left' ? 'row' : 'row-reverse'};
        `}
        color={color}
        data-test-subj={dataTestSubj}
        disabled={disabled}
        onClick={onClick}
        aria-label={ariaLabel}
        {...rest}
      >
        <EuiIcon
          css={
            iconSide === 'left'
              ? css`
                  margin-right: ${euiTheme.size.xs};
                `
              : css`
                  flex-direction: row-reverse;

                  .euiIcon {
                    margin-left: ${euiTheme.size.xs};
                  }
                `
          }
          data-test-subj="link-icon"
          size={iconSize}
          type={iconType}
          aria-hidden={true}
        />
        <span data-test-subj="link-icon-label">{children}</span>
      </EuiLink>
    );
  }
);
LinkIcon.displayName = 'LinkIcon';
