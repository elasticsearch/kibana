/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import { EuiButtonIcon, EuiToolTip } from '@elastic/eui';

import { stopPropagationAndPreventDefault } from '../../../../common/utils/accessibility';
import { TooltipWithKeyboardShortcut } from '../../tooltip_with_keyboard_shortcut';
import { createFilter, getAdditionalScreenReaderOnlyContext } from '../utils';
import type { HoverActionComponentProps, FilterValueFnArgs } from './types';

export const FILTER_OUT_VALUE = i18n.translate('xpack.timelines.hoverActions.filterOut', {
  defaultMessage: 'Filter out',
});

export const FILTER_OUT_VALUE_KEYBOARD_SHORTCUT = 'o';

const FilterOutValueButton: React.FC<HoverActionComponentProps & FilterValueFnArgs> = React.memo(
  ({
    Component,
    defaultFocusedButtonRef,
    field,
    filterManager,
    keyboardEvent,
    onFilterAdded,
    ownFocus,
    onClick,
    size,
    showTooltip = false,
    value,
    dataViewId,
  }) => {
    const filterOutValueFn = useCallback(() => {
      const makeFilter = (currentVal: string | null | undefined) =>
        currentVal == null || currentVal?.length === 0
          ? createFilter(field, null, false, dataViewId)
          : createFilter(field, currentVal, true, dataViewId);
      const filters = Array.isArray(value)
        ? value.map((currentVal: string | null | undefined) => makeFilter(currentVal))
        : makeFilter(value);

      const activeFilterManager = filterManager;

      if (activeFilterManager != null) {
        activeFilterManager.addFilters(filters);
        if (onFilterAdded != null) {
          onFilterAdded();
        }
      }
      if (onClick != null) {
        onClick();
      }
    }, [field, filterManager, onClick, onFilterAdded, value, dataViewId]);

    useEffect(() => {
      if (!ownFocus) {
        return;
      }
      if (keyboardEvent?.key === FILTER_OUT_VALUE_KEYBOARD_SHORTCUT) {
        stopPropagationAndPreventDefault(keyboardEvent);
        filterOutValueFn();
      }
    }, [filterOutValueFn, keyboardEvent, ownFocus]);

    const button = useMemo(
      () =>
        Component ? (
          <Component
            aria-label={FILTER_OUT_VALUE}
            buttonRef={defaultFocusedButtonRef}
            data-test-subj="filter-out-value"
            iconType="minusCircle"
            onClick={filterOutValueFn}
            size={size}
            title={FILTER_OUT_VALUE}
          >
            {FILTER_OUT_VALUE}
          </Component>
        ) : (
          <EuiToolTip content={FILTER_OUT_VALUE} disableScreenReaderOutput>
            <EuiButtonIcon
              aria-label={FILTER_OUT_VALUE}
              buttonRef={defaultFocusedButtonRef}
              className="timelines__hoverActionButton"
              data-test-subj="filter-out-value"
              iconSize="s"
              iconType="minusCircle"
              onClick={filterOutValueFn}
              size={size}
            />
          </EuiToolTip>
        ),
      [Component, defaultFocusedButtonRef, filterOutValueFn, size]
    );

    return showTooltip ? (
      <EuiToolTip
        content={
          <TooltipWithKeyboardShortcut
            additionalScreenReaderOnlyContext={getAdditionalScreenReaderOnlyContext({
              field,
              value,
            })}
            content={FILTER_OUT_VALUE}
            shortcut={FILTER_OUT_VALUE_KEYBOARD_SHORTCUT}
            showShortcut={ownFocus}
          />
        }
      >
        {button}
      </EuiToolTip>
    ) : (
      button
    );
  }
);

FilterOutValueButton.displayName = 'FilterOutValueButton';

// eslint-disable-next-line import/no-default-export
export { FilterOutValueButton as default };
