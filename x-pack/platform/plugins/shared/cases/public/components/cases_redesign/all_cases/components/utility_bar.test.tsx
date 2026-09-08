/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { MAX_DOCS_PER_PAGE } from '../../../../../common/constants';
import {
  noCasesPermissions,
  onlyDeleteCasesPermission,
  renderWithTestingProviders,
  writeCasesPermissions,
} from '../../../../common/mock';
import { basicCase } from '../../../../containers/mock';
import { CasesTableUtilityBar } from './utility_bar';
import { useCasesLocalStorage } from '../../../../common/use_cases_local_storage';
import { VIEW_TOGGLE_LIST_ID, VIEW_TOGGLE_TABLE_ID } from '../constants';

jest.mock('../../../../common/use_cases_local_storage');

// Failing: See https://github.com/elastic/kibana/issues/275455
describe.skip('Severity form field', () => {
  const deselectCases = jest.fn();
  const localStorageKey = 'securitySolution.cases.utilityBar.hideMaxLimitWarning';

  const props = {
    totalCases: 5,
    selectedCases: [basicCase],
    deselectCases,
    pagination: {
      pageIndex: 1,
      pageSize: 10,
      totalItemCount: 5,
    },
    onClearFilters: jest.fn(),
    showClearFiltersButton: false,
    viewMode: VIEW_TOGGLE_TABLE_ID,
    onSelectAll: jest.fn(),
    totalOnPage: 5,
  };

  beforeAll(() => {
    jest.mocked(useCasesLocalStorage).mockReturnValue([false, jest.fn()]);
  });

  afterAll(() => {
    sessionStorage.removeItem(localStorageKey);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders', async () => {
    renderWithTestingProviders(<CasesTableUtilityBar {...props} />);

    expect(await screen.findByText('Showing 5 of 5')).toBeInTheDocument();
    expect(await screen.findByText('Selected 1 case')).toBeInTheDocument();
    expect(await screen.findByTestId('case-table-bulk-actions-link-icon')).toBeInTheDocument();

    expect(screen.queryByTestId('all-cases-maximum-limit-warning')).not.toBeInTheDocument();
  });

  it('renders showing cases correctly', async () => {
    const updatedProps = {
      ...props,
      totalCases: 20,
      pagination: {
        ...props.pagination,
        totalItemCount: 20,
      },
    };

    renderWithTestingProviders(<CasesTableUtilityBar {...updatedProps} />);

    expect(await screen.findByText('Showing 10 of 20')).toBeInTheDocument();
    expect(await screen.findByText('Selected 1 case')).toBeInTheDocument();
  });

  it('renders showing cases correctly for second page', async () => {
    const updatedProps = {
      ...props,
      totalCases: 20,
      pagination: {
        ...props.pagination,
        pageIndex: 2,
        totalItemCount: 20,
      },
    };

    renderWithTestingProviders(<CasesTableUtilityBar {...updatedProps} />);

    expect(await screen.findByText('Showing 10 of 20')).toBeInTheDocument();
    expect(await screen.findByText('Selected 1 case')).toBeInTheDocument();
  });

  it('renders showing cases correctly when no cases available', async () => {
    const updatedProps = {
      ...props,
      totalCases: 0,
      selectedCases: [],
      deselectCases,
      pagination: {
        pageSize: 10,
        pageIndex: 1,
        totalItemCount: 0,
      },
    };

    renderWithTestingProviders(<CasesTableUtilityBar {...updatedProps} />);
    expect(await screen.findByText('Showing 0 of 0')).toBeInTheDocument();
  });

  it('opens the bulk actions correctly', async () => {
    renderWithTestingProviders(<CasesTableUtilityBar {...props} />);

    await userEvent.click(await screen.findByTestId('case-table-bulk-actions-link-icon'));

    expect(await screen.findByTestId('case-table-bulk-actions-context-menu'));
  });

  it('closes the bulk actions correctly', async () => {
    renderWithTestingProviders(<CasesTableUtilityBar {...props} />);

    await userEvent.click(await screen.findByTestId('case-table-bulk-actions-link-icon'));

    expect(await screen.findByTestId('case-table-bulk-actions-context-menu')).toBeInTheDocument();

    await userEvent.click(await screen.findByTestId('case-table-bulk-actions-link-icon'));

    await waitFor(() => {
      expect(screen.queryByTestId('case-table-bulk-actions-context-menu')).not.toBeInTheDocument();
    });
  });

  it('does not show the bulk actions without update & delete permissions', async () => {
    renderWithTestingProviders(<CasesTableUtilityBar {...props} />, {
      wrapperProps: { permissions: noCasesPermissions() },
    });

    expect(screen.queryByTestId('case-table-bulk-actions-link-icon')).not.toBeInTheDocument();
  });

  it('does show the bulk actions with only delete permissions', async () => {
    renderWithTestingProviders(<CasesTableUtilityBar {...props} />, {
      wrapperProps: { permissions: onlyDeleteCasesPermission() },
    });

    expect(await screen.findByTestId('case-table-bulk-actions-link-icon')).toBeInTheDocument();
  });

  it('does show the bulk actions with update permissions', async () => {
    renderWithTestingProviders(<CasesTableUtilityBar {...props} />, {
      wrapperProps: { permissions: writeCasesPermissions() },
    });

    expect(await screen.findByTestId('case-table-bulk-actions-link-icon')).toBeInTheDocument();
  });

  it('does not show the bulk actions if there are not selected cases', async () => {
    renderWithTestingProviders(<CasesTableUtilityBar {...props} selectedCases={[]} />);

    expect(screen.queryByTestId('case-table-bulk-actions-link-icon')).not.toBeInTheDocument();
    expect(screen.queryByText('Showing 0')).not.toBeInTheDocument();
  });

  it('shows the clear filter button', async () => {
    renderWithTestingProviders(<CasesTableUtilityBar {...props} showClearFiltersButton={true} />);

    expect(await screen.findByTestId('all-cases-clear-filters-link-icon')).toBeInTheDocument();
  });

  it('clears the filters correctly', async () => {
    renderWithTestingProviders(<CasesTableUtilityBar {...props} showClearFiltersButton={true} />);

    await userEvent.click(await screen.findByTestId('all-cases-clear-filters-link-icon'));

    await waitFor(() => {
      expect(props.onClearFilters).toHaveBeenCalled();
    });
  });

  it('shows select all and clear selection links in list view when cases are selected', async () => {
    renderWithTestingProviders(
      <CasesTableUtilityBar {...props} viewMode={VIEW_TOGGLE_LIST_ID} totalOnPage={5} />
    );

    expect(await screen.findByTestId('all-cases-select-all-link')).toBeInTheDocument();
    expect(await screen.findByTestId('all-cases-clear-selection-link')).toBeInTheDocument();
  });

  it('does not show select all and clear selection links in table view', async () => {
    renderWithTestingProviders(<CasesTableUtilityBar {...props} viewMode={VIEW_TOGGLE_TABLE_ID} />);

    expect(screen.queryByTestId('all-cases-select-all-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('all-cases-clear-selection-link')).not.toBeInTheDocument();
  });

  it('does not show select all when all cases on the page are selected', async () => {
    renderWithTestingProviders(
      <CasesTableUtilityBar
        {...props}
        viewMode={VIEW_TOGGLE_LIST_ID}
        selectedCases={[basicCase]}
        totalOnPage={1}
      />
    );

    expect(screen.queryByTestId('all-cases-select-all-link')).not.toBeInTheDocument();
    expect(await screen.findByTestId('all-cases-clear-selection-link')).toBeInTheDocument();
  });

  it('calls onSelectAll when select all link is clicked', async () => {
    const onSelectAll = jest.fn();

    renderWithTestingProviders(
      <CasesTableUtilityBar
        {...props}
        viewMode={VIEW_TOGGLE_LIST_ID}
        onSelectAll={onSelectAll}
        totalOnPage={5}
      />
    );

    await userEvent.click(await screen.findByTestId('all-cases-select-all-link'));

    expect(onSelectAll).toHaveBeenCalled();
  });

  it('calls deselectCases when clear selection link is clicked', async () => {
    renderWithTestingProviders(
      <CasesTableUtilityBar {...props} viewMode={VIEW_TOGGLE_LIST_ID} totalOnPage={5} />
    );

    await userEvent.click(await screen.findByTestId('all-cases-clear-selection-link'));

    expect(deselectCases).toHaveBeenCalled();
  });

  it('does show the bulk actions with only assign permissions', async () => {
    renderWithTestingProviders(<CasesTableUtilityBar {...props} />, {
      wrapperProps: {
        permissions: {
          ...noCasesPermissions(),
          assign: true,
        },
      },
    });

    expect(await screen.findByTestId('case-table-bulk-actions-link-icon')).toBeInTheDocument();
  });

  it('shows bulk actions when only assignCase and update permissions are present', async () => {
    renderWithTestingProviders(<CasesTableUtilityBar {...props} />, {
      wrapperProps: {
        permissions: {
          ...noCasesPermissions(),
          assign: true,
          update: true,
        },
      },
    });

    expect(await screen.findByTestId('case-table-bulk-actions-link-icon')).toBeInTheDocument();
  });

  it('shows bulk actions when only assignCase and delete permissions are present', async () => {
    renderWithTestingProviders(<CasesTableUtilityBar {...props} />, {
      wrapperProps: {
        permissions: {
          ...noCasesPermissions(),
          assign: true,
          delete: true,
        },
      },
    });

    expect(await screen.findByTestId('case-table-bulk-actions-link-icon')).toBeInTheDocument();
  });

  describe('Maximum number of cases', () => {
    const newProps = {
      ...props,
      selectedCaseS: [],
      totalCases: MAX_DOCS_PER_PAGE,
      pagination: {
        ...props.pagination,
        totalItemCount: MAX_DOCS_PER_PAGE,
      },
    };

    const allCasesPageSize = [10, 25, 50, 100];

    it.each(allCasesPageSize)(
      `does not show warning when totalCases = ${MAX_DOCS_PER_PAGE} but pageSize(%s) * pageIndex + 1 < ${MAX_DOCS_PER_PAGE}`,
      async (size) => {
        const newPageIndex = MAX_DOCS_PER_PAGE / size - 2;

        renderWithTestingProviders(
          <CasesTableUtilityBar
            {...{
              ...newProps,
              pagination: { ...newProps.pagination, pageSize: size, pageIndex: newPageIndex },
            }}
          />
        );

        expect(
          await screen.findByText(`Showing ${size} of ${MAX_DOCS_PER_PAGE}`)
        ).toBeInTheDocument();

        expect(screen.queryByTestId('all-cases-maximum-limit-warning')).not.toBeInTheDocument();
      }
    );

    it.each(allCasesPageSize)(
      `shows warning when totalCases = ${MAX_DOCS_PER_PAGE} but pageSize(%s) * pageIndex + 1 = ${MAX_DOCS_PER_PAGE}`,
      async (size) => {
        const newPageIndex = MAX_DOCS_PER_PAGE / size - 1;

        renderWithTestingProviders(
          <CasesTableUtilityBar
            {...{
              ...newProps,
              pagination: { ...newProps.pagination, pageSize: size, pageIndex: newPageIndex },
            }}
          />
        );

        expect(
          await screen.findByText(`Showing ${size} of ${MAX_DOCS_PER_PAGE}`)
        ).toBeInTheDocument();

        expect(await screen.findByTestId('all-cases-maximum-limit-warning')).toBeInTheDocument();
      }
    );

    it.each(allCasesPageSize)(
      `shows warning when totalCases = ${MAX_DOCS_PER_PAGE} but pageSize(%s) * pageIndex + 1 > ${MAX_DOCS_PER_PAGE}`,
      async (size) => {
        const newPageIndex = MAX_DOCS_PER_PAGE / size;

        renderWithTestingProviders(
          <CasesTableUtilityBar
            {...{
              ...newProps,
              pagination: { ...newProps.pagination, pageSize: size, pageIndex: newPageIndex },
            }}
          />
        );

        expect(
          await screen.findByText(`Showing ${size} of ${MAX_DOCS_PER_PAGE}`)
        ).toBeInTheDocument();

        expect(await screen.findByTestId('all-cases-maximum-limit-warning')).toBeInTheDocument();
      }
    );

    it('should show dismiss and do not show again buttons correctly', async () => {
      renderWithTestingProviders(
        <CasesTableUtilityBar
          {...{
            ...newProps,
            pagination: { ...newProps.pagination, pageSize: 100, pageIndex: 100 },
          }}
        />
      );

      expect(await screen.findByTestId('all-cases-maximum-limit-warning')).toBeInTheDocument();
      expect(await screen.findByTestId('dismiss-warning')).toBeInTheDocument();
      expect(await screen.findByTestId('do-not-show-warning')).toBeInTheDocument();
    });

    it('should dismiss warning correctly', async () => {
      renderWithTestingProviders(
        <CasesTableUtilityBar
          {...{
            ...newProps,
            pagination: { ...newProps.pagination, pageSize: 100, pageIndex: 100 },
          }}
        />
      );

      expect(await screen.findByTestId('all-cases-maximum-limit-warning')).toBeInTheDocument();
      expect(await screen.findByTestId('dismiss-warning')).toBeInTheDocument();

      await userEvent.click(await screen.findByTestId('dismiss-warning'));

      expect(screen.queryByTestId('all-cases-maximum-limit-warning')).not.toBeInTheDocument();
    });

    describe('do not show button', () => {
      it('should show the limit warning', async () => {
        jest.mocked(useCasesLocalStorage).mockReturnValue([false, jest.fn()]);

        renderWithTestingProviders(
          <CasesTableUtilityBar
            {...{
              ...newProps,
              pagination: { ...newProps.pagination, pageSize: 100, pageIndex: 100 },
            }}
          />
        );

        expect(await screen.findByTestId('all-cases-maximum-limit-warning')).toBeInTheDocument();
        expect(await screen.findByTestId('do-not-show-warning')).toBeInTheDocument();
      });

      it('should NOT show the limit warning if it has been dismissed', async () => {
        jest.mocked(useCasesLocalStorage).mockReturnValue([true, jest.fn()]);

        renderWithTestingProviders(
          <CasesTableUtilityBar
            {...{
              ...newProps,
              pagination: { ...newProps.pagination, pageSize: 100, pageIndex: 100 },
            }}
          />
        );

        expect(screen.queryByTestId('all-cases-maximum-limit-warning')).not.toBeInTheDocument();
      });

      it('should hide warning correctly when do not show button clicked', async () => {
        const setDoNotShowAgain = jest.fn();
        jest.mocked(useCasesLocalStorage).mockReturnValue([false, setDoNotShowAgain]);

        renderWithTestingProviders(
          <CasesTableUtilityBar
            {...{
              ...newProps,
              pagination: { ...newProps.pagination, pageSize: 100, pageIndex: 100 },
            }}
          />
        );

        await userEvent.click(await screen.findByTestId('do-not-show-warning'));

        await waitFor(() => {
          expect(setDoNotShowAgain).toHaveBeenCalledWith(true);
        });
      });
    });
  });
});
