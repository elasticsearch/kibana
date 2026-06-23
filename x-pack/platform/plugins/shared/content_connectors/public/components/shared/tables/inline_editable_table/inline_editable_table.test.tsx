/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

jest.mock('./get_updated_columns', () => ({
  getUpdatedColumns: jest.fn(),
}));
jest.mock('../reorderable_table', () => ({
  ReorderableTable: jest.fn(() => null),
}));

import { screen } from '@testing-library/react';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';
import { setMockActions, setMockValues } from '../../../../__mocks__';

import { ReorderableTable } from '../reorderable_table';
import { getUpdatedColumns } from './get_updated_columns';

import { InlineEditableTable, InlineEditableTableContents } from './inline_editable_table';

const items = [{ id: 1 }, { id: 2 }];
const requiredParams = {
  columns: [],
  items,
  title: 'Some Title',
};

interface Foo {
  id: number;
}

describe('InlineEditableTable', () => {
  const mockValues = {};
  const mockActions = { editNewItem: jest.fn(), reorderItems: jest.fn() };

  const MockReorderableTable = jest.mocked(ReorderableTable);

  beforeEach(() => {
    jest.clearAllMocks();
    setMockValues(mockValues);
    setMockActions(mockActions);
  });

  it('wraps the table in a bound logic, and passes through only required props to the underlying component', () => {
    const instanceId = 'MyInstance';
    const onAdd = jest.fn();
    const onDelete = jest.fn();
    const onReorder = jest.fn();
    const onUpdate = jest.fn();
    const transformItem = jest.fn();
    const validateItem = jest.fn();

    renderWithKibanaRenderContext(
      <InlineEditableTable
        {...requiredParams}
        instanceId={instanceId}
        onAdd={onAdd}
        onDelete={onDelete}
        onReorder={onReorder}
        onUpdate={onUpdate}
        transformItem={transformItem}
        validateItem={validateItem}
      />
    );

    // InlineEditableTableContents should receive requiredParams only, not logic-specific props
    const tableProps = MockReorderableTable.mock.calls[0][0];
    expect(tableProps).not.toHaveProperty('onAdd');
    expect(tableProps).not.toHaveProperty('instanceId');
    expect(tableProps).not.toHaveProperty('onDelete');
    // Title and items are forwarded
    expect(screen.getByTestId('inlineEditableTableTitle')).toHaveTextContent(requiredParams.title);
  });

  it('renders a ReorderableTable', () => {
    renderWithKibanaRenderContext(
      <InlineEditableTableContents {...requiredParams} items={items} />
    );

    expect(MockReorderableTable).toHaveBeenCalled();
    expect(MockReorderableTable.mock.calls[0][0].items).toEqual(items);
    expect(screen.getByTestId('inlineEditableTableActionButton')).toHaveTextContent('New row');
  });

  it('renders a title if one is provided', () => {
    renderWithKibanaRenderContext(
      <InlineEditableTableContents {...requiredParams} description={<p>Some Description</p>} />
    );
    expect(screen.getByTestId('inlineEditableTableTitle')).toHaveTextContent(requiredParams.title);
  });

  it('does not render a title if none is provided', () => {
    renderWithKibanaRenderContext(
      <InlineEditableTableContents
        {...{ ...requiredParams, title: '' }}
        description={<p>Some Description</p>}
      />
    );
    expect(screen.getByTestId('inlineEditableTableTitle').textContent?.trim()).toBe('');
  });

  it('renders a description if one is provided', () => {
    renderWithKibanaRenderContext(
      <InlineEditableTableContents {...requiredParams} description={<p>Some Description</p>} />
    );
    expect(screen.getByTestId('pageIntroductionDescriptionText')).toHaveTextContent(
      'Some Description'
    );
  });

  it('renders no description if none is provided', () => {
    renderWithKibanaRenderContext(<InlineEditableTableContents {...requiredParams} />);
    expect(screen.queryByTestId('inlineEditableTableDescription')).not.toBeInTheDocument();
  });

  it('can specify items in the table that are uneditable', () => {
    const uneditableItems = [{ id: 3 }];
    renderWithKibanaRenderContext(
      <InlineEditableTableContents {...requiredParams} uneditableItems={uneditableItems} />
    );
    expect(MockReorderableTable.mock.calls[0][0].unreorderableItems).toBe(uneditableItems);
  });

  it('can apply an additional className', () => {
    renderWithKibanaRenderContext(
      <InlineEditableTableContents {...requiredParams} className="myTestClassName" />
    );
    const className = MockReorderableTable.mock.calls[0][0].className as string;
    expect(className).toContain('editableTable');
    expect(className).toContain('myTestClassName');
  });

  it('will use the value of addButtonText as custom text on the New Row button', () => {
    renderWithKibanaRenderContext(
      <InlineEditableTableContents {...requiredParams} addButtonText="Add a new row custom text" />
    );
    expect(screen.getByTestId('inlineEditableTableActionButton')).toHaveTextContent(
      'Add a new row custom text'
    );
  });

  describe('when a user is editing an unsaved item', () => {
    beforeEach(() => setMockValues({ ...mockValues, isEditingUnsavedItem: true }));

    it('will change the displayed items to END with an empty item', () => {
      renderWithKibanaRenderContext(
        <InlineEditableTableContents {...requiredParams} items={items} />
      );
      expect(MockReorderableTable.mock.calls[0][0].items).toEqual([...items, { id: null }]);
    });

    it('will change the displayed items to START with an empty item when there are uneditableItems', () => {
      renderWithKibanaRenderContext(
        <InlineEditableTableContents
          {...requiredParams}
          items={items}
          uneditableItems={[{ id: 3 }]}
        />
      );
      expect(MockReorderableTable.mock.calls[0][0].items).toEqual([{ id: null }, ...items]);
    });
  });

  it('will style the row that is currently being edited', () => {
    setMockValues({ ...mockValues, isEditing: true, editingItemId: 2 });
    const itemList = [{ id: 1 }, { id: 2 }];
    renderWithKibanaRenderContext(
      <InlineEditableTableContents {...requiredParams} items={itemList} />
    );
    const rowProps = MockReorderableTable.mock.calls[0][0].rowProps as (item: any) => object;
    expect(rowProps(items[0])).toEqual({ className: '' });
    expect(rowProps(items[1])).toEqual({ className: 'is-being-edited' });
  });

  it('will pass errors for row that is currently being edited', () => {
    setMockValues({
      ...mockValues,
      isEditing: true,
      editingItemId: 2,
      rowErrors: ['first error', 'second error'],
    });
    const itemList = [{ id: 1 }, { id: 2 }];
    renderWithKibanaRenderContext(
      <InlineEditableTableContents {...requiredParams} items={itemList} />
    );
    const rowErrors = MockReorderableTable.mock.calls[0][0].rowErrors as (item: any) => object;
    expect(rowErrors(items[0])).toEqual(undefined);
    expect(rowErrors(items[1])).toEqual(['first error', 'second error']);
  });

  it('will update the passed columns and pass them through to the underlying table', () => {
    const updatedColumns = {};
    const canRemoveLastItem = true;
    const isLoading = true;
    const lastItemWarning = 'A warning';
    const uneditableItems: Foo[] = [];

    (getUpdatedColumns as jest.Mock).mockReturnValue(updatedColumns);
    renderWithKibanaRenderContext(
      <InlineEditableTableContents
        {...requiredParams}
        canRemoveLastItem={canRemoveLastItem}
        isLoading={isLoading}
        lastItemWarning={lastItemWarning}
        uneditableItems={uneditableItems}
      />
    );
    expect(MockReorderableTable.mock.calls[0][0].columns).toEqual(updatedColumns);

    expect(getUpdatedColumns).toHaveBeenCalledWith({
      columns: requiredParams.columns,
      displayedItems: items,
      isActivelyEditing: expect.any(Function),
      canRemoveLastItem,
      isLoading,
      lastItemWarning,
      uneditableItems,
      prevFocusRef: expect.objectContaining({ current: null }),
      emptyPropertyAllowed: undefined,
    });
  });
});
