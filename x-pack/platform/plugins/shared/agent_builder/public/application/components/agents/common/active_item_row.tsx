/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';

export interface ActiveItemRowProps {
  id: string;
  name: string;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  isRemoving?: boolean;
  removeAriaLabel: string;
  readOnlyContent?: React.ReactNode;
  canEditAgent: boolean;
  ebtProps?: Record<string, string>;
  removeEbtProps?: Record<string, string>;
}

const SHOW_ON_HOVER_CLASS = 'agentBuilder__agentActiveItemRow--showOnHover';

export const ActiveItemRow: React.FC<ActiveItemRowProps> = ({
  name,
  isSelected,
  onSelect,
  onRemove,
  isRemoving = false,
  removeAriaLabel,
  readOnlyContent,
  canEditAgent,
  ebtProps,
  removeEbtProps,
}) => {
  const { euiTheme } = useEuiTheme();
  const isReadOnly = Boolean(readOnlyContent);
  const showRemoveButton = canEditAgent && !isReadOnly;

  const rowStyles = css`
    block-size: 40px;
    padding: ${euiTheme.size.s} ${euiTheme.size.m};
    cursor: pointer;
    border-radius: ${euiTheme.border.radius.medium};
    background-color: ${isSelected
      ? euiTheme.colors.backgroundBaseInteractiveHover
      : 'transparent'};
    &:hover {
      background-color: ${euiTheme.colors.backgroundBaseInteractiveHover};
    }

    /* Show remove button on row hover / focus */
    &:hover .${SHOW_ON_HOVER_CLASS}, &:focus-within .${SHOW_ON_HOVER_CLASS} {
      display: inline;
      opacity: 1;
    }

    & .${SHOW_ON_HOVER_CLASS} {
      /* Always show when row is selected */
      display: ${isSelected ? 'inline' : 'none'};
      opacity: ${isSelected ? 1 : 0};
      transition: opacity ${euiTheme.animation.fast};
    }
  `;

  return (
    <EuiFlexGroup
      alignItems="center"
      gutterSize="none"
      responsive={false}
      onClick={onSelect}
      css={rowStyles}
      {...ebtProps}
    >
      <EuiFlexItem
        css={css`
          min-width: 0;
        `}
      >
        <EuiText
          size="s"
          css={css`
            font-weight: ${isSelected
              ? euiTheme.font.weight.semiBold
              : euiTheme.font.weight.regular};
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          `}
        >
          {name}
        </EuiText>
      </EuiFlexItem>
      {isReadOnly && (
        <EuiFlexItem grow={false} className={SHOW_ON_HOVER_CLASS}>
          {readOnlyContent}
        </EuiFlexItem>
      )}
      {showRemoveButton && (
        <EuiFlexItem grow={false}>
          <EuiToolTip content={removeAriaLabel} disableScreenReaderOutput>
            <EuiButtonIcon
              className={SHOW_ON_HOVER_CLASS}
              iconType="cross"
              aria-label={removeAriaLabel}
              disabled={isRemoving}
              onClick={(event: React.MouseEvent) => {
                event.stopPropagation();
                onRemove();
              }}
              {...removeEbtProps}
            />
          </EuiToolTip>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};
