/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, render } from '@testing-library/react';
import { PaginatedTimelineDocumentFlyout } from './paginated_timeline_document_flyout';
import {
  __resetFlyoutPaginationStoreForTests,
  flyoutPaginationStore,
} from '../../common/utils/flyout_pagination/store';

const mockDocumentFlyoutWrapper = jest.fn(
  ({ documentId, indexName }: { documentId?: string; indexName?: string }) => (
    <div
      data-test-subj="mock-document-flyout-wrapper"
      data-document-id={documentId}
      data-index-name={indexName}
    />
  )
);

jest.mock('./main/document_flyout_wrapper', () => ({
  DocumentFlyoutWrapper: (props: { documentId?: string; indexName?: string }) =>
    mockDocumentFlyoutWrapper(props),
}));

const INSTANCE_ID = 'test-timeline-instance-uuid';

describe('<PaginatedTimelineDocumentFlyout />', () => {
  const onAlertUpdated = jest.fn();

  beforeEach(() => {
    __resetFlyoutPaginationStoreForTests();
    mockDocumentFlyoutWrapper.mockClear();
    onAlertUpdated.mockClear();
  });

  it('renders nothing when no flyoutDocumentRef is set', () => {
    const { queryByTestId } = render(
      <PaginatedTimelineDocumentFlyout
        paginationInstanceId={INSTANCE_ID}
        onAlertUpdated={onAlertUpdated}
      />
    );

    expect(queryByTestId('mock-document-flyout-wrapper')).not.toBeInTheDocument();
  });

  it('renders DocumentFlyoutWrapper with documentId/indexName from the store', () => {
    act(() => {
      flyoutPaginationStore.setSlice(INSTANCE_ID, {
        flyoutDocumentRef: { id: 'event-1', indexName: 'logs-*' },
      });
    });

    const { getByTestId } = render(
      <PaginatedTimelineDocumentFlyout
        paginationInstanceId={INSTANCE_ID}
        onAlertUpdated={onAlertUpdated}
      />
    );

    const wrapper = getByTestId('mock-document-flyout-wrapper');
    expect(wrapper).toHaveAttribute('data-document-id', 'event-1');
    expect(wrapper).toHaveAttribute('data-index-name', 'logs-*');
    expect(mockDocumentFlyoutWrapper).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'event-1',
        indexName: 'logs-*',
        onAlertUpdated,
      })
    );
  });

  it('re-renders DocumentFlyoutWrapper when flyoutDocumentRef changes', () => {
    act(() => {
      flyoutPaginationStore.setSlice(INSTANCE_ID, {
        flyoutDocumentRef: { id: 'event-1', indexName: 'logs-*' },
      });
    });
    const { getByTestId } = render(
      <PaginatedTimelineDocumentFlyout
        paginationInstanceId={INSTANCE_ID}
        onAlertUpdated={onAlertUpdated}
      />
    );
    expect(getByTestId('mock-document-flyout-wrapper')).toHaveAttribute(
      'data-document-id',
      'event-1'
    );

    act(() => {
      flyoutPaginationStore.setSlice(INSTANCE_ID, {
        flyoutDocumentRef: { id: 'event-2', indexName: 'logs-*' },
      });
    });

    expect(getByTestId('mock-document-flyout-wrapper')).toHaveAttribute(
      'data-document-id',
      'event-2'
    );
  });

  it('renders nothing when a different instance id has the ref', () => {
    act(() => {
      flyoutPaginationStore.setSlice('other-timeline', {
        flyoutDocumentRef: { id: 'event-1', indexName: 'logs-*' },
      });
    });

    const { queryByTestId } = render(
      <PaginatedTimelineDocumentFlyout
        paginationInstanceId={INSTANCE_ID}
        onAlertUpdated={onAlertUpdated}
      />
    );
    expect(queryByTestId('mock-document-flyout-wrapper')).not.toBeInTheDocument();
  });
});
