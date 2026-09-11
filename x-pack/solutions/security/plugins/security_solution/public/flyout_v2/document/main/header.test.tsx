/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { act, fireEvent, render } from '@testing-library/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { Header } from './header';
import {
  ALERT_SUMMARY_PANEL_TEST_ID,
  DOCUMENT_FLYOUT_HEADER_SHARE_BUTTON_TEST_ID,
} from '../../shared/components/test_ids';
import { useGetFlyoutLink } from '../../../flyout/document_details/right/hooks/use_get_flyout_link';
import { FLYOUT_V2_DOCUMENT_PAGINATION_TEST_ID } from './components/test_ids';
import { createPaginationStore } from '../pagination/store';
import { PaginationStoreProvider } from '../pagination/context';

jest.mock('../../../common/lib/kibana', () => ({
  useKibana: () => ({
    services: {
      application: {
        getUrlForApp: jest.fn().mockReturnValue('/app/security/alerts/redirect/test-id'),
      },
    },
  }),
}));

jest.mock('../../../common/lib/kibana/hooks', () => ({
  useAppUrl: () => ({
    getAppUrl: jest.fn(({ path }: { path: string }) => path),
  }),
}));

jest.mock('./components/title', () => ({
  Title: ({ hit }: { hit: DataTableRecord }) => (
    <div
      data-test-subj="mockHeaderTitle"
      data-hit-id={hit.id}
      data-event-kind={String(hit.flattened['event.kind'] ?? '')}
    />
  ),
}));

jest.mock('./components/severity', () => ({
  DocumentSeverity: ({ hit }: { hit: DataTableRecord }) => (
    <div data-test-subj="mockDocumentSeverity" data-hit-id={hit.id} />
  ),
}));

jest.mock('./components/risk_score', () => ({
  RiskScore: ({ hit }: { hit: DataTableRecord }) => (
    <div data-test-subj="mockRiskScore" data-hit-id={hit.id} />
  ),
}));

jest.mock('./components/status', () => ({
  Status: ({ hit }: { hit: DataTableRecord }) => (
    <div data-test-subj="mockHeaderStatus" data-hit-id={hit.id} />
  ),
}));

jest.mock('../../shared/components/notes', () => ({
  Notes: ({ documentId, onShowNotes }: { documentId: string; onShowNotes?: () => void }) => (
    <button
      type="button"
      data-test-subj="mockNotes"
      data-document-id={documentId}
      data-has-open-notes-tab={String(onShowNotes != null)}
      onClick={onShowNotes}
    />
  ),
}));

jest.mock('./components/assignees', () => ({
  Assignees: ({ hit, onAlertUpdated }: { hit: DataTableRecord; onAlertUpdated: () => void }) => (
    <div
      data-test-subj="mockAssignees"
      data-hit-id={hit.id}
      data-has-on-assignees-updated={String(onAlertUpdated != null)}
    />
  ),
}));

jest.mock('../../shared/components/share_url_icon_button', () => ({
  ShareUrlIconButton: ({
    url,
    dataTestSubj,
  }: {
    url: string | null | undefined;
    dataTestSubj: string;
  }) => (url ? <button type="button" data-test-subj={dataTestSubj} /> : null),
}));

jest.mock('../../../flyout/document_details/right/hooks/use_get_flyout_link', () => ({
  useGetFlyoutLink: jest.fn(),
}));

jest.mock('../../../common/components/formatted_date', () => ({
  PreferenceFormattedDate: ({ value }: { value: Date }) => (
    <div data-test-subj="mockPreferenceFormattedDate">{value.toISOString()}</div>
  ),
}));

const createMockHit = (flattened: DataTableRecord['flattened']): DataTableRecord =>
  ({
    id: '1',
    raw: {},
    flattened,
    isAnchor: false,
  } as DataTableRecord);

const alertHit = createMockHit({
  'event.kind': 'signal',
  'kibana.alert.rule.name': 'Test Rule',
  'kibana.alert.rule.uuid': 'test-rule-id',
  'kibana.alert.risk_score': 21,
  '@timestamp': '2023-01-01T00:00:00.000Z',
});

const alertHitNoRiskScore = createMockHit({
  'event.kind': 'signal',
  'kibana.alert.rule.name': 'Test Rule',
  'kibana.alert.rule.uuid': 'test-rule-id',
  '@timestamp': '2023-01-01T00:00:00.000Z',
});

const eventHit = createMockHit({
  'event.kind': 'event',
  'kibana.alert.risk_score': 21,
});

const defaultHeaderProps: Pick<Parameters<typeof Header>[0], 'onAlertUpdated' | 'onShowNotes'> = {
  onAlertUpdated: jest.fn(),
  onShowNotes: jest.fn(),
};

type RenderHeaderProps = Omit<Parameters<typeof Header>[0], 'onAlertUpdated' | 'onShowNotes'> &
  Partial<Pick<Parameters<typeof Header>[0], 'onAlertUpdated' | 'onShowNotes'>>;

const renderHeader = (props: RenderHeaderProps) =>
  render(
    <IntlProvider locale="en">
      <Header {...defaultHeaderProps} {...props} />
    </IntlProvider>
  );

const renderHeaderWithStore = (
  props: RenderHeaderProps,
  store: ReturnType<typeof createPaginationStore>
) =>
  render(
    <PaginationStoreProvider value={store}>
      <IntlProvider locale="en">
        <Header {...defaultHeaderProps} {...props} />
      </IntlProvider>
    </PaginationStoreProvider>
  );

const mockUseGetFlyoutLink = useGetFlyoutLink as jest.Mock;

describe('<DocumentHeader />', () => {
  beforeEach(() => {
    mockUseGetFlyoutLink.mockReturnValue(null);
  });

  it('should pass the hit to the severity component', () => {
    const { getByTestId } = renderHeader({ hit: alertHit });

    expect(getByTestId('mockDocumentSeverity')).toHaveAttribute('data-hit-id', '1');
  });

  it('should render the inline timestamp when present', () => {
    const { getByTestId } = renderHeader({ hit: alertHit });

    expect(getByTestId('mockPreferenceFormattedDate')).toHaveTextContent(
      '2023-01-01T00:00:00.000Z'
    );
  });

  it('should pass the hit to the header title', () => {
    const { getByTestId } = renderHeader({ hit: alertHit });

    expect(getByTestId('mockHeaderTitle')).toHaveAttribute('data-hit-id', '1');
    expect(getByTestId('mockHeaderTitle')).toHaveAttribute('data-event-kind', 'signal');
  });

  it('should pass alert documents to the header title', () => {
    const { getByTestId } = renderHeader({ hit: alertHit });

    expect(getByTestId('mockHeaderTitle')).toHaveAttribute('data-hit-id', '1');
    expect(getByTestId('mockHeaderTitle')).toHaveAttribute('data-event-kind', 'signal');
  });

  it('should pass non-alert documents to the header title', () => {
    const { getByTestId } = renderHeader({ hit: eventHit });

    expect(getByTestId('mockHeaderTitle')).toHaveAttribute('data-hit-id', '1');
    expect(getByTestId('mockHeaderTitle')).toHaveAttribute('data-event-kind', 'event');
  });

  it('should render the alert summary blocks for alerts', () => {
    const onOpenNotesTab = jest.fn();
    const onAlertUpdated = jest.fn();
    const { getByTestId } = renderHeader({
      hit: alertHit,
      onAlertUpdated,
      onShowNotes: onOpenNotesTab,
    });

    expect(getByTestId(ALERT_SUMMARY_PANEL_TEST_ID)).toBeInTheDocument();
    expect(getByTestId('mockHeaderStatus')).toBeInTheDocument();
    expect(getByTestId('mockRiskScore')).toBeInTheDocument();
    expect(getByTestId('mockAssignees')).toHaveAttribute('data-hit-id', '1');
    expect(getByTestId('mockAssignees')).toHaveAttribute('data-has-on-assignees-updated', 'true');
    expect(getByTestId('mockNotes')).toHaveAttribute('data-has-open-notes-tab', 'true');
  });

  it('should hide stale alert actions while a paginated document is loading', () => {
    const store = createPaginationStore();
    act(() => {
      store.setState({ flyoutDocumentIndex: 1, totalDocumentCount: 5 });
    });
    const { getByTestId, queryByTestId } = renderHeaderWithStore(
      { hit: alertHit, isDocumentStale: true },
      store
    );

    expect(getByTestId('mockHeaderTitle')).toBeInTheDocument();
    expect(getByTestId(FLYOUT_V2_DOCUMENT_PAGINATION_TEST_ID)).toBeInTheDocument();
    expect(queryByTestId(ALERT_SUMMARY_PANEL_TEST_ID)).not.toBeInTheDocument();
    expect(queryByTestId('mockHeaderStatus')).not.toBeInTheDocument();
    expect(queryByTestId('mockAssignees')).not.toBeInTheDocument();
    expect(queryByTestId('mockNotes')).not.toBeInTheDocument();
  });

  it('should not render the alert summary blocks for non-alert events', () => {
    const { queryByTestId } = renderHeader({ hit: eventHit });

    expect(queryByTestId(ALERT_SUMMARY_PANEL_TEST_ID)).not.toBeInTheDocument();
    expect(queryByTestId('mockHeaderStatus')).not.toBeInTheDocument();
    expect(queryByTestId('mockAssignees')).not.toBeInTheDocument();
    expect(queryByTestId('mockNotes')).not.toBeInTheDocument();
    expect(queryByTestId('mockRiskScore')).not.toBeInTheDocument();
  });

  it('should render the risk score block when the alert has no risk score', () => {
    const { getByTestId } = renderHeader({ hit: alertHitNoRiskScore });

    expect(getByTestId(ALERT_SUMMARY_PANEL_TEST_ID)).toBeInTheDocument();
    expect(getByTestId('mockHeaderStatus')).toBeInTheDocument();
    expect(getByTestId('mockRiskScore')).toBeInTheDocument();
  });

  it('should render the status block for alerts', () => {
    const { getByTestId } = renderHeader({ hit: alertHit });

    expect(getByTestId('mockHeaderStatus')).toBeInTheDocument();
  });

  it('should not render the summary block for non-alert documents', () => {
    const { queryByTestId } = renderHeader({ hit: eventHit });

    expect(queryByTestId(ALERT_SUMMARY_PANEL_TEST_ID)).not.toBeInTheDocument();
  });

  it('should render the share button for alerts when a link is available', () => {
    mockUseGetFlyoutLink.mockReturnValue('https://example.com/alerts/redirect/test-id');
    const { getByTestId } = renderHeader({ hit: alertHit });

    expect(getByTestId(DOCUMENT_FLYOUT_HEADER_SHARE_BUTTON_TEST_ID)).toBeInTheDocument();
  });

  it('should not render the share button for alerts when link is null (e.g. preview index)', () => {
    mockUseGetFlyoutLink.mockReturnValue(null);
    const { queryByTestId } = renderHeader({ hit: alertHit });

    expect(queryByTestId(DOCUMENT_FLYOUT_HEADER_SHARE_BUTTON_TEST_ID)).not.toBeInTheDocument();
  });

  it('should not render the share button for non-alert events', () => {
    mockUseGetFlyoutLink.mockReturnValue('https://example.com/alerts/redirect/test-id');
    const { queryByTestId } = renderHeader({ hit: eventHit });

    expect(queryByTestId(DOCUMENT_FLYOUT_HEADER_SHARE_BUTTON_TEST_ID)).not.toBeInTheDocument();
  });

  describe('alert pagination', () => {
    it('does not render the pagination control when there is no PaginationStoreProvider', () => {
      const { queryByTestId } = renderHeader({ hit: alertHit });
      expect(queryByTestId(FLYOUT_V2_DOCUMENT_PAGINATION_TEST_ID)).not.toBeInTheDocument();
    });

    it('does not render the pagination control when only one document is in the result set', () => {
      const store = createPaginationStore();
      act(() => {
        store.setState({ flyoutDocumentIndex: 0, pageSize: 50, totalDocumentCount: 1 });
      });
      const { queryByTestId } = renderHeaderWithStore({ hit: alertHit }, store);
      expect(queryByTestId(FLYOUT_V2_DOCUMENT_PAGINATION_TEST_ID)).not.toBeInTheDocument();
    });

    it('renders the pagination control with page count equal to the total document count', () => {
      const store = createPaginationStore();
      act(() => {
        store.setState({ flyoutDocumentIndex: 2, pageSize: 50, totalDocumentCount: 1432 });
      });
      const { getByTestId } = renderHeaderWithStore({ hit: alertHit }, store);
      const pagination = getByTestId(FLYOUT_V2_DOCUMENT_PAGINATION_TEST_ID);
      expect(pagination).toBeInTheDocument();
      // The compressed EuiPagination renders a "{active+1} of {total}" label.
      expect(pagination).toHaveTextContent('3 of 1432');
    });

    it('uses the absolute document index when computing the active page', () => {
      const store = createPaginationStore();
      act(() => {
        store.setState({
          // 2nd document of the 2nd page (page size 50) → absolute index 51.
          flyoutDocumentIndex: 51,
          pageSize: 50,
          totalDocumentCount: 1432,
        });
      });
      const { getByTestId } = renderHeaderWithStore({ hit: alertHit }, store);
      const pagination = getByTestId(FLYOUT_V2_DOCUMENT_PAGINATION_TEST_ID);
      expect(pagination).toHaveTextContent('52 of 1432');
    });

    it('opens the next/prev document via the flyout pagination slice when pagination is clicked', () => {
      const store = createPaginationStore();
      const openDocumentFlyoutImpl = jest.fn();
      act(() => {
        store.setState({
          flyoutDocumentIndex: 49,
          pageSize: 50,
          totalDocumentCount: 1432,
          openDocumentFlyoutImpl,
        });
      });
      const { getByTestId } = renderHeaderWithStore({ hit: alertHit }, store);
      const pagination = getByTestId(FLYOUT_V2_DOCUMENT_PAGINATION_TEST_ID);

      const nextButton = pagination.querySelector('[data-test-subj="pagination-button-next"]');
      expect(nextButton).not.toBeNull();
      fireEvent.click(nextButton as HTMLElement);

      // Last document of page 1 (absolute index 49) → next is the first document of
      // page 2 (absolute index 50). Pagination crosses the page boundary
      // without changing the underlying table page.
      expect(openDocumentFlyoutImpl).toHaveBeenCalledWith(50);

      const prevButton = pagination.querySelector('[data-test-subj="pagination-button-previous"]');
      expect(prevButton).not.toBeNull();
      fireEvent.click(prevButton as HTMLElement);

      expect(openDocumentFlyoutImpl).toHaveBeenCalledWith(48);
    });

    it('renders the pagination control even on non-alert documents (the source is the source of truth)', () => {
      const store = createPaginationStore();
      act(() => {
        store.setState({ flyoutDocumentIndex: 1, pageSize: 50, totalDocumentCount: 5 });
      });
      const { getByTestId } = renderHeaderWithStore({ hit: eventHit }, store);
      expect(getByTestId(FLYOUT_V2_DOCUMENT_PAGINATION_TEST_ID)).toBeInTheDocument();
    });
  });
});
