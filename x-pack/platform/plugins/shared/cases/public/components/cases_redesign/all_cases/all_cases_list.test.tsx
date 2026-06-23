/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import moment from 'moment-timezone';
import { waitFor, screen, within, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { waitForEuiPopoverOpen } from '@elastic/eui/lib/test/rtl';

import {
  TestProviders,
  noCreateCasesPermissions,
  noDeleteCasesPermissions,
  readCasesPermissions,
  renderWithTestingProviders,
} from '../../../common/mock';
import { useGetCasesMockState, connectorsMock } from '../../../containers/mock';

import { SortFieldCase } from '../../../../common/ui/types';
import { CaseSeverity, CaseStatuses } from '../../../../common/types/domain';
import { SECURITY_SOLUTION_OWNER } from '../../../../common/constants';
import { useKibana } from '../../../common/lib/kibana';
import { AllCasesList } from './all_cases_list';
import { VIEW_TOGGLE_LIST_ID, VIEW_TOGGLE_TABLE_ID } from './constants';
import * as useViewModeModule from './hooks/use_view_mode';
import { useCasesColumns } from '../../all_cases/use_cases_columns';
import { triggersActionsUiMock } from '@kbn/triggers-actions-ui-plugin/public/mocks';
import { registerConnectorsToMockActionRegistry } from '../../../common/mock/register_connectors';
import { createStartServicesMock } from '../../../common/lib/kibana/kibana_react.mock';
import { waitForComponentToUpdate } from '../../../common/test_utils';
import { useGetSupportedActionConnectors } from '../../../containers/configure/use_get_supported_action_connectors';
import { useGetTags } from '../../../containers/use_get_tags';
import { useGetCategories } from '../../../containers/use_get_categories';
import { useUpdateCase } from '../../../containers/use_update_case';
import { useGetCases } from '../../../containers/use_get_cases';
import {
  DEFAULT_QUERY_PARAMS,
  DEFAULT_FILTER_OPTIONS,
  DEFAULT_CASES_TABLE_STATE,
} from '../../../containers/constants';
import { useGetCurrentUserProfile } from '../../../containers/user_profiles/use_get_current_user_profile';
import { userProfiles, userProfilesMap } from '../../../containers/user_profiles/api.mock';
import { useBulkGetUserProfiles } from '../../../containers/user_profiles/use_bulk_get_user_profiles';
import { useLicense } from '../../../common/use_license';
import * as api from '../../../containers/api';
import { useGetCaseConfiguration } from '../../../containers/configure/use_get_case_configuration';
import { useCaseConfigureResponse } from '../../configure_cases/__mock__';
import { useSuggestUserProfiles } from '../../../containers/user_profiles/use_suggest_user_profiles';
import * as i18n from './translations';

jest.mock('../../../containers/configure/use_get_case_configuration');
jest.mock('../../../containers/use_get_cases');
jest.mock('../../../containers/use_get_action_license');
jest.mock('../../../containers/use_get_tags');
jest.mock('../../../containers/use_get_categories');
jest.mock('../../../containers/user_profiles/use_get_current_user_profile');
jest.mock('../../../containers/user_profiles/use_bulk_get_user_profiles');
jest.mock('../../../containers/configure/use_get_supported_action_connectors');
jest.mock('../../../common/lib/kibana');
jest.mock('../../../common/navigation/hooks');
jest.mock('../../app/use_available_owners', () => ({
  useAvailableCasesOwners: () => ['securitySolution', 'observability'],
}));
jest.mock('../../../containers/use_update_case');
jest.mock('../../../common/use_license');
jest.mock('../../../containers/user_profiles/use_suggest_user_profiles');
jest.mock('./hooks/use_view_mode', () => ({
  useViewMode: jest.fn(),
}));

const useViewModeMock = useViewModeModule.useViewMode as jest.Mock;

const useGetCaseConfigurationMock = useGetCaseConfiguration as jest.Mock;
const useGetCasesMock = useGetCases as jest.Mock;
const useGetTagsMock = useGetTags as jest.Mock;
const useGetCurrentUserProfileMock = useGetCurrentUserProfile as jest.Mock;
const useBulkGetUserProfilesMock = useBulkGetUserProfiles as jest.Mock;
const useKibanaMock = useKibana as jest.MockedFunction<typeof useKibana>;
const useGetConnectorsMock = useGetSupportedActionConnectors as jest.Mock;
const useUpdateCaseMock = useUpdateCase as jest.Mock;
const useLicenseMock = useLicense as jest.Mock;
const useGetCategoriesMock = useGetCategories as jest.Mock;
const useSuggestUserProfilesMock = useSuggestUserProfiles as jest.Mock;

const mockTriggersActionsUiService = triggersActionsUiMock.createStart();

const mockKibana = () => {
  useKibanaMock.mockReturnValue({
    services: {
      ...createStartServicesMock(),
      triggersActionsUi: mockTriggersActionsUiService,
    },
  } as unknown as ReturnType<typeof useKibana>);
};

const mockEarliestCaseParams = {
  filterOptions: { from: undefined, to: undefined, owner: [] },
  queryParams: {
    page: 1,
    perPage: 1,
    sortField: SortFieldCase.createdAt,
    sortOrder: 'asc',
  },
};

// eslint-disable-next-line prefer-object-spread
const originalGetComputedStyle = Object.assign({}, window.getComputedStyle);

const restoreGetComputedStyle = () => {
  Object.defineProperty(window, 'getComputedStyle', originalGetComputedStyle);
};

const patchGetComputedStyle = () => {
  // The JSDOM implementation is too slow
  // Especially for dropdowns that try to position themselves
  // perf issue - https://github.com/jsdom/jsdom/issues/3234
  Object.defineProperty(window, 'getComputedStyle', {
    value: (el: HTMLElement) => {
      /**
       * This is based on the jsdom implementation of getComputedStyle
       * https://github.com/jsdom/jsdom/blob/9dae17bf0ad09042cfccd82e6a9d06d3a615d9f4/lib/jsdom/browser/Window.js#L779-L820
       *
       * It is missing global style parsing and will only return styles applied directly to an element.
       * Will not return styles that are global or from emotion
       */
      const declaration = new CSSStyleDeclaration();
      const { style } = el;

      Array.prototype.forEach.call(style, (property: string) => {
        declaration.setProperty(
          property,
          style.getPropertyValue(property),
          style.getPropertyPriority(property)
        );
      });

      return declaration;
    },
    configurable: true,
    writable: true,
  });
};

describe('AllCasesListGeneric', () => {
  const onRowClick = jest.fn();
  const updateCaseProperty = jest.fn();

  const defaultGetCases = {
    ...useGetCasesMockState,
  };

  const defaultColumnArgs = {
    filterStatus: [CaseStatuses.open],
    handleIsLoading: jest.fn(),
    isLoadingCases: [],
    isLoadingColumns: false,
    isSelectorView: false,
    userProfiles: new Map(),
    currentUserProfile: undefined,
    selectedColumns: [],
  };

  const removeMsFromDate = (value: string) => moment(value).format('YYYY-MM-DDTHH:mm:ss[Z]');

  beforeAll(() => {
    patchGetComputedStyle();
    mockKibana();
    const {
      triggersActionsUi: { actionTypeRegistry },
    } = useKibanaMock().services;

    registerConnectorsToMockActionRegistry(actionTypeRegistry, connectorsMock);
  });

  afterAll(() => {
    restoreGetComputedStyle();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    useViewModeMock.mockReturnValue({
      viewMode: VIEW_TOGGLE_TABLE_ID,
      setViewMode: jest.fn(),
    });
    useGetCasesMock.mockReturnValue(defaultGetCases);
    useGetTagsMock.mockReturnValue({ data: ['coke', 'pepsi'], isLoading: false });
    useGetCategoriesMock.mockReturnValue({ data: ['twix', 'snickers'], isLoading: false });
    useGetCurrentUserProfileMock.mockReturnValue({ data: userProfiles[0], isLoading: false });
    useGetConnectorsMock.mockImplementation(() => ({ data: connectorsMock, isLoading: false }));
    useGetCaseConfigurationMock.mockImplementation(() => useCaseConfigureResponse);
    useBulkGetUserProfilesMock.mockReturnValue({ data: userProfilesMap });
    useUpdateCaseMock.mockReturnValue({ mutate: updateCaseProperty });
    useLicenseMock.mockReturnValue({ isAtLeastGold: () => false, isAtLeastPlatinum: () => false });
    useSuggestUserProfilesMock.mockReturnValue({ data: userProfiles, isLoading: false });
    mockKibana();
    moment.tz.setDefault('UTC');
    window.localStorage.clear();
  });

  afterEach(() => {
    moment.tz.setDefault('Browser');
  });

  it('should render AllCasesList', async () => {
    useLicenseMock.mockReturnValue({ isAtLeastGold: () => true, isAtLeastPlatinum: () => true });
    renderWithTestingProviders(<AllCasesList />);

    const caseDetailsLinks = await screen.findAllByTestId('case-details-link');

    expect(caseDetailsLinks[0]).toHaveAttribute('href', '/app/security/cases/test');
    expect(caseDetailsLinks[0]).toHaveTextContent(useGetCasesMockState.data.cases[0].title);
    expect(
      (await screen.findAllByTestId('case-user-profile-avatar-damaged_raccoon'))[0]
    ).toHaveTextContent('DR');

    const incrementalIdTextElements = screen.getAllByTestId('cases-incremental-id-text');
    expect(incrementalIdTextElements).toHaveLength(1);
    expect(incrementalIdTextElements[0]).toHaveTextContent('#1');

    expect((await screen.findAllByTestId('case-table-column-tags-coke'))[0]).toHaveAttribute(
      'title',
      useGetCasesMockState.data.cases[0].tags[0]
    );

    const createdAtColumn = screen.getAllByTestId('case-table-column-createdAt')[0];

    expect(
      within(createdAtColumn).getByText(
        removeMsFromDate(useGetCasesMockState.data.cases[0].createdAt)
      )
    ).toBeInTheDocument();

    expect(await screen.findByTestId('case-table-case-count')).toHaveTextContent(
      `Showing 10 of ${useGetCasesMockState.data.total}`
    );

    expect(screen.queryByTestId('all-cases-maximum-limit-warning')).not.toBeInTheDocument();
    expect(screen.queryByTestId('all-cases-clear-filters-link-icon')).not.toBeInTheDocument();
  });

  it("should show a tooltip with the assignee's email when hover over the assignee avatar", async () => {
    useLicenseMock.mockReturnValue({ isAtLeastGold: () => true, isAtLeastPlatinum: () => true });

    renderWithTestingProviders(<AllCasesList />);

    await userEvent.hover(
      (
        await screen.findAllByTestId('case-user-profile-avatar-damaged_raccoon')
      )[0]
    );

    expect(await screen.findByText('damaged_raccoon@elastic.co')).toBeInTheDocument();
  });

  it('should show a tooltip with all tags when hovered', async () => {
    renderWithTestingProviders(<AllCasesList />);

    await userEvent.hover((await screen.findAllByTestId('case-table-column-tags'))[0]);

    expect(await screen.findByTestId('case-table-column-tags-tooltip')).toBeTruthy();
  });

  it('should render empty fields', async () => {
    useGetCasesMock.mockReturnValue({
      ...defaultGetCases,
      data: {
        ...defaultGetCases.data,
        cases: [
          {
            ...defaultGetCases.data.cases[0],
            id: null,
            createdAt: null,
            createdBy: null,
            updatedAt: null,
            status: null,
            severity: null,
            tags: null,
            title: null,
            totalComment: null,
            totalAlerts: null,
            assignees: [],
          },
        ],
      },
    });

    renderWithTestingProviders(<AllCasesList />);

    const checkIt = async (columnName: string, key: number) => {
      const column = screen.getByText(columnName);

      expect(column).toBeInTheDocument();
      expect(within(column).getByText('-')).toBeInTheDocument();
    };

    const { result } = renderHook(() => useCasesColumns(defaultColumnArgs), {
      wrapper: ({ children }) => <TestProviders>{children}</TestProviders>,
    });

    await waitFor(() => {
      result.current.columns.map(
        (i, key) => i.name != null && i.name !== 'Actions' && checkIt(`${i.name}`, key)
      );
    });
  });

  it('should not call onCreateCasePressed if onRowClick is not provided when create case from case page', async () => {
    useGetCasesMock.mockReturnValue({
      ...defaultGetCases,
      data: {
        ...defaultGetCases.data,
        cases: [],
      },
    });
    renderWithTestingProviders(<AllCasesList isSelectorView={false} />);
    await userEvent.click(await screen.findByTestId('cases-table-add-case'));
    await waitFor(() => {
      expect(onRowClick).not.toHaveBeenCalled();
    });
  });

  it('should tableHeaderSortButton AllCasesList', async () => {
    renderWithTestingProviders(<AllCasesList />);

    await userEvent.click((await screen.findAllByTestId('tableHeaderSortButton'))[0]);

    await waitFor(() => {
      expect(useGetCasesMock).toBeCalledWith(
        expect.objectContaining({
          queryParams: {
            ...DEFAULT_QUERY_PARAMS,
          },
        })
      );
    });
  });

  it('renders the columns correctly', async () => {
    renderWithTestingProviders(<AllCasesList isSelectorView={false} />);

    const casesTable = within(await screen.findByTestId('cases-table'));

    expect(await casesTable.findByTitle('Name')).toBeInTheDocument();
    expect(await casesTable.findByTitle('Category')).toBeInTheDocument();
    expect(await casesTable.findByTitle('Created on')).toBeInTheDocument();
    expect(await casesTable.findByTitle('Updated on')).toBeInTheDocument();
    expect(await casesTable.findByTitle('Status')).toBeInTheDocument();
    expect(await casesTable.findByTitle('Severity')).toBeInTheDocument();
    expect(await casesTable.findByTitle('Tags')).toBeInTheDocument();
    expect(await casesTable.findByTitle('Alerts')).toBeInTheDocument();
    expect(await casesTable.findByTitle('Comments')).toBeInTheDocument();
    expect(await casesTable.findByTitle('External incident')).toBeInTheDocument();
    expect(await casesTable.findByTitle('Actions')).toBeInTheDocument();
  });

  it('should not render table utility bar when isSelectorView=true', async () => {
    renderWithTestingProviders(<AllCasesList isSelectorView={true} />);

    expect(screen.queryByTestId('case-table-selected-case-count')).not.toBeInTheDocument();
    expect(screen.queryByTestId('case-table-bulk-actions')).not.toBeInTheDocument();
  });

  it('should not render table utility bar when the user does not have permissions to delete', async () => {
    renderWithTestingProviders(<AllCasesList isSelectorView={true} />, {
      wrapperProps: { permissions: noDeleteCasesPermissions() },
    });

    expect(screen.queryByTestId('case-table-selected-case-count')).not.toBeInTheDocument();
    expect(screen.queryByTestId('case-table-bulk-actions')).not.toBeInTheDocument();
  });

  it('should render metrics when isSelectorView=false', async () => {
    renderWithTestingProviders(<AllCasesList isSelectorView={false} />);

    expect(await screen.findByTestId('cases-metrics-stats')).toBeInTheDocument();
  });

  it('should not render metrics when isSelectorView=true', async () => {
    renderWithTestingProviders(<AllCasesList isSelectorView={true} />);

    expect(screen.queryByTestId('case-table-selected-case-count')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cases-metrics-stats')).not.toBeInTheDocument();
  });

  it('should call onRowClick with no cases and isSelectorView=true when create case is clicked', async () => {
    renderWithTestingProviders(<AllCasesList isSelectorView={true} onRowClick={onRowClick} />);
    await userEvent.click(await screen.findByTestId('cases-table-add-case-filter-bar'));
    const isCreateCase = true;

    await waitFor(() => {
      expect(onRowClick).toHaveBeenCalled();
    });

    expect(onRowClick).toBeCalledWith(undefined, isCreateCase);
  });

  it('should not render the create new case link when the user does not have create privileges', async () => {
    renderWithTestingProviders(<AllCasesList />, {
      wrapperProps: { permissions: noCreateCasesPermissions() },
    });

    await screen.findByTestId('cases-table');

    expect(screen.queryByTestId('cases-table-add-case')).not.toBeInTheDocument();
  });

  it('should call onRowClick when clicking a case with modal=true', async () => {
    const theCase = defaultGetCases.data.cases[0];

    renderWithTestingProviders(<AllCasesList isSelectorView={true} onRowClick={onRowClick} />);

    await userEvent.click(await screen.findByTestId(`cases-table-row-select-${theCase.id}`));

    await waitFor(() => {
      expect(onRowClick).toHaveBeenCalledWith(theCase);
    });
  });

  it('should disable select and not call onRowClick for closed cases with modal=true', async () => {
    const theCase = {
      ...defaultGetCases.data.cases[0],
      status: CaseStatuses.closed,
    };
    useGetCasesMock.mockReturnValue({
      ...defaultGetCases,
      data: {
        ...defaultGetCases.data,
        cases: [theCase, ...defaultGetCases.data.cases.slice(1)],
      },
    });

    renderWithTestingProviders(<AllCasesList isSelectorView={true} onRowClick={onRowClick} />);

    const selectButton = await screen.findByTestId(`cases-table-row-select-${theCase.id}`);
    expect(selectButton).toBeDisabled();
    expect(selectButton).toHaveTextContent('Select');
    expect(selectButton).not.toHaveTextContent('Added');

    await userEvent.click(selectButton);
    await waitFor(() => {
      expect(onRowClick).not.toHaveBeenCalled();
    });
  });

  it('should NOT call onRowClick when clicking a case with modal=true', async () => {
    renderWithTestingProviders(<AllCasesList isSelectorView={false} />);

    await userEvent.click(await screen.findByTestId('cases-table-row-1'));

    await waitFor(() => {
      expect(onRowClick).not.toHaveBeenCalled();
    });
  });

  it('should sort by status', async () => {
    renderWithTestingProviders(<AllCasesList isSelectorView={false} />);

    // 0 is the status filter button label
    await userEvent.click((await screen.findAllByTitle('Status'))[1]);

    await waitFor(() => {
      expect(useGetCasesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          queryParams: {
            ...DEFAULT_QUERY_PARAMS,
            sortField: SortFieldCase.status,
            sortOrder: 'asc',
          },
        })
      );
    });
    await waitFor(() => {
      expect(useGetCasesMock).toHaveBeenCalledWith(mockEarliestCaseParams);
    });
  });

  it('should render Name, Category, CreatedOn and Severity columns when isSelectorView=true', async () => {
    renderWithTestingProviders(<AllCasesList isSelectorView={true} />);

    expect(await screen.findByTitle('Name')).toBeInTheDocument();
    expect(await screen.findByTitle('Category')).toBeInTheDocument();
    expect(await screen.findByTitle('Created on')).toBeInTheDocument();
    // 0 is the severity filter button label
    expect((await screen.findAllByTitle('Severity'))[1]).toBeInTheDocument();
  });

  it('should sort by severity', async () => {
    renderWithTestingProviders(<AllCasesList isSelectorView={false} />);

    // 0 is the severity filter button label
    await userEvent.click((await screen.findAllByTitle('Severity'))[1]);

    await waitFor(() => {
      expect(useGetCasesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          queryParams: {
            ...DEFAULT_QUERY_PARAMS,
            sortField: SortFieldCase.severity,
            sortOrder: 'asc',
          },
        })
      );
    });
    await waitFor(() => {
      expect(useGetCasesMock).toHaveBeenCalledWith(mockEarliestCaseParams);
    });
  });

  it('should sort by title', async () => {
    renderWithTestingProviders(<AllCasesList isSelectorView={false} />);

    await userEvent.click(await screen.findByTitle('Name'));

    await waitFor(() => {
      expect(useGetCasesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          queryParams: {
            ...DEFAULT_QUERY_PARAMS,
            sortField: SortFieldCase.title,
            sortOrder: 'asc',
          },
        })
      );
    });

    await waitFor(() => {
      expect(useGetCasesMock).toHaveBeenCalledWith(mockEarliestCaseParams);
    });
  });

  it('should sort by updatedOn', async () => {
    renderWithTestingProviders(<AllCasesList isSelectorView={false} />);

    await userEvent.click(await screen.findByTitle('Updated on'));

    await waitFor(() => {
      expect(useGetCasesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          queryParams: {
            ...DEFAULT_QUERY_PARAMS,
            sortField: SortFieldCase.updatedAt,
            sortOrder: 'asc',
          },
        })
      );
    });

    await waitFor(() => {
      expect(useGetCasesMock).toHaveBeenCalledWith(mockEarliestCaseParams);
    });
  });

  it('should sort by category', async () => {
    renderWithTestingProviders(<AllCasesList isSelectorView={false} />);

    await userEvent.click(await screen.findByTitle('Category'));

    await waitFor(() => {
      expect(useGetCasesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          queryParams: {
            ...DEFAULT_QUERY_PARAMS,
            sortField: SortFieldCase.category,
            sortOrder: 'asc',
          },
        })
      );
    });

    await waitFor(() => {
      expect(useGetCasesMock).toHaveBeenCalledWith(mockEarliestCaseParams);
    });
  });

  it('should filter by category', async () => {
    renderWithTestingProviders(<AllCasesList isSelectorView={false} />);

    await userEvent.click(await screen.findByTestId('options-filter-popover-button-category'));
    await waitForEuiPopoverOpen();
    await userEvent.click(await screen.findByTestId('options-filter-popover-item-twix'));

    await waitFor(() => {
      expect(useGetCasesMock).toHaveBeenCalledWith({
        filterOptions: {
          ...DEFAULT_FILTER_OPTIONS,
          category: ['twix'],
        },
        queryParams: DEFAULT_QUERY_PARAMS,
      });
    });

    await waitFor(() => {
      expect(useGetCasesMock).toHaveBeenCalledWith(mockEarliestCaseParams);
    });
  });

  it('should show the correct count on stats', async () => {
    renderWithTestingProviders(<AllCasesList isSelectorView={false} />);

    await userEvent.click(await screen.findByTestId('options-filter-popover-button-status'));

    expect(await screen.findByTestId('options-filter-popover-item-open')).toHaveTextContent(
      'Open (20)'
    );
    expect(await screen.findByTestId('options-filter-popover-item-in-progress')).toHaveTextContent(
      'In progress (40)'
    );
    expect(await screen.findByTestId('options-filter-popover-item-closed')).toHaveTextContent(
      'Closed (130)'
    );
  });

  it('shows Solution column if there are no set owners', async () => {
    renderWithTestingProviders(<AllCasesList isSelectorView={false} />, {
      wrapperProps: { owner: [] },
    });

    expect((await screen.findAllByText('Solution'))[0]).toBeInTheDocument();
  });

  it('hides Solution column if there is a set owner', async () => {
    renderWithTestingProviders(<AllCasesList isSelectorView={false} />);

    expect(screen.queryByText('Solution')).not.toBeInTheDocument();
  });

  it('should deselect cases when refreshing', async () => {
    renderWithTestingProviders(<AllCasesList />);

    const allCheckbox = await screen.findByTestId('checkboxSelectAll');
    await userEvent.click(allCheckbox);
    const checkboxes = await screen.findAllByRole('checkbox');

    for (const checkbox of checkboxes) {
      expect(checkbox).toBeChecked();
    }

    await userEvent.click(await screen.findByText('Refresh'));
    for (const checkbox of checkboxes) {
      expect(checkbox).not.toBeChecked();
    }

    await waitForComponentToUpdate();
  });

  it('should deselect cases when changing filters', async () => {
    useGetCasesMock.mockReturnValue({
      ...defaultGetCases,
      selectedCases: [],
    });

    renderWithTestingProviders(<AllCasesList />);

    const allCheckbox = await screen.findByTestId('checkboxSelectAll');

    await userEvent.click(allCheckbox);
    const checkboxes = await screen.findAllByRole('checkbox');

    for (const checkbox of checkboxes) {
      expect(checkbox).toBeChecked();
    }

    await userEvent.click(await screen.findByTestId('options-filter-popover-button-status'));
    await waitForEuiPopoverOpen();
    await userEvent.click(await screen.findByTestId('options-filter-popover-item-open'));

    for (const checkbox of checkboxes) {
      expect(checkbox).not.toBeChecked();
    }

    await waitForComponentToUpdate();
  });

  it('should hide the alerts column if the alert feature is disabled', async () => {
    renderWithTestingProviders(<AllCasesList />, {
      wrapperProps: { features: { alerts: { enabled: false } } },
    });

    expect(await screen.findByTestId('cases-table')).toBeInTheDocument();
    expect(screen.queryAllByTestId('case-table-column-alertsCount').length).toBe(0);
  });

  it('should show the alerts column if the alert feature is enabled', async () => {
    renderWithTestingProviders(<AllCasesList />, {
      wrapperProps: { features: { alerts: { enabled: true } } },
    });

    const alertCounts = await screen.findAllByTestId('case-table-column-alertsCount');

    expect(alertCounts.length).toBeGreaterThan(0);
  });

  it('should show the alerts column if the alert object is empty', async () => {
    renderWithTestingProviders(<AllCasesList />, { wrapperProps: { features: { alerts: {} } } });

    const alertCounts = await screen.findAllByTestId('case-table-column-alertsCount');

    expect(alertCounts.length).toBeGreaterThan(0);
  });

  it('should clear the filters correctly', async () => {
    useLicenseMock.mockReturnValue({ isAtLeastGold: () => true, isAtLeastPlatinum: () => true });

    renderWithTestingProviders(<AllCasesList />);

    await userEvent.click(await screen.findByTestId('options-filter-popover-button-category'));
    await waitForEuiPopoverOpen();
    await userEvent.click(await screen.findByTestId('options-filter-popover-item-twix'));

    await userEvent.click(await screen.findByTestId('all-cases-clear-filters-link-icon'));
    await waitFor(() => {
      expect(useGetCasesMock).toHaveBeenCalledWith(DEFAULT_CASES_TABLE_STATE);
    });

    await waitFor(() => {
      expect(useGetCasesMock).toHaveBeenCalledWith(mockEarliestCaseParams);
    });
  });

  describe('Solutions', () => {
    it('should hide the solutions filter if the owner is provided', async () => {
      renderWithTestingProviders(<AllCasesList />, {
        wrapperProps: { owner: [SECURITY_SOLUTION_OWNER] },
      });

      expect(screen.queryByTestId('options-filter-popover-button-owner')).not.toBeInTheDocument();
    });
  });

  describe('Actions', () => {
    const updateCasesSpy = jest.spyOn(api, 'updateCases');
    const deleteCasesSpy = jest.spyOn(api, 'deleteCases');

    describe('Bulk actions', () => {
      it('Renders bulk action', async () => {
        renderWithTestingProviders(<AllCasesList />);

        expect(await screen.findByTestId('cases-table')).toBeInTheDocument();

        await userEvent.click(await screen.findByTestId('checkboxSelectAll'));
        await userEvent.click(await screen.findByText('Bulk actions'));

        expect(await screen.findByTestId('case-bulk-action-status')).toBeInTheDocument();
        expect(await screen.findByTestId('cases-bulk-action-delete')).toBeInTheDocument();
      });

      it.each([[CaseStatuses.open], [CaseStatuses['in-progress']], [CaseStatuses.closed]])(
        'Bulk update status: %s',
        async (status) => {
          renderWithTestingProviders(<AllCasesList />);

          expect(await screen.findByTestId('cases-table')).toBeInTheDocument();

          await userEvent.click(await screen.findByTestId('checkboxSelectAll'));

          await userEvent.click(await screen.findByText('Bulk actions'));

          await userEvent.click(await screen.findByTestId('case-bulk-action-status'), {
            pointerEventsCheck: 0,
          });

          expect(
            await screen.findByTestId(`cases-bulk-action-status-${status}`)
          ).toBeInTheDocument();

          await userEvent.click(await screen.findByTestId(`cases-bulk-action-status-${status}`));

          if (status === CaseStatuses.closed) {
            await waitFor(() => {
              expect(
                screen.getByRole('dialog', { name: i18n.CLOSE_CASE_MODAL_TITLE })
              ).toBeInTheDocument();
            });

            await userEvent.click(screen.getByText(i18n.CLOSE_CASE_MODAL_REASON_DUPLICATE));
            await userEvent.click(screen.getByText(i18n.CLOSE_CASE_MODAL_CONFIRM));
          }

          await waitFor(() => {
            expect(updateCasesSpy).toBeCalledWith({
              cases: useGetCasesMockState.data.cases.map(({ id, version }) => ({
                id,
                version,
                status,
                ...(status === CaseStatuses.closed ? { closeReason: 'duplicate' } : {}),
              })),
            });
          });
        }
      );

      it.each([
        [CaseSeverity.LOW],
        [CaseSeverity.MEDIUM],
        [CaseSeverity.HIGH],
        [CaseSeverity.CRITICAL],
      ])('Bulk update severity: %s', async (severity) => {
        renderWithTestingProviders(<AllCasesList />);

        expect(await screen.findByTestId('cases-table')).toBeInTheDocument();

        await userEvent.click(await screen.findByTestId('checkboxSelectAll'));

        await userEvent.click(await screen.findByText('Bulk actions'));

        await userEvent.click(await screen.findByTestId('case-bulk-action-severity'), {
          pointerEventsCheck: 0,
        });

        expect(
          await screen.findByTestId(`cases-bulk-action-severity-${severity}`)
        ).toBeInTheDocument();

        await userEvent.click(await screen.findByTestId(`cases-bulk-action-severity-${severity}`));

        await waitFor(() => {
          expect(updateCasesSpy).toBeCalledWith({
            cases: useGetCasesMockState.data.cases.map(({ id, version }) => ({
              id,
              version,
              severity,
            })),
          });
        });
      });

      it('Bulk delete', async () => {
        renderWithTestingProviders(<AllCasesList />);

        expect(await screen.findByTestId('cases-table')).toBeInTheDocument();

        await userEvent.click(await screen.findByTestId('checkboxSelectAll'));

        await userEvent.click(await screen.findByText('Bulk actions'));

        await userEvent.click(await screen.findByTestId('cases-bulk-action-delete'), {
          pointerEventsCheck: 0,
        });

        expect(await screen.findByTestId('confirm-delete-case-modal')).toBeInTheDocument();

        await userEvent.click(await screen.findByTestId('confirmModalConfirmButton'));

        await waitFor(() => {
          expect(deleteCasesSpy).toHaveBeenCalledWith({
            caseIds: [
              'basic-case-id',
              '1',
              '2',
              '3',
              '4',
              'case-with-alerts-id',
              'case-with-alerts-syncoff-id',
              'case-with-registered-attachment',
            ],
          });
        });
      });

      it('should disable the checkboxes when the user has read only permissions', async () => {
        renderWithTestingProviders(<AllCasesList />, {
          wrapperProps: { permissions: readCasesPermissions() },
        });

        expect(await screen.findByTestId('checkboxSelectAll')).toBeDisabled();

        for (const theCase of defaultGetCases.data.cases) {
          expect(await screen.findByTestId(`checkboxSelectRow-${theCase.id}`)).toBeDisabled();
        }
      });
    });

    describe('Row actions', () => {
      const statusTests = [
        [CaseStatuses.open],
        [CaseStatuses['in-progress']],
        [CaseStatuses.closed],
      ];

      const severityTests = [
        [CaseSeverity.LOW],
        [CaseSeverity.MEDIUM],
        [CaseSeverity.HIGH],
        [CaseSeverity.CRITICAL],
      ];

      it('should render row actions', async () => {
        renderWithTestingProviders(<AllCasesList />);

        for (const theCase of defaultGetCases.data.cases) {
          expect(
            await screen.findByTestId(`case-action-popover-button-${theCase.id}`)
          ).toBeInTheDocument();
        }
      });

      it.each(statusTests)('update the status of a case: %s', async (status) => {
        renderWithTestingProviders(<AllCasesList />);
        const openCase = useGetCasesMockState.data.cases[0];
        const inProgressCase = useGetCasesMockState.data.cases[1];
        const theCase = status === CaseStatuses.open ? inProgressCase : openCase;

        await userEvent.click(
          await screen.findByTestId(`case-action-popover-button-${theCase.id}`)
        );

        await userEvent.click(await screen.findByTestId(`case-action-status-panel-${theCase.id}`), {
          pointerEventsCheck: 0,
        });

        await userEvent.click(await screen.findByTestId(`cases-bulk-action-status-${status}`));

        await waitFor(() => {
          expect(updateCasesSpy).toHaveBeenCalledWith({
            cases: [{ id: theCase.id, status, version: theCase.version }],
          });
        });
      });

      it.each(severityTests)('update the severity of a case: %s', async (severity) => {
        renderWithTestingProviders(<AllCasesList />);
        const lowCase = useGetCasesMockState.data.cases[0];
        const mediumCase = useGetCasesMockState.data.cases[1];
        const theCase = severity === CaseSeverity.LOW ? mediumCase : lowCase;

        await userEvent.click(
          await screen.findByTestId(`case-action-popover-button-${theCase.id}`)
        );

        await userEvent.click(
          await screen.findByTestId(`case-action-severity-panel-${theCase.id}`),
          {
            pointerEventsCheck: 0,
          }
        );

        await userEvent.click(await screen.findByTestId(`cases-bulk-action-severity-${severity}`));

        await waitFor(() => {
          expect(updateCasesSpy).toHaveBeenCalledWith({
            cases: [{ id: theCase.id, severity, version: theCase.version }],
          });
        });
      });

      it('should delete a case', async () => {
        renderWithTestingProviders(<AllCasesList />);
        const theCase = defaultGetCases.data.cases[0];

        await userEvent.click(
          await screen.findByTestId(`case-action-popover-button-${theCase.id}`)
        );

        await userEvent.click(await screen.findByTestId('cases-bulk-action-delete'), {
          pointerEventsCheck: 0,
        });

        expect(await screen.findByTestId('confirm-delete-case-modal')).toBeInTheDocument();

        await userEvent.click(await screen.findByTestId('confirmModalConfirmButton'));

        await waitFor(() => {
          expect(deleteCasesSpy).toHaveBeenCalledWith({ caseIds: ['basic-case-id'] });
        });
      });

      it('should disable row actions when bulk selecting all cases', async () => {
        renderWithTestingProviders(<AllCasesList />);

        await userEvent.click(await screen.findByTestId('checkboxSelectAll'));

        for (const theCase of defaultGetCases.data.cases) {
          expect(
            await screen.findByTestId(`case-action-popover-button-${theCase.id}`)
          ).toBeDisabled();
        }
      });

      it('should disable row actions when selecting a case', async () => {
        renderWithTestingProviders(<AllCasesList />);
        const caseToSelect = defaultGetCases.data.cases[0];

        await userEvent.click(await screen.findByTestId(`checkboxSelectRow-${caseToSelect.id}`));

        for (const theCase of defaultGetCases.data.cases) {
          expect(
            await screen.findByTestId(`case-action-popover-button-${theCase.id}`)
          ).toBeDisabled();
        }
      });
    });

    describe('Assignees', () => {
      it('should hide the assignees column on basic license', async () => {
        useLicenseMock.mockReturnValue({
          isAtLeastGold: () => false,
          isAtLeastPlatinum: () => false,
        });

        renderWithTestingProviders(<AllCasesList />);

        expect(await screen.findByTestId('cases-table')).toBeTruthy();
        expect(screen.queryAllByTestId('case-table-column-assignee').length).toBe(0);
      });

      it('should show the assignees column on platinum license', async () => {
        useLicenseMock.mockReturnValue({
          isAtLeastGold: () => true,
          isAtLeastPlatinum: () => true,
        });

        renderWithTestingProviders(<AllCasesList />);

        expect(await screen.findByTestId('cases-table')).toBeTruthy();
        expect(screen.queryAllByTestId('case-table-column-assignee').length).toBeGreaterThan(0);
      });

      it('should hide the assignees filters on basic license', async () => {
        useLicenseMock.mockReturnValue({
          isAtLeastGold: () => false,
          isAtLeastPlatinum: () => false,
        });

        renderWithTestingProviders(<AllCasesList />);

        expect(await screen.findByTestId('cases-table')).toBeTruthy();
        expect(screen.queryAllByTestId('options-filter-popover-button-assignees').length).toBe(0);
      });

      it('should show the assignees filters on platinum license', async () => {
        useLicenseMock.mockReturnValue({
          isAtLeastGold: () => true,
          isAtLeastPlatinum: () => true,
        });

        renderWithTestingProviders(<AllCasesList />);

        expect(await screen.findByTestId('cases-table')).toBeTruthy();
        expect(
          screen.queryAllByTestId('options-filter-popover-button-assignees').length
        ).toBeGreaterThan(0);
      });

      it('should reset the assignees when deactivating the filter', async () => {
        useLicenseMock.mockReturnValue({
          isAtLeastGold: () => true,
          isAtLeastPlatinum: () => true,
        });

        renderWithTestingProviders(<AllCasesList />);

        // Opens assignees filter and checks an option
        const assigneesButton = await screen.findByTestId(
          'options-filter-popover-button-assignees'
        );
        await userEvent.click(assigneesButton);
        await userEvent.click(await screen.findByText('Damaged Raccoon'));
        expect(
          await within(assigneesButton).findByLabelText('1 active filters')
        ).toBeInTheDocument();

        // Deactivates assignees filter
        await userEvent.click(
          await screen.findByTestId('options-filter-popover-button-more-filters')
        );
        await waitForEuiPopoverOpen();
        await userEvent.click(await screen.findByRole('option', { name: 'Assignees' }));

        await waitFor(() => {
          expect(useGetCasesMock).toHaveBeenCalledWith(mockEarliestCaseParams);
        });
        await waitFor(() => {
          expect(useGetCasesMock).toHaveBeenCalledWith({
            filterOptions: {
              ...DEFAULT_FILTER_OPTIONS,
              assignees: [],
            },
            queryParams: DEFAULT_QUERY_PARAMS,
          });
        });
        // Reopens assignees filter
        await userEvent.click(await screen.findByRole('option', { name: 'Assignees' }));
        // Opens the assignees popup
        await userEvent.click(assigneesButton);
        expect(await screen.findByLabelText('click to filter assignees')).toBeInTheDocument();
        expect(
          within(
            await screen.findByTestId('options-filter-popover-button-assignees')
          ).queryByLabelText('1 active filters')
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('Columns Popover', () => {
    it('renders the columns popover correctly', async () => {
      renderWithTestingProviders(<AllCasesList isSelectorView={false} />);

      expect(await screen.findByTestId('column-selection-popover-button')).toBeInTheDocument();
    });

    it('renders the columns popover in the filter bar when isSelectorView=true', async () => {
      renderWithTestingProviders(<AllCasesList isSelectorView={true} />);

      expect(await screen.findByTestId('column-selection-popover-button')).toBeInTheDocument();
    });
  });

  describe('List view mode', () => {
    beforeEach(() => {
      useViewModeMock.mockReturnValue({
        viewMode: VIEW_TOGGLE_LIST_ID,
        setViewMode: jest.fn(),
      });
    });

    it('should render the list view', async () => {
      renderWithTestingProviders(<AllCasesList />);

      expect(await screen.findByTestId('cases-list-view')).toBeInTheDocument();
      expect(screen.queryByTestId('cases-table')).not.toBeInTheDocument();
    });

    it('should show the clear filters button when filters differ from defaults', async () => {
      useLicenseMock.mockReturnValue({ isAtLeastGold: () => true, isAtLeastPlatinum: () => true });

      renderWithTestingProviders(<AllCasesList />);

      await userEvent.click(await screen.findByTestId('options-filter-popover-button-category'));
      await waitForEuiPopoverOpen();
      await userEvent.click(await screen.findByTestId('options-filter-popover-item-twix'));

      expect(await screen.findByTestId('all-cases-clear-filters-link-icon')).toBeInTheDocument();
      expect(screen.queryByTestId('cases-table')).not.toBeInTheDocument();
    });

    it('should show case count in the utility bar', async () => {
      renderWithTestingProviders(<AllCasesList />);

      expect(await screen.findByTestId('case-table-case-count')).toHaveTextContent(
        `Showing 10 of ${useGetCasesMockState.data.total}`
      );
    });
  });
});
