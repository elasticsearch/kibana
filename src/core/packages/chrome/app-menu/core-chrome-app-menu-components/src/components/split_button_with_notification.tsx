/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { type MouseEventHandler } from 'react';
import { EuiSplitButton, EuiIcon, EuiIconTip, useEuiTheme, type IconType } from '@elastic/eui';
import { css } from '@emotion/react';
import { APP_MENU_TEST_SUBJECTS } from '../test_subjects';

export interface SplitButtonWithNotificationProps {
  label: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>;
  iconType?: IconType;
  isDisabled?: boolean;
  isLoading?: boolean;
  isMainButtonLoading?: boolean;
  isSelected?: boolean;
  href?: string;
  target?: string;
  id?: string;
  'data-test-subj'?: string;
  fullWidth?: boolean;
  'aria-haspopup'?: 'menu';

  secondaryButtonAriaLabel: string;
  onSecondaryButtonClick?: React.MouseEventHandler<HTMLButtonElement>;
  isSecondaryButtonDisabled?: boolean;

  showNotificationIndicator?: boolean;
  notificationIndicatorTooltipContent?: string;
}

export const SplitButtonWithNotification = ({
  isDisabled = false,
  isLoading = false,
  'data-test-subj': dataTestSubj,
  fullWidth,
  label,
  onClick,
  iconType,
  isMainButtonLoading = false,
  isSelected,
  href,
  target,
  id,
  'aria-haspopup': ariaHasPopup,
  secondaryButtonAriaLabel,
  onSecondaryButtonClick,
  isSecondaryButtonDisabled,
  showNotificationIndicator = false,
  notificationIndicatorTooltipContent,
}: SplitButtonWithNotificationProps) => {
  const { euiTheme } = useEuiTheme();

  return (
    <EuiSplitButton
      color="text"
      size="s"
      isDisabled={isDisabled}
      isLoading={isLoading}
      css={
        fullWidth &&
        css`
          display: flex;
          width: 100%;
        `
      }
    >
      <EuiSplitButton.ActionPrimary
        data-test-subj={dataTestSubj}
        id={id}
        onClick={onClick as MouseEventHandler}
        isLoading={isMainButtonLoading}
        isSelected={isSelected}
        href={href}
        target={target}
        fullWidth={fullWidth}
        aria-haspopup={ariaHasPopup}
      >
        {iconType && !isMainButtonLoading && (
          <span
            css={{
              position: 'relative',
              display: 'inline-flex',
              marginInlineEnd: euiTheme.size.xs,
            }}
          >
            <EuiIcon type={iconType} size="m" aria-hidden={true} />
            {showNotificationIndicator && (
              <div
                data-test-subj={APP_MENU_TEST_SUBJECTS.notificationIndicator}
                css={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  transform: 'translate(50%, -50%)',
                  zIndex: 1,
                  pointerEvents: 'none',
                  '& svg': {
                    stroke: euiTheme.colors.backgroundBasePlain,
                    strokeWidth: euiTheme.size.xxs,
                    paintOrder: 'stroke fill',
                  },
                }}
              >
                <span css={{ pointerEvents: 'auto' }}>
                  <EuiIconTip
                    type="dot"
                    size="m"
                    color="primary"
                    content={notificationIndicatorTooltipContent}
                    iconProps={{
                      onClick:
                        isDisabled || isLoading || isMainButtonLoading
                          ? undefined
                          : (onClick as MouseEventHandler),
                    }}
                  />
                </span>
              </div>
            )}
          </span>
        )}
        {label}
      </EuiSplitButton.ActionPrimary>
      <EuiSplitButton.ActionSecondary
        data-test-subj={dataTestSubj ? `${dataTestSubj}-secondary-button` : undefined}
        iconType="chevronSingleDown"
        aria-label={secondaryButtonAriaLabel}
        onClick={onSecondaryButtonClick}
        isDisabled={isSecondaryButtonDisabled}
        isSelected={isSelected}
      />
    </EuiSplitButton>
  );
};
