/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { screen, fireEvent } from '@testing-library/react';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { setMockActions, setMockValues } from '../../../../__mocks__';
import { ActionColumn } from './action_column';

const requiredParams = {
  displayedItems: [],
  isActivelyEditing: () => false,
  item: { id: 1 },
};

describe('ActionColumn', () => {
  const mockValues = {
    doesEditingItemValueContainEmptyProperty: false,
    editingItemId: 1,
    fieldErrors: {},
    isEditing: false,
    isEditingUnsavedItem: false,
    rowErrors: [],
  };
  const mockActions = {
    editExistingItem: jest.fn(),
    deleteItem: jest.fn(),
    doneEditing: jest.fn(),
    saveExistingItem: jest.fn(),
    saveNewItem: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setMockValues(mockValues);
    setMockActions(mockActions);
  });

  it('renders', () => {
    const { container } = renderWithKibanaRenderContext(
      <ActionColumn
        displayedItems={[]}
        isActivelyEditing={() => false}
        isLoading={false}
        item={{ id: 1 }}
        canRemoveLastItem={false}
        lastItemWarning="I am a warning"
        uneditableItems={[]}
      />
    );
    expect(container.firstChild).not.toBeNull();
  });

  it('renders nothing if the item is an uneditableItem', () => {
    const item = { id: 1 };
    const { container } = renderWithKibanaRenderContext(
      <ActionColumn
        displayedItems={[]}
        isActivelyEditing={() => false}
        isLoading={false}
        item={item}
        canRemoveLastItem={false}
        lastItemWarning="I am a warning"
        uneditableItems={[item]}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  describe('when the user is actively editing', () => {
    const isActivelyEditing = () => true;
    const activelyEditingParams = {
      ...requiredParams,
      isActivelyEditing,
    };

    describe('it renders a save button', () => {
      it('which is disabled if data is loading', () => {
        renderWithKibanaRenderContext(<ActionColumn {...activelyEditingParams} isLoading />);
        expect(screen.getByTestId('saveButton')).toBeDisabled();
      });

      it('which is disabled if there are field errors', () => {
        setMockValues({ ...mockValues, fieldErrors: { foo: ['I am an error for foo'] } });
        renderWithKibanaRenderContext(<ActionColumn {...activelyEditingParams} />);
        expect(screen.getByTestId('saveButton')).toBeDisabled();
      });

      it('which is disabled if there are row errors', () => {
        setMockValues({ ...mockValues, rowErrors: ['I am a row error'] });
        renderWithKibanaRenderContext(<ActionColumn {...activelyEditingParams} />);
        expect(screen.getByTestId('saveButton')).toBeDisabled();
      });

      it('which is disabled if the item value contains an empty property', () => {
        setMockValues({ ...mockValues, doesEditingItemValueContainEmptyProperty: true });
        renderWithKibanaRenderContext(<ActionColumn {...activelyEditingParams} />);
        expect(screen.getByTestId('saveButton')).toBeDisabled();
      });

      it('which calls saveNewItem when clicked if the user is editing an unsaved item', () => {
        setMockValues({ ...mockValues, isEditingUnsavedItem: true });
        renderWithKibanaRenderContext(<ActionColumn {...activelyEditingParams} />);
        fireEvent.click(screen.getByTestId('saveButton'));
        expect(mockActions.saveNewItem).toHaveBeenCalled();
      });

      it('which calls saveExistingItem when clicked if the user is NOT editing an unsaved item', () => {
        setMockValues({ ...mockValues, isEditingUnsavedItem: false });
        renderWithKibanaRenderContext(<ActionColumn {...activelyEditingParams} />);
        fireEvent.click(screen.getByTestId('saveButton'));
        expect(mockActions.saveExistingItem).toHaveBeenCalled();
      });
    });

    describe('it renders a cancel button', () => {
      it('which is disabled if data is loading', () => {
        renderWithKibanaRenderContext(<ActionColumn {...activelyEditingParams} isLoading />);
        expect(screen.getByTestId('cancelButton')).toBeDisabled();
      });

      it('which calls doneEditing when clicked', () => {
        renderWithKibanaRenderContext(<ActionColumn {...activelyEditingParams} />);
        fireEvent.click(screen.getByTestId('cancelButton'));
        expect(mockActions.doneEditing).toHaveBeenCalled();
      });
    });
  });

  describe('when the user is NOT actively editing', () => {
    const item = { id: 2 };
    const mockValuesWhereUserIsNotActivelyEditing = { ...mockValues, isEditing: false };

    beforeEach(() => {
      setMockValues(mockValuesWhereUserIsNotActivelyEditing);
    });

    describe('it renders an edit button', () => {
      it('which calls editExistingItem when clicked', () => {
        renderWithKibanaRenderContext(<ActionColumn {...requiredParams} item={item} />);
        fireEvent.click(screen.getByTestId('editButton'));
        expect(mockActions.editExistingItem).toHaveBeenCalledWith(item);
      });
    });

    describe('it renders an delete button', () => {
      it('which calls deleteItem when clicked', () => {
        renderWithKibanaRenderContext(<ActionColumn {...requiredParams} item={item} />);
        fireEvent.click(screen.getByTestId('deleteButton'));
        expect(mockActions.deleteItem).toHaveBeenCalledWith(item);
      });

      it('which does not render if candRemoveLastItem is prevented and this is the last item', () => {
        renderWithKibanaRenderContext(
          <ActionColumn
            {...requiredParams}
            displayedItems={[item]}
            item={item}
            canRemoveLastItem={false}
          />
        );
        expect(screen.queryByTestId('deleteButton')).not.toBeInTheDocument();
      });
    });
  });
});
