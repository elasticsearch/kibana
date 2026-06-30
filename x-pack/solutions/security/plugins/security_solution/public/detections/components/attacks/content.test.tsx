/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import type { DataView } from '@kbn/data-views-plugin/common';
import { createStubDataView } from '@kbn/data-views-plugin/common/data_views/data_view.stub';

import { TestProviders } from '../../../common/mock';
import { AttacksPageContent, SECURITY_SOLUTION_PAGE_WRAPPER_TEST_ID } from './content';
import { TABLE_SECTION_TEST_ID } from './table/table_section';
import { FILTER_BY_ASSIGNEES_BUTTON } from '../../../common/components/filter_by_assignees_popover/test_ids';

jest.mock('@kbn/inference-connectors', () => ({
  useLoadConnectors: jest.fn().mockReturnValue({ data: undefined }),
}));

jest.mock('../../../attack_discovery/pages/use_find_attack_discoveries', () => ({
  ...jest.requireActual('../../../attack_discovery/pages/use_find_attack_discoveries'),
  useFindAttackDiscoveries: jest.fn().mockReturnValue({ data: undefined }),
}));

const dataView: DataView = createStubDataView({ spec: {} });

describe('AttacksPageContent', () => {
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

  it('should render `Schedule` button', async () => {
    render(
      <TestProviders>
        <AttacksPageContent dataView={dataView} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('schedule')).toBeInTheDocument();
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
      expect(screen.getByTestId(FILTER_BY_ASSIGNEES_BUTTON)).toBeInTheDocument();
    });
  });
});
