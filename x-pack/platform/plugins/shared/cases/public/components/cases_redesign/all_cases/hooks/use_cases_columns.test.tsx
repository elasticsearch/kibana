/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { licensingMock } from '@kbn/licensing-plugin/public/mocks';

import type { GetCasesColumn } from './use_cases_columns';
import { ExternalServiceColumn, useCasesColumns } from './use_cases_columns';
import { useGetCasesMockState } from '../../../../containers/mock';
import { connectors, useCaseConfigureResponse } from '../../../configure_cases/__mock__';

import {
  readCasesPermissions,
  renderWithTestingProviders,
  TestProviders,
} from '../../../../common/mock';
import { KibanaServices } from '../../../../common/lib/kibana';
import { renderHook, screen } from '@testing-library/react';
import { CaseStatuses, CustomFieldTypes } from '../../../../../common/types/domain';
import { userProfilesMap } from '../../../../containers/user_profiles/api.mock';
import { useGetCaseConfiguration } from '../../../../containers/configure/use_get_case_configuration';
import { coreMock } from '@kbn/core/public/mocks';
import { createMockActionConnector } from '@kbn/alerts-ui-shared/src/common/test_utils/connector.mock';

jest.mock('../../../../containers/configure/use_get_case_configuration');

const useGetCaseConfigurationMock = useGetCaseConfiguration as jest.Mock;

const DEFAULT_SELECTED_COLUMNS = [
  { field: 'title', name: 'title', isChecked: true },
  { field: 'assignees', name: 'assignees', isChecked: true },
  { field: 'tags', name: 'tags', isChecked: true },
  { field: 'totalAlerts', name: 'totalAlerts', isChecked: true },
  { field: 'totalComment', name: 'totalComment', isChecked: true },
  { field: 'category', name: 'category', isChecked: true },
  { field: 'createdAt', name: 'createdAt', isChecked: true },
  { field: 'updatedAt', name: 'updatedAt', isChecked: true },
  { field: 'closedAt', name: 'closedAt', isChecked: false },
  { field: 'externalIncident', name: 'externalIncident', isChecked: true },
  { field: 'status', name: 'status', isChecked: true },
  { field: 'severity', name: 'severity', isChecked: true },
];

describe('useCasesColumns ', () => {
  const useCasesColumnsProps: GetCasesColumn = {
    filterStatus: [CaseStatuses.open],
    userProfiles: userProfilesMap,
    isSelectorView: false,
    selectedColumns: DEFAULT_SELECTED_COLUMNS,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    useGetCaseConfigurationMock.mockImplementation(() => useCaseConfigureResponse);
  });

  it('return all selected columns correctly', async () => {
    const license = licensingMock.createLicense({
      license: { type: 'platinum' },
    });

    const { result } = renderHook(
      () =>
        useCasesColumns({
          ...useCasesColumnsProps,
          selectedColumns: DEFAULT_SELECTED_COLUMNS.map((element) => ({
            ...element,
            isChecked: true,
          })),
        }),
      {
        wrapper: (props) => <TestProviders {...props} license={license} />,
      }
    );

    expect(result.current).toMatchInlineSnapshot(`
      Object {
        "columns": Array [
          Object {
            "field": "title",
            "minWidth": "12em",
            "name": "Name",
            "render": [Function],
            "sortable": true,
          },
          Object {
            "field": "assignees",
            "minWidth": "2em",
            "name": "Assignees",
            "render": [Function],
            "width": "6em",
          },
          Object {
            "field": "tags",
            "minWidth": "8em",
            "name": "Tags",
            "render": [Function],
            "width": "14em",
          },
          Object {
            "align": "right",
            "field": "totalAlerts",
            "minWidth": "4em",
            "name": "Alerts",
            "render": [Function],
            "width": "4em",
          },
          Object {
            "align": "right",
            "field": "totalComment",
            "minWidth": "6em",
            "name": "Comments",
            "render": [Function],
            "width": "6em",
          },
          Object {
            "field": "category",
            "minWidth": "6.5em",
            "name": "Category",
            "render": [Function],
            "sortable": true,
            "width": "10em",
          },
          Object {
            "data-test-subj": "case-table-column-createdAt",
            "field": "createdAt",
            "minWidth": "9em",
            "name": "Created on",
            "render": [Function],
            "sortable": true,
            "width": "9em",
          },
          Object {
            "data-test-subj": "case-table-column-updatedAt",
            "field": "updatedAt",
            "minWidth": "9em",
            "name": "Updated on",
            "render": [Function],
            "sortable": true,
            "width": "9em",
          },
          Object {
            "data-test-subj": "case-table-column-closedAt",
            "field": "closedAt",
            "minWidth": "9.5em",
            "name": "Closed on",
            "render": [Function],
            "sortable": true,
            "width": "9.5em",
          },
          Object {
            "name": "External incident",
            "render": [Function],
            "width": "8.5em",
          },
          Object {
            "className": "eui-textNoWrap",
            "field": "status",
            "minWidth": "6.5em",
            "name": "Status",
            "render": [Function],
            "sortable": true,
            "width": "6.5em",
          },
          Object {
            "className": "eui-textNoWrap",
            "field": "severity",
            "minWidth": "6em",
            "name": "Severity",
            "render": [Function],
            "sortable": true,
            "width": "6em",
          },
          Object {
            "align": "right",
            "minWidth": "4.5em",
            "name": "Actions",
            "render": [Function],
            "width": "4.5em",
          },
        ],
        "isLoadingColumns": false,
        "rowHeader": "title",
      }
    `);
  });

  it('only returns selected columns', async () => {
    const license = licensingMock.createLicense({
      license: { type: 'platinum' },
    });

    const { result } = renderHook(() => useCasesColumns(useCasesColumnsProps), {
      wrapper: (props) => <TestProviders {...props} license={license} />,
    });

    expect(result.current).toMatchInlineSnapshot(`
      Object {
        "columns": Array [
          Object {
            "field": "title",
            "minWidth": "12em",
            "name": "Name",
            "render": [Function],
            "sortable": true,
          },
          Object {
            "field": "assignees",
            "minWidth": "2em",
            "name": "Assignees",
            "render": [Function],
            "width": "6em",
          },
          Object {
            "field": "tags",
            "minWidth": "8em",
            "name": "Tags",
            "render": [Function],
            "width": "14em",
          },
          Object {
            "align": "right",
            "field": "totalAlerts",
            "minWidth": "4em",
            "name": "Alerts",
            "render": [Function],
            "width": "4em",
          },
          Object {
            "align": "right",
            "field": "totalComment",
            "minWidth": "6em",
            "name": "Comments",
            "render": [Function],
            "width": "6em",
          },
          Object {
            "field": "category",
            "minWidth": "6.5em",
            "name": "Category",
            "render": [Function],
            "sortable": true,
            "width": "10em",
          },
          Object {
            "data-test-subj": "case-table-column-createdAt",
            "field": "createdAt",
            "minWidth": "9em",
            "name": "Created on",
            "render": [Function],
            "sortable": true,
            "width": "9em",
          },
          Object {
            "data-test-subj": "case-table-column-updatedAt",
            "field": "updatedAt",
            "minWidth": "9em",
            "name": "Updated on",
            "render": [Function],
            "sortable": true,
            "width": "9em",
          },
          Object {
            "name": "External incident",
            "render": [Function],
            "width": "8.5em",
          },
          Object {
            "className": "eui-textNoWrap",
            "field": "status",
            "minWidth": "6.5em",
            "name": "Status",
            "render": [Function],
            "sortable": true,
            "width": "6.5em",
          },
          Object {
            "className": "eui-textNoWrap",
            "field": "severity",
            "minWidth": "6em",
            "name": "Severity",
            "render": [Function],
            "sortable": true,
            "width": "6em",
          },
          Object {
            "align": "right",
            "minWidth": "4.5em",
            "name": "Actions",
            "render": [Function],
            "width": "4.5em",
          },
        ],
        "isLoadingColumns": false,
        "rowHeader": "title",
      }
    `);
  });

  it('returns the assignees column without the width specified when in the modal view', async () => {
    const license = licensingMock.createLicense({
      license: { type: 'platinum' },
    });

    const { result } = renderHook(
      () => useCasesColumns({ ...useCasesColumnsProps, isSelectorView: true }),
      {
        wrapper: (props) => <TestProviders {...props} license={license} />,
      }
    );

    expect(result.current).toMatchInlineSnapshot(`
      Object {
        "columns": Array [
          Object {
            "field": "title",
            "minWidth": "12em",
            "name": "Name",
            "render": [Function],
            "sortable": true,
          },
          Object {
            "field": "category",
            "minWidth": "6.5em",
            "name": "Category",
            "render": [Function],
            "sortable": true,
            "width": "10em",
          },
          Object {
            "data-test-subj": "case-table-column-createdAt",
            "field": "createdAt",
            "minWidth": "9em",
            "name": "Created on",
            "render": [Function],
            "sortable": true,
            "width": "9em",
          },
          Object {
            "className": "eui-textNoWrap",
            "field": "status",
            "minWidth": "6.5em",
            "name": "Status",
            "render": [Function],
            "sortable": true,
            "width": "6.5em",
          },
          Object {
            "className": "eui-textNoWrap",
            "field": "severity",
            "minWidth": "6em",
            "name": "Severity",
            "render": [Function],
            "sortable": true,
            "width": "6em",
          },
          Object {
            "align": "right",
            "render": [Function],
            "width": "8em",
          },
        ],
        "isLoadingColumns": false,
        "rowHeader": "title",
      }
    `);
  });

  it('shows the select button if isSelectorView=true', async () => {
    const { result } = renderHook(
      () => useCasesColumns({ ...useCasesColumnsProps, isSelectorView: true }),
      {
        wrapper: TestProviders,
      }
    );

    expect(result.current).toMatchInlineSnapshot(`
      Object {
        "columns": Array [
          Object {
            "field": "title",
            "minWidth": "12em",
            "name": "Name",
            "render": [Function],
            "sortable": true,
          },
          Object {
            "field": "category",
            "minWidth": "6.5em",
            "name": "Category",
            "render": [Function],
            "sortable": true,
            "width": "10em",
          },
          Object {
            "data-test-subj": "case-table-column-createdAt",
            "field": "createdAt",
            "minWidth": "9em",
            "name": "Created on",
            "render": [Function],
            "sortable": true,
            "width": "9em",
          },
          Object {
            "className": "eui-textNoWrap",
            "field": "status",
            "minWidth": "6.5em",
            "name": "Status",
            "render": [Function],
            "sortable": true,
            "width": "6.5em",
          },
          Object {
            "className": "eui-textNoWrap",
            "field": "severity",
            "minWidth": "6em",
            "name": "Severity",
            "render": [Function],
            "sortable": true,
            "width": "6em",
          },
          Object {
            "align": "right",
            "render": [Function],
            "width": "8em",
          },
        ],
        "isLoadingColumns": false,
        "rowHeader": "title",
      }
    `);
  });

  it('shows the correct columns if isSelectorView=true', async () => {
    const { result } = renderHook(
      () => useCasesColumns({ ...useCasesColumnsProps, isSelectorView: true }),
      {
        wrapper: TestProviders,
      }
    );

    expect(result.current).toMatchInlineSnapshot(`
      Object {
        "columns": Array [
          Object {
            "field": "title",
            "minWidth": "12em",
            "name": "Name",
            "render": [Function],
            "sortable": true,
          },
          Object {
            "field": "category",
            "minWidth": "6.5em",
            "name": "Category",
            "render": [Function],
            "sortable": true,
            "width": "10em",
          },
          Object {
            "data-test-subj": "case-table-column-createdAt",
            "field": "createdAt",
            "minWidth": "9em",
            "name": "Created on",
            "render": [Function],
            "sortable": true,
            "width": "9em",
          },
          Object {
            "className": "eui-textNoWrap",
            "field": "status",
            "minWidth": "6.5em",
            "name": "Status",
            "render": [Function],
            "sortable": true,
            "width": "6.5em",
          },
          Object {
            "className": "eui-textNoWrap",
            "field": "severity",
            "minWidth": "6em",
            "name": "Severity",
            "render": [Function],
            "sortable": true,
            "width": "6em",
          },
          Object {
            "align": "right",
            "render": [Function],
            "width": "8em",
          },
        ],
        "isLoadingColumns": false,
        "rowHeader": "title",
      }
    `);
  });

  it('keeps the selector action column for closed status filtering', async () => {
    const { result } = renderHook(
      () =>
        useCasesColumns({
          ...useCasesColumnsProps,
          isSelectorView: true,
          filterStatus: [CaseStatuses.closed],
        }),
      {
        wrapper: TestProviders,
      }
    );

    const assignActionColumn = result.current.columns[result.current.columns.length - 1];
    expect(assignActionColumn).toMatchInlineSnapshot(`
      Object {
        "align": "right",
        "render": [Function],
        "width": "8em",
      }
    `);
  });

  it('does not shows the actions if the user does not have the right permissions', async () => {
    const { result } = renderHook(() => useCasesColumns(useCasesColumnsProps), {
      wrapper: (props) => <TestProviders {...props} permissions={readCasesPermissions()} />,
    });

    expect(result.current).toMatchInlineSnapshot(`
      Object {
        "columns": Array [
          Object {
            "field": "title",
            "minWidth": "12em",
            "name": "Name",
            "render": [Function],
            "sortable": true,
          },
          Object {
            "field": "tags",
            "minWidth": "8em",
            "name": "Tags",
            "render": [Function],
            "width": "14em",
          },
          Object {
            "align": "right",
            "field": "totalAlerts",
            "minWidth": "4em",
            "name": "Alerts",
            "render": [Function],
            "width": "4em",
          },
          Object {
            "align": "right",
            "field": "totalComment",
            "minWidth": "6em",
            "name": "Comments",
            "render": [Function],
            "width": "6em",
          },
          Object {
            "field": "category",
            "minWidth": "6.5em",
            "name": "Category",
            "render": [Function],
            "sortable": true,
            "width": "10em",
          },
          Object {
            "data-test-subj": "case-table-column-createdAt",
            "field": "createdAt",
            "minWidth": "9em",
            "name": "Created on",
            "render": [Function],
            "sortable": true,
            "width": "9em",
          },
          Object {
            "data-test-subj": "case-table-column-updatedAt",
            "field": "updatedAt",
            "minWidth": "9em",
            "name": "Updated on",
            "render": [Function],
            "sortable": true,
            "width": "9em",
          },
          Object {
            "name": "External incident",
            "render": [Function],
            "width": "8.5em",
          },
          Object {
            "className": "eui-textNoWrap",
            "field": "status",
            "minWidth": "6.5em",
            "name": "Status",
            "render": [Function],
            "sortable": true,
            "width": "6.5em",
          },
          Object {
            "className": "eui-textNoWrap",
            "field": "severity",
            "minWidth": "6em",
            "name": "Severity",
            "render": [Function],
            "sortable": true,
            "width": "6em",
          },
        ],
        "isLoadingColumns": false,
        "rowHeader": "title",
      }
    `);
  });

  it('returns custom field columns', async () => {
    const textKey = 'text_key';
    const toggleKey = 'toggle_key';

    const textLabel = 'Text Label';
    const toggleLabel = 'Toggle Label';

    useGetCaseConfigurationMock.mockImplementation(() => ({
      data: {
        ...useCaseConfigureResponse.data,
        customFields: [
          { key: textKey, label: textLabel, type: CustomFieldTypes.TEXT },
          { key: toggleKey, label: toggleLabel, type: CustomFieldTypes.TOGGLE },
        ],
      },
      isFetching: false,
    }));

    const { result } = renderHook(
      () =>
        useCasesColumns({
          ...useCasesColumnsProps,
          selectedColumns: [
            ...DEFAULT_SELECTED_COLUMNS,
            { field: textKey, name: textLabel, isChecked: true },
            { field: toggleKey, name: toggleLabel, isChecked: true },
          ],
        }),
      {
        wrapper: (props) => <TestProviders {...props} permissions={readCasesPermissions()} />,
      }
    );

    expect(result.current).toMatchInlineSnapshot(`
      Object {
        "columns": Array [
          Object {
            "field": "title",
            "minWidth": "12em",
            "name": "Name",
            "render": [Function],
            "sortable": true,
          },
          Object {
            "field": "tags",
            "minWidth": "8em",
            "name": "Tags",
            "render": [Function],
            "width": "14em",
          },
          Object {
            "align": "right",
            "field": "totalAlerts",
            "minWidth": "4em",
            "name": "Alerts",
            "render": [Function],
            "width": "4em",
          },
          Object {
            "align": "right",
            "field": "totalComment",
            "minWidth": "6em",
            "name": "Comments",
            "render": [Function],
            "width": "6em",
          },
          Object {
            "field": "category",
            "minWidth": "6.5em",
            "name": "Category",
            "render": [Function],
            "sortable": true,
            "width": "10em",
          },
          Object {
            "data-test-subj": "case-table-column-createdAt",
            "field": "createdAt",
            "minWidth": "9em",
            "name": "Created on",
            "render": [Function],
            "sortable": true,
            "width": "9em",
          },
          Object {
            "data-test-subj": "case-table-column-updatedAt",
            "field": "updatedAt",
            "minWidth": "9em",
            "name": "Updated on",
            "render": [Function],
            "sortable": true,
            "width": "9em",
          },
          Object {
            "name": "External incident",
            "render": [Function],
            "width": "8.5em",
          },
          Object {
            "className": "eui-textNoWrap",
            "field": "status",
            "minWidth": "6.5em",
            "name": "Status",
            "render": [Function],
            "sortable": true,
            "width": "6.5em",
          },
          Object {
            "className": "eui-textNoWrap",
            "field": "severity",
            "minWidth": "6em",
            "name": "Severity",
            "render": [Function],
            "sortable": true,
            "width": "6em",
          },
          Object {
            "data-test-subj": "text-custom-field-column",
            "maxWidth": "18em",
            "minWidth": "6em",
            "name": "Text Label",
            "render": [Function],
          },
          Object {
            "align": "center",
            "data-test-subj": "toggle-custom-field-column",
            "maxWidth": "7em",
            "minWidth": "2.5em",
            "name": "Toggle Label",
            "render": [Function],
          },
        ],
        "isLoadingColumns": false,
        "rowHeader": "title",
      }
    `);
  });

  describe('extended fields column', () => {
    const license = licensingMock.createLicense({
      license: { type: 'platinum' },
    });

    beforeEach(() => {
      jest.spyOn(KibanaServices, 'getConfig').mockReturnValue({
        templates: { enabled: true },
      } as ReturnType<typeof KibanaServices.getConfig>);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('includes the extended fields column when selected and templates are enabled', () => {
      const { result } = renderHook(
        () =>
          useCasesColumns({
            ...useCasesColumnsProps,
            selectedColumns: [
              ...DEFAULT_SELECTED_COLUMNS,
              { field: 'extendedFields', name: 'Extended fields', isChecked: true },
            ],
          }),
        {
          wrapper: (props) => <TestProviders {...props} license={license} />,
        }
      );

      const extendedColumn = result.current.columns.find((col) => col.name === 'Extended fields');

      expect(extendedColumn).toBeDefined();
      expect(extendedColumn?.name).toBe('Extended fields');
    });
  });

  describe('ExternalServiceColumn ', () => {
    it('Not pushed render', () => {
      renderWithTestingProviders(
        <ExternalServiceColumn
          theCase={useGetCasesMockState.data.cases[0]}
          connectors={connectors}
        />
      );

      expect(screen.getByTestId('case-table-column-external-notPushed')).toBeInTheDocument();
    });

    it('Up to date', () => {
      renderWithTestingProviders(
        <ExternalServiceColumn
          theCase={useGetCasesMockState.data.cases[1]}
          connectors={connectors}
        />
      );

      expect(screen.getByTestId('case-table-column-external-upToDate')).toBeInTheDocument();
    });

    it('Needs update', () => {
      renderWithTestingProviders(
        <ExternalServiceColumn
          theCase={useGetCasesMockState.data.cases[2]}
          connectors={connectors}
        />
      );

      expect(screen.getByTestId('case-table-column-external-requiresUpdate')).toBeInTheDocument();
    });

    it('it does not throw when accessing the icon if the connector type is not registered', () => {
      // If the component throws the test will fail
      expect(() =>
        renderWithTestingProviders(
          <ExternalServiceColumn
            theCase={useGetCasesMockState.data.cases[2]}
            connectors={[
              createMockActionConnector({
                id: 'none',
                actionTypeId: '.none',
                name: 'None',
              }),
            ]}
          />
        )
      ).not.toThrowError();
    });

    it('shows the connectors icon if the user has read access to actions', async () => {
      renderWithTestingProviders(
        <ExternalServiceColumn
          theCase={useGetCasesMockState.data.cases[1]}
          connectors={connectors}
        />
      );

      expect(screen.getByTestId('cases-table-connector-icon')).toBeInTheDocument();
    });

    it('hides the connectors icon if the user does not have read access to actions', async () => {
      const coreStart = coreMock.createStart();
      coreStart.application.capabilities = {
        ...coreStart.application.capabilities,
        actions: { save: false, show: false },
      };

      renderWithTestingProviders(
        <ExternalServiceColumn
          theCase={useGetCasesMockState.data.cases[1]}
          connectors={connectors}
        />,
        { wrapperProps: { coreStart } }
      );

      expect(screen.queryByTestId('cases-table-connector-icon')).toBe(null);
    });
  });
});
