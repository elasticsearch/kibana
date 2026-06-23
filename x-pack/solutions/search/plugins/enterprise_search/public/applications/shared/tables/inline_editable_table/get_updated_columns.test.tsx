/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '../../../__mocks__/kea_logic';

import React from 'react';

jest.mock('./action_column', () => ({
  ActionColumn: jest.fn(() => null),
}));
jest.mock('./editing_column', () => ({
  EditingColumn: jest.fn(() => null),
}));

import { render } from '@testing-library/react';

import type { Column } from '../reorderable_table/types';

import { ActionColumn } from './action_column';
import { EditingColumn } from './editing_column';
import { getUpdatedColumns } from './get_updated_columns';
import type { InlineEditableTableColumn } from './types';

interface Foo {
  id: number;
}

describe('getUpdatedColumns', () => {
  const displayedItems: Foo[] = [];
  const canRemoveLastItem = true;
  const lastItemWarning = 'I am a warning';
  const uneditableItems: Foo[] = [];
  const item = { id: 1 };

  const MockActionColumn = jest.mocked(ActionColumn);
  const MockEditingColumn = jest.mocked(EditingColumn);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('it takes an array of InlineEditableTableColumn columns and turns them into ReorderableTable Columns', () => {
    const columns: Array<InlineEditableTableColumn<Foo>> = [
      {
        name: 'Foo',
        editingRender: jest.fn(),
        render: jest.fn(),
        field: 'foo',
      },
      {
        name: 'Bar',
        editingRender: jest.fn(),
        render: jest.fn(),
        field: 'bar',
      },
    ];
    let newColumns: Array<Column<Foo>> = [];

    beforeAll(() => {
      newColumns = getUpdatedColumns({
        columns,
        displayedItems,
        canRemoveLastItem,
        lastItemWarning,
        uneditableItems,
        isActivelyEditing: () => true,
      });
    });

    it('converts the columns to Column objects', () => {
      expect(newColumns[0]).toEqual({
        name: 'Foo',
        render: expect.any(Function),
      });
      expect(newColumns[1]).toEqual({
        name: 'Bar',
        render: expect.any(Function),
      });
    });

    it('appends an action column at the end', () => {
      expect(newColumns[2]).toEqual({
        flexBasis: '200px',
        flexGrow: 0,
        render: expect.any(Function),
      });

      render(<div>{newColumns[2].render(item)}</div>);
      expect(MockActionColumn.mock.calls[0][0]).toEqual({
        isActivelyEditing: expect.any(Function),
        displayedItems,
        emptyPropertyAllowed: false,
        isLoading: false,
        canRemoveLastItem,
        lastItemWarning,
        uneditableItems,
        item,
      });
    });
  });

  describe("the converted column's render prop", () => {
    const columns: Array<InlineEditableTableColumn<Foo>> = [
      {
        name: 'Foo',
        editingRender: jest.fn(),
        render: jest.fn(),
        field: 'foo',
      },
    ];

    it("renders with the passed column's editingRender function when the user is actively editing", () => {
      const newColumns = getUpdatedColumns({
        columns,
        displayedItems,
        isLoading: true,
        isActivelyEditing: () => true,
      });

      render(<div>{newColumns[0].render(item)}</div>);
      expect(MockEditingColumn.mock.calls[0][0]).toEqual({
        column: columns[0],
        isLoading: true,
      });
    });

    it("renders with the passed column's render function when the user is NOT actively editing", () => {
      const newColumns = getUpdatedColumns({
        columns,
        displayedItems,
        isActivelyEditing: () => false,
      });

      newColumns[0].render(item);
      expect(columns[0].render).toHaveBeenCalledWith(item);
    });
  });
});
