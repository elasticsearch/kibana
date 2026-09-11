/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { type ForwardedRef } from 'react';
import { from, throwError } from 'rxjs';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { copyToClipboard, type EuiFlyoutProps } from '@elastic/eui';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import { buildDataTableRecord, type DataTableColumnsMeta } from '@kbn/discover-utils';
import { dataViewMock, esHitsMock } from '@kbn/discover-utils/src/__mocks__';
import type { DataTableRecord, EsHitRecord } from '@kbn/discover-utils/types';
import type { AggregateQuery, Query } from '@kbn/es-query';
import { constructCascadeQuery } from '@kbn/esql-utils';
import type { IKibanaSearchResponse } from '@kbn/search-types';
import { sharePluginMock } from '@kbn/share-plugin/public/mocks';
import { setUnifiedDocViewerServices } from '@kbn/unified-doc-viewer-plugin/public/plugin';
import { mockUnifiedDocViewerServices } from '@kbn/unified-doc-viewer-plugin/public/__mocks__';
import { createDiscoverServicesMock } from '../../../../__mocks__/services';
import type { DiscoverServices } from '../../../../build_services';
import { getDiscoverInternalStateMock } from '../../../../__mocks__/discover_state.mock';
import { DiscoverToolkitTestProvider } from '../../../../__mocks__/test_provider';
import { internalStateActions } from '../../state_management/redux';
import { FetchStatus } from '../../../types';
import { DiscoverDocumentFlyout } from './discover_document_flyout';
import {
  ExpandedDocLinkability,
  getExpandedDocLinkDisabledReason,
  type ExpandedDocRef,
} from '../../utils/expanded_doc';

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  const react = jest.requireActual('react');
  const OriginalFlyout = actual.EuiFlyout;

  return {
    ...actual,
    copyToClipboard: jest.fn(),
    EuiFlyout: react.forwardRef((props: EuiFlyoutProps, ref: ForwardedRef<HTMLDivElement>) => {
      const { flyoutMenuProps, children, ...rest } = props;

      return (
        <OriginalFlyout {...rest} ref={ref}>
          {flyoutMenuProps && <actual.EuiFlyoutMenu {...flyoutMenuProps} hideCloseButton />}
          {children}
        </OriginalFlyout>
      );
    }),
  };
});

const [inResultsHit, outOfResultsHit] = esHitsMock;
const expandedDocRef: ExpandedDocRef = {
  id: outOfResultsHit._id,
  index: outOfResultsHit._index,
};

const searchResponseFor = (hit: EsHitRecord): Promise<IKibanaSearchResponse> =>
  Promise.resolve({ rawResponse: { hits: { hits: [hit] } } });

type InitialFlyout =
  | { type: 'restoreFromRef'; ref: ExpandedDocRef }
  | { type: 'openDocument'; document: DataTableRecord }
  | { type: 'closed' };

const setup = async ({
  searchResult,
  hits = [inResultsHit],
  fetchStatus = FetchStatus.COMPLETE,
  initialFlyout = { type: 'restoreFromRef', ref: expandedDocRef },
  query,
  services = createDiscoverServicesMock(),
}: {
  searchResult?: Promise<IKibanaSearchResponse> | Error;
  hits?: EsHitRecord[];
  fetchStatus?: FetchStatus;
  initialFlyout?: InitialFlyout;
  query?: Query | AggregateQuery;
  services?: DiscoverServices;
} = {}) => {
  setUnifiedDocViewerServices(mockUnifiedDocViewerServices);

  if (searchResult) {
    jest
      .mocked(services.data.search.search)
      .mockImplementation(() =>
        searchResult instanceof Error ? throwError(() => searchResult) : from(searchResult)
      );
  }

  const toolkit = getDiscoverInternalStateMock({ services });

  await toolkit.initializeTabs();

  if (query) {
    toolkit.internalState.dispatch(
      internalStateActions.updateAppState({
        tabId: toolkit.getCurrentTab().id,
        appState: { query },
      })
    );
  }

  await toolkit.initializeSingleTab({
    tabId: toolkit.getCurrentTab().id,
    skipWaitForDataFetching: true,
  });

  const dataStateContainer = toolkit.getCurrentTabDataStateContainer();

  dataStateContainer.data$.documents$.next({
    fetchStatus,
    result: hits.map((hit) => buildDataTableRecord(hit, dataViewMock)),
  });

  await act(async () => {
    if (initialFlyout.type === 'restoreFromRef') {
      toolkit.internalState.dispatch(
        internalStateActions.updateAppState({
          tabId: toolkit.getCurrentTab().id,
          appState: { expandedDoc: initialFlyout.ref },
        })
      );
    } else if (initialFlyout.type === 'openDocument') {
      toolkit.internalState.dispatch(
        internalStateActions.setExpandedDoc({
          tabId: toolkit.getCurrentTab().id,
          expandedDoc: initialFlyout.document,
        })
      );
    }
  });

  renderWithI18n(
    <DiscoverToolkitTestProvider toolkit={toolkit}>
      <DiscoverDocumentFlyout
        dataView={dataViewMock}
        columns={['bytes']}
        onAddColumn={jest.fn()}
        onRemoveColumn={jest.fn()}
        onAddFilter={jest.fn()}
      />
    </DiscoverToolkitTestProvider>
  );

  return { toolkit, services };
};

describe('DiscoverDocumentFlyout', () => {
  const expectShareButtonEbt = (shareButton: HTMLElement, detail: string) => {
    const trackedElement = shareButton.closest('[data-ebt-action]');

    expect(trackedElement).toHaveAttribute('data-test-subj', 'discoverDocFlyoutShareDirectLink');
    expect(trackedElement).toHaveAttribute('data-ebt-action', 'shareDirectLink');
    expect(trackedElement).toHaveAttribute('data-ebt-element', 'docViewerFlyoutHeader');
    expect(trackedElement).toHaveAttribute('data-ebt-detail', detail);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('copies a document link from the flyout menu and ignores duplicate clicks', async () => {
    const { services, toolkit } = await setup({ hits: esHitsMock });
    // Freeze the seeded results so the unawaited main fetch can't remount the menu mid-click.
    toolkit.getCurrentTabDataStateContainer().data$.documents$.next = jest.fn();

    const shareButton = await screen.findByRole('button', {
      name: 'Share direct link',
    });
    expectShareButtonEbt(shareButton, 'linkable');

    // Both clicks must stay in one act() so the second lands while isCopyingLinkRef is still set.
    act(() => {
      shareButton.click();
      shareButton.click();
    });

    expect(copyToClipboard).toHaveBeenCalledTimes(1);
    expect(services.toastNotifications.addSuccess).toHaveBeenCalledWith({
      title: 'Link copied to clipboard',
    });
    expect(services.locator.getRedirectUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        expandedDoc: expandedDocRef,
        timeRange: services.data.query.timefilter.timefilter.getAbsoluteTime(),
      })
    );
  });

  it('copies a short URL when the user has permission to create one', async () => {
    const user = userEvent.setup();
    const services = createDiscoverServicesMock();
    const share = sharePluginMock.createStartContract();
    const shortUrlClient = share.url.shortUrls.get(null);
    const shortUrlLocator = sharePluginMock.createLocator<{ slug: string }>();
    shortUrlLocator.getUrl.mockResolvedValue('https://example.com/s/short-link');
    jest.spyOn(share.url.shortUrls, 'get').mockReturnValue(shortUrlClient);
    jest.spyOn(shortUrlClient, 'createWithLocator').mockResolvedValue({
      data: {
        id: 'short-url-id',
        slug: 'short-link',
        accessCount: 0,
        accessDate: 0,
        createDate: 0,
        locator: { id: 'DISCOVER_APP_LOCATOR', version: '1', state: {} },
      },
      locator: shortUrlLocator,
      params: { slug: 'short-link' },
    });
    services.share = share;
    services.capabilities.discover_v2.createShortUrl = true;

    await setup({ hits: esHitsMock, services });

    await user.click(await screen.findByRole('button', { name: 'Share direct link' }));

    expect(shortUrlClient.createWithLocator).toHaveBeenCalledWith({
      locator: services.locator,
      params: expect.objectContaining({ expandedDoc: expandedDocRef }),
    });
    expect(copyToClipboard).toHaveBeenCalledWith('https://example.com/s/short-link');
  });

  it('shows an error when a document link cannot be created', async () => {
    const user = userEvent.setup();
    const services = createDiscoverServicesMock();
    const share = sharePluginMock.createStartContract();
    const shortUrlClient = share.url.shortUrls.get(null);
    jest.spyOn(share.url.shortUrls, 'get').mockReturnValue(shortUrlClient);
    jest.spyOn(shortUrlClient, 'createWithLocator').mockRejectedValue(new Error('Request failed'));
    services.share = share;
    services.capabilities.discover_v2.createShortUrl = true;

    await setup({ hits: esHitsMock, services });

    await user.click(await screen.findByRole('button', { name: 'Share direct link' }));

    await waitFor(() => {
      expect(services.toastNotifications.addDanger).toHaveBeenCalledWith({
        title: 'Unable to copy link',
        text: 'Request failed',
      });
    });
    expect(copyToClipboard).not.toHaveBeenCalled();
    expect(services.toastNotifications.addSuccess).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'an ES|QL result from an unsupported source command',
      query: { esql: 'ROW message = "hello"' },
      expandedDoc: buildDataTableRecord(outOfResultsHit, dataViewMock),
      linkability: ExpandedDocLinkability.EsqlUnsupportedSource,
      ebtDetail: 'esqlUnsupportedSource',
    },
    {
      name: 'an ES|QL result without document metadata',
      query: { esql: 'FROM logs' },
      expandedDoc: buildDataTableRecord({ _source: { message: 'no metadata' } }, dataViewMock),
      linkability: ExpandedDocLinkability.EsqlMissingMetadata,
      ebtDetail: 'esqlMissingMetadata',
    },
    {
      name: 'a result from a transformational ES|QL query',
      query: { esql: 'FROM logs METADATA _id, _index | STATS count() BY host' },
      expandedDoc: buildDataTableRecord(outOfResultsHit, dataViewMock),
      linkability: ExpandedDocLinkability.EsqlTransformational,
      ebtDetail: 'esqlTransformational',
    },
  ])(
    'explains why a link cannot be copied for $name',
    async ({ query, expandedDoc, linkability, ebtDetail }) => {
      const { services } = await setup({
        hits: esHitsMock,
        query,
        initialFlyout: { type: 'openDocument', document: expandedDoc },
      });
      const disabledReason = getExpandedDocLinkDisabledReason(linkability);

      const shareButton = await screen.findByRole('button', {
        name: `Cannot share direct link: ${disabledReason}`,
      });

      expectShareButtonEbt(shareButton, ebtDetail);
      expect(shareButton).toBeEnabled();
      fireEvent.click(shareButton);

      expect(services.toastNotifications.addWarning).toHaveBeenCalledWith({
        title: 'Cannot share direct link',
        text: disabledReason,
        'data-test-subj': 'discoverDocFlyoutCopyLinkWarning',
      });
      expect(copyToClipboard).not.toHaveBeenCalled();
    }
  );

  it('renders nothing when no document is expanded', async () => {
    await setup({ initialFlyout: { type: 'closed' } });

    expect(screen.queryByTestId('docViewerFlyout')).not.toBeInTheDocument();
  });

  it('opens the flyout with a directly fetched document that is not in the results', async () => {
    const { toolkit } = await setup({ searchResult: searchResponseFor(outOfResultsHit) });

    await waitFor(() => {
      expect(toolkit.getCurrentTab().expandedDoc?.raw._id).toBe(outOfResultsHit._id);
    });

    expect(screen.getByTestId('docViewerFlyout')).toBeVisible();
    expect(screen.getByTestId('expandedDocNotice-NotInResults')).toBeVisible();
    expect(screen.queryByTestId('docViewerFlyoutNavigation')).not.toBeInTheDocument();
  });

  it('preserves document routing when fetching from a reference', async () => {
    const routing = 'route-1';
    const routedHit = { ...outOfResultsHit, _routing: routing };
    const { toolkit, services } = await setup({
      searchResult: searchResponseFor(routedHit),
      initialFlyout: {
        type: 'restoreFromRef',
        ref: { ...expandedDocRef, routing },
      },
    });

    await waitFor(() => {
      expect(toolkit.getCurrentTab().expandedDoc?.raw._routing).toBe(routing);
    });

    const searchRequest = jest.mocked(services.data.search.search).mock.calls[0][0];
    expect(searchRequest.params.routing).toBe(routing);
  });

  it('uses the instance from the results without fetching when they already contain it', async () => {
    const { toolkit, services } = await setup({
      searchResult: searchResponseFor(outOfResultsHit),
      hits: esHitsMock,
    });
    // Freeze the seeded results so the unawaited main fetch can't replace them mid-assertion.
    toolkit.getCurrentTabDataStateContainer().data$.documents$.next = jest.fn();

    await waitFor(() => {
      expect(toolkit.getCurrentTab().expandedDoc?.raw._id).toBe(outOfResultsHit._id);
    });

    // The record from the result set is the one the grid renders, so pagination and the row
    // highlight only work with that instance rather than a directly fetched copy
    const rowFromResults = toolkit
      .getCurrentTabDataStateContainer()
      .data$.documents$.getValue()
      .result?.find((row) => row.raw._id === outOfResultsHit._id);

    expect(toolkit.getCurrentTab().expandedDoc).toBe(rowFromResults);
    expect(services.data.search.search).not.toHaveBeenCalled();
    expect(screen.queryByTestId('expandedDocNotice-NotInResults')).not.toBeInTheDocument();
  });

  it('keeps the instance from the results when the direct fetch finishes after them', async () => {
    const services = createDiscoverServicesMock();
    let resolveSearch: (response: IKibanaSearchResponse) => void = () => {};

    jest
      .mocked(services.data.search.search)
      .mockImplementation(() =>
        from(new Promise<IKibanaSearchResponse>((resolve) => (resolveSearch = resolve)))
      );

    setUnifiedDocViewerServices(mockUnifiedDocViewerServices);

    const toolkit = getDiscoverInternalStateMock({ services });

    await toolkit.initializeTabs();
    await toolkit.initializeSingleTab({
      tabId: toolkit.getCurrentTab().id,
      skipWaitForDataFetching: true,
    });

    toolkit.internalState.dispatch(
      internalStateActions.updateAppState({
        tabId: toolkit.getCurrentTab().id,
        appState: { expandedDoc: expandedDocRef },
      })
    );

    const documents$ = toolkit.getCurrentTabDataStateContainer().data$.documents$;

    documents$.next({
      fetchStatus: FetchStatus.LOADING,
      result: [buildDataTableRecord(inResultsHit, dataViewMock)],
    });

    renderWithI18n(
      <DiscoverToolkitTestProvider toolkit={toolkit}>
        <DiscoverDocumentFlyout
          dataView={dataViewMock}
          columns={['bytes']}
          onAddColumn={jest.fn()}
          onRemoveColumn={jest.fn()}
          onAddFilter={jest.fn()}
        />
      </DiscoverToolkitTestProvider>
    );

    await waitFor(() => {
      expect(services.data.search.search).toHaveBeenCalled();
    });

    act(() => {
      documents$.next({
        fetchStatus: FetchStatus.COMPLETE,
        result: esHitsMock.map((hit) => buildDataTableRecord(hit, dataViewMock)),
      });
    });
    // Freeze the seeded results so the unawaited main fetch can't replace them mid-assertion.
    documents$.next = jest.fn();

    const rowFromResults = documents$
      .getValue()
      .result?.find((row) => row.raw._id === outOfResultsHit._id);

    await waitFor(() => {
      expect(toolkit.getCurrentTab().expandedDoc).toBe(rowFromResults);
    });

    // The late direct fetch must not replace the instance the grid renders, since only that one
    // restores flyout pagination and the row highlight
    await act(async () => {
      resolveSearch({ rawResponse: { hits: { hits: [outOfResultsHit] } } });
    });

    expect(toolkit.getCurrentTab().expandedDoc).toBe(rowFromResults);
  });

  it('keeps flyout pagination populated when the URL reference changes to another document already in the results (e.g. browser back navigation)', async () => {
    const { toolkit } = await setup({ hits: esHitsMock });
    const tabId = toolkit.getCurrentTab().id;
    // Freeze the seeded results so the unawaited main fetch can't replace them mid-assertion.
    toolkit.getCurrentTabDataStateContainer().data$.documents$.next = jest.fn();

    await waitFor(() => {
      expect(toolkit.getCurrentTab().expandedDoc?.raw._id).toBe(outOfResultsHit._id);
    });

    act(() => {
      toolkit.internalState.dispatch(
        internalStateActions.setRenderDocumentViewMeta({
          tabId,
          renderDocumentViewMeta: {
            displayedRows: esHitsMock.map((hit) => buildDataTableRecord(hit, dataViewMock)),
            displayedColumns: ['bytes'],
          },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('docViewerFlyoutNavigation')).toBeVisible();
    });

    act(() => {
      toolkit.internalState.dispatch(
        internalStateActions.updateAppState({
          tabId,
          appState: { expandedDoc: { id: inResultsHit._id, index: inResultsHit._index } },
        })
      );
    });

    await waitFor(() => {
      expect(toolkit.getCurrentTab().expandedDoc?.raw._id).toBe(inResultsHit._id);
    });

    expect(screen.getByTestId('docViewerFlyoutNavigation')).toBeVisible();
  });

  it('reports that it is still searching while the results are loading', async () => {
    await setup({
      searchResult: searchResponseFor(outOfResultsHit),
      fetchStatus: FetchStatus.LOADING,
    });

    await waitFor(() => {
      expect(screen.getByTestId('expandedDocNotice-SearchingResults')).toBeVisible();
    });
  });

  it('shows a loading state while the document request is unresolved', async () => {
    await setup({ searchResult: new Promise(() => {}) });

    expect(await screen.findByTestId('docViewerFlyoutLoading')).toBeVisible();
  });

  it('shows a not found state with the unresolved document reference when the document no longer exists', async () => {
    await setup({ searchResult: Promise.resolve({ rawResponse: { hits: { hits: [] } } }) });

    await waitFor(() => {
      expect(screen.getByTestId('docViewerFlyoutNotFound')).toBeVisible();
    });

    expect(screen.getByTestId('docViewerFlyoutNotFound')).toHaveTextContent(expandedDocRef.id);
    expect(screen.getByTestId('docViewerFlyoutNotFound')).toHaveTextContent(expandedDocRef.index);
    expect(screen.queryByTestId('docViewerFlyoutNotice')).not.toBeInTheDocument();
    expect(screen.queryByTestId('docViewerFlyoutActions')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /share direct link/i })).not.toBeInTheDocument();
  });

  it('shows an error state when the document cannot be fetched', async () => {
    await setup({ searchResult: new Error('search failed') });

    await waitFor(() => {
      expect(screen.getByTestId('docViewerFlyoutError')).toBeVisible();
    });
  });

  it('shows an error without fetching or clearing a routed ES|QL reference', async () => {
    const routedRef = { ...expandedDocRef, routing: 'route-1' };
    const { toolkit, services } = await setup({
      query: { esql: 'FROM logs METADATA _id, _index' },
      initialFlyout: { type: 'restoreFromRef', ref: routedRef },
    });

    expect(await screen.findByTestId('docViewerFlyoutError')).toBeVisible();
    expect(services.data.search.search).not.toHaveBeenCalled();
    expect(toolkit.getCurrentTab().appState.expandedDoc).toEqual(routedRef);
  });

  it('closes the flyout when the reference is removed from the URL', async () => {
    const { toolkit } = await setup({ searchResult: searchResponseFor(outOfResultsHit) });

    await waitFor(() => {
      expect(toolkit.getCurrentTab().expandedDoc).toBeDefined();
    });

    act(() => {
      toolkit.internalState.dispatch(
        internalStateActions.updateAppState({
          tabId: toolkit.getCurrentTab().id,
          appState: { expandedDoc: undefined },
        })
      );
    });

    await waitFor(() => {
      expect(toolkit.getCurrentTab().expandedDoc).toBeUndefined();
      expect(screen.queryByTestId('docViewerFlyout')).not.toBeInTheDocument();
    });
  });

  it('clears the current document when the reference changes to a missing document', async () => {
    const services = createDiscoverServicesMock();
    jest
      .mocked(services.data.search.search)
      .mockImplementationOnce(() => from(searchResponseFor(outOfResultsHit)))
      .mockImplementationOnce(() => from(Promise.resolve({ rawResponse: { hits: { hits: [] } } })));
    const { toolkit } = await setup({ services });

    await waitFor(() => {
      expect(toolkit.getCurrentTab().expandedDoc?.raw._id).toBe(outOfResultsHit._id);
    });

    act(() => {
      toolkit.internalState.dispatch(
        internalStateActions.updateAppState({
          tabId: toolkit.getCurrentTab().id,
          appState: { expandedDoc: { id: 'missing', index: outOfResultsHit._index } },
        })
      );
    });

    await waitFor(() => {
      expect(toolkit.getCurrentTab().expandedDoc).toBeUndefined();
      expect(screen.getByTestId('docViewerFlyoutNotFound')).toBeVisible();
    });
  });

  it.each([
    ['a transformational query', 'FROM logs METADATA _id, _index | STATS count() BY host'],
    ['an unsupported source command', 'ROW message = "hello"'],
  ])('clears a restored reference for %s without fetching', async (_, esql) => {
    const { toolkit, services } = await setup({ query: { esql } });

    await waitFor(() => {
      expect(toolkit.getCurrentTab().appState.expandedDoc).toBeUndefined();
      expect(screen.queryByTestId('docViewerFlyout')).not.toBeInTheDocument();
    });
    expect(services.data.search.search).not.toHaveBeenCalled();
  });

  it('renders a cascade owned document with the columns and meta reported by its grid', async () => {
    const services = createDiscoverServicesMock();
    const toolkit = getDiscoverInternalStateMock({ services });
    const groupingQuery = { esql: 'FROM logs | STATS count() BY extension' };
    const expandedDocCascadePath = {
      nodePath: ['extension'],
      nodePathMap: { extension: 'png' },
    };

    await toolkit.initializeTabs();
    toolkit.internalState.dispatch(
      internalStateActions.updateAppState({
        tabId: toolkit.getCurrentTab().id,
        appState: { query: groupingQuery },
      })
    );
    await toolkit.initializeSingleTab({
      tabId: toolkit.getCurrentTab().id,
      skipWaitForDataFetching: true,
    });

    const tabId = toolkit.getCurrentTab().id;
    const expandedDoc = buildDataTableRecord(esHitsMock[0], dataViewMock);
    const nextExpandedDoc = buildDataTableRecord(esHitsMock[1], dataViewMock);
    const cascadedColumnsMeta: DataTableColumnsMeta = { bytes: { type: 'number' } };

    toolkit.internalState.dispatch(
      internalStateActions.setExpandedDoc({
        tabId,
        expandedDoc,
        expandedDocOwner: 'nested-grid',
        expandedDocCascadePath,
      })
    );
    toolkit.internalState.dispatch(
      internalStateActions.setRenderDocumentViewMeta({
        tabId,
        renderDocumentViewMeta: {
          displayedRows: [expandedDoc, nextExpandedDoc],
          displayedColumns: ['bytes'],
        },
      })
    );
    toolkit.internalState.dispatch(
      internalStateActions.setCascadedDocumentsState({
        tabId,
        cascadedDocumentsState: {
          ...toolkit.getCurrentTab().cascadedDocumentsState,
          columnsMeta: cascadedColumnsMeta,
        },
      })
    );

    setUnifiedDocViewerServices(mockUnifiedDocViewerServices);

    const dataStateContainer = toolkit.getCurrentTabDataStateContainer();

    dataStateContainer.data$.documents$.next({
      fetchStatus: FetchStatus.COMPLETE,
      result: esHitsMock.map((hit) => buildDataTableRecord(hit, dataViewMock)),
    });
    dataStateContainer.data$.documents$.next = jest.fn();

    renderWithI18n(
      <DiscoverToolkitTestProvider toolkit={toolkit}>
        <DiscoverDocumentFlyout
          dataView={dataViewMock}
          columns={['bytes']}
          onAddColumn={jest.fn()}
          onRemoveColumn={jest.fn()}
          onAddFilter={jest.fn()}
        />
      </DiscoverToolkitTestProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('docViewerFlyout')).toBeVisible();
    });

    expect(await screen.findByRole('button', { name: 'Share direct link' })).toBeVisible();

    await waitFor(() => {
      expect(screen.getByTestId('docViewerFlyoutNavigation')).toBeVisible();
    });

    act(() => {
      toolkit.internalState.dispatch(
        internalStateActions.setExpandedDoc({
          tabId,
          expandedDoc: nextExpandedDoc,
          expandedDocOwner: 'nested-grid',
          expandedDocCascadePath,
        })
      );
    });

    await waitFor(() => {
      expect(toolkit.getCurrentTab().expandedDoc).toEqual(nextExpandedDoc);
      expect(toolkit.getCurrentTab().expandedDocOwner).toBe('nested-grid');
      expect(toolkit.getCurrentTab().expandedDocCascadePath).toEqual(expandedDocCascadePath);
    });

    expect(toolkit.getCurrentTab().appState.expandedDoc).toBeUndefined();
  });

  it('copies a document link that uses the nested grid query instead of the group-by query', async () => {
    const services = createDiscoverServicesMock();
    const toolkit = getDiscoverInternalStateMock({ services });
    const groupingQuery = { esql: 'FROM logs | STATS count() BY extension' };
    const expandedDocCascadePath = {
      nodePath: ['extension'],
      nodePathMap: { extension: 'png' },
    };
    const cascadeQuery = constructCascadeQuery({
      query: groupingQuery,
      dataView: dataViewMock,
      esqlVariables: undefined,
      nodeType: 'leaf',
      ...expandedDocCascadePath,
    });

    await toolkit.initializeTabs();
    toolkit.internalState.dispatch(
      internalStateActions.updateAppState({
        tabId: toolkit.getCurrentTab().id,
        appState: { query: groupingQuery },
      })
    );
    await toolkit.initializeSingleTab({
      tabId: toolkit.getCurrentTab().id,
      skipWaitForDataFetching: true,
    });

    const tabId = toolkit.getCurrentTab().id;
    const expandedDoc = buildDataTableRecord(esHitsMock[0], dataViewMock);

    toolkit.internalState.dispatch(
      internalStateActions.setExpandedDoc({
        tabId,
        expandedDoc,
        expandedDocOwner: 'nested-grid',
        expandedDocCascadePath,
      })
    );

    setUnifiedDocViewerServices(mockUnifiedDocViewerServices);

    const dataStateContainer = toolkit.getCurrentTabDataStateContainer();

    dataStateContainer.data$.documents$.next({
      fetchStatus: FetchStatus.COMPLETE,
      result: esHitsMock.map((hit) => buildDataTableRecord(hit, dataViewMock)),
    });

    renderWithI18n(
      <DiscoverToolkitTestProvider toolkit={toolkit}>
        <DiscoverDocumentFlyout
          dataView={dataViewMock}
          columns={['bytes']}
          onAddColumn={jest.fn()}
          onRemoveColumn={jest.fn()}
          onAddFilter={jest.fn()}
        />
      </DiscoverToolkitTestProvider>
    );

    const shareButton = await screen.findByRole('button', { name: 'Share direct link' });
    expectShareButtonEbt(shareButton, 'linkable');

    act(() => {
      shareButton.click();
    });

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledTimes(1);
    });
    expect(services.locator.getRedirectUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        query: cascadeQuery,
        columns: [],
        expandedDoc: {
          id: esHitsMock[0]._id,
          index: esHitsMock[0]._index,
        },
      })
    );
    expect(services.locator.getRedirectUrl).not.toHaveBeenCalledWith(
      expect.objectContaining({
        query: groupingQuery,
      })
    );
  });

  it('does not fetch when the expanded document already matches the reference', async () => {
    const services = createDiscoverServicesMock();
    const toolkit = getDiscoverInternalStateMock({ services });

    await toolkit.initializeTabs();
    await toolkit.initializeSingleTab({
      tabId: toolkit.getCurrentTab().id,
      skipWaitForDataFetching: true,
    });

    toolkit.internalState.dispatch(
      internalStateActions.setExpandedDoc({
        tabId: toolkit.getCurrentTab().id,
        expandedDoc: buildDataTableRecord(inResultsHit, dataViewMock),
      })
    );

    setUnifiedDocViewerServices(mockUnifiedDocViewerServices);

    const dataStateContainer = toolkit.getCurrentTabDataStateContainer();

    dataStateContainer.data$.documents$.next({
      fetchStatus: FetchStatus.COMPLETE,
      result: [buildDataTableRecord(inResultsHit, dataViewMock)],
    });
    dataStateContainer.data$.documents$.next = jest.fn();

    renderWithI18n(
      <DiscoverToolkitTestProvider toolkit={toolkit}>
        <DiscoverDocumentFlyout
          dataView={dataViewMock}
          columns={['bytes']}
          onAddColumn={jest.fn()}
          onRemoveColumn={jest.fn()}
          onAddFilter={jest.fn()}
        />
      </DiscoverToolkitTestProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('docViewerFlyout')).toBeVisible();
    });

    expect(services.data.search.search).not.toHaveBeenCalled();
    expect(toolkit.getCurrentTab().appState.expandedDoc).toEqual({
      id: inResultsHit._id,
      index: inResultsHit._index,
    });
  });
});
