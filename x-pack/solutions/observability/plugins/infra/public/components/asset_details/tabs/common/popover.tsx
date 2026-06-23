/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiPopover, EuiIcon, type IconType, type IconColor, type IconSize } from '@elastic/eui';
import { css } from '@emotion/react';
import React from 'react';
import { useBoolean } from '@kbn/react-hooks';

export const Popover = ({
  children,
  icon,
  iconColor,
  iconSize,
  ...props
}: {
  children: React.ReactNode;
  icon: IconType;
  iconColor?: IconColor;
  iconSize?: IconSize;
  'data-test-subj'?: string;
  'aria-label'?: string;
}) => {
  const [isPopoverOpen, { off: closePopover, toggle: togglePopover }] = useBoolean(false);

  return (
    <EuiPopover
      panelPaddingSize="s"
      aria-label={props['aria-label']}
      focusTrapProps={{
        returnFocus: true,
      }}
      button={
        <button
          aria-label={props['aria-label']}
          onClick={(e) => {
            e.stopPropagation();
            togglePopover();
          }}
          css={css`
            display: flex;
          `}
          data-test-subj={props['data-test-subj']}
        >
          <EuiIcon
            type={icon}
            color={iconColor ?? 'text'}
            size={iconSize ?? 'original'}
            aria-hidden={true}
          />
        </button>
      }
      isOpen={isPopoverOpen}
      offset={10}
      closePopover={closePopover}
      repositionOnScroll
      anchorPosition="upCenter"
      panelStyle={{ maxWidth: 350 }}
    >
      {children}
    </EuiPopover>
  );
};
