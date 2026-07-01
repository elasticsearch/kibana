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
import { ALERT_SUMMARY_PANEL_TEST_ID } from '../../shared/components/test_ids';
import { FLYOUT_V2_ALERT_PAGINATION_TEST_ID } from './components/test_ids';
import {
  __resetFlyoutPaginationStoreForTests,
  flyoutPaginationStore,
} from '../../../common/utils/flyout_pagination/store';

jest.mock('../../../common/lib/kibana', () => ({
  useKibana: () => ({
    services: {
      application: {
        getUrlForApp: jest.fn().mockReturnValue('https://example.com/rule/test-rule-id'),
      },
    },
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

const INSTANCE_ID = 'test-instance-uuid';

describe('<DocumentHeader />', () => {
  beforeEach(() => {
    __resetFlyoutPaginationStoreForTests();
  });
  afterEach(() => {
    __resetFlyoutPaginationStoreForTests();
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

  describe('alert pagination', () => {
    it('does not render the pagination control when no paginationInstanceId is passed', () => {
      // No paginationInstanceId → header has no slice to look up
      const { queryByTestId } = renderHeader({ hit: alertHit });
      expect(queryByTestId(FLYOUT_V2_ALERT_PAGINATION_TEST_ID)).not.toBeInTheDocument();
    });

    it('does not render the pagination control when only one alert is in the result set', () => {
      act(() => {
        flyoutPaginationStore.setSlice(INSTANCE_ID, {
          flyoutAlertIndex: 0,
          pageSize: 50,
          totalAlertCount: 1,
        });
      });
      const { queryByTestId } = renderHeader({
        hit: alertHit,
        paginationInstanceId: INSTANCE_ID,
      });
      expect(queryByTestId(FLYOUT_V2_ALERT_PAGINATION_TEST_ID)).not.toBeInTheDocument();
    });

    it('renders the pagination control with page count equal to the total alert count', () => {
      act(() => {
        flyoutPaginationStore.setSlice(INSTANCE_ID, {
          flyoutAlertIndex: 2,
          pageSize: 50,
          totalAlertCount: 1432,
        });
      });
      const { getByTestId } = renderHeader({
        hit: alertHit,
        paginationInstanceId: INSTANCE_ID,
      });
      const pagination = getByTestId(FLYOUT_V2_ALERT_PAGINATION_TEST_ID);
      expect(pagination).toBeInTheDocument();
      // The compressed EuiPagination renders a "{active+1} of {total}" label.
      expect(pagination).toHaveTextContent('3 of 1432');
    });

    it('uses the absolute alert index when computing the active page', () => {
      act(() => {
        flyoutPaginationStore.setSlice(INSTANCE_ID, {
          // 2nd alert of the 2nd page (page size 50) → absolute index 51.
          flyoutAlertIndex: 51,
          pageSize: 50,
          totalAlertCount: 1432,
        });
      });
      const { getByTestId } = renderHeader({
        hit: alertHit,
        paginationInstanceId: INSTANCE_ID,
      });
      const pagination = getByTestId(FLYOUT_V2_ALERT_PAGINATION_TEST_ID);
      expect(pagination).toHaveTextContent('52 of 1432');
    });

    it('opens the next/prev alert via the flyout pagination slice when pagination is clicked', () => {
      const openAlertFlyoutImpl = jest.fn();
      act(() => {
        flyoutPaginationStore.setSlice(INSTANCE_ID, {
          flyoutAlertIndex: 49,
          pageSize: 50,
          totalAlertCount: 1432,
          openAlertFlyoutImpl,
        });
      });
      const { getByTestId } = renderHeader({
        hit: alertHit,
        paginationInstanceId: INSTANCE_ID,
      });
      const pagination = getByTestId(FLYOUT_V2_ALERT_PAGINATION_TEST_ID);

      const nextButton = pagination.querySelector('[data-test-subj="pagination-button-next"]');
      expect(nextButton).not.toBeNull();
      fireEvent.click(nextButton as HTMLElement);

      // Last alert of page 1 (absolute index 49) → next is the first alert of
      // page 2 (absolute index 50). Pagination crosses the page boundary
      // without changing the underlying table page.
      expect(openAlertFlyoutImpl).toHaveBeenCalledWith(50);

      const prevButton = pagination.querySelector('[data-test-subj="pagination-button-previous"]');
      expect(prevButton).not.toBeNull();
      fireEvent.click(prevButton as HTMLElement);

      expect(openAlertFlyoutImpl).toHaveBeenCalledWith(48);
    });

    it('renders the pagination control even on non-alert documents (the source is the source of truth)', () => {
      // For Flyout V2, every document in the result set is shown. When a
      // paginated source is driving the flyout, render the pagination
      // unconditionally for events or alerts; the source fills the store only
      // when pagination makes sense.
      act(() => {
        flyoutPaginationStore.setSlice(INSTANCE_ID, {
          flyoutAlertIndex: 1,
          pageSize: 50,
          totalAlertCount: 5,
        });
      });
      const { getByTestId } = renderHeader({
        hit: eventHit,
        paginationInstanceId: INSTANCE_ID,
      });
      expect(getByTestId(FLYOUT_V2_ALERT_PAGINATION_TEST_ID)).toBeInTheDocument();
    });
  });
});
