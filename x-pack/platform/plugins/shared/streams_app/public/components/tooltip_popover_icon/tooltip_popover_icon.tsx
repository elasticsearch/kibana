/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import useToggle from 'react-use/lib/useToggle';
import type { EuiButtonIconProps, EuiButtonIconPropsForButton, IconType } from '@elastic/eui';
import { EuiButtonIcon, EuiPopover, EuiToolTip, EuiIcon, EuiFlexGroup } from '@elastic/eui';

export const TooltipOrPopoverIcon = ({
  title,
  mode = 'popover',
  icon,
  iconColor = 'warning',
  popoverCss,
  dataTestSubj,
  children,
}: {
  title: string;
  mode?: 'tooltip' | 'popover';
  icon: IconType;
  iconColor?: EuiButtonIconPropsForButton['color'];
  popoverCss?: EuiButtonIconProps['css'];
  dataTestSubj: string;
  children?: React.ReactNode;
}) => {
  const [isPopoverOpen, togglePopover] = useToggle(false);

  const handleButtonClick = togglePopover;

  return mode === 'popover' ? (
    <EuiPopover
      css={popoverCss}
      attachToAnchor={true}
      anchorPosition="downCenter"
      button={
        <EuiToolTip content={title} disableScreenReaderOutput>
          <EuiButtonIcon
            data-test-subj={dataTestSubj}
            aria-label={title}
            iconType={icon}
            color={iconColor}
            onClick={handleButtonClick}
          />
        </EuiToolTip>
      }
      isOpen={isPopoverOpen}
      closePopover={togglePopover}
    >
      {title}
    </EuiPopover>
  ) : (
    <EuiToolTip content={title}>
      <EuiFlexGroup alignItems="center">
        <EuiIcon
          data-test-subj={dataTestSubj}
          aria-label={title}
          title={title}
          type={icon}
          color={iconColor}
        />
        {children}
      </EuiFlexGroup>
    </EuiToolTip>
  );
};
