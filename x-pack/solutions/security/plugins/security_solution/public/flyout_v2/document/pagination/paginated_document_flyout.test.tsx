/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, render } from '@testing-library/react';
import { PaginatedDocumentFlyout } from './paginated_document_flyout';
import { PaginationStoreProvider } from './context';
import { createPaginationStore } from './store';

const mockDocumentFlyoutWrapper = jest.fn((props: unknown) => (
  <div data-test-subj="documentFlyoutWrapperStub" />
));
jest.mock('../main/document_flyout_wrapper', () => ({
  DocumentFlyoutWrapper: (props: unknown) => mockDocumentFlyoutWrapper(props),
}));

describe('PaginatedDocumentFlyout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderWithStore = (store: ReturnType<typeof createPaginationStore>) =>
    render(
      <PaginationStoreProvider value={store}>
        <PaginatedDocumentFlyout renderCellActions={jest.fn()} onAlertUpdated={jest.fn()} />
      </PaginationStoreProvider>
    );

  it('resolves the document by id and index rather than from the source row', () => {
    const store = createPaginationStore();
    act(() => {
      store.setState({
        flyoutDocumentIndex: 0,
        flyoutDocumentId: 'alert-1',
        flyoutDocumentIndexName: 'index-1',
      });
    });

    renderWithStore(store);

    expect(mockDocumentFlyoutWrapper).toHaveBeenLastCalledWith(
      expect.objectContaining({
        documentId: 'alert-1',
        indexName: 'index-1',
        isPaginationLoading: false,
      })
    );
  });

  it('keeps the previously displayed document while a cross-page document is loading', () => {
    const store = createPaginationStore();
    act(() => {
      store.setState({
        flyoutDocumentIndex: 0,
        flyoutDocumentId: 'alert-1',
        flyoutDocumentIndexName: 'index-1',
      });
    });

    renderWithStore(store);

    act(() => {
      store.setState({ flyoutDocumentIndex: 60, isFlyoutDocumentLoading: true });
    });

    expect(mockDocumentFlyoutWrapper).toHaveBeenLastCalledWith(
      expect.objectContaining({
        documentId: 'alert-1',
        indexName: 'index-1',
        isPaginationLoading: true,
      })
    );
  });

  it('passes no document when the slice is empty', () => {
    renderWithStore(createPaginationStore());

    expect(mockDocumentFlyoutWrapper).toHaveBeenLastCalledWith(
      expect.objectContaining({ documentId: undefined, indexName: undefined })
    );
  });

  it('renders an error instead of the previously displayed document when the cross-page query errors', () => {
    const store = createPaginationStore();
    act(() => {
      store.setState({
        flyoutDocumentIndex: 0,
        flyoutDocumentId: 'alert-1',
        flyoutDocumentIndexName: 'index-1',
      });
    });

    const { getByTestId, queryByTestId } = renderWithStore(store);

    act(() => {
      store.setState({ flyoutDocumentIndex: 60, hasFlyoutQueryError: true });
    });

    expect(getByTestId('securitySolutionFlyoutV2PaginationQueryError')).toBeInTheDocument();
    expect(queryByTestId('documentFlyoutWrapperStub')).not.toBeInTheDocument();
  });
});
