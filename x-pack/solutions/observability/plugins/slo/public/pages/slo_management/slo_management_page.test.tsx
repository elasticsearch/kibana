/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { useFetchSloDefinitions } from '../../hooks/use_fetch_slo_definitions';
import { useFetchSloTemplateTags } from '../../hooks/use_fetch_slo_template_tags';
import { useFetchSloTemplates } from '../../hooks/use_fetch_slo_templates';
import { useKibana } from '../../hooks/use_kibana';
import { useLicense } from '../../hooks/use_license';
import { usePermissions } from '../../hooks/use_permissions';
import { render } from '../../utils/test_helper';
import { SloManagementPage } from './slo_management_page';

const mockNavigateToUrl = jest.fn();
const mockHistoryPush = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useHistory: () => ({
    push: mockHistoryPush,
    location: { pathname: '/management', search: '', hash: '' },
    listen: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock('@kbn/observability-shared-plugin/public', () => ({
  ...jest.requireActual('@kbn/observability-shared-plugin/public'),
  useBreadcrumbs: jest.fn(),
}));
jest.mock('../../hooks/use_kibana');
jest.mock('../../hooks/use_license');
jest.mock('../../hooks/use_permissions');
jest.mock('../../hooks/use_fetch_slo_definitions');
jest.mock('../../hooks/use_fetch_slo_templates');
jest.mock('../../hooks/use_fetch_slo_template_tags');
jest.mock('./components/slo_definitions/slo_management_table', () => ({
  SloManagementTable: () => <div data-test-subj="sloManagementTable">SLO Management Table</div>,
}));
jest.mock('./components/slo_definitions/slo_management_outdated_filter_callout', () => ({
  SloOutdatedFilterCallout: () => null,
}));
jest.mock('../../components/header_menu/header_menu', () => ({
  HeaderMenu: () => null,
}));
jest.mock('./context/bulk_operation', () => ({
  BulkOperationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../../context/action_modal', () => ({
  ActionModalProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useActionModal: () => ({ triggerAction: jest.fn() }),
}));
jest.mock('./hooks/use_templates_url_search_state', () => ({
  useTemplatesUrlSearchState: () => ({
    state: { search: '', tags: [], page: 0, perPage: 20 },
    onStateChange: jest.fn(),
  }),
}));

const useKibanaMock = useKibana as jest.Mock;
const useLicenseMock = useLicense as jest.Mock;
const usePermissionsMock = usePermissions as jest.Mock;
const useFetchSloDefinitionsMock = useFetchSloDefinitions as jest.Mock;
const useFetchSloTemplatesMock = useFetchSloTemplates as jest.Mock;
const useFetchSloTemplateTagsMock = useFetchSloTemplateTags as jest.Mock;

function MockSearchBar(props: Record<string, unknown>) {
  return (
    <div data-test-subj="sloTemplatesSearchBar">
      {typeof props.renderQueryInputAppend === 'function' && props.renderQueryInputAppend()}
    </div>
  );
}

describe('SloManagementPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useKibanaMock.mockReturnValue({
      services: {
        http: { basePath: { prepend: (path: string) => path } },
        application: { navigateToUrl: mockNavigateToUrl },
        unifiedSearch: { ui: { SearchBar: MockSearchBar } },
        serverless: undefined,
        inspector: { open: jest.fn() },
        uiSettings: { get: () => false },
        docLinks: { links: { observability: { slo: 'dummy_link' } } },
      },
    });
    useLicenseMock.mockReturnValue({ hasAtLeast: () => true });
    usePermissionsMock.mockReturnValue({
      data: { hasAllReadRequested: true, hasAllWriteRequested: true },
    });
    useFetchSloDefinitionsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { total: 10 },
    });
    useFetchSloTemplatesMock.mockReturnValue({
      data: { total: 0, page: 1, perPage: 20, results: [] },
      isLoading: false,
      isError: false,
    });
    useFetchSloTemplateTagsMock.mockReturnValue({
      data: { tags: [] },
      isLoading: false,
      isError: false,
    });
  });

  it('renders with definitions tab selected by default', async () => {
    render(<SloManagementPage />);

    expect(screen.getByTestId('managementTabDefinitions')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('managementTabTemplates')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('sloManagementTable')).toBeTruthy();
    expect(await screen.findByTestId('headerControlActionsButton')).toBeTruthy();
  });

  it('navigates to templates tab when clicked', () => {
    render(<SloManagementPage />);

    fireEvent.click(screen.getByTestId('managementTabTemplates'));

    expect(mockHistoryPush).toHaveBeenCalledWith('/management/templates');
  });

  it('navigates to definitions tab when clicked', () => {
    render(<SloManagementPage />);

    fireEvent.click(screen.getByTestId('managementTabDefinitions'));

    expect(mockHistoryPush).toHaveBeenCalledWith('/management');
  });
});
