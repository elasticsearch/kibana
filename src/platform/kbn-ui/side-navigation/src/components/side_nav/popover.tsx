/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useRef, useMemo, useCallback, cloneElement, useEffect, useState } from 'react';
import type {
  ReactNode,
  ReactElement,
  FocusEventHandler,
  KeyboardEventHandler,
  MouseEvent,
  KeyboardEvent,
  Ref,
} from 'react';
import { EuiPopover, EuiScreenReaderOnly, useEuiTheme, useGeneratedHtmlId } from '@elastic/eui';
import { css } from '@emotion/react';
import { euiIncludeSelectorInFocusTrap } from '@kbn/ui-chrome-layout-constants';
import { i18n } from '@kbn/i18n';

import {
  BOTTOM_POPOVER_GAP,
  POPOVER_HOVER_DELAY,
  POPOVER_OFFSET,
  TOP_BAR_HEIGHT,
  TOP_BAR_POPOVER_GAP,
} from '../../constants';
import { SIDE_PANEL_WIDTH } from '../../hooks/use_layout_width';
import { focusAdjacentTrigger } from '../../utils/focus_adjacent_trigger';
import { focusFirstElement } from '../../utils/focus_first_element';
import { getFocusableElements } from '../../utils/get_focusable_elements';
import { handleRovingIndex } from '../../utils/handle_roving_index';
import { updateTabIndices } from '../../utils/update_tab_indices';
import { useHoverTimeout } from '../../hooks/use_hover_timeout';
import { useScroll } from '../../hooks/use_scroll';

export interface PopoverIds {
  popoverNavigationInstructionsId: string;
}

export type PopoverChildren =
  | ReactNode
  | ((closePopover: () => void, ids?: PopoverIds) => ReactNode);

export interface PopoverProps {
  children?: PopoverChildren;
  container?: HTMLElement;
  hasContent: boolean;
  isSidePanelOpen: boolean;
  isAnyPopoverLocked?: boolean;
  setIsLocked?: (isLocked: boolean) => void;
  label: string;
  /**
   * Accessible title for the popover dialog (aria-label and screen-reader instructions).
   * Defaults to `label`. Set when the visible secondary header differs from `label`
   * (e.g. a custom `secondaryMenuTitle`) so the announced title matches what is shown.
   */
  secondaryMenuTitle?: string;
  persistent?: boolean;
  trigger: ReactElement<{
    ref?: Ref<HTMLElement>;
    onClick?: (e: MouseEvent) => void;
    onKeyDown?: (e: KeyboardEvent) => void;
    tabIndex?: number;
    'aria-haspopup'?: boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
    'aria-expanded'?: boolean;
    'aria-describedby'?: string;
  }>;
}

/**
 * The side nav popover differs from the regular `EuiPopover`:
 * - it opens on focus and hover, instead of just click,
 * - it handles keyboard navigation
 *   - Enter to move focus into the popover
 *   - Arrow keys to move focus between elements,
 *   - Escape to move focus back to the trigger.
 */
export const Popover = ({
  children,
  container,
  hasContent,
  isSidePanelOpen,
  isAnyPopoverLocked = false,
  setIsLocked = () => {},
  label,
  secondaryMenuTitle,
  persistent = false,
  trigger,
}: PopoverProps): JSX.Element => {
  const dialogLabel = secondaryMenuTitle ?? label;
  const { euiTheme } = useEuiTheme();
  const { setHoverTimeout, clearHoverTimeout } = useHoverTimeout();
  const popoverEnterAndExitInstructionsId = useGeneratedHtmlId({
    prefix: 'popover-enter-exit-instructions',
  });
  const popoverNavigationInstructionsId = useGeneratedHtmlId({
    prefix: 'popover-navigation-instructions',
  });

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement>(null);

  const [isOpenedByClick, setIsOpenedByClick] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [shouldFocusOnOpen, setShouldFocusOnOpen] = useState(false);

  useEffect(() => {
    if (persistent) {
      setIsLocked(isOpenedByClick && isOpen);
    }
  }, [persistent, isOpenedByClick, isOpen, setIsLocked]);

  const setOpenedByClick = useCallback(() => setIsOpenedByClick(true), []);

  const clearOpenedByClick = useCallback(() => setIsOpenedByClick(false), []);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    clearOpenedByClick();
    clearHoverTimeout();
    setShouldFocusOnOpen(false);
  }, [clearOpenedByClick, clearHoverTimeout]);

  const handleClose = useCallback(() => {
    clearHoverTimeout();
    close();
  }, [clearHoverTimeout, close]);

  const handleMouseEnter = useCallback(() => {
    if ((!persistent || !isOpenedByClick) && (!isAnyPopoverLocked || isOpen)) {
      clearHoverTimeout();
      if (!isSidePanelOpen) {
        setHoverTimeout(open, POPOVER_HOVER_DELAY);
      }
    }
  }, [
    persistent,
    isOpenedByClick,
    isAnyPopoverLocked,
    isOpen,
    isSidePanelOpen,
    clearHoverTimeout,
    open,
    setHoverTimeout,
  ]);

  const handleMouseLeave = useCallback(() => {
    if (!persistent || !isOpenedByClick) {
      setHoverTimeout(handleClose, POPOVER_HOVER_DELAY);
    }
  }, [persistent, isOpenedByClick, setHoverTimeout, handleClose]);

  const scrollStyles = useScroll(true);

  const handleTriggerClick = useCallback(() => {
    if (persistent) {
      if (isOpen && isOpenedByClick) {
        handleClose();
      } else {
        clearHoverTimeout();
        open();
        setOpenedByClick();
      }
    }
  }, [persistent, isOpen, isOpenedByClick, handleClose, clearHoverTimeout, open, setOpenedByClick]);

  const handleTriggerKeyDown: KeyboardEventHandler = useCallback(
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        trigger.props.onKeyDown?.(e);

        if (hasContent) {
          // Required for entering the popover with Enter or Space key
          // Otherwise the navigation happens immediately
          e.preventDefault();
          setShouldFocusOnOpen(true);
          open();
        }
      } else {
        trigger.props.onKeyDown?.(e);
      }
    },
    [trigger, hasContent, open]
  );

  const handlePopoverKeyDown: KeyboardEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        handleClose();
        triggerRef.current?.focus();
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        handleClose();
        focusAdjacentTrigger(triggerRef, e.shiftKey ? -1 : 1);
        return;
      }

      handleRovingIndex(e);
    },
    [handleClose]
  );

  const handleBlur: FocusEventHandler = useCallback(
    (e) => {
      clearHoverTimeout();

      const nextFocused = e.relatedTarget;
      const isStayingInComponent =
        nextFocused &&
        Boolean(
          triggerRef.current?.contains(nextFocused) || popoverRef.current?.contains(nextFocused)
        );

      if (isStayingInComponent === false) {
        handleClose();
      }
    },
    [clearHoverTimeout, handleClose]
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearHoverTimeout();
      handleClose();
    };
  }, [clearHoverTimeout, handleClose]);

  const enhancedTrigger = useMemo(() => {
    const existingDescribedBy = trigger.props['aria-describedby'];
    const popoverDescribedBy =
      hasContent && !isSidePanelOpen ? popoverEnterAndExitInstructionsId : undefined;
    const finalDescribedBy = [existingDescribedBy, popoverDescribedBy].filter(Boolean).join(' ');

    return cloneElement(trigger, {
      ref: triggerRef,
      'aria-haspopup': hasContent,
      'aria-expanded': hasContent ? isOpen : undefined,
      'aria-describedby': finalDescribedBy || undefined,
      onClick: (e: MouseEvent) => {
        trigger.props.onClick?.(e);
        handleTriggerClick();
      },
      onKeyDown: handleTriggerKeyDown,
    });
  }, [
    trigger,
    hasContent,
    isOpen,
    handleTriggerKeyDown,
    handleTriggerClick,
    isSidePanelOpen,
    popoverEnterAndExitInstructionsId,
  ]);

  const wrapperStyles = css`
    width: 100%;
  `;

  const popoverContentStyles = css`
    --popover-max-height: 37.5rem;
    width: ${SIDE_PANEL_WIDTH}px;
    max-height: var(--popover-max-height);
    ${scrollStyles};
  `;

  const maskStyles = css`
    position: fixed;
    inset: 0;
    z-index: calc(${euiTheme.levels.menu} - 1);
  `;

  return (
    <div
      css={wrapperStyles}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleBlur}
    >
      {hasContent && !isSidePanelOpen && (
        <EuiScreenReaderOnly>
          <p id={popoverEnterAndExitInstructionsId}>
            {i18n.translate('kbnUI.sideNavigation.popoverInstruction', {
              defaultMessage: 'Press Enter to go to the submenu.',
            })}
          </p>
        </EuiScreenReaderOnly>
      )}
      <EuiPopover
        aria-label={dialogLabel}
        anchorPosition="rightUp"
        buffer={[TOP_BAR_HEIGHT + TOP_BAR_POPOVER_GAP, 0, BOTTOM_POPOVER_GAP, POPOVER_OFFSET]}
        button={enhancedTrigger}
        closePopover={handleClose}
        container={container}
        display="block"
        hasArrow={false}
        isOpen={hasContent && !isSidePanelOpen && isOpen}
        offset={POPOVER_OFFSET}
        ownFocus={false}
        panelPaddingSize="none"
        repositionOnScroll
        panelProps={{
          ...euiIncludeSelectorInFocusTrap.prop,
          'data-test-subj': `side-nav-popover-${label}`,
        }}
      >
        <div
          ref={(ref) => {
            popoverRef.current = ref;

            if (ref) {
              const elements = getFocusableElements(ref);
              updateTabIndices(elements);

              if (shouldFocusOnOpen) {
                focusFirstElement(popoverRef);
                setShouldFocusOnOpen(false);
              }
            }
          }}
          onKeyDown={handlePopoverKeyDown}
          css={popoverContentStyles}
        >
          <EuiScreenReaderOnly>
            <p id={popoverNavigationInstructionsId}>
              {i18n.translate('kbnUI.sideNavigation.popoverNavigationInstructions', {
                defaultMessage:
                  'You are in the {label} secondary menu dialog. Use Up and Down arrow keys to navigate the menu. Press Escape to exit to the menu trigger.',
                values: {
                  label: dialogLabel,
                },
              })}
            </p>
          </EuiScreenReaderOnly>
          {typeof children === 'function'
            ? children(handleClose, { popoverNavigationInstructionsId })
            : children}
        </div>
      </EuiPopover>
      {persistent && isOpenedByClick && isOpen && (
        // The persistent popover does not affect keyboard navigation users
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events
        <div onClick={handleClose} css={maskStyles} />
      )}
    </div>
  );
};
