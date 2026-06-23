/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiButtonIcon,
  EuiCheckbox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiPopoverTitle,
  EuiSpacer,
  EuiToolTip,
} from '@elastic/eui';
import type { ControlColumnProps } from '../../../common/types';

const SelectionHeaderCell = () => {
  return (
    <div data-test-subj="test-header-control-column-cell">
      <EuiCheckbox id="selection-toggle" aria-label="Select all rows" onChange={() => null} />
    </div>
  );
};

const SimpleHeaderCell = () => {
  return (
    <div
      css={{
        fontSize: '12px',
        fontWeight: 600,
        lineHeight: 1.5,
        minWidth: 0,
        padding: '4px',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
      }}
      data-test-subj="test-header-action-cell"
    >
      {'Additional Actions'}
    </div>
  );
};

const SelectionRowCell = ({ rowIndex }: { rowIndex: number }) => {
  return (
    <div data-test-subj="test-body-control-column-cell">
      <EuiCheckbox
        id={`${rowIndex}`}
        aria-label={`Select row test`}
        checked={false}
        onChange={() => null}
      />
    </div>
  );
};

const TestTrailingColumn = () => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  return (
    <EuiPopover
      aria-label="Actions"
      isOpen={isPopoverOpen}
      anchorPosition="upCenter"
      panelPaddingSize="s"
      button={
        <EuiToolTip content="show actions" disableScreenReaderOutput>
          <EuiButtonIcon
            aria-label="show actions"
            iconType="boxesVertical"
            color="text"
            onClick={() => setIsPopoverOpen(!isPopoverOpen)}
          />
        </EuiToolTip>
      }
      data-test-subj="test-trailing-column-popover-button"
      closePopover={() => setIsPopoverOpen(false)}
    >
      <EuiPopoverTitle>{'Actions'}</EuiPopoverTitle>
      <div css={{ width: 150 }}>
        <button type="button" onClick={() => {}}>
          <EuiFlexGroup alignItems="center" component="span" gutterSize="s">
            <EuiFlexItem grow={false}>
              <EuiToolTip content="Pin selected items" disableScreenReaderOutput>
                <EuiButtonIcon aria-label="Pin selected items" iconType="pin" color="text" />
              </EuiToolTip>
            </EuiFlexItem>
            <EuiFlexItem>{'Pin'}</EuiFlexItem>
          </EuiFlexGroup>
        </button>
        <EuiSpacer size="s" />
        <button type="button" onClick={() => {}}>
          <EuiFlexGroup alignItems="center" component="span" gutterSize="s">
            <EuiFlexItem grow={false}>
              <EuiToolTip content="Delete selected items" disableScreenReaderOutput>
                <EuiButtonIcon aria-label="Delete selected items" iconType="trash" color="text" />
              </EuiToolTip>
            </EuiFlexItem>
            <EuiFlexItem>{'Delete'}</EuiFlexItem>
          </EuiFlexGroup>
        </button>
      </div>
    </EuiPopover>
  );
};

export const testTrailingControlColumns = [
  {
    id: 'actions',
    width: 96,
    headerCellRender: SimpleHeaderCell,
    rowCellRender: TestTrailingColumn,
  },
];

export const testLeadingControlColumn: ControlColumnProps = {
  id: 'test-leading-control',
  headerCellRender: SelectionHeaderCell,
  rowCellRender: SelectionRowCell,
  width: 100,
};
