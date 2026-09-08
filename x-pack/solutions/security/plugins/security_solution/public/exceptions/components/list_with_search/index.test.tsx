/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fireEvent, render } from '@testing-library/react';
import React from 'react';

import { getExceptionListSchemaMock } from '@kbn/lists-plugin/common/schemas/response/exception_list_schema.mock';
import { getExceptionListItemSchemaMock } from '@kbn/lists-plugin/common/schemas/response/exception_list_item_schema.mock';

import { ListWithSearch } from '.';
import { useListWithSearchComponent } from '../../hooks/use_list_with_search';
import { TestProviders } from '../../../common/mock';

jest.mock('../../hooks/use_list_with_search');
jest.mock('../../hooks/use_endpoint_exceptions_capability', () => ({
  useEndpointExceptionsCapability: jest.fn().mockReturnValue(true),
}));
jest.mock('../../../common/components/user_privileges', () => ({
  useUserPrivileges: jest.fn().mockReturnValue({
    rulesPrivileges: { exceptions: { edit: true, read: true } },
  }),
}));

const getMockUseListWithSearchComponent = () => ({
  exceptionViewerStatus: '',
  listName: 'Exception list',
  exceptions: [{ ...getExceptionListItemSchemaMock() }],
  listType: 'detection',
  lastUpdated: null,
  pagination: { pageIndex: 0, pageSize: 5, totalItemCount: 1 },
  viewerStatus: '',
  emptyViewerTitle: 'Empty View',
  emptyViewerBody: 'This is the empty view description.',
  emptyViewerButtonText: 'Take action',
  ruleReferences: {},
  showAddExceptionFlyout: false,
  showEditExceptionFlyout: false,
  exceptionToEdit: undefined,
  onSearch: jest.fn(),
  onAddExceptionClick: jest.fn(),
  onDeleteException: jest.fn(),
  onEditExceptionItem: jest.fn(),
  onPaginationChange: jest.fn(),
  handleCancelExceptionItemFlyout: jest.fn(),
  handleConfirmExceptionFlyout: jest.fn(),
});

describe('ListWithSearch', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const renderListAndOpenDeleteModal = (onDeleteException: jest.Mock) => {
    (useListWithSearchComponent as jest.Mock).mockReturnValue({
      ...getMockUseListWithSearchComponent(),
      onDeleteException,
    });

    const wrapper = render(
      <TestProviders>
        <ListWithSearch list={getExceptionListSchemaMock()} isReadOnly={false} />
      </TestProviders>
    );

    fireEvent.click(wrapper.getByTestId('exceptionItemCardHeaderButtonIcon'));
    fireEvent.click(wrapper.getByTestId('exceptionItemCardHeaderActionItemdelete'));

    return wrapper;
  };

  it('shows the delete confirmation modal without deleting the item', () => {
    const onDeleteException = jest.fn();
    const wrapper = renderListAndOpenDeleteModal(onDeleteException);

    expect(wrapper.getByTestId('exceptionItemDeleteConfirmModal')).toBeTruthy();
    expect(onDeleteException).not.toHaveBeenCalled();
  });

  it('deletes the item on confirm', () => {
    const onDeleteException = jest.fn();
    const wrapper = renderListAndOpenDeleteModal(onDeleteException);

    fireEvent.click(wrapper.getByTestId('confirmModalConfirmButton'));

    const exceptionItem = getExceptionListItemSchemaMock();
    expect(onDeleteException).toHaveBeenCalledWith({
      id: exceptionItem.id,
      name: exceptionItem.name,
      namespaceType: exceptionItem.namespace_type,
    });
    expect(wrapper.queryByTestId('exceptionItemDeleteConfirmModal')).toBeNull();
  });

  it('does not delete the item on cancel', () => {
    const onDeleteException = jest.fn();
    const wrapper = renderListAndOpenDeleteModal(onDeleteException);

    fireEvent.click(wrapper.getByTestId('confirmModalCancelButton'));

    expect(onDeleteException).not.toHaveBeenCalled();
    expect(wrapper.queryByTestId('exceptionItemDeleteConfirmModal')).toBeNull();
  });
});
