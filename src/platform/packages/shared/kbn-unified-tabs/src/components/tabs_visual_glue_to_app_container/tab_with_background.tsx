/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { type HTMLAttributes } from 'react';
import { css } from '@emotion/react';
import { useEuiTheme, euiSlightShadowHover, type EuiThemeComputed } from '@elastic/eui';
import classNames from 'classnames';
import type { TabsServices } from '../../types';

export interface TabWithBackgroundProps extends HTMLAttributes<HTMLElement> {
  isSelected: boolean;
  isDragging?: boolean;
  isLoading?: boolean;
  hideRightSeparator?: boolean;
  services: TabsServices;
  children: React.ReactNode;
}

export const TabWithBackground = React.forwardRef<HTMLDivElement, TabWithBackgroundProps>(
  (
    { isSelected, isDragging, isLoading, hideRightSeparator, services, children, ...otherProps },
    ref
  ) => {
    const euiThemeContext = useEuiTheme();
    const { euiTheme } = euiThemeContext;

    return (
      <div
        {...otherProps}
        ref={ref}
        className={classNames('unifiedTabs__tabWithBackground', {
          'unifiedTabs__tabWithBackground--selected': isSelected,
        })}
        // tab main background and another background color on hover
        css={css`
          position: relative;
          display: inline-block;
          border-radius: ${euiTheme.border.radius.small};
          background: ${isSelected || isDragging
            ? euiTheme.colors.backgroundBasePlain
            : 'transparent'};
          transition: background ${euiTheme.animation.fast};
          margin: ${euiTheme.size.xs};
          // overlap the container's bottom border so the active tab connects to the content below
          margin-bottom: -${euiTheme.border.width.thin};
          padding-bottom: ${isDragging ? '0' : euiTheme.size.xs};
          // Reserve space for the selected tab's borders so it does not shift layout.
          border-top: ${euiTheme.border.width.thick} solid transparent;
          border-left: ${euiTheme.border.width.thin} solid transparent;
          border-right: ${euiTheme.border.width.thin} solid transparent;

          ${isSelected
            ? `
              border-top-color: ${
                isLoading ? euiTheme.colors.borderBaseSubdued : euiTheme.colors.primary
              };
              border-left-color: ${euiTheme.colors.borderBaseSubdued};
              border-right-color: ${euiTheme.colors.borderBaseSubdued};
              border-bottom-left-radius: 0;
              border-bottom-right-radius: 0;
            `
            : ''}

          ${isDragging
            ? `
              ${euiSlightShadowHover(euiThemeContext)};
              border-radius: ${euiTheme.border.radius.small};
          `
            : ''}

          // right vertical separator
          &::before {
            content: '';
            position: absolute;
            right: -${euiTheme.size.xs};
            top: calc(
              50% - ${euiTheme.size.xs} / 2
            ); // 50% is the tab height midpoint, we want it centered in the middle of the whole tab bar
            transform: translateY(-50%);
            width: 1px;
            height: ${euiTheme.size.base};
            background-color: ${euiTheme.colors.borderBasePlain};
            transition: opacity ${euiTheme.animation.fast};
            opacity: ${hideRightSeparator || isDragging ? '0' : '1'};
            pointer-events: none;
          }
        `}
      >
        <div
          css={css`
            ${!isSelected
              ? `
              &:hover {
                background-color: ${euiTheme.colors.backgroundLightPrimary};
                color: ${euiTheme.colors.primary};
                border-radius: ${euiTheme.border.radius.small};
              }
            `
              : ''}
          `}
        >
          {children}
        </div>
        {isSelected && !isDragging && (
          <>
            <Accent direction="left" euiTheme={euiTheme} />
            <Accent direction="right" euiTheme={euiTheme} />
          </>
        )}
      </div>
    );
  }
);

const Accent = ({
  direction,
  euiTheme,
}: {
  direction: 'left' | 'right';
  euiTheme: EuiThemeComputed;
}) => {
  return (
    <svg
      css={css`
        height: ${euiTheme.size.s};
        width: ${euiTheme.size.s};
        position: absolute;
        bottom: 0;
        ${direction === 'left' ? `left: -${euiTheme.size.s};` : `right: -${euiTheme.size.s};`};
        ${direction === 'left' ? 'transform: scaleX(-1);' : ''};
      `}
      xmlns="http://www.w3.org/2000/svg"
      width={euiTheme.size.s}
      height={euiTheme.size.s}
      viewBox="0 0 8 8"
      fill="none"
    >
      <path
        d="M8 7.92676C7.67329 7.97351 7.33964 8 7 8H8V7.92676ZM0 8H7C3.13401 8 0 4.86599 0 1C0 0.660412 0.0255308 0.326664 0.0722656 0H0V8Z"
        fill={euiTheme.colors.backgroundBasePlain}
      />
      <path
        d="M7 8C3.13401 8 0 4.86599 0 1C0 0.660412 0.0255308 0.326664 0.0722656 0"
        fill="none"
        stroke={euiTheme.colors.borderBaseSubdued}
        strokeWidth={euiTheme.border.width.thin}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};
