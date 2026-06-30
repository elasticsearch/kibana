/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { EuiProvider } from '@elastic/eui';

import { PacksTable } from './packs_table';
import type { OsqueryCapabilities } from '../../../__test_helpers__/create_mock_kibana_services';
import { ROLE_CAPABILITIES } from '../../../__test_helpers__/create_mock_kibana_services';

const mockPush = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useHistory: () => ({ push: mockPush }),
}));

const mockUseKibana = jest.fn();
const mockUseRouterNavigate = jest.fn();

jest.mock('../../../common/lib/kibana', () => ({
  ...jest.requireActual('../../../common/lib/kibana'),
  useKibana: () => mockUseKibana(),
  useRouterNavigate: (path: string) => {
    mockUseRouterNavigate(path);

    return { onClick: jest.fn(), href: path };
  },
}));

jest.mock('../../../common/use_persisted_page_size', () => ({
  usePersistedPageSize: jest.fn(() => [20, jest.fn()]),
  PAGE_SIZE_OPTIONS: [10, 20, 50],
}));

const mockUsePackUsers = jest.fn(() => ({
  users: [],
  profilesMap: new Map(),
  isLoading: false,
}));

jest.mock('../../../common/use_saved_object_users', () => ({
  usePackUsers: () => mockUsePackUsers(),
}));

jest.mock('../../../packs/active_state_switch', () => ({
  ActiveStateSwitch: ({ item }: { item: { enabled: boolean; name: string } }) => (
    <div data-test-subj={`pack-switch-${item.name}`}>{item.enabled ? 'Active' : 'Inactive'}</div>
  ),
}));

jest.mock('../../../packs/pack_row_actions', () => ({
  PackRowActions: ({ item }: { item: { name: string } }) => (
    <div data-test-subj={`pack-row-actions-${item.name}`}>Actions Menu</div>
  ),
}));

jest.mock('./empty_state', () => ({
  PacksTableEmptyState: () => <div data-test-subj="packsEmptyState">No packs</div>,
}));

jest.mock('./load_integration_assets', () => ({
  LoadIntegrationAssetsButton: () => (
    <button data-test-subj="loadIntegrationAssets">Load integration assets</button>
  ),
}));

jest.mock('../../../components/table_toolbar', () => ({
  TableToolbar: (props: any) => <div data-test-subj="table-toolbar">{props.actionButton}</div>,
}));

jest.mock('../../../actions/components/run_by_column', () => ({
  RunByColumn: ({ userId }: { userId?: string }) => <span>{userId ?? 'unknown'}</span>,
}));

const mockUsePacks = jest.fn();

jest.mock('../../../packs/use_packs', () => ({
  usePacks: (...args: unknown[]) => mockUsePacks(...args),
}));

const createPack = (overrides: Record<string, unknown> = {}) => ({
  name: 'test-pack',
  saved_object_id: 'so-pack-1',
  description: 'Test pack',
  queries: { q1: { query: 'SELECT * FROM uptime' } },
  policy_ids: ['policy-1'],
  enabled: true,
  created_by: 'elastic',
  updated_at: '2025-06-15T10:00:00.000Z',
  ...overrides,
});

const setupKibana = (capabilities: Partial<OsqueryCapabilities> = {}) => {
  mockUseKibana.mockReturnValue({
    services: {
      application: {
        capabilities: {
          osquery: { ...ROLE_CAPABILITIES.admin, ...capabilities },
        },
      },
    },
  });
};

const createTestQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } });

const renderComponent = (props: { hasAssetsToInstall?: boolean } = {}) =>
  render(
    <EuiProvider>
      <IntlProvider locale="en">
        <QueryClientProvider client={createTestQueryClient()}>
          <PacksTable {...props} />
        </QueryClientProvider>
      </IntlProvider>
    </EuiProvider>
  );

describe('PacksTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupKibana();
    mockUsePacks.mockReturnValue({
      data: {
        data: [
          createPack({ name: 'pack-alpha', saved_object_id: 'so-1', enabled: true }),
          createPack({ name: 'pack-beta', saved_object_id: 'so-2', enabled: false }),
        ],
        total: 2,
      },
      isLoading: false,
      isFetching: false,
    });
  });

  describe('columns', () => {
    it('should render all expected columns', () => {
      renderComponent();

      expect(screen.getByText('Actions')).toBeInTheDocument();
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Scheduled policies')).toBeInTheDocument();
      expect(screen.getByText('Number of queries')).toBeInTheDocument();
      expect(screen.getByText('Created by')).toBeInTheDocument();
      expect(screen.getByText('Last updated')).toBeInTheDocument();
      expect(screen.getByText('Enable')).toBeInTheDocument();
    });

    it('should render pack names as links', () => {
      renderComponent();

      expect(screen.getByText('pack-alpha')).toBeInTheDocument();
      expect(screen.getByText('pack-beta')).toBeInTheDocument();
    });

    it('should link each pack name directly to its edit page', () => {
      renderComponent();

      expect(screen.getByText('pack-alpha').closest('a')).toHaveAttribute(
        'href',
        'packs/so-1/edit'
      );
      expect(screen.getByText('pack-beta').closest('a')).toHaveAttribute('href', 'packs/so-2/edit');
    });
  });

  describe('active/inactive toggle', () => {
    it('should render ActiveStateSwitch for each pack', () => {
      renderComponent();

      expect(screen.getByTestId('pack-switch-pack-alpha')).toHaveTextContent('Active');
      expect(screen.getByTestId('pack-switch-pack-beta')).toHaveTextContent('Inactive');
    });
  });

  describe('row actions', () => {
    it('should render row actions menu for each pack', () => {
      renderComponent();

      expect(screen.getByTestId('pack-row-actions-pack-alpha')).toBeInTheDocument();
      expect(screen.getByTestId('pack-row-actions-pack-beta')).toBeInTheDocument();
    });
  });

  describe('permissions', () => {
    it('should disable run button when user lacks write and run permissions', () => {
      setupKibana(ROLE_CAPABILITIES.reader);

      renderComponent();

      const runButtons = screen.getAllByLabelText(/Run pack/);
      runButtons.forEach((btn) => {
        expect(btn).toBeDisabled();
      });
    });

    it('should enable run button when user has writeLiveQueries permission', () => {
      renderComponent();

      const runButtons = screen.getAllByLabelText(/Run pack/);
      runButtons.forEach((btn) => {
        expect(btn).not.toBeDisabled();
      });
    });

    it('should disable Create pack button when user lacks writePacks', () => {
      setupKibana({ ...ROLE_CAPABILITIES.admin, writePacks: false });

      renderComponent();

      expect(screen.getByText('Create pack').closest('a, button')).toBeDisabled();
    });

    it('should enable Create pack button when user has writePacks', () => {
      renderComponent();

      expect(screen.getByText('Create pack').closest('a, button')).not.toBeDisabled();
    });
  });

  describe('empty state', () => {
    it('should show empty state when no packs and assets available', () => {
      mockUsePacks.mockReturnValue({
        data: { data: [], total: 0 },
        isLoading: false,
        isFetching: false,
      });

      renderComponent({ hasAssetsToInstall: true });

      expect(screen.getByTestId('packsEmptyState')).toBeInTheDocument();
    });

    it('should show table when packs exist', () => {
      renderComponent();

      expect(screen.queryByTestId('packsEmptyState')).not.toBeInTheDocument();
      expect(screen.getByText('pack-alpha')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show skeleton when data is loading', () => {
      mockUsePacks.mockReturnValue({
        data: undefined,
        isLoading: true,
        isFetching: true,
      });

      const { container } = renderComponent();
      expect(container.querySelector('.euiSkeletonText')).toBeInTheDocument();
    });
  });
});
