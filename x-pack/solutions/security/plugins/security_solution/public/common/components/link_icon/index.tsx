/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IconSize, IconType } from '@elastic/eui';
import { EuiIcon, EuiLink } from '@elastic/eui';
import type { LinkAnchorProps } from '@elastic/eui/src/components/link/link';
import type { ReactNode } from 'react';
import React, { useCallback, useMemo } from 'react';
import styled, { css } from 'styled-components';

interface LinkProps {
  ariaLabel?: string;
  color?: LinkAnchorProps['color'];
  disabled?: boolean;
  href?: string;
  iconSide?: 'left' | 'right';
  onClick?: Function;
}

export const Link = styled(({ iconSide, children, ...rest }) => (
  <EuiLink {...rest}>{children}</EuiLink>
))<LinkProps>`
  ${({ iconSide, theme }) => css`
    align-items: center;
    display: inline-flex;
    vertical-align: top;
    white-space: nowrap;

    ${iconSide === 'left' &&
    css`
      .euiIcon {
        margin-right: ${theme.eui.euiSizeXS};
      }
    `}

    ${iconSide === 'right' &&
    css`
      flex-direction: row-reverse;

      .euiIcon {
        margin-left: ${theme.eui.euiSizeXS};
      }
    `}
  `}
`;
Link.displayName = 'Link';

export interface LinkIconProps extends LinkProps {
  children: string | ReactNode;
  iconSize?: IconSize;
  iconType: IconType;
  dataTestSubj: string;
}

export const LinkIcon = React.memo<LinkIconProps>(
  ({
    ariaLabel,
    children,
    color,
    dataTestSubj,
    disabled,
    href,
    iconSide = 'left',
    iconSize = 's',
    iconType,
    onClick,
  }) => {
    const getChildrenString = useCallback((theChild: string | ReactNode): string => {
      if (
        typeof theChild === 'object' &&
        theChild != null &&
        'props' in theChild &&
        theChild.props &&
        theChild.props.children
      ) {
        return getChildrenString(theChild.props.children);
      }
      return theChild != null && Object.keys(theChild).length > 0 ? (theChild as string) : '';
    }, []);
    const aria = useMemo(() => {
      if (ariaLabel) {
        return ariaLabel;
      }
      return getChildrenString(children);
    }, [ariaLabel, children, getChildrenString]);

    return (
      <Link
        className="siemLinkIcon"
        color={color}
        data-test-subj={dataTestSubj}
        disabled={disabled}
        href={href}
        iconSide={iconSide}
        onClick={onClick}
        aria-label={aria}
      >
        <EuiIcon size={iconSize} type={iconType} aria-hidden={true} />
        <span className="siemLinkIcon__label">{children}</span>
      </Link>
    );
  }
);
LinkIcon.displayName = 'LinkIcon';
