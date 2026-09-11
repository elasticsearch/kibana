/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { ElasticRequestState } from '@kbn/unified-doc-viewer';
import { useEsDocSearch } from '@kbn/unified-doc-viewer-plugin/public';
import { useDataView } from '../../../data_view_manager/hooks/use_data_view';
import { useAlertsPrivileges } from '../../../detections/containers/detection_engine/alerts/use_alerts_privileges';
import { TestProviders } from '../../../common/mock';
import { DocumentFlyoutWrapper } from './document_flyout_wrapper';

jest.mock('@kbn/unified-doc-viewer-plugin/public');
jest.mock('../../../data_view_manager/hooks/use_data_view');
jest.mock('../../../detections/containers/detection_engine/alerts/use_alerts_privileges');

interface MockDocumentFlyoutProps {
  hit?: DataTableRecord;
  dataTestSubj?: string;
  onAlertUpdated: () => void;
  isPaginationLoading?: boolean;
  unavailableDocumentCallout?: ReactNode;
}

// The stub renders `unavailableDocumentCallout` so tests can assert that the not-found/error
// state lands inside the mounted flyout body rather than replacing the whole panel.
const mockDocumentFlyout = jest.fn((props: MockDocumentFlyoutProps) => (
  <div data-test-subj="documentFlyoutStub">{props.unavailableDocumentCallout}</div>
));
jest.mock('.', () => ({
  DocumentFlyout: (props: MockDocumentFlyoutProps) => mockDocumentFlyout(props),
}));

// `_id` matters: the wrapper tells "still resolving the next document" from "showing the
// requested one" by comparing the rendered hit's `_id` with the requested document id.
const createHit = (id: string, eventKind: string = 'event'): DataTableRecord =>
  ({
    id,
    raw: { _id: id },
    flattened: { 'event.kind': eventKind },
    isAnchor: false,
  } as DataTableRecord);

const createAlertHit = (): DataTableRecord => createHit('doc-id', 'signal');

const mockDataView = {
  hasMatchedIndices: () => true,
  getIndexPattern: () => 'logs-*',
};

const renderDocumentFlyoutWrapper = (
  props: Partial<React.ComponentProps<typeof DocumentFlyoutWrapper>> = {}
) =>
  render(
    <TestProviders>
      <DocumentFlyoutWrapper
        documentId="doc-id"
        indexName="my-index"
        renderCellActions={jest.fn()}
        onAlertUpdated={jest.fn()}
        {...props}
      />
    </TestProviders>
  );

describe('DocumentFlyoutWrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useDataView as jest.Mock).mockReturnValue({
      status: 'ready',
      dataView: mockDataView,
    });
    (useEsDocSearch as jest.Mock).mockReturnValue([ElasticRequestState.Loading, null, jest.fn()]);
    (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasAlertsRead: true, loading: false });
  });

  it('fetches clicked document using document id and index', () => {
    renderDocumentFlyoutWrapper();

    expect(useEsDocSearch).toHaveBeenCalledWith({
      id: 'doc-id',
      index: 'my-index',
      dataView: mockDataView,
      skip: false,
    });
  });

  it('renders loading while data view is loading', () => {
    (useDataView as jest.Mock).mockReturnValue({
      status: 'loading',
      dataView: mockDataView,
    });

    const { getByTestId } = renderDocumentFlyoutWrapper();

    expect(getByTestId('document-overview-wrapper-loading')).toBeInTheDocument();
    expect(useEsDocSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: true,
      })
    );
  });

  it('renders loading while alerts privileges are loading for an alert', () => {
    const alertHit = createAlertHit();
    (useEsDocSearch as jest.Mock).mockReturnValue([ElasticRequestState.Found, alertHit, jest.fn()]);
    (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasAlertsRead: false, loading: true });

    const { getByTestId } = renderDocumentFlyoutWrapper();

    expect(getByTestId('document-overview-wrapper-loading')).toBeInTheDocument();
  });

  it('does not render loading when alerts privileges are loading but document is not an alert', () => {
    const nonAlertHit = createHit('doc-id');
    (useEsDocSearch as jest.Mock).mockReturnValue([
      ElasticRequestState.Found,
      nonAlertHit,
      jest.fn(),
    ]);
    (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasAlertsRead: false, loading: true });

    const { getByTestId, queryByTestId } = renderDocumentFlyoutWrapper();

    expect(queryByTestId('document-overview-wrapper-loading')).not.toBeInTheDocument();
    expect(getByTestId('documentFlyoutStub')).toBeInTheDocument();
  });

  it('renders DocumentFlyout when document is found', () => {
    const hit = createHit('doc-id');
    const refetchDocument = jest.fn();
    const onAlertUpdated = jest.fn();
    (useEsDocSearch as jest.Mock).mockReturnValue([
      ElasticRequestState.Found,
      hit,
      refetchDocument,
    ]);

    const { getByTestId } = renderDocumentFlyoutWrapper({
      onAlertUpdated,
      dataTestSubj: 'childDocumentFlyout',
    });

    expect(getByTestId('documentFlyoutStub')).toBeInTheDocument();
    expect(mockDocumentFlyout).toHaveBeenCalledWith(
      expect.objectContaining({
        hit,
        dataTestSubj: 'childDocumentFlyout',
        onAlertUpdated: expect.any(Function),
      })
    );

    const latestProps = mockDocumentFlyout.mock.calls.at(-1)?.[0] as {
      onAlertUpdated: () => void;
    };

    latestProps.onAlertUpdated();

    expect(onAlertUpdated).toHaveBeenCalledTimes(1);
    expect(refetchDocument).toHaveBeenCalledTimes(1);
  });

  it('renders a standalone not-found state when no document has ever resolved', () => {
    (useEsDocSearch as jest.Mock).mockReturnValue([ElasticRequestState.NotFound, null, jest.fn()]);

    const { getByTestId, queryByTestId } = renderDocumentFlyoutWrapper();

    expect(getByTestId('document-overview-wrapper-not-found')).toBeInTheDocument();
    expect(queryByTestId('documentFlyoutStub')).not.toBeInTheDocument();
  });

  it('renders a standalone error state when no document has ever resolved', () => {
    (useEsDocSearch as jest.Mock).mockReturnValue([ElasticRequestState.Error, null, jest.fn()]);

    const { getByTestId, queryByTestId } = renderDocumentFlyoutWrapper();

    expect(getByTestId('document-overview-fetch-error')).toBeInTheDocument();
    expect(queryByTestId('documentFlyoutStub')).not.toBeInTheDocument();
  });

  it('renders data view error when the data view failed to load', () => {
    (useDataView as jest.Mock).mockReturnValue({
      status: 'error',
      dataView: mockDataView,
    });
    (useEsDocSearch as jest.Mock).mockReturnValue([ElasticRequestState.NotFound, null, jest.fn()]);

    const { getByTestId } = renderDocumentFlyoutWrapper();

    expect(getByTestId('document-overview-wrapper-data-view-error')).toBeInTheDocument();
    expect(useEsDocSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: true,
      })
    );
  });

  it('still fetches the document when the data view has no matched indices', () => {
    const hit = createHit('doc-id');
    const degradedDataView = {
      ...mockDataView,
      hasMatchedIndices: () => false,
    };
    (useDataView as jest.Mock).mockReturnValue({
      status: 'ready',
      dataView: degradedDataView,
    });
    (useEsDocSearch as jest.Mock).mockReturnValue([ElasticRequestState.Found, hit, jest.fn()]);

    const { getByTestId } = renderDocumentFlyoutWrapper();

    expect(useEsDocSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: false,
      })
    );
    expect(getByTestId('document-overview-wrapper-data-view-degraded')).toBeInTheDocument();
    expect(getByTestId('documentFlyoutStub')).toBeInTheDocument();
  });

  it('renders the loading state when the request reports found before any hit has arrived', () => {
    (useEsDocSearch as jest.Mock).mockReturnValue([ElasticRequestState.Found, null, jest.fn()]);

    const { getByTestId, queryByTestId } = renderDocumentFlyoutWrapper();

    expect(getByTestId('document-overview-wrapper-loading')).toBeInTheDocument();
    expect(queryByTestId('documentFlyoutStub')).not.toBeInTheDocument();
    expect(queryByTestId('document-overview-fetch-error')).not.toBeInTheDocument();
    expect(queryByTestId('document-overview-wrapper-not-found')).not.toBeInTheDocument();
  });

  it('keeps the previously resolved document mounted while a new one is loading', () => {
    const firstHit = createHit('doc-id');
    (useEsDocSearch as jest.Mock).mockReturnValue([ElasticRequestState.Found, firstHit, jest.fn()]);

    const { rerender, getByTestId, queryByTestId } = renderDocumentFlyoutWrapper();

    expect(getByTestId('documentFlyoutStub')).toBeInTheDocument();
    expect(mockDocumentFlyout).toHaveBeenLastCalledWith(
      expect.objectContaining({ hit: firstHit, isPaginationLoading: false })
    );

    // `useEsDocSearch` doesn't report `Loading` again while it fetches the newly requested
    // document: it keeps returning `Found` with the document it resolved last. The flyout must
    // stay mounted (so the header keeps its pagination controls) but be told that what it renders
    // is no longer the requested document, otherwise the previous one stays fully rendered while
    // the pagination control already points at the new position.
    rerender(
      <TestProviders>
        <DocumentFlyoutWrapper
          documentId="doc-id-2"
          indexName="my-index"
          renderCellActions={jest.fn()}
          onAlertUpdated={jest.fn()}
        />
      </TestProviders>
    );

    expect(queryByTestId('document-overview-wrapper-loading')).not.toBeInTheDocument();
    expect(getByTestId('documentFlyoutStub')).toBeInTheDocument();
    expect(mockDocumentFlyout).toHaveBeenLastCalledWith(
      expect.objectContaining({ hit: firstHit, isPaginationLoading: true })
    );
  });

  it('does not report loading while the current document is refetched after a mutation', () => {
    const hit = createHit('doc-id');
    (useEsDocSearch as jest.Mock).mockReturnValue([ElasticRequestState.Found, hit, jest.fn()]);

    const { rerender } = renderDocumentFlyoutWrapper();

    rerender(
      <TestProviders>
        <DocumentFlyoutWrapper
          documentId="doc-id"
          indexName="my-index"
          renderCellActions={jest.fn()}
          onAlertUpdated={jest.fn()}
        />
      </TestProviders>
    );

    expect(mockDocumentFlyout).toHaveBeenLastCalledWith(
      expect.objectContaining({ hit, isPaginationLoading: false })
    );
  });

  it.each([
    [ElasticRequestState.NotFound, 'document-overview-wrapper-not-found'],
    [ElasticRequestState.Error, 'document-overview-fetch-error'],
  ])(
    'keeps the previously resolved document mounted and moves the %s state into its body',
    (requestState, calloutTestSubj) => {
      const firstHit = createHit('doc-id');
      (useEsDocSearch as jest.Mock).mockReturnValue([
        ElasticRequestState.Found,
        firstHit,
        jest.fn(),
      ]);

      const { rerender, getByTestId } = renderDocumentFlyoutWrapper();

      expect(getByTestId('documentFlyoutStub')).toBeInTheDocument();

      // Paginating onto a document that no longer resolves (deleted, or moved out of its index)
      // must not replace the whole panel: the header — and with it the pagination controls the
      // user needs to step back — stays mounted around the last document that did resolve.
      (useEsDocSearch as jest.Mock).mockReturnValue([requestState, null, jest.fn()]);

      rerender(
        <TestProviders>
          <DocumentFlyoutWrapper
            documentId="deleted-doc-id"
            indexName="my-index"
            renderCellActions={jest.fn()}
            onAlertUpdated={jest.fn()}
          />
        </TestProviders>
      );

      expect(getByTestId('documentFlyoutStub')).toBeInTheDocument();
      expect(getByTestId(calloutTestSubj)).toBeInTheDocument();
      expect(mockDocumentFlyout).toHaveBeenLastCalledWith(
        expect.objectContaining({
          hit: firstHit,
          unavailableDocumentCallout: expect.anything(),
        })
      );
    }
  );

  it('renders the cold loading state when no document has been resolved yet', () => {
    (useEsDocSearch as jest.Mock).mockReturnValue([ElasticRequestState.Loading, null, jest.fn()]);

    const { getByTestId, queryByTestId } = renderDocumentFlyoutWrapper();

    expect(getByTestId('document-overview-wrapper-loading')).toBeInTheDocument();
    expect(queryByTestId('documentFlyoutStub')).not.toBeInTheDocument();
  });

  it('renders FlyoutMissingAlertsPrivilege when document is an alert and user lacks alerts read privilege', () => {
    const alertHit = createAlertHit();
    (useEsDocSearch as jest.Mock).mockReturnValue([ElasticRequestState.Found, alertHit, jest.fn()]);
    (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasAlertsRead: false, loading: false });

    const { getByTestId, queryByTestId } = renderDocumentFlyoutWrapper();

    expect(getByTestId('noPrivilegesPage')).toBeInTheDocument();
    expect(queryByTestId('documentFlyoutStub')).not.toBeInTheDocument();
  });
});
