/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import type { Row } from '@tanstack/react-table';
import { CascadeRowCellPrimitive } from './cascade_row_cell';
import type {
  ChildVirtualizerController,
  CascadeRootVirtualizerReturnValue,
} from '../../../lib/core/virtualizer';
import { DataCascadeProvider } from '../../../store_provider';

const renderComponent = ({
  cascadeGroups,
  children,
  initialGroupColumn,
  row,
  getVirtualizer,
  onCascadeLeafNodeExpanded = jest.fn(),
  onCascadeLeafNodeCollapsed,
}: Pick<
  React.ComponentProps<typeof CascadeRowCellPrimitive>,
  'onCascadeLeafNodeExpanded' | 'onCascadeLeafNodeCollapsed' | 'row' | 'children' | 'getVirtualizer'
> &
  Pick<
    React.ComponentProps<typeof DataCascadeProvider>,
    'cascadeGroups' | 'initialGroupColumn'
  >) => {
  return render(
    <DataCascadeProvider
      data={[]}
      cascadeGroups={cascadeGroups}
      initialGroupColumn={initialGroupColumn}
    >
      {/* @ts-expect-error -- we don't need to provide all the props */}
      <CascadeRowCellPrimitive
        size="m"
        onCascadeLeafNodeExpanded={onCascadeLeafNodeExpanded}
        onCascadeLeafNodeCollapsed={onCascadeLeafNodeCollapsed}
        row={row}
        getVirtualizer={getVirtualizer}
      >
        {children}
      </CascadeRowCellPrimitive>
    </DataCascadeProvider>
  );
};

describe('CascadeRowCellPrimitive', () => {
  const onCascadeLeafNodeExpanded = jest.fn();

  const mockVirtualizerGetter = jest.fn(
    () =>
      ({
        getVirtualItems: jest.fn(() => []),
        getTotalSize: jest.fn(() => 0),
        isScrolling: false,
        measureElement: jest.fn(),
        scrollOffset: 0,
        scrollElement: null,
        activeStickyIndex: null,
        virtualizedRowComputedTranslateValue: new Map(),
        preventRowSizeChangePropagation: jest.fn(() => jest.fn()),
        childController: {
          subscribe: jest.fn(() => () => {}),
          shouldActivate: jest.fn(() => true),
          enqueue: jest.fn(() => jest.fn()),
          isReturningCell: jest.fn(() => false),
        },
      } as unknown as CascadeRootVirtualizerReturnValue)
  );

  it('will invoke the passed onCascadeLeafNodeExpanded if the leafNode has no data', () => {
    const cascadeGroups = ['group1', 'group2'];

    const rowData = cascadeGroups.reduce((acc, value, idx) => ({ ...acc, [value]: idx }), {
      id: '1',
      randomField: 'randomValue',
    });

    renderComponent({
      cascadeGroups,
      initialGroupColumn: [cascadeGroups[0]],
      row: {
        id: '1',
        depth: 0,
        original: rowData,
        getToggleSelectedHandler: jest.fn(),
        getToggleExpandedHandler: jest.fn(),
      } as unknown as Row<any>,
      children: () => <div>Test Child</div>,
      onCascadeLeafNodeExpanded,
      getVirtualizer: mockVirtualizerGetter,
    });

    expect(onCascadeLeafNodeExpanded).toHaveBeenCalledWith({
      nodePath: [cascadeGroups[0]],
      nodePathMap: { group1: 0 },
      row: rowData,
    });
  });

  it('will invoke the passed onCascadeLeafNodeCollapsed if the leafNode has data when the component unmounts', () => {
    const cascadeGroups = ['group1', 'group2'];

    const onCascadeLeafNodeCollapsed = jest.fn();

    const rowData = cascadeGroups.reduce((acc, value, idx) => ({ ...acc, [value]: idx }), {
      id: '1',
      randomField: 'randomValue2',
    });

    const { unmount } = renderComponent({
      cascadeGroups,
      initialGroupColumn: [cascadeGroups[0]],
      row: {
        id: '1',
        depth: 0,
        original: rowData,
        getToggleSelectedHandler: jest.fn(),
        getToggleExpandedHandler: jest.fn(),
      } as unknown as Row<any>,
      children: () => <div>Test Child</div>,
      onCascadeLeafNodeExpanded,
      onCascadeLeafNodeCollapsed,
      getVirtualizer: mockVirtualizerGetter,
    });

    unmount();

    expect(onCascadeLeafNodeCollapsed).toHaveBeenCalledWith({
      nodePath: [cascadeGroups[0]],
      nodePathMap: { group1: 0 },
      row: rowData,
    });
  });

  describe('child component props', () => {
    const mockLeafData = { items: [{ id: 'item-1' }] };

    it('should pass all required methods and properties to the child component', async () => {
      const cascadeGroups = ['group1', 'group2'];
      const childPropsSpy = jest.fn();
      const mockOnCascadeLeafNodeExpanded = jest.fn().mockResolvedValue(mockLeafData);

      const rowData = cascadeGroups.reduce((acc, value, idx) => ({ ...acc, [value]: idx }), {
        id: '1',
        randomField: 'randomValue',
      });

      renderComponent({
        cascadeGroups,
        initialGroupColumn: [cascadeGroups[0]],
        row: {
          id: '1',
          index: 0,
          depth: 0,
          original: rowData,
          getToggleSelectedHandler: jest.fn(),
          getToggleExpandedHandler: jest.fn(),
        } as unknown as Row<any>,
        children: (props) => {
          childPropsSpy(props);
          return <div>Test Child</div>;
        },
        onCascadeLeafNodeExpanded: mockOnCascadeLeafNodeExpanded,
        getVirtualizer: mockVirtualizerGetter,
      });

      await waitFor(() => {
        expect(childPropsSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            cellId: expect.any(String),
            nodePath: expect.any(Array),
            nodePathMap: expect.any(Object),
            data: expect.anything(),
            rowIndex: expect.any(Number),
          })
        );
      });
    });

    it('should provide virtualizerController from the virtualizer childController', async () => {
      const cascadeGroups = ['group1', 'group2'];
      let capturedVirtualizerController: ChildVirtualizerController | undefined;
      const mockOnCascadeLeafNodeExpanded = jest.fn().mockResolvedValue(mockLeafData);

      const mockChildController = {
        subscribe: jest.fn(() => () => {}),
        shouldActivate: jest.fn(() => true),
        enqueue: jest.fn(() => jest.fn()),
        isReturningCell: jest.fn(() => false),
      };

      const customMockVirtualizerGetter = jest.fn(
        () =>
          ({
            getVirtualItems: jest.fn(() => []),
            getTotalSize: jest.fn(() => 0),
            isScrolling: false,
            measureElement: jest.fn(),
            scrollOffset: 0,
            scrollElement: null,
            activeStickyIndex: null,
            virtualizedRowComputedTranslateValue: new Map(),
            childController: mockChildController,
          } as unknown as CascadeRootVirtualizerReturnValue)
      );

      const rowData = cascadeGroups.reduce((acc, value, idx) => ({ ...acc, [value]: idx }), {
        id: '1',
        randomField: 'randomValue',
      });

      renderComponent({
        cascadeGroups,
        initialGroupColumn: [cascadeGroups[0]],
        row: {
          id: '1',
          index: 0,
          depth: 0,
          original: rowData,
          getToggleSelectedHandler: jest.fn(),
          getToggleExpandedHandler: jest.fn(),
        } as unknown as Row<any>,
        children: (props) => {
          capturedVirtualizerController = props.virtualizerController;
          return <div>Test Child</div>;
        },
        onCascadeLeafNodeExpanded: mockOnCascadeLeafNodeExpanded,
        getVirtualizer: customMockVirtualizerGetter,
      });

      await waitFor(() => {
        expect(capturedVirtualizerController).toBeDefined();
      });

      expect(capturedVirtualizerController).toBe(mockChildController);
    });
  });
});
