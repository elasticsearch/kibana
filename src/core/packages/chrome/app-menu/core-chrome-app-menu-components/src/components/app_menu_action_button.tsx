/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useRef, type MouseEvent } from 'react';
import { upperFirst } from 'lodash';
import { EuiButton, EuiHideFor, EuiToolTip, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { getRouterLinkProps } from '@kbn/router-utils';
import { createReturnFocus, getIsSelectedColor, getTooltip, isDisabled } from '../utils';
import { AppMenuPopover } from './app_menu_popover';
import { SplitButtonWithNotification } from './split_button_with_notification';
import type { AppMenuPrimaryActionItem, AppMenuSplitButtonProps } from '../types';
import { getAppMenuActionButtonTestSubj } from '../test_subjects';

type AppMenuActionButtonProps = AppMenuPrimaryActionItem & {
  isPopoverOpen: boolean;
  onPopoverToggle: () => void;
  onPopoverClose: () => void;
  onCloseOverflowButton?: () => void;
  fullWidth?: boolean;
};

export const AppMenuActionButton = (props: AppMenuActionButtonProps) => {
  const { euiTheme } = useEuiTheme();

  const {
    run,
    id,
    htmlId,
    label,
    testId,
    iconType,
    disableButton,
    href,
    target,
    isLoading,
    tooltipContent,
    tooltipTitle,
    isPopoverOpen,
    hidden,
    popoverWidth,
    popoverTestId,
    onPopoverToggle,
    onPopoverClose,
    onCloseOverflowButton,
    fullWidth,
  } = props;

  const itemText = upperFirst(label);
  const { title, content } = getTooltip({ tooltipContent, tooltipTitle });
  const showTooltip = Boolean(content || title);

  const splitButtonProps = 'splitButtonProps' in props ? props.splitButtonProps : undefined;
  const items = 'items' in props ? props.items : undefined;

  const {
    items: splitButtonItems,
    run: splitButtonRun,
    ...otherSplitButtonProps
  } = splitButtonProps || ({} as AppMenuSplitButtonProps);

  const hasItems = items && items.length > 0;
  const hasSplitItems = splitButtonItems && splitButtonItems.length > 0;
  const hasPopover = hasItems || hasSplitItems;
  const anchorDomElementRef = useRef<HTMLElement | null>(null);

  const handleClick = (event: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    if (isDisabled(disableButton)) return;

    if (hasItems) {
      onPopoverToggle();
      return;
    }

    const triggerElement = event.currentTarget;
    run?.({
      triggerElement,
      returnFocus: createReturnFocus(triggerElement),
    });
  };

  const handleSecondaryButtonClick = (event: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    if (isDisabled(splitButtonProps?.isSecondaryButtonDisabled)) return;

    if (hasSplitItems) {
      anchorDomElementRef.current = event.currentTarget;
      onPopoverToggle();
      return;
    }

    const triggerElement = event.currentTarget;
    splitButtonRun?.({
      triggerElement,
      returnFocus: createReturnFocus(triggerElement),
    });
  };

  const routerLinkProps =
    href && run ? getRouterLinkProps({ href, onClick: handleClick }) : { onClick: handleClick };

  const commonProps = {
    ...routerLinkProps,
    id: htmlId,
    'data-test-subj': testId || getAppMenuActionButtonTestSubj(id),
    iconType,
    isDisabled: isDisabled(disableButton),
    href,
    target: href ? target : undefined,
    isLoading,
    'aria-haspopup': (hasPopover ? 'menu' : undefined) as 'menu' | undefined,
    fullWidth,
  };

  const buttonCss = css`
    background-color: ${isPopoverOpen
      ? getIsSelectedColor({
          color: 'text',
          euiTheme,
          isFilled: false,
        })
      : undefined};
  `;

  const buttonComponent = splitButtonProps ? (
    <EuiHideFor sizes={hidden ?? 'none'}>
      <SplitButtonWithNotification
        {...otherSplitButtonProps}
        {...commonProps}
        label={itemText}
        onSecondaryButtonClick={handleSecondaryButtonClick}
        isSelected={isPopoverOpen}
      />
    </EuiHideFor>
  ) : (
    <EuiHideFor sizes={hidden ?? 'none'}>
      <EuiButton
        {...commonProps}
        size="s"
        iconSize="m"
        iconSide="left"
        isSelected={isPopoverOpen}
        css={buttonCss}
        color="text"
      >
        {itemText}
      </EuiButton>
    </EuiHideFor>
  );

  /**
   * There is an issue with passing down a button wrapped in a tooltip to popover.
   * Because of that, popover has its own tooltip handling.
   * So we only wrap in tooltip if there are no items (no popover).
   */
  const button =
    showTooltip && !hasPopover ? (
      <EuiToolTip content={content} title={title}>
        {buttonComponent}
      </EuiToolTip>
    ) : (
      buttonComponent
    );

  if (hasItems) {
    return (
      <AppMenuPopover
        items={items}
        tooltipContent={content}
        tooltipTitle={title}
        anchorElement={button}
        isOpen={isPopoverOpen}
        popoverWidth={popoverWidth}
        popoverTestId={popoverTestId}
        anchorPosition="downRight"
        repositionToCrossAxis={false}
        onClose={onPopoverClose}
        onCloseOverflowButton={onCloseOverflowButton}
      />
    );
  }

  if (hasSplitItems) {
    return (
      <AppMenuPopover
        items={splitButtonItems}
        tooltipContent={content}
        tooltipTitle={title}
        anchorElement={button}
        anchorDomElement={anchorDomElementRef.current ?? undefined}
        isOpen={isPopoverOpen}
        popoverWidth={popoverWidth}
        popoverTestId={popoverTestId}
        anchorPosition="downRight"
        repositionToCrossAxis={false}
        onClose={onPopoverClose}
        onCloseOverflowButton={onCloseOverflowButton}
      />
    );
  }

  return button;
};
