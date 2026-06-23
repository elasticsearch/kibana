/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FC } from 'react';
import React from 'react';
import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { strings } from './action_strings';
import type { FilterItemActionsProps } from './types';
import { actionButtonCss } from '../filter_item.styles';

export const FilterItemActions: FC<FilterItemActionsProps & { minimizePaddings?: boolean }> = ({
  disabled = false,
  disableRemove = false,
  hideOr = false,
  disableOr = false,
  hideAnd = false,
  disableAnd = false,
  minimizePaddings = false,
  onRemoveFilter,
  onOrButtonClick,
  onAddButtonClick,
}) => {
  const { euiTheme } = useEuiTheme();
  const actionButtonClassName = actionButtonCss(euiTheme);

  return (
    <EuiFlexGroup justifyContent="flexEnd" alignItems="flexEnd" gutterSize="xs" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiToolTip
          content={
            disableRemove || disabled
              ? strings.getDeleteButtonDisabled()
              : strings.getDeleteFilterGroupButtonIconLabel()
          }
          disableScreenReaderOutput
        >
          <EuiButtonIcon
            onClick={onRemoveFilter}
            iconType="trash"
            isDisabled={disableRemove || disabled}
            size="xs"
            color="danger"
            aria-label={strings.getDeleteFilterGroupButtonIconLabel()}
            // EuiButtonIcon has no padding to minimize
          />
        </EuiToolTip>
      </EuiFlexItem>
      {!hideOr && (
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            onClick={onOrButtonClick}
            isDisabled={disableOr || disabled}
            iconType="plusCircle"
            size="xs"
            iconSize="s"
            flush="right"
            aria-label={strings.getAddOrFilterGroupButtonIconLabel()}
            data-test-subj="add-or-filter"
            className={minimizePaddings ? actionButtonClassName : ''}
          >
            {strings.getAddOrFilterGroupButtonLabel()}
          </EuiButtonEmpty>
        </EuiFlexItem>
      )}
      {!hideAnd && (
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            onClick={onAddButtonClick}
            isDisabled={disableAnd || disabled}
            iconType="plusCircle"
            size="xs"
            iconSize="s"
            flush="right"
            aria-label={strings.getAddAndFilterGroupButtonIconLabel()}
            data-test-subj="add-and-filter"
            className={minimizePaddings ? actionButtonClassName : ''}
          >
            {strings.getAddAndFilterGroupButtonLabel()}
          </EuiButtonEmpty>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};
