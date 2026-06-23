/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { waitForEuiPopoverOpen } from '@elastic/eui/lib/test/rtl';
import { licensingMock } from '@kbn/licensing-plugin/public/mocks';
import { waitForComponentToUpdate } from '../../../../common/test_utils';

import { CaseStatuses, CustomFieldTypes, CaseSeverity } from '../../../../../common/types/domain';
import { SECURITY_SOLUTION_OWNER, OBSERVABILITY_OWNER } from '../../../../../common/constants';

import { renderWithTestingProviders } from '../../../../common/mock';
import { DEFAULT_FILTER_OPTIONS } from '../../../../containers/constants';
import type { CasesTableFiltersProps } from './table_filters';
import { CasesTableFilters } from './table_filters';
import { useGetTags } from '../../../../containers/use_get_tags';
import { useGetCategories } from '../../../../containers/use_get_categories';
import { useSuggestUserProfiles } from '../../../../containers/user_profiles/use_suggest_user_profiles';
import { userProfiles } from '../../../../containers/user_profiles/api.mock';
import { CUSTOM_FIELD_KEY_PREFIX, VIEW_TOGGLE_TABLE_ID } from '../constants';
import { useGetCaseConfiguration } from '../../../../containers/configure/use_get_case_configuration';
import { useCaseConfigureResponse } from '../../../configure_cases/__mock__';

jest.mock('../../../../containers/use_get_tags');
jest.mock('../../../../containers/use_get_categories');
jest.mock('../../../../containers/user_profiles/use_suggest_user_profiles');
jest.mock('../../../../containers/configure/use_get_case_configuration');

const useGetCaseConfigurationMock = useGetCaseConfiguration as jest.Mock;
const MORE_FILTERS_TEST_ID = 'options-filter-popover-button-more-filters';
const onFilterChanged = jest.fn();
/** Extra toolbar buttons: More filters, Columns, view toggle (×2), date range (×2), refresh. */
const EXTRA_TOOLBAR_BUTTON_COUNT = 7;

const props: CasesTableFiltersProps = {
  countClosedCases: 1234,
  countOpenCases: 99,
  countInProgressCases: 54,
  onFilterChanged,
  filterOptions: DEFAULT_FILTER_OPTIONS,
  availableSolutions: [],
  isLoading: false,
  currentUserProfile: undefined,
  deselectCases: jest.fn(),
  viewMode: VIEW_TOGGLE_TABLE_ID,
  onViewModeChange: jest.fn(),
  selectedColumns: [],
  onSelectedColumnsChange: jest.fn(),
  listFields: [],
  onListFieldsChange: jest.fn(),
  sortOrder: 'desc',
  onSortOrderChange: jest.fn(),
};

describe('CasesTableFilters ', () => {
  // eslint-disable-next-line prefer-object-spread
  const originalGetComputedStyle = Object.assign({}, window.getComputedStyle);

  beforeAll(() => {
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
  });

  afterAll(() => {
    Object.defineProperty(window, 'getComputedStyle', originalGetComputedStyle);
  });

  beforeEach(() => {
    (useGetTags as jest.Mock).mockReturnValue({ data: ['coke', 'pepsi'], isLoading: false });
    (useGetCategories as jest.Mock).mockReturnValue({
      data: ['twix', 'snickers'],
      isLoading: false,
    });
    (useSuggestUserProfiles as jest.Mock).mockReturnValue({ data: userProfiles, isLoading: false });

    useGetCaseConfigurationMock.mockImplementation(() => useCaseConfigureResponse);
  });

  afterEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('should render the case status filter dropdown', async () => {
    renderWithTestingProviders(<CasesTableFilters {...props} />);

    expect(await screen.findByTestId('options-filter-popover-button-status')).toBeInTheDocument();
  });

  it('should render the case severity filter dropdown', async () => {
    renderWithTestingProviders(<CasesTableFilters {...props} />);
    expect(await screen.findByTestId('options-filter-popover-button-severity')).toBeTruthy();
  });

  it('should call onFilterChange when the severity filter changes', async () => {
    renderWithTestingProviders(<CasesTableFilters {...props} />);
    await userEvent.click(await screen.findByTestId('options-filter-popover-button-severity'));
    await waitForEuiPopoverOpen();
    await userEvent.click(await screen.findByTestId('options-filter-popover-item-high'));

    expect(onFilterChanged).toBeCalledWith({ ...DEFAULT_FILTER_OPTIONS, severity: ['high'] });
  });

  it('should call onFilterChange when selected tags change', async () => {
    renderWithTestingProviders(<CasesTableFilters {...props} />);

    await userEvent.click(await screen.findByTestId('options-filter-popover-button-tags'));
    await waitForEuiPopoverOpen();
    await userEvent.click(await screen.findByTestId('options-filter-popover-item-coke'));

    expect(onFilterChanged).toBeCalledWith({ ...DEFAULT_FILTER_OPTIONS, tags: ['coke'] });
  });

  it('should call onFilterChange when selected category changes', async () => {
    renderWithTestingProviders(<CasesTableFilters {...props} />);

    await userEvent.click(await screen.findByTestId('options-filter-popover-button-category'));
    await waitForEuiPopoverOpen();
    await userEvent.click(await screen.findByTestId('options-filter-popover-item-twix'));

    expect(onFilterChanged).toBeCalledWith({ ...DEFAULT_FILTER_OPTIONS, category: ['twix'] });
  });

  it('should call onFilterChange when selected assignees change', async () => {
    const license = licensingMock.createLicense({
      license: { type: 'platinum' },
    });

    renderWithTestingProviders(<CasesTableFilters {...props} />, { wrapperProps: { license } });
    await userEvent.click(screen.getByTestId('options-filter-popover-button-assignees'));
    await waitForEuiPopoverOpen();

    await userEvent.click(screen.getByText('Physical Dinosaur'));

    expect(onFilterChanged.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "assignees": Array [
          "u_A_tM4n0wPkdiQ9smmd8o0Hr_h61XQfu8aRPh9GMoRoc_0",
        ],
        "category": Array [],
        "customFields": Object {},
        "extendedFieldFilters": Array [],
        "from": "now-30d",
        "owner": Array [],
        "reporters": Array [],
        "search": "",
        "searchFields": Array [
          "cases.title",
          "cases.description",
          "cases.incremental_id.text",
          "cases.observables.value",
          "cases.customFields.value",
          "cases-comments.comment",
          "cases-comments.alertId",
          "cases-comments.eventId",
          "cases.ef_all_values",
        ],
        "severity": Array [],
        "status": Array [],
        "tags": Array [],
        "to": "now",
      }
    `);
  });

  it('should call onFilterChange when search changes', async () => {
    renderWithTestingProviders(<CasesTableFilters {...props} />);

    await userEvent.type(await screen.findByTestId('search-cases'), 'My search{enter}');

    await waitFor(() => {
      expect(onFilterChanged.mock.calls[0][0].search).toEqual('My search');
    });
  });

  it('should change the initial value of search when the state changes', async () => {
    const { rerender } = renderWithTestingProviders(
      <CasesTableFilters
        {...props}
        filterOptions={{ ...props.filterOptions, search: 'My search' }}
      />
    );

    await screen.findByDisplayValue('My search');

    rerender(
      <CasesTableFilters
        {...props}
        filterOptions={{ ...props.filterOptions, search: 'My new search' }}
      />
    );

    await screen.findByDisplayValue('My new search');
  });

  it('should call onFilterChange when changing status', async () => {
    renderWithTestingProviders(<CasesTableFilters {...props} />);

    await userEvent.click(await screen.findByTestId('options-filter-popover-button-status'));
    await waitForEuiPopoverOpen();
    await userEvent.click(await screen.findByTestId('options-filter-popover-item-closed'));

    expect(onFilterChanged).toBeCalledWith({
      ...DEFAULT_FILTER_OPTIONS,
      status: [CaseStatuses.closed],
    });
  });

  it('should show in progress status only when "in p" is searched in the filter', async () => {
    renderWithTestingProviders(<CasesTableFilters {...props} />);

    await userEvent.click(await screen.findByTestId('options-filter-popover-button-status'));
    await waitForEuiPopoverOpen();

    await userEvent.type(await screen.findByTestId('status-search-input'), 'in p');

    const allOptions = screen.getAllByRole('option');
    expect(allOptions).toHaveLength(1);
    expect(allOptions[0]).toHaveTextContent('In progress');
  });

  it('should remove assignee from selected assignees when assignee no longer exists', async () => {
    const overrideProps = {
      ...props,
      filterOptions: {
        ...DEFAULT_FILTER_OPTIONS,
        assignees: [
          // invalid profile uid
          '123',
        ],
      },
    };

    const license = licensingMock.createLicense({
      license: { type: 'platinum' },
    });

    renderWithTestingProviders(<CasesTableFilters {...overrideProps} />, {
      wrapperProps: { license },
    });
    await userEvent.click(await screen.findByTestId('options-filter-popover-button-assignees'));
    await waitForEuiPopoverOpen();

    await userEvent.click(screen.getByText('Physical Dinosaur'));

    expect(onFilterChanged.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "assignees": Array [
          "u_A_tM4n0wPkdiQ9smmd8o0Hr_h61XQfu8aRPh9GMoRoc_0",
        ],
        "category": Array [],
        "customFields": Object {},
        "extendedFieldFilters": Array [],
        "from": "now-30d",
        "owner": Array [],
        "reporters": Array [],
        "search": "",
        "searchFields": Array [
          "cases.title",
          "cases.description",
          "cases.incremental_id.text",
          "cases.observables.value",
          "cases.customFields.value",
          "cases-comments.comment",
          "cases-comments.alertId",
          "cases-comments.eventId",
          "cases.ef_all_values",
        ],
        "severity": Array [],
        "status": Array [],
        "tags": Array [],
        "to": "now",
      }
    `);
  });

  describe('Solution filter', () => {
    it('shows Solution filter when provided more than 1 availableSolutions', async () => {
      renderWithTestingProviders(
        <CasesTableFilters
          {...props}
          availableSolutions={[SECURITY_SOLUTION_OWNER, OBSERVABILITY_OWNER]}
        />,
        { wrapperProps: { owner: [SECURITY_SOLUTION_OWNER, OBSERVABILITY_OWNER] } }
      );

      expect(await screen.findByTestId('options-filter-popover-button-owner')).toBeInTheDocument();
    });

    it('does not show Solution filter when provided less than 1 availableSolutions', () => {
      renderWithTestingProviders(<CasesTableFilters {...props} availableSolutions={[]} />, {
        wrapperProps: { owner: [] },
      });

      expect(screen.queryByTestId('options-filter-popover-button-owner')).not.toBeInTheDocument();
    });

    it('does not select a solution on initial render', async () => {
      renderWithTestingProviders(
        <CasesTableFilters
          {...props}
          availableSolutions={[SECURITY_SOLUTION_OWNER, OBSERVABILITY_OWNER]}
        />,
        { wrapperProps: { owner: [SECURITY_SOLUTION_OWNER, OBSERVABILITY_OWNER] } }
      );

      expect(await screen.findByTestId('options-filter-popover-button-owner')).not.toHaveAttribute(
        'hasActiveFilters'
      );
    });

    it('should reset the filter when deactivated', async () => {
      const overrideProps = {
        ...props,
        filterOptions: {
          ...props.filterOptions,
          owner: [SECURITY_SOLUTION_OWNER, OBSERVABILITY_OWNER],
        },
      };

      renderWithTestingProviders(
        <CasesTableFilters
          {...overrideProps}
          availableSolutions={[SECURITY_SOLUTION_OWNER, OBSERVABILITY_OWNER]}
        />,
        { wrapperProps: { owner: [SECURITY_SOLUTION_OWNER, OBSERVABILITY_OWNER] } }
      );

      await userEvent.click(screen.getByTestId(MORE_FILTERS_TEST_ID));
      await waitForEuiPopoverOpen();
      await userEvent.click(screen.getByRole('option', { name: 'Solution' }));

      expect(onFilterChanged).toHaveBeenCalledWith({
        ...DEFAULT_FILTER_OPTIONS,
        owner: [],
      });
    });

    it('should check all options when all options are selected', async () => {
      const overrideProps = {
        ...props,
        filterOptions: {
          ...props.filterOptions,
          owner: [SECURITY_SOLUTION_OWNER, OBSERVABILITY_OWNER],
        },
      };

      renderWithTestingProviders(
        <CasesTableFilters
          {...overrideProps}
          availableSolutions={[SECURITY_SOLUTION_OWNER, OBSERVABILITY_OWNER]}
        />,
        { wrapperProps: { owner: [SECURITY_SOLUTION_OWNER, OBSERVABILITY_OWNER] } }
      );

      await userEvent.click(await screen.findByTestId('options-filter-popover-button-owner'));
      await waitForEuiPopoverOpen();

      const allOptions = screen.getAllByRole('option');
      expect(allOptions).toHaveLength(2);
      expect(allOptions[0]).toHaveAttribute('aria-checked', 'true');
      expect(allOptions[0]).toHaveTextContent('Security');
      expect(allOptions[1]).toHaveAttribute('aria-checked', 'true');
      expect(allOptions[1]).toHaveTextContent('Observability');
    });
  });

  describe('assignees filter', () => {
    it('should hide the assignees filters on basic license', async () => {
      renderWithTestingProviders(<CasesTableFilters {...props} />);

      expect(screen.queryByTestId('options-filter-popover-button-assignees')).toBeNull();
    });

    it('should show the assignees filters on platinum license', async () => {
      const license = licensingMock.createLicense({
        license: { type: 'platinum' },
      });

      renderWithTestingProviders(<CasesTableFilters {...props} />, {
        wrapperProps: { license },
      });

      expect(
        await screen.findByTestId('options-filter-popover-button-assignees')
      ).toBeInTheDocument();
    });

    it('should reset the assignees when deactivating the filter', async () => {
      const overrideProps = {
        ...props,
        filterOptions: {
          ...DEFAULT_FILTER_OPTIONS,
          assignees: ['u_A_tM4n0wPkdiQ9smmd8o0Hr_h61XQfu8aRPh9GMoRoc_0'],
        },
      };
      const license = licensingMock.createLicense({
        license: { type: 'platinum' },
      });

      renderWithTestingProviders(<CasesTableFilters {...overrideProps} />, {
        wrapperProps: { license },
      });

      // deactivate the assignees filter
      await userEvent.click(screen.getByTestId(MORE_FILTERS_TEST_ID));
      await waitForEuiPopoverOpen();
      await userEvent.click(screen.getByRole('option', { name: 'Assignees' }));

      expect(onFilterChanged).toHaveBeenCalledWith({
        ...DEFAULT_FILTER_OPTIONS,
        assignees: [],
      });
    });
  });

  describe('create case button', () => {
    it('should not render the create case button when isSelectorView is false and onCreateCasePressed are not passed', () => {
      renderWithTestingProviders(<CasesTableFilters {...props} />);
      expect(screen.queryByTestId('cases-table-add-case-filter-bar')).not.toBeInTheDocument();
    });

    it('should render the create case button when isSelectorView is true and onCreateCasePressed are passed', async () => {
      const onCreateCasePressed = jest.fn();

      renderWithTestingProviders(
        <CasesTableFilters
          {...props}
          isSelectorView={true}
          onCreateCasePressed={onCreateCasePressed}
        />
      );

      expect(await screen.findByTestId('cases-table-add-case-filter-bar')).toBeInTheDocument();
    });

    it('should call the onCreateCasePressed when create case is clicked', async () => {
      const onCreateCasePressed = jest.fn();

      renderWithTestingProviders(
        <CasesTableFilters
          {...props}
          isSelectorView={true}
          onCreateCasePressed={onCreateCasePressed}
        />
      );

      await userEvent.click(await screen.findByTestId('cases-table-add-case-filter-bar'));

      await waitForComponentToUpdate();
      // NOTE: intentionally checking no arguments are passed
      expect(onCreateCasePressed).toHaveBeenCalledWith();
    });
  });

  describe('toggle type custom field filter', () => {
    const customFieldKey = 'toggleKey';
    const uiCustomFieldKey = `${CUSTOM_FIELD_KEY_PREFIX}${customFieldKey}`;

    beforeEach(() => {
      const previousState = [{ key: uiCustomFieldKey, isActive: true }];
      localStorage.setItem(
        'securitySolution.cases.list.tableFiltersConfig',
        JSON.stringify(previousState)
      );

      useGetCaseConfigurationMock.mockImplementation(() => ({
        ...useCaseConfigureResponse,
        data: {
          ...useCaseConfigureResponse.data,
          customFields: [{ type: 'toggle', key: customFieldKey, label: 'Toggle', required: false }],
        },
      }));
    });

    afterEach(() => {
      jest.clearAllMocks();
      localStorage.clear();
    });

    it('should render its options', async () => {
      renderWithTestingProviders(<CasesTableFilters {...props} />);

      await userEvent.click(await screen.findByTestId('options-filter-popover-button-toggleKey'));
      await waitForEuiPopoverOpen();

      const allOptions = screen.getAllByRole('option');
      expect(allOptions).toHaveLength(2);
      expect(allOptions[0]).toHaveTextContent('On');
      expect(allOptions[1]).toHaveTextContent('Off');
    });

    it('should call onFilterChange when On option changes', async () => {
      renderWithTestingProviders(<CasesTableFilters {...props} />);

      await userEvent.click(await screen.findByTestId('options-filter-popover-button-toggleKey'));
      await waitForEuiPopoverOpen();

      await userEvent.click(await screen.findByTestId('options-filter-popover-item-on'));

      expect(onFilterChanged).toBeCalledWith({
        ...DEFAULT_FILTER_OPTIONS,
        customFields: {
          [customFieldKey]: {
            type: 'toggle',
            options: ['on'],
          },
        },
      });
    });

    it('should call onFilterChange when Off option changes', async () => {
      renderWithTestingProviders(<CasesTableFilters {...props} />);

      await userEvent.click(await screen.findByTestId('options-filter-popover-button-toggleKey'));
      await waitForEuiPopoverOpen();

      await userEvent.click(await screen.findByTestId('options-filter-popover-item-off'));

      expect(onFilterChanged).toBeCalledWith({
        ...DEFAULT_FILTER_OPTIONS,
        customFields: {
          [customFieldKey]: {
            type: 'toggle',
            options: ['off'],
          },
        },
      });
    });

    it('should call onFilterChange when second option is clicked', async () => {
      const customProps = {
        ...props,
        filterOptions: {
          ...props.filterOptions,
          customFields: {
            [customFieldKey]: {
              type: CustomFieldTypes.TOGGLE,
              options: ['on'],
            },
          },
        },
      };

      renderWithTestingProviders(<CasesTableFilters {...customProps} />);

      await userEvent.click(await screen.findByTestId('options-filter-popover-button-toggleKey'));
      await waitForEuiPopoverOpen();

      await userEvent.click(await screen.findByTestId('options-filter-popover-item-off'));

      expect(onFilterChanged).toHaveBeenCalledWith({
        ...DEFAULT_FILTER_OPTIONS,
        customFields: {
          [customFieldKey]: {
            type: 'toggle',
            options: ['on', 'off'],
          },
        },
      });
    });

    it('should reset the selected options when a custom field filter is deactivated', async () => {
      const previousState = [{ key: uiCustomFieldKey, isActive: true }];
      localStorage.setItem(
        'securitySolution.cases.list.tableFiltersConfig',
        JSON.stringify(previousState)
      );
      const customProps = {
        ...props,
        filterOptions: {
          ...props.filterOptions,
          customFields: {
            [customFieldKey]: {
              type: CustomFieldTypes.TOGGLE,
              options: ['on'],
            },
          },
        },
      };
      renderWithTestingProviders(<CasesTableFilters {...customProps} />);

      await userEvent.click(await screen.findByTestId(MORE_FILTERS_TEST_ID));
      await userEvent.click(await screen.findByRole('option', { name: 'Toggle' }));

      expect(onFilterChanged).toHaveBeenCalledWith({
        ...DEFAULT_FILTER_OPTIONS,
        customFields: {
          [customFieldKey]: {
            type: CustomFieldTypes.TOGGLE,
            options: [],
          },
        },
      });
    });
  });

  describe('custom filters configuration', () => {
    beforeEach(() => {
      useGetCaseConfigurationMock.mockImplementation(() => ({
        ...useCaseConfigureResponse,
        data: {
          ...useCaseConfigureResponse.data,
          customFields: [
            { type: 'toggle', key: 'toggle', label: 'Toggle', required: false },
            { type: 'text', key: 'text', label: 'Text', required: false },
          ],
        },
      }));
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should not render the more button when in selector view', async () => {
      renderWithTestingProviders(<CasesTableFilters {...props} isSelectorView />);
      expect(screen.queryByTestId(MORE_FILTERS_TEST_ID)).not.toBeInTheDocument();
    });

    it('should render all options in the popover, including custom fields', async () => {
      renderWithTestingProviders(<CasesTableFilters {...props} />);

      expect(screen.getByTestId(MORE_FILTERS_TEST_ID)).toBeInTheDocument();
      await userEvent.click(screen.getByTestId(MORE_FILTERS_TEST_ID));
      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(5));

      expect(await screen.findByTestId('options-filter-popover-item-status')).toBeInTheDocument();
      expect(
        await screen.findByTestId(`options-filter-popover-item-${CUSTOM_FIELD_KEY_PREFIX}toggle`)
      ).toBeInTheDocument();
    });

    it('should not add text type custom fields', async () => {
      renderWithTestingProviders(<CasesTableFilters {...props} />);

      await userEvent.click(screen.getByTestId(MORE_FILTERS_TEST_ID));
      await waitForEuiPopoverOpen();

      expect(screen.queryByTestId('options-filter-popover-item-text')).not.toBeInTheDocument();
    });

    it('when a filter gets activated, it should be rendered at the end of the list', async () => {
      renderWithTestingProviders(<CasesTableFilters {...props} />);

      await userEvent.click(screen.getByTestId(MORE_FILTERS_TEST_ID));
      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(5));

      await userEvent.click(screen.getByRole('option', { name: 'Toggle' }));

      const filterBar = await screen.findByTestId('cases-table-filters');
      const allFilters = within(filterBar).getAllByRole('button');
      const orderedFilterLabels = ['Severity', 'Status', 'Tags', 'Categories', 'Toggle'];
      orderedFilterLabels.forEach((label, index) => {
        expect(allFilters[index]).toHaveTextContent(label);
      });
    });

    it('when a filter gets activated, it should be updated in the local storage', async () => {
      renderWithTestingProviders(<CasesTableFilters {...props} />);

      await userEvent.click(screen.getByTestId(MORE_FILTERS_TEST_ID));
      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(5));

      await userEvent.click(screen.getByRole('option', { name: 'Toggle' }));
      const storedFilterState = localStorage.getItem(
        'securitySolution.cases.list.tableFiltersConfig'
      );
      expect(storedFilterState).toBeTruthy();
      expect(JSON.parse(storedFilterState!)).toMatchInlineSnapshot(`
        Array [
          Object {
            "isActive": true,
            "key": "severity",
          },
          Object {
            "isActive": true,
            "key": "status",
          },
          Object {
            "isActive": true,
            "key": "tags",
          },
          Object {
            "isActive": true,
            "key": "category",
          },
          Object {
            "isActive": true,
            "key": "cf_toggle",
          },
        ]
      `);
    });

    it('when a filter gets deactivated, it should be removed from the list', async () => {
      renderWithTestingProviders(<CasesTableFilters {...props} />);

      await userEvent.click(screen.getByTestId(MORE_FILTERS_TEST_ID));
      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(5));

      expect(await screen.findByTestId('options-filter-popover-button-status')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('option', { name: 'Status' }));

      const filterBar = await screen.findByTestId('cases-table-filters');
      const allFilters = within(filterBar).getAllByRole('button');
      const orderedFilterLabels = ['Severity', 'Tags', 'Categories'];
      orderedFilterLabels.forEach((label, index) => {
        expect(allFilters[index]).toHaveTextContent(label);
      });
    });

    it('should reset the selected options when a system field filter is deactivated', async () => {
      const customProps = {
        ...props,
        filterOptions: {
          ...props.filterOptions,
          status: [CaseStatuses.open],
        },
      };
      renderWithTestingProviders(<CasesTableFilters {...customProps} />);

      await userEvent.click(await screen.findByTestId(MORE_FILTERS_TEST_ID));
      await userEvent.click(await screen.findByRole('option', { name: 'Status' }));

      expect(onFilterChanged).toHaveBeenCalledWith({
        ...DEFAULT_FILTER_OPTIONS,
        status: [],
        customFields: {
          toggle: {
            type: CustomFieldTypes.TOGGLE,
            options: [],
          },
        },
      });
    });

    it('when a filter gets deactivated, it should be updated in the local storage', async () => {
      renderWithTestingProviders(<CasesTableFilters {...props} />);

      await userEvent.click(screen.getByTestId(MORE_FILTERS_TEST_ID));
      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(5));

      await userEvent.click(screen.getByRole('option', { name: 'Status' }));

      const storedFilterState = localStorage.getItem(
        'securitySolution.cases.list.tableFiltersConfig'
      );
      expect(storedFilterState).toBeTruthy();
      expect(JSON.parse(storedFilterState || '')).toMatchInlineSnapshot(`
        Array [
          Object {
            "isActive": true,
            "key": "severity",
          },
          Object {
            "isActive": false,
            "key": "status",
          },
          Object {
            "isActive": true,
            "key": "tags",
          },
          Object {
            "isActive": true,
            "key": "category",
          },
          Object {
            "isActive": false,
            "key": "cf_toggle",
          },
        ]
      `);
    });

    it('should recover the stored state from the local storage with the right order', async () => {
      const previousState = [
        { key: `${CUSTOM_FIELD_KEY_PREFIX}toggle`, isActive: true },
        { key: 'owner', isActive: false },
        { key: 'category', isActive: false },
        { key: 'tags', isActive: true },
        { key: 'assignee', isActive: false },
        { key: 'status', isActive: false },
        { key: 'severity', isActive: true },
      ];

      localStorage.setItem(
        'securitySolution.cases.list.tableFiltersConfig',
        JSON.stringify(previousState)
      );

      renderWithTestingProviders(<CasesTableFilters {...props} />);

      const filterBar = await screen.findByTestId('cases-table-filters');
      let allFilters: HTMLElement[];
      await waitFor(() => {
        allFilters = within(filterBar).getAllByRole('button');
        expect(allFilters).toHaveLength(3 + EXTRA_TOOLBAR_BUTTON_COUNT);
      });

      const orderedFilterLabels = ['Toggle', 'Tags', 'Severity'];
      orderedFilterLabels.forEach((label, index) => {
        expect(allFilters[index]).toHaveTextContent(label);
      });
    });

    it('it should not render a filter that was stored but does not exist anymore', async () => {
      const previousState = [
        { key: 'severity', isActive: true },
        { key: 'status', isActive: false },
        { key: 'fakeField', isActive: true }, // does not exist
        { key: 'tags', isActive: true },
        { key: 'category', isActive: false },
        { key: 'owner', isActive: false },
        { key: `${CUSTOM_FIELD_KEY_PREFIX}toggle`, isActive: true },
      ];
      localStorage.setItem(
        'securitySolution.cases.list.tableFiltersConfig',
        JSON.stringify(previousState)
      );

      renderWithTestingProviders(<CasesTableFilters {...props} />);

      const filterBar = await screen.findByTestId('cases-table-filters');
      let allFilters: HTMLElement[];
      await waitFor(() => {
        allFilters = within(filterBar).getAllByRole('button');
        expect(allFilters).toHaveLength(3 + EXTRA_TOOLBAR_BUTTON_COUNT);
      });

      const orderedFilterLabels = ['Severity', 'Tags', 'Toggle'];
      orderedFilterLabels.forEach((label, index) => {
        expect(allFilters[index]).toHaveTextContent(label);
      });
    });

    it('should sort the labels shown in the popover (on equal label, sort by key)', async () => {
      useGetCaseConfigurationMock.mockImplementation(() => ({
        ...useCaseConfigureResponse,
        data: {
          ...useCaseConfigureResponse.data,
          customFields: [
            { type: 'toggle', key: 'za', label: 'ZToggle', required: false },
            { type: 'toggle', key: 'tc', label: 'Toggle', required: false },
            { type: 'toggle', key: 'ta', label: 'Toggle', required: false },
            { type: 'toggle', key: 'tb', label: 'Toggle', required: false },
            { type: 'toggle', key: 'aa', label: 'AToggle', required: false },
          ],
        },
      }));

      renderWithTestingProviders(<CasesTableFilters {...props} />);

      await userEvent.click(screen.getByTestId(MORE_FILTERS_TEST_ID));
      await waitFor(() => {
        expect(screen.getAllByRole('option')).toHaveLength(9);
      });
      const allOptions = screen.getAllByRole('option');
      const orderedKey = [
        `${CUSTOM_FIELD_KEY_PREFIX}aa`,
        'category',
        'severity',
        'status',
        'tags',
        `${CUSTOM_FIELD_KEY_PREFIX}ta`,
        `${CUSTOM_FIELD_KEY_PREFIX}tb`,
        `${CUSTOM_FIELD_KEY_PREFIX}tc`,
        `${CUSTOM_FIELD_KEY_PREFIX}za`,
      ];
      orderedKey.forEach((key, index) => {
        expect(allOptions[index].getAttribute('data-test-subj')).toBe(
          `options-filter-popover-item-${key}`
        );
      });
    });

    it('when a filter is active and is not last in the list, it should move the filter to last position after deactivating and activating', async () => {
      renderWithTestingProviders(<CasesTableFilters {...props} />);

      const filterBar = await screen.findByTestId('cases-table-filters');
      let allFilters = within(filterBar).getAllByRole('button');
      let orderedFilterLabels = ['Severity', 'Status', 'Tags', 'Categories'];
      orderedFilterLabels.forEach((label, index) => {
        expect(allFilters[index]).toHaveTextContent(label);
      });

      expect(await screen.findByTestId('options-filter-popover-button-status')).toBeInTheDocument();
      await userEvent.click(await screen.findByTestId(MORE_FILTERS_TEST_ID));
      await userEvent.click(await screen.findByRole('option', { name: 'Status' }));

      await userEvent.click(await screen.findByTestId(MORE_FILTERS_TEST_ID));
      await userEvent.click(await screen.findByRole('option', { name: 'Status' }));

      allFilters = within(filterBar).getAllByRole('button');
      orderedFilterLabels = ['Severity', 'Tags', 'Categories', 'Status'];
      orderedFilterLabels.forEach((label, index) => {
        expect(allFilters[index]).toHaveTextContent(label);
      });
    });

    it('should avoid key collisions between custom fields and default fields', async () => {
      useGetCaseConfigurationMock.mockImplementation(() => ({
        ...useCaseConfigureResponse,
        data: {
          ...useCaseConfigureResponse.data,
          customFields: [
            { type: 'toggle', key: 'severity', label: 'Fake Severity', required: false },
            { type: 'toggle', key: 'status', label: 'Fake Status', required: false },
          ],
        },
      }));

      renderWithTestingProviders(<CasesTableFilters {...props} />);

      const filterBar = await screen.findByTestId('cases-table-filters');
      let allFilters: HTMLElement[];
      await waitFor(() => {
        allFilters = within(filterBar).getAllByRole('button');
        expect(allFilters).toHaveLength(4 + EXTRA_TOOLBAR_BUTTON_COUNT);
      });

      const orderedFilterLabels = ['Severity', 'Status', 'Tags', 'Categories'];
      orderedFilterLabels.forEach((label, index) => {
        expect(allFilters[index]).toHaveTextContent(label);
      });

      await userEvent.click(screen.getByTestId(MORE_FILTERS_TEST_ID));
      let allOptions: HTMLElement[];
      await waitFor(() => {
        allOptions = screen.getAllByRole('option');
        expect(allOptions).toHaveLength(6);
      });
    });

    it('should delete stored filters that do not exist anymore', async () => {
      const previousState = [
        { key: 'severity', isActive: true },
        { key: 'status', isActive: false },
        { key: 'fakeField', isActive: true }, // does not exist, should be removed
        { key: 'tags', isActive: true },
        { key: 'category', isActive: false },
        { key: 'owner', isActive: false }, // isnt available, should be removed
        { key: `${CUSTOM_FIELD_KEY_PREFIX}toggle`, isActive: true },
      ];
      localStorage.setItem(
        'securitySolution.cases.list.tableFiltersConfig',
        JSON.stringify(previousState)
      );

      renderWithTestingProviders(<CasesTableFilters {...props} />);

      await userEvent.click(screen.getByTestId(MORE_FILTERS_TEST_ID));
      // we need any user action to trigger the filter config update
      await userEvent.click(await screen.findByRole('option', { name: 'Toggle' }));

      const storedFilterState = localStorage.getItem(
        'securitySolution.cases.list.tableFiltersConfig'
      );
      // the fakeField and owner filter should be removed and toggle should update isActive
      expect(JSON.parse(storedFilterState || '')).toMatchInlineSnapshot(`
        Array [
          Object {
            "isActive": true,
            "key": "severity",
          },
          Object {
            "isActive": false,
            "key": "status",
          },
          Object {
            "isActive": true,
            "key": "tags",
          },
          Object {
            "isActive": false,
            "key": "category",
          },
          Object {
            "isActive": false,
            "key": "cf_toggle",
          },
        ]
      `);
    });

    it('should activate all filters when there is a value in the global state and is not active in the local storage', async () => {
      const license = licensingMock.createLicense({
        license: { type: 'platinum' },
      });

      const previousState = [
        { key: 'severity', isActive: false }, // notice severity filter not active
        { key: 'status', isActive: false }, // notice status filter not active
        { key: 'tags', isActive: false },
        { key: 'category', isActive: false },
        { key: 'cf_toggle', isActive: false },
        { key: 'assignees', isActive: false },
      ];

      localStorage.setItem(
        'securitySolution.cases.list.tableFiltersConfig',
        JSON.stringify(previousState)
      );

      const overrideProps = {
        ...props,
        filterOptions: {
          ...DEFAULT_FILTER_OPTIONS,
          severity: [CaseSeverity.MEDIUM], // but they have values
          status: [CaseStatuses.open, CaseStatuses['in-progress']],
          tags: ['coke'],
          category: ['twix'],
          assignees: [userProfiles[0].uid],
          customFields: { toggle: { type: CustomFieldTypes.TOGGLE, options: ['on'] } },
        },
      };

      renderWithTestingProviders(<CasesTableFilters {...overrideProps} />, {
        wrapperProps: { license },
      });

      const filters = [
        { testId: 'options-filter-popover-button-status', active: 2 },
        { testId: 'options-filter-popover-button-severity', active: 1 },
        { testId: 'options-filter-popover-button-tags', active: 1 },
        { testId: 'options-filter-popover-button-category', active: 1 },
        { testId: 'options-filter-popover-button-toggle', active: 1 },
        { testId: 'options-filter-popover-button-assignees', active: 1 },
      ];

      await waitForComponentToUpdate();

      const totalFilters = await screen.findAllByRole('button');
      expect(totalFilters.length).toBe(filters.length + EXTRA_TOOLBAR_BUTTON_COUNT);

      for (const filter of filters) {
        const button = await screen.findByTestId(filter.testId);
        expect(button).toBeInTheDocument();
        expect(
          await within(button).findByLabelText(`${filter.active} active filters`)
        ).toBeInTheDocument();
      }
    });

    it('should activate all filters when there is a value in the global state and the local storage is empty', async () => {
      const license = licensingMock.createLicense({
        license: { type: 'platinum' },
      });

      localStorage.setItem('securitySolution.cases.list.tableFiltersConfig', JSON.stringify([]));

      const overrideProps = {
        ...props,
        filterOptions: {
          ...DEFAULT_FILTER_OPTIONS,
          severity: [CaseSeverity.MEDIUM], // but they have values
          status: [CaseStatuses.open, CaseStatuses['in-progress']],
          tags: ['coke'],
          category: ['twix'],
          assignees: [userProfiles[0].uid],
          customFields: { toggle: { type: CustomFieldTypes.TOGGLE, options: ['on'] } },
        },
      };

      renderWithTestingProviders(<CasesTableFilters {...overrideProps} />, {
        wrapperProps: { license },
      });

      const filters = [
        { testId: 'options-filter-popover-button-status', active: 2 },
        { testId: 'options-filter-popover-button-severity', active: 1 },
        { testId: 'options-filter-popover-button-tags', active: 1 },
        { testId: 'options-filter-popover-button-category', active: 1 },
        { testId: 'options-filter-popover-button-toggle', active: 1 },
        { testId: 'options-filter-popover-button-assignees', active: 1 },
      ];

      await waitForComponentToUpdate();

      const totalFilters = await screen.findAllByRole('button');
      expect(totalFilters.length).toBe(filters.length + EXTRA_TOOLBAR_BUTTON_COUNT);

      for (const filter of filters) {
        const button = await screen.findByTestId(filter.testId);
        expect(button).toBeInTheDocument();
        expect(
          await within(button).findByLabelText(`${filter.active} active filters`)
        ).toBeInTheDocument();
      }
    });
  });
});
