/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment-timezone';
import React from 'react';
import { screen, within, fireEvent, waitFor } from '@testing-library/react';
import { renderWithI18n } from '@kbn/test-jest-helpers';

import { docLinksServiceMock } from '@kbn/core/public/mocks';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { usageCollectionPluginMock } from '@kbn/usage-collection-plugin/public/mocks';

import type { PolicyFromES } from '../common/types';
import { PolicyList } from '../public/application/sections/policy_list/policy_list';
import { init as initHttp } from '../public/application/services/http';
import { init as initUiMetric } from '../public/application/services/ui_metric';
import { KibanaContextProvider } from '../public/shared_imports';
import { PolicyListContextProvider } from '../public/application/sections/policy_list/policy_list_context';
import * as readOnlyHook from '../public/application/lib/use_is_read_only';

initHttp(httpServiceMock.createSetupContract());
initUiMetric(usageCollectionPluginMock.createSetupContract());

const TEST_DATE = '2020-07-21T14:16:58.666Z';
const TEST_DATE_FORMATTED = moment(TEST_DATE).format('MMM D, YYYY');
const TOTAL_POLICIES = 105;

const ROWS_PER_PAGE_OPTIONS = {
  DEFAULT: 10,
  MEDIUM: 25,
  LARGE: 50,
};

const testPolicy = {
  version: 0,
  modifiedDate: TEST_DATE,
  indices: ['index1'],
  indexTemplates: ['indexTemplate1', 'indexTemplate2', 'indexTemplate3', 'indexTemplate4'],
  name: 'testy0',
  policy: {
    name: 'testy0',
    phases: {},
  },
};

const isUsedByAnIndex = (i: number) => i % 2 === 0;
const isDesignatedManagedPolicy = (i: number) => i > 0 && i % 3 === 0;
const isDeprecatedPolicy = (i: number) => i > 0 && i % 2 === 0;

const policies: PolicyFromES[] = [testPolicy];
for (let i = 1; i < TOTAL_POLICIES; i++) {
  policies.push({
    version: i,
    modifiedDate: moment().subtract(i, 'days').toISOString(),
    indices: isUsedByAnIndex(i) ? [`index${i}`] : [],
    indexTemplates: i % 2 === 0 ? [`indexTemplate${i}`] : [],
    name: `testy${i}`,
    policy: {
      name: `testy${i}`,
      deprecated: i % 2 === 0,
      phases: {},
      ...(isDesignatedManagedPolicy(i)
        ? {
            _meta: {
              managed: true,
            },
          }
        : {}),
    },
  });
}

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useHistory: () => ({
    createHref: jest.fn(),
    location: {
      search: '',
    },
  }),
}));

const mockReactRouterNavigate = jest.fn();
jest.mock('@kbn/kibana-react-plugin/public', () => ({
  ...jest.requireActual('@kbn/kibana-react-plugin/public'),
  reactRouterNavigate: () => mockReactRouterNavigate(),
}));

const getPolicyLinks = () => screen.queryAllByTestId('policyTablePolicyNameLink');

const getPolicyNames = (): string[] => getPolicyLinks().map((button) => button.textContent || '');

const getPolicies = () => {
  const visiblePolicyNames = getPolicyNames();

  return visiblePolicyNames.map((name) => {
    const version = parseInt(name.replace('testy', ''), 10);

    return {
      version,
      name,
      isManagedPolicy: isDesignatedManagedPolicy(version),
      isDeprecatedPolicy: isDeprecatedPolicy(version),
      isUsedByAnIndex: isUsedByAnIndex(version),
    };
  });
};

const testSort = (headerName: string) => {
  const headerCell = screen.getByTestId(`tableHeaderCell_${headerName}`);
  const sortButton = within(headerCell).getByRole('button');

  fireEvent.click(sortButton);
  expect(getPolicyNames()).toMatchSnapshot();

  fireEvent.click(sortButton);
  expect(getPolicyNames()).toMatchSnapshot();
};

const TestComponent = ({ testPolicies }: { testPolicies: PolicyFromES[] }) => {
  return (
    <KibanaContextProvider
      services={{ getUrlForApp: () => '', docLinks: docLinksServiceMock.createStartContract() }}
    >
      <PolicyListContextProvider>
        <PolicyList updatePolicies={jest.fn()} policies={testPolicies} />
      </PolicyListContextProvider>
    </KibanaContextProvider>
  );
};

beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

describe('policy table', () => {
  beforeEach(() => {
    jest.spyOn(readOnlyHook, 'useIsReadOnly').mockReturnValue(false);
    window.localStorage.removeItem('ILM_SHOW_MANAGED_POLICIES_BY_DEFAULT');
  });

  test('shows empty state when there are no policies', () => {
    const { container } = renderWithI18n(<TestComponent testPolicies={[]} />);
    expect(container).toMatchSnapshot();
  });

  test('changes pages when a pagination link is clicked on', () => {
    const { container } = renderWithI18n(<TestComponent testPolicies={policies} />);
    expect(getPolicyNames()).toMatchSnapshot();

    const pagingButtons = container.querySelectorAll('.euiPaginationButton');
    const secondPageButton = pagingButtons[1];
    fireEvent.click(secondPageButton);

    expect(getPolicyNames()).toMatchSnapshot();
  });

  test('does not show any hidden policies by default', () => {
    renderWithI18n(<TestComponent testPolicies={policies} />);

    const includeHiddenPoliciesSwitch = screen.getByTestId('includeHiddenPoliciesSwitch');
    expect(includeHiddenPoliciesSwitch).toHaveAttribute('aria-checked', 'false');

    const visiblePolicies = getPolicies();
    const hasManagedPolicies = visiblePolicies.some((p) => {
      const policyRow = screen.getByTestId(`policyTableRow-${p.name}`);
      const warningBadge = within(policyRow).queryByTestId('managedPolicyBadge');
      return warningBadge !== null;
    });

    expect(hasManagedPolicies).toEqual(false);
  });

  test('shows more policies when "Rows per page" value is increased', async () => {
    renderWithI18n(<TestComponent testPolicies={policies} />);

    const perPageButton = screen.getByText(/Rows per page/);
    fireEvent.click(perPageButton);

    const rowsOptions = await screen.findAllByText(/\d+ rows/);
    const mediumRowsOption = rowsOptions[1];
    fireEvent.click(mediumRowsOption);

    await waitFor(() => {
      expect(getPolicyNames().length).toBe(ROWS_PER_PAGE_OPTIONS.MEDIUM);
    });
  });

  test('shows hidden policies with Managed badges when setting is switched on', async () => {
    renderWithI18n(<TestComponent testPolicies={policies} />);

    const includeHiddenPoliciesSwitch = screen.getByTestId('includeHiddenPoliciesSwitch');
    fireEvent.click(includeHiddenPoliciesSwitch);

    const perPageButton = screen.getByText(/Rows per page/);
    fireEvent.click(perPageButton);

    const rowsOptions = await screen.findAllByText(/\d+ rows/);
    const largeRowsOption = rowsOptions[2];
    fireEvent.click(largeRowsOption);

    await waitFor(() => {
      const visiblePolicies = getPolicies();
      expect(visiblePolicies.filter((p) => p.isManagedPolicy).length).toBeGreaterThan(0);

      visiblePolicies.forEach((p) => {
        const policyRow = screen.getByTestId(`policyTableRow-${p.name}`);
        const warningBadge = within(policyRow).queryByTestId('managedPolicyBadge');

        if (p.isManagedPolicy) {
          expect(warningBadge).toBeInTheDocument();
        } else {
          expect(warningBadge).not.toBeInTheDocument();
        }
      });
    });
  });

  test('shows deprecated policies with Deprecated badges', () => {
    renderWithI18n(<TestComponent testPolicies={policies} />);

    let deprecatedPolicies = screen.queryAllByTestId('deprecatedPolicyBadge');
    expect(deprecatedPolicies.length).toBe(0);

    const searchInput = screen.getByPlaceholderText(/Search/i);
    fireEvent.change(searchInput, { target: { value: 'is:policy.deprecated' } });
    fireEvent.keyUp(searchInput, { key: 'Enter', keyCode: 13, which: 13 });

    deprecatedPolicies = screen.queryAllByTestId('deprecatedPolicyBadge');
    expect(deprecatedPolicies.length).toBeGreaterThan(0);
  });

  test('filters based on content of search input', () => {
    renderWithI18n(<TestComponent testPolicies={policies} />);

    const searchInput = screen.getByPlaceholderText(/Search/i);
    fireEvent.change(searchInput, { target: { value: 'testy0' } });
    fireEvent.keyUp(searchInput, { key: 'Enter', keyCode: 13, which: 13 });

    expect(getPolicyNames()).toMatchSnapshot();
  });

  test('sorts when name header is clicked', () => {
    renderWithI18n(<TestComponent testPolicies={policies} />);
    testSort('name_0');
  });

  test('sorts when modified date header is clicked', () => {
    renderWithI18n(<TestComponent testPolicies={policies} />);
    testSort('modifiedDate_3');
  });

  test('sorts when linked indices header is clicked', () => {
    renderWithI18n(<TestComponent testPolicies={policies} />);
    testSort('indices_2');
  });

  test('sorts when linked index templates header is clicked', () => {
    renderWithI18n(<TestComponent testPolicies={policies} />);
    testSort('indexTemplates_1');
  });

  test('delete policy button is disabled when there are linked indices', () => {
    renderWithI18n(<TestComponent testPolicies={policies} />);

    const policyRow = screen.getByTestId(`policyTableRow-${testPolicy.name}`);
    const deleteButton = within(policyRow).getByTestId('deletePolicy');

    expect(deleteButton).toHaveAttribute('aria-disabled', 'true');
  });

  test('delete policy button is enabled when there are no linked indices', () => {
    renderWithI18n(<TestComponent testPolicies={policies} />);

    const visiblePolicies = getPolicies();
    const unusedPolicy = visiblePolicies.find((p) => !p.isUsedByAnIndex);
    expect(unusedPolicy).toBeDefined();

    const policyRow = screen.getByTestId(`policyTableRow-${unusedPolicy!.name}`);
    const deleteButton = within(policyRow).getByTestId('deletePolicy');

    expect(deleteButton).toBeEnabled();
  });

  test('confirmation modal shows when delete button is pressed', async () => {
    renderWithI18n(<TestComponent testPolicies={policies} />);

    const policyRow = screen.getByTestId('policyTableRow-testy1');
    const deleteButton = within(policyRow).getByTestId('deletePolicy');
    fireEvent.click(deleteButton);

    expect(await screen.findByTestId('deletePolicyModal')).toBeInTheDocument();
  });

  test('confirmation modal shows warning when delete button is pressed for a hidden policy', async () => {
    renderWithI18n(<TestComponent testPolicies={policies} />);

    const includeHiddenPoliciesSwitch = screen.getByTestId('includeHiddenPoliciesSwitch');
    fireEvent.click(includeHiddenPoliciesSwitch);

    const perPageButton = screen.getByText(/Rows per page/);
    fireEvent.click(perPageButton);

    const rowsOptions = await screen.findAllByText(/\d+ rows/);
    const largeRowsOption = rowsOptions[2];
    fireEvent.click(largeRowsOption);

    await waitFor(() => {
      const visiblePolicies = getPolicies();
      const managedPolicy = visiblePolicies.find((p) => p.isManagedPolicy && !p.isUsedByAnIndex);
      expect(managedPolicy).toBeDefined();
    });

    const visiblePolicies = getPolicies();
    const managedPolicy = visiblePolicies.find((p) => p.isManagedPolicy && !p.isUsedByAnIndex);

    const policyRow = screen.getByTestId(`policyTableRow-${managedPolicy!.name}`);
    const deleteButton = within(policyRow).getByTestId('deletePolicy');
    fireEvent.click(deleteButton);

    expect(await screen.findByTestId('deletePolicyModal')).toBeInTheDocument();
    expect(screen.getByTestId('deleteManagedPolicyCallOut')).toBeInTheDocument();
  });

  test('add index template modal shows when add policy to index template button is pressed', async () => {
    renderWithI18n(<TestComponent testPolicies={policies} />);

    const policyRow = screen.getByTestId(`policyTableRow-${testPolicy.name}`);
    const actionsButton = within(policyRow).getByTestId('euiCollapsedItemActionsButton');
    fireEvent.click(actionsButton);

    const addPolicyToTemplateButton = await screen.findByTestId('addPolicyToTemplate');
    fireEvent.click(addPolicyToTemplateButton);

    expect(await screen.findByTestId('addPolicyToTemplateModal')).toBeInTheDocument();
  });

  test('displays policy properties', () => {
    renderWithI18n(<TestComponent testPolicies={policies} />);

    const firstRow = screen.getByTestId('policyTableRow-testy0');

    const policyName = within(firstRow).getByTestId('policyTablePolicyNameLink');
    expect(policyName).toHaveTextContent(testPolicy.name);

    const policyIndexTemplates = within(firstRow).getByTestId('policy-indexTemplates');
    expect(policyIndexTemplates).toHaveTextContent(`${testPolicy.indexTemplates.length}`);

    const policyIndices = within(firstRow).getByTestId('policy-indices');
    expect(policyIndices).toHaveTextContent(`${testPolicy.indices.length}`);

    const policyModifiedDate = within(firstRow).getByTestId('policy-modifiedDate');
    expect(policyModifiedDate).toHaveTextContent(TEST_DATE_FORMATTED);

    const cells = within(firstRow).getAllByRole('cell');
    expect(cells.length).toBe(5);
  });

  test('opens a flyout with index templates', async () => {
    renderWithI18n(<TestComponent testPolicies={policies} />);

    const indexTemplatesButton = screen.getAllByTestId('viewIndexTemplates')[0];
    fireEvent.click(indexTemplatesButton);

    const flyoutTitle = await screen.findByTestId('indexTemplatesFlyoutHeader');
    expect(flyoutTitle).toHaveTextContent('testy0');

    const indexTemplatesLinks = screen.getAllByTestId('indexTemplateLink');
    expect(indexTemplatesLinks.length).toBe(testPolicy.indexTemplates.length);
  });

  test('opens a flyout to view policy by calling reactRouterNavigate', async () => {
    renderWithI18n(<TestComponent testPolicies={policies} />);

    const policyNameLink = screen.getAllByTestId('policyTablePolicyNameLink')[0];
    fireEvent.click(policyNameLink);

    expect(mockReactRouterNavigate).toHaveBeenCalled();
  });

  describe('read only view', () => {
    beforeEach(() => {
      jest.spyOn(readOnlyHook, 'useIsReadOnly').mockReturnValue(true);
    });

    test(`doesn't show actions column in the table`, () => {
      renderWithI18n(<TestComponent testPolicies={policies} />);

      const policyRow = screen.getByTestId('policyTableRow-testy0');
      const cells = within(policyRow).getAllByRole('cell');

      expect(cells.length).toBe(4);
    });
  });
});
