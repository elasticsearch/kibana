/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

jest.mock('@elastic/eui', () => ({
  ...jest.requireActual('@elastic/eui'),
  EuiDragDropContext: jest.fn(({ children }: { children: React.ReactNode }) => <>{children}</>),
  EuiDroppable: jest.fn(({ children }: { children: React.ReactNode }) => <>{children}</>),
  EuiDraggable: jest.fn(({ children }: { children: (provided: object) => React.ReactNode }) => (
    <>{children({ dragHandleProps: {} })}</>
  )),
}));

import { screen } from '@testing-library/react';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';
import { EuiDragDropContext } from '@elastic/eui';

import { ReorderableTable } from './reorderable_table';
import type { Column } from './types';

interface Foo {
  id: number;
}

describe('ReorderableTable', () => {
  const items: Foo[] = [{ id: 1 }, { id: 2 }];
  const columns: Array<Column<Foo>> = [];

  const MockEuiDragDropContext = jest.mocked(EuiDragDropContext);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when the table is reorderable', () => {
    it('renders with a header that has an additional column injected as the first column, which is empty', () => {
      renderWithKibanaRenderContext(
        <ReorderableTable noItemsMessage={<p>No Items</p>} items={items} columns={columns} />
      );
      // columns=[] + leftAction spacer for drag handle → 1 columnheader
      expect(screen.getAllByRole('columnheader')).toHaveLength(1);
    });

    it('renders draggable rows inside of the reorderable table', () => {
      renderWithKibanaRenderContext(
        <ReorderableTable noItemsMessage={<p>No Items</p>} items={items} columns={columns} />
      );
      // header + 2 items = 3 rows; each body row has a drag handle
      const rows = screen.getAllByRole('row');
      expect(rows).toHaveLength(3);
      expect(rows[1]).toHaveAttribute('aria-rowindex', '2');
      expect(rows[2]).toHaveAttribute('aria-rowindex', '3');
      expect(screen.getAllByTestId('dragHandle')).toHaveLength(2);
    });

    it('can append additional properties to each row, which can be dynamically calculated from the item in that row', () => {
      renderWithKibanaRenderContext(
        <ReorderableTable
          noItemsMessage={<p>No Items</p>}
          items={items}
          columns={columns}
          rowProps={(item) => ({
            className: `someClassName_${item.id}`,
          })}
        />
      );
      // additionalProps are spread onto the row element (role="row"); rows[0] is header
      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveClass('someClassName_1');
      expect(rows[2]).toHaveClass('someClassName_2');
    });

    it('will disableDragging on individual rows if disableDragging is enabled', () => {
      renderWithKibanaRenderContext(
        <ReorderableTable
          noItemsMessage={<p>No Items</p>}
          items={items}
          columns={columns}
          disableDragging
        />
      );
      // When dragging is disabled, drag handle icons are replaced with a fixed-width spacer
      expect(screen.queryAllByTestId('dragHandle')).toHaveLength(0);
    });

    it('will accept a callback which will be triggered every time a row is reordered', () => {
      const onReorder = jest.fn();
      renderWithKibanaRenderContext(
        <ReorderableTable
          noItemsMessage={<p>No Items</p>}
          items={items}
          columns={columns}
          onReorder={onReorder}
        />
      );
      const { onDragEnd } = MockEuiDragDropContext.mock.calls[0][0] as unknown as {
        onDragEnd: (args: { source: { index: number }; destination?: { index: number } }) => void;
      };
      onDragEnd({ source: { index: 1 }, destination: { index: 0 } });
      expect(onReorder).toHaveBeenCalledWith([{ id: 2 }, { id: 1 }], items);
    });

    it('will provide a default callback for reordered if none is provided, which does nothing', () => {
      renderWithKibanaRenderContext(
        <ReorderableTable noItemsMessage={<p>No Items</p>} items={items} columns={columns} />
      );
      const { onDragEnd } = MockEuiDragDropContext.mock.calls[0][0] as unknown as {
        onDragEnd: (args: { source: { index: number }; destination?: { index: number } }) => void;
      };
      expect(() => onDragEnd({ source: { index: 0 }, destination: { index: 1 } })).not.toThrow();
    });

    it('will render items that cant be reordered', () => {
      const unreorderableItems = [{ id: 3 }];
      renderWithKibanaRenderContext(
        <ReorderableTable
          noItemsMessage={<p>No Items</p>}
          items={items}
          unreorderableItems={unreorderableItems}
          columns={columns}
        />
      );
      // header(1) + 2 draggable rows + 1 unreorderable row = 4 total role="row" elements
      const rows = screen.getAllByRole('row');
      expect(rows).toHaveLength(4);
      // Unreorderable row is at aria-rowindex=4 (items.length + itemIndex + rowIndexOffset = 2+0+2)
      expect(rows[3]).toHaveAttribute('aria-rowindex', '4');
    });

    it('will render bottom rows that cant be reordered', () => {
      const bottomRows = [<div />, <div />];
      renderWithKibanaRenderContext(
        <ReorderableTable
          noItemsMessage={<p>No Items</p>}
          items={items}
          bottomRows={bottomRows}
          columns={columns}
        />
      );
      // header(1) + 2 draggable rows + 2 bottom rows = 5 total role="row" elements
      const rows = screen.getAllByRole('row');
      expect(rows).toHaveLength(5);
      expect(rows[3]).toHaveAttribute('aria-rowindex', '4');
      expect(rows[4]).toHaveAttribute('aria-rowindex', '5');
    });
  });

  describe('when reorderable is turned off on the table', () => {
    it('renders a table with a header and non-reorderable rows', () => {
      renderWithKibanaRenderContext(
        <ReorderableTable
          noItemsMessage={<p>No Items</p>}
          items={items}
          columns={columns}
          disableReordering
        />
      );
      // No drag handles when reordering is disabled
      expect(screen.queryAllByTestId('dragHandle')).toHaveLength(0);
      // Items are still rendered at correct row indices
      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveAttribute('aria-rowindex', '2');
      expect(rows[2]).toHaveAttribute('aria-rowindex', '3');
    });

    it('can append additional properties to each row, which can be dynamically calculated from the item in that row', () => {
      renderWithKibanaRenderContext(
        <ReorderableTable
          noItemsMessage={<p>No Items</p>}
          items={items}
          columns={columns}
          rowProps={(item) => ({
            className: `someClassName_${item.id}`,
          })}
          disableReordering
        />
      );
      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveClass('someClassName_1');
      expect(rows[2]).toHaveClass('someClassName_2');
    });
  });

  it('appends an additional className if specified', () => {
    const { container } = renderWithKibanaRenderContext(
      <ReorderableTable noItemsMessage={<p>No Items</p>} items={[]} columns={[]} className="foo" />
    );
    expect(container.firstChild).toHaveClass('foo');
  });

  it('will show a no items message when there are no items', () => {
    renderWithKibanaRenderContext(
      <ReorderableTable noItemsMessage={<p>No Items</p>} items={[]} columns={columns} />
    );
    expect(screen.getByTestId('NoItems')).toBeInTheDocument();
    // Only the header row is rendered, no body rows
    expect(screen.getAllByRole('row')).toHaveLength(1);
  });
});
