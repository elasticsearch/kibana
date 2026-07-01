/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { useAlertsPrivileges } from '../../../detections/containers/detection_engine/alerts/use_alerts_privileges';
import { DocumentFlyout } from '.';
import { TestProviders } from '../../../common/mock';
import { createStartServicesMock } from '../../../common/lib/kibana/kibana_react.mock';
import {
  __resetFlyoutPaginationStoreForTests,
  flyoutPaginationStore,
} from '../../../common/utils/flyout_pagination/store';
import { FLYOUT_V2_LOADING_SPINNER_TEST_ID } from './components/test_ids';

jest.mock('../../../detections/containers/detection_engine/alerts/use_alerts_privileges');
jest.mock('./header', () => ({
  Header: ({
    onAlertUpdated,
    onShowNotes,
  }: {
    onAlertUpdated: () => void;
    onShowNotes: () => void;
  }) => (
    <button
      type="button"
      data-test-subj="mock-header"
      data-has-on-assignees-updated={String(onAlertUpdated != null)}
      onClick={onShowNotes}
    />
  ),
}));
jest.mock('./tabs/overview_tab', () => ({
  OverviewTab: () => <div data-test-subj="mock-overview-tab" />,
}));
jest.mock('./footer', () => ({ Footer: () => <div data-test-subj="mock-footer" /> }));
jest.mock('../../shared/tools/notes', () => ({
  NotesDetails: () => <div data-test-subj="mock-notes-details" />,
}));

const createAlertHit = (extra: DataTableRecord['flattened'] = {}): DataTableRecord =>
  ({
    id: '1',
    raw: {},
    flattened: { 'event.kind': 'signal', ...extra },
    isAnchor: false,
  } as DataTableRecord);

const INSTANCE_ID = 'test-instance-uuid';

describe('<DocumentFlyout />', () => {
  const startServices = createStartServicesMock();

  beforeEach(() => {
    jest.clearAllMocks();
    __resetFlyoutPaginationStoreForTests();
  });

  afterEach(() => {
    __resetFlyoutPaginationStoreForTests();
  });

  it('renders FlyoutMissingAlertsPrivilege when document is an alert and user lacks alerts read privilege', () => {
    (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasAlertsRead: false, loading: false });

    const { getByTestId } = render(
      <TestProviders>
        <DocumentFlyout
          hit={createAlertHit()}
          onAlertUpdated={jest.fn()}
          renderCellActions={jest.fn()}
        />
      </TestProviders>
    );

    expect(getByTestId('noPrivilegesPage')).toBeInTheDocument();
  });

  it('renders loading while alerts privileges are loading for an alert', () => {
    (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasAlertsRead: false, loading: true });

    const { getByTestId, queryByTestId } = render(
      <TestProviders>
        <DocumentFlyout
          hit={createAlertHit()}
          onAlertUpdated={jest.fn()}
          renderCellActions={jest.fn()}
        />
      </TestProviders>
    );

    expect(getByTestId('document-overview-loading')).toBeInTheDocument();
    expect(queryByTestId('noPrivilegesPage')).not.toBeInTheDocument();
  });

  it('renders the header, overview tab and footer', () => {
    (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasAlertsRead: true, loading: false });

    const { getByTestId } = render(
      <TestProviders>
        <DocumentFlyout
          hit={createAlertHit()}
          renderCellActions={jest.fn()}
          onAlertUpdated={jest.fn()}
        />
      </TestProviders>
    );

    expect(getByTestId('mock-header')).toBeInTheDocument();
    expect(getByTestId('mock-overview-tab')).toBeInTheDocument();
    expect(getByTestId('mock-footer')).toBeInTheDocument();
  });

  it('opens notes in a system flyout when notes action is clicked', () => {
    const openSystemFlyout = jest.fn();
    startServices.overlays = {
      ...startServices.overlays,
      openSystemFlyout,
    };
    (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasAlertsRead: true, loading: false });

    const { getByTestId } = render(
      <TestProviders startServices={startServices}>
        <DocumentFlyout
          hit={createAlertHit()}
          renderCellActions={jest.fn()}
          onAlertUpdated={jest.fn()}
        />
      </TestProviders>
    );

    fireEvent.click(getByTestId('mock-header'));

    expect(openSystemFlyout).toHaveBeenCalledTimes(1);
    expect(openSystemFlyout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownFocus: false,
        resizable: true,
        size: 'm',
      })
    );
  });

  it('passes assignee updates callback to the header', () => {
    (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasAlertsRead: true, loading: false });

    const { getByTestId } = render(
      <TestProviders startServices={startServices}>
        <DocumentFlyout
          hit={createAlertHit()}
          renderCellActions={jest.fn()}
          onAlertUpdated={jest.fn()}
        />
      </TestProviders>
    );

    expect(getByTestId('mock-header')).toHaveAttribute('data-has-on-assignees-updated', 'true');
  });

  describe('cross-page pagination loading branch', () => {
    it('renders the header and a centered spinner instead of the body when isFlyoutAlertLoading is true', () => {
      (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasAlertsRead: true, loading: false });
      act(() => {
        flyoutPaginationStore.setSlice(INSTANCE_ID, { isFlyoutAlertLoading: true });
      });

      const { getByTestId, queryByTestId } = render(
        <TestProviders>
          <DocumentFlyout
            hit={createAlertHit()}
            renderCellActions={jest.fn()}
            onAlertUpdated={jest.fn()}
            paginationInstanceId={INSTANCE_ID}
          />
        </TestProviders>
      );

      // Header is preserved so the in-flyout pagination control (rendered by
      // it) remains operable while the new alert loads.
      expect(getByTestId('mock-header')).toBeInTheDocument();
      expect(getByTestId(FLYOUT_V2_LOADING_SPINNER_TEST_ID)).toBeInTheDocument();
      // The body and footer are replaced by the spinner branch — neither
      // tab content nor footer should render.
      expect(queryByTestId('mock-overview-tab')).not.toBeInTheDocument();
      expect(queryByTestId('mock-footer')).not.toBeInTheDocument();
    });

    it('renders the normal body once the flyout alert loading flag clears', () => {
      (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasAlertsRead: true, loading: false });

      const { getByTestId, queryByTestId } = render(
        <TestProviders>
          <DocumentFlyout
            hit={createAlertHit()}
            renderCellActions={jest.fn()}
            onAlertUpdated={jest.fn()}
          />
        </TestProviders>
      );

      expect(getByTestId('mock-overview-tab')).toBeInTheDocument();
      expect(queryByTestId(FLYOUT_V2_LOADING_SPINNER_TEST_ID)).not.toBeInTheDocument();
    });
  });

  describe('remote document callout', () => {
    it('shows the callout for remote alerts', () => {
      (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasAlertsRead: true, loading: false });

      const { getByText } = render(
        <TestProviders>
          <DocumentFlyout
            hit={createAlertHit({ _index: 'remote-cluster:.alerts-security.alerts-default' })}
            renderCellActions={jest.fn()}
            onAlertUpdated={jest.fn()}
          />
        </TestProviders>
      );

      expect(
        getByText(
          'This alert originates from a remote cluster. Some features may not be available.'
        )
      ).toBeInTheDocument();
    });

    it('shows the callout for remote non-alert documents', () => {
      (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasAlertsRead: true, loading: false });

      const remoteEventHit: DataTableRecord = {
        id: '1',
        raw: {},
        flattened: { 'event.kind': 'event', _index: 'remote-cluster:logs-system-default' },
        isAnchor: false,
      } as DataTableRecord;

      const { getByText } = render(
        <TestProviders>
          <DocumentFlyout
            hit={remoteEventHit}
            renderCellActions={jest.fn()}
            onAlertUpdated={jest.fn()}
          />
        </TestProviders>
      );

      expect(
        getByText(
          'This event originates from a remote cluster. Some features may not be available.'
        )
      ).toBeInTheDocument();
    });

    it('does not show the callout for local documents', () => {
      (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasAlertsRead: true, loading: false });

      const { queryByText } = render(
        <TestProviders>
          <DocumentFlyout
            hit={createAlertHit({ _index: '.alerts-security.alerts-default' })}
            renderCellActions={jest.fn()}
            onAlertUpdated={jest.fn()}
          />
        </TestProviders>
      );

      expect(
        queryByText(
          'This alert originates from a remote cluster. Some features may not be available.'
        )
      ).not.toBeInTheDocument();
    });
  });
});
