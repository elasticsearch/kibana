/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { screen } from '@testing-library/react';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { setMockActions, setMockValues } from '../../../../__mocks__';
import { EditingColumn } from './editing_column';

describe('EditingColumn', () => {
  const column = {
    name: 'foo',
    field: 'foo',
    render: jest.fn(),
    editingRender: jest.fn().mockReturnValue(<div data-test-subj="editing-view" />),
  };

  const requiredProps = {
    column,
  };

  const mockValues = {
    editingItemValue: { id: 1 },
    fieldErrors: {},
    rowErrors: [],
  };

  const mockActions = {
    setEditingItemValue: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setMockActions(mockActions);
    setMockValues(mockValues);
  });

  it('renders', () => {
    renderWithKibanaRenderContext(<EditingColumn {...requiredProps} />);
    expect(screen.getByTestId('editing-view')).toBeInTheDocument();
  });

  describe('when there is a form error for this field', () => {
    beforeEach(() => {
      setMockValues({
        ...mockValues,
        fieldErrors: {
          foo: 'I am an error for foo and should be displayed',
        },
      });
    });

    it('renders field errors for this field if any are present', () => {
      renderWithKibanaRenderContext(
        <EditingColumn {...requiredProps} column={{ ...column, field: 'foo' }} />
      );
      expect(screen.getByText('I am an error for foo and should be displayed')).toBeInTheDocument();
    });

    it('renders as invalid', () => {
      renderWithKibanaRenderContext(
        <EditingColumn {...requiredProps} column={{ ...column, field: 'foo' }} />
      );
      // isInvalid is forwarded to editingRender as the third argument
      expect(column.editingRender.mock.calls[0][2]).toMatchObject({ isInvalid: true });
    });
  });

  describe('when there is a form error for this row', () => {
    beforeEach(() => {
      setMockValues({
        ...mockValues,
        rowErrors: ['I am an error for this row'],
      });
    });

    it('renders as invalid', () => {
      renderWithKibanaRenderContext(<EditingColumn {...requiredProps} />);
      // isInvalid is forwarded to editingRender as the third argument
      expect(column.editingRender.mock.calls[0][2]).toMatchObject({ isInvalid: true });
    });
  });

  it('renders nothing if there is no editingItemValue in state', () => {
    setMockValues({
      ...mockValues,
      editingItemValue: null,
    });

    const { container } = renderWithKibanaRenderContext(<EditingColumn {...requiredProps} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the column\'s "editing" view (editingRender)', () => {
    setMockValues({
      ...mockValues,
      editingItemValue: { id: 1, foo: 'foo', bar: 'bar' },
      fieldErrors: { foo: ['I am an error for foo'] },
    });

    renderWithKibanaRenderContext(
      <EditingColumn
        {...{
          ...requiredProps,
          column: {
            ...column,
            field: 'foo',
          },
          isLoading: true,
        }}
      />
    );
    expect(screen.getByTestId('editing-view')).toBeInTheDocument();

    expect(column.editingRender).toHaveBeenCalled();
    // The render function is provided with the item currently being edited for rendering
    expect(column.editingRender.mock.calls[0][0]).toEqual({ id: 1, foo: 'foo', bar: 'bar' });

    // The render function is provided with a callback function to save the value once editing is finished
    const callback = column.editingRender.mock.calls[0][1];
    callback('someNewValue');
    expect(mockActions.setEditingItemValue).toHaveBeenCalledWith({
      id: 1,
      // foo is the 'field' this column is associated with, so that field is updated with the new value
      foo: 'someNewValue',
      bar: 'bar',
    });

    // The render function is provided with additional properties
    expect(column.editingRender.mock.calls[0][2]).toEqual({
      isInvalid: true, // Because there errors for 'foo'
      isLoading: true, // Because isLoading was passed as true to this prop
    });
  });
});
