/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { of } from 'rxjs';
import type { DataView } from '@kbn/data-views-plugin/common';
import { createStubDataView } from '@kbn/data-views-plugin/common/data_views/data_view.stub';

import { TestProviders } from '../../../common/mock';
import { AttacksPageContent, SECURITY_SOLUTION_PAGE_WRAPPER_TEST_ID } from './content';
import { KPIS_SECTION } from './kpis/kpis_section';
import { TABLE_SECTION_TEST_ID } from './table/table_section';
import { useKibana } from '../../../common/lib/kibana';
import { AttacksEventTypes } from '../../../common/lib/telemetry';

import { useAttackDiscoveryControls } from '../../../attack_discovery/pages/use_attack_discovery_controls';

jest.mock('../../../common/lib/kibana');

jest.mock('./kpis/kpis_section', () => ({
  KPIsSection: () => <div data-test-subj="attacks-kpis-section" />,
  KPIS_SECTION: 'attacks-kpis-section',
}));

jest.mock('./search_bar/search_bar_section', () => ({
  SearchBarSection: () => <div data-test-subj="search-bar-section" />,
}));

jest.mock('./filters/type_filter', () => ({
  TypeFilter: () => <div data-test-subj="mock-type-filter" />,
}));

jest.mock(
  '../../../common/components/filter_by_assignees_popover/filter_by_assignees_popover',
  () => ({
    FilterByAssigneesPopover: () => <div data-test-subj="mock-filter-by-assignees-popover" />,
  })
);

jest.mock('./table/table_section', () => ({
  TableSection: () => <div data-test-subj="attacks-page-table-section" />,
  TABLE_SECTION_TEST_ID: 'attacks-page-table-section',
}));

jest.mock('../../../attack_discovery/pages/use_attack_discovery_controls', () => ({
  useAttackDiscoveryControls: jest.fn().mockReturnValue({
    connectorId: 'test-connector',
    isLoading: false,
    onGenerate: jest.fn(),
    openFlyout: jest.fn(),
    settingsFlyout: null,
  }),
}));

jest.mock('@kbn/inference-connectors', () => ({
  useLoadConnectors: jest.fn().mockReturnValue({ data: undefined }),
}));

jest.mock('../../../attack_discovery/pages/use_find_attack_discoveries', () => ({
  ...jest.requireActual('../../../attack_discovery/pages/use_find_attack_discoveries'),
  useFindAttackDiscoveries: jest.fn().mockReturnValue({ data: undefined }),
}));

const dataView: DataView = createStubDataView({ spec: {} });

describe('AttacksPageContent', () => {
  const reportEvent = jest.fn();

  beforeEach(() => {
    (useKibana as jest.Mock).mockReturnValue({
      services: {
        settings: {
          client: {
            get: jest.fn(),
            get$: jest.fn().mockReturnValue(of(undefined)),
            getUpdate$: jest.fn().mockReturnValue(of()),
          },
        },
        telemetry: {
          reportEvent,
        },
        storage: {
          get: jest.fn(),
          set: jest.fn(),
          remove: jest.fn(),
        },
      },
    });
  });

  it('should render correctly', async () => {
    render(
      <TestProviders>
        <AttacksPageContent dataView={dataView} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId(SECURITY_SOLUTION_PAGE_WRAPPER_TEST_ID)).toBeInTheDocument();
      expect(screen.getByTestId('header-page-title')).toHaveTextContent('Attacks');
      expect(screen.getByTestId(TABLE_SECTION_TEST_ID)).toBeInTheDocument();
    });
  });

  it('should render `Schedule` button and report telemetry when clicked', async () => {
    const openFlyoutMock = jest.fn();
    (useAttackDiscoveryControls as jest.Mock).mockReturnValue({
      connectorId: 'test-connector',
      isLoading: false,
      onGenerate: jest.fn(),
      openFlyout: openFlyoutMock,
      settingsFlyout: null,
    });

    render(
      <TestProviders>
        <AttacksPageContent dataView={dataView} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('schedule')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('schedule'));

    expect(openFlyoutMock).toHaveBeenCalledWith('schedule');
    expect(reportEvent).toHaveBeenCalledWith(AttacksEventTypes.ScheduleFlyoutOpened, {
      source: 'attacks_page_header',
    });
  });

  it('should render `Settings` button and report telemetry when clicked', async () => {
    const openFlyoutMock = jest.fn();
    (useAttackDiscoveryControls as jest.Mock).mockReturnValue({
      connectorId: 'test-connector',
      isLoading: false,
      onGenerate: jest.fn(),
      openFlyout: openFlyoutMock,
      settingsFlyout: null,
    });

    render(
      <TestProviders>
        <AttacksPageContent dataView={dataView} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('settings')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('settings'));

    expect(openFlyoutMock).toHaveBeenCalledWith('settings');
    expect(reportEvent).toHaveBeenCalledWith(AttacksEventTypes.SettingsFlyoutOpened, {
      source: 'attacks_page_header',
    });
  });

  it('should render `Run` button and report telemetry when clicked', async () => {
    const onGenerateMock = jest.fn();
    (useAttackDiscoveryControls as jest.Mock).mockReturnValue({
      connectorId: 'test-connector',
      isLoading: false,
      onGenerate: onGenerateMock,
      openFlyout: jest.fn(),
      settingsFlyout: null,
    });

    render(
      <TestProviders>
        <AttacksPageContent dataView={dataView} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('run')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('run'));

    expect(onGenerateMock).toHaveBeenCalled();
    expect(reportEvent).toHaveBeenCalledWith(AttacksEventTypes.GenerateClicked, {
      source: 'attacks_page_header',
    });
  });

  it('should render `Type` filter', async () => {
    render(
      <TestProviders>
        <AttacksPageContent dataView={dataView} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-type-filter')).toBeInTheDocument();
    });
  });

  it('should render `Connector` filter', async () => {
    render(
      <TestProviders>
        <AttacksPageContent dataView={dataView} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('connectorFilterButton')).toBeInTheDocument();
    });
  });

  it('should render `Assignee` button', async () => {
    render(
      <TestProviders>
        <AttacksPageContent dataView={dataView} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-filter-by-assignees-popover')).toBeInTheDocument();
    });
  });

  it('should render KPIs section', async () => {
    render(
      <TestProviders>
        <AttacksPageContent dataView={dataView} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId(KPIS_SECTION)).toBeInTheDocument();
    });
  });
});
