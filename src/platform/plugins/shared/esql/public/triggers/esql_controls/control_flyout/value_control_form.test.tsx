/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, within, fireEvent, waitFor } from '@testing-library/react';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import type { IUiSettingsClient } from '@kbn/core/public';
import type { monaco } from '@kbn/code-editor';
import { coreMock } from '@kbn/core/public/mocks';
import type { OptionsListESQLControlState } from '@kbn/controls-schemas';
import { ControlTriggerSource, ESQLVariableType, EsqlControlType } from '@kbn/esql-types';
import { getESQLResults } from '@kbn/esql-utils';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { ESQLControlsFlyout } from '.';
import { ESQLEditorTelemetryService } from '@kbn/esql-editor';
import {
  DEFAULT_ESQL_OPTIONS_LIST_STATE,
  DEFAULT_PINNED_CONTROL_STATE,
} from '@kbn/controls-constants';
import { setupEuiMatchers } from '@elastic/eui/lib/test/rtl/matchers';

jest.mock('@kbn/esql-utils', () => {
  const actual = jest.requireActual('@kbn/esql-utils');
  return {
    getESQLResults: jest.fn().mockResolvedValue({
      response: {
        columns: [
          {
            name: 'field',
            id: 'field',
            meta: {
              type: 'keyword',
            },
          },
        ],
        values: [['v1'], ['v2']],
      },
    }),
    getIndexPatternFromESQLQuery: jest.fn().mockReturnValue('index1'),
    getLimitFromESQLQuery: jest.fn().mockReturnValue(1000),
    getValuesFromQueryField: jest.fn().mockReturnValue('field'),
    getESQLQueryColumnsRaw: jest.fn().mockResolvedValue([{ name: 'column1' }, { name: 'column2' }]),
    getVariableNamePrefix: actual.getVariableNamePrefix,
  };
});

describe('ValueControlForm', () => {
  const dataMock = dataPluginMock.createStartContract();
  const searchMock = dataMock.search.search;

  const uiConfig: Record<string, any> = {};
  const uiSettings = {
    get: (key: string) => uiConfig[key],
  } as IUiSettingsClient;

  const services = {
    uiSettings,
    settings: {
      client: uiSettings,
    },
    core: coreMock.createStart(),
    data: dataMock,
  };

  services.core.http.post = jest
    .fn()
    .mockImplementation((_url: string) => Promise.resolve({ timeField: '@timestamp' }));

  const defaultProps = {
    initialVariableType: ESQLVariableType.TIME_LITERAL,
    queryString: 'FROM foo | STATS BY BUCKET(@timestamp,)',
    onSaveControl: jest.fn(),
    closeFlyout: jest.fn(),
    onCancelControl: jest.fn(),
    search: searchMock,
    esqlVariables: [],
    ariaLabelledBy: 'esqlControlsFlyoutTitle',
    telemetryTriggerSource: ControlTriggerSource.QUESTION_MARK,
    telemetryService: new ESQLEditorTelemetryService(services.core.analytics),
  };

  beforeAll(() => {
    setupEuiMatchers();
  });

  describe('Interval type', () => {
    it('should default correctly if no initial state is given for an interval variable type', async () => {
      const { findByTestId, findByTitle } = render(
        <IntlProvider locale="en">
          <KibanaContextProvider services={services}>
            <ESQLControlsFlyout {...defaultProps} />
          </KibanaContextProvider>
        </IntlProvider>
      );
      // control type dropdown should be rendered and default to 'STATIC_VALUES'
      expect(await findByTestId('esqlControlTypeDropdown')).toBeInTheDocument();
      expect(await findByTestId('esqlControlTypeDropdown')).toHaveTextContent(`Static values`);

      // variable name input should be rendered and with the default value
      expect(await findByTestId('esqlVariableName')).toHaveValue('?interval');

      // values dropdown should be rendered
      const valuesOptionsDropdown = await findByTestId('esqlValuesOptions');
      expect(valuesOptionsDropdown).toBeInTheDocument();
      const valuesOptionsDropdownSearchInput = within(valuesOptionsDropdown).getByRole('combobox');
      fireEvent.click(valuesOptionsDropdownSearchInput);
      expect(valuesOptionsDropdownSearchInput).toHaveValue('');
      expect(await findByTitle('5 minutes')).toBeDefined();
      expect(await findByTitle('1 hour')).toBeDefined();

      // variable label input should be rendered and with the default value (empty)
      expect(await findByTestId('esqlControlLabel')).toHaveValue('');

      // control type radio should be rendered and default to 'single'
      const selectionTypeContainer = await findByTestId('esqlControlSelectionType');
      expect(selectionTypeContainer).toBeInTheDocument();
      const singleRadioButton = within(selectionTypeContainer).getByLabelText(
        'Only allow a single selection'
      );
      expect(singleRadioButton).toBeChecked();
    });

    it('should call the onCreateControl callback, if no initialState is given', async () => {
      const onCreateControlSpy = jest.fn();
      const { findByTestId, findByTitle } = render(
        <IntlProvider locale="en">
          <KibanaContextProvider services={services}>
            <ESQLControlsFlyout
              {...defaultProps}
              onSaveControl={onCreateControlSpy}
              cursorPosition={{ lineNumber: 1, column: 1 } as monaco.Position}
            />
          </KibanaContextProvider>
        </IntlProvider>
      );

      // select the first interval
      const valuesOptionsDropdownSearchInput = within(
        await findByTestId('esqlValuesOptions')
      ).getByRole('combobox');
      fireEvent.click(valuesOptionsDropdownSearchInput);
      fireEvent.click(await findByTitle('5 minutes'));
      // click on the create button
      fireEvent.click(await findByTestId('saveEsqlControlsFlyoutButton'));
      expect(onCreateControlSpy).toHaveBeenCalled();
    });

    it('should call the onCancelControl callback, if Cancel button is clicked', async () => {
      const onCancelControlSpy = jest.fn();
      const { findByTestId } = render(
        <IntlProvider locale="en">
          <KibanaContextProvider services={services}>
            <ESQLControlsFlyout {...defaultProps} onCancelControl={onCancelControlSpy} />
          </KibanaContextProvider>
        </IntlProvider>
      );
      // click on the cancel button
      fireEvent.click(await findByTestId('cancelEsqlControlsFlyoutButton'));
      expect(onCancelControlSpy).toHaveBeenCalled();
    });

    it('should default correctly if initial state is given', async () => {
      const initialState = {
        ...DEFAULT_PINNED_CONTROL_STATE,
        ...DEFAULT_ESQL_OPTIONS_LIST_STATE,
        title: 'my control',
        available_options: ['5 minutes'],
        selected_options: ['5 minutes'],
        variable_name: 'myInterval',
        variable_type: ESQLVariableType.TIME_LITERAL,
        esql_query: 'FROM foo | STATS BY BUCKET(@timestamp,)"',
        control_type: EsqlControlType.STATIC_VALUES,
      } as OptionsListESQLControlState;
      const { findByTestId } = render(
        <IntlProvider locale="en">
          <KibanaContextProvider services={services}>
            <ESQLControlsFlyout {...defaultProps} initialState={initialState} />
          </KibanaContextProvider>
        </IntlProvider>
      );

      // variable name input should be rendered and with the default value
      expect(await findByTestId('esqlVariableName')).toHaveValue('?myInterval');

      // values dropdown should be rendered with column2 selected
      const valuesOptionsDropdown = await findByTestId('esqlValuesOptions');
      const valuesOptionsDropdownBadge = within(valuesOptionsDropdown).getByTestId('5 minutes');
      expect(valuesOptionsDropdownBadge).toBeInTheDocument();

      // variable label input should be rendered and with the default value (my control)
      expect(await findByTestId('esqlControlLabel')).toHaveValue('my control');
    });

    it('should call the onEditControl callback, if initialState is given', async () => {
      const initialState = {
        ...DEFAULT_PINNED_CONTROL_STATE,
        ...DEFAULT_ESQL_OPTIONS_LIST_STATE,
        title: 'my control',
        available_options: ['5 minutes'],
        selected_options: ['5 minutes'],
        variable_name: 'myInterval',
        variable_type: ESQLVariableType.TIME_LITERAL,
        esql_query: 'FROM foo | STATS BY BUCKET(@timestamp,)"',
        control_type: EsqlControlType.STATIC_VALUES,
      } as OptionsListESQLControlState;
      const onEditControlSpy = jest.fn();
      const { findByTestId } = render(
        <IntlProvider locale="en">
          <KibanaContextProvider services={services}>
            <ESQLControlsFlyout
              {...defaultProps}
              onSaveControl={onEditControlSpy}
              initialState={initialState}
              cursorPosition={{ lineNumber: 1, column: 1 } as monaco.Position}
            />
          </KibanaContextProvider>
        </IntlProvider>
      );
      // click on the create button
      fireEvent.click(await findByTestId('saveEsqlControlsFlyoutButton'));
      expect(onEditControlSpy).toHaveBeenCalled();
    });

    describe('Values type', () => {
      it('should default correctly if no initial state is given for a values variable type', async () => {
        const { findByTestId } = render(
          <KibanaContextProvider services={services}>
            <IntlProvider locale="en">
              <ESQLControlsFlyout
                {...defaultProps}
                initialVariableType={ESQLVariableType.VALUES}
                queryString="FROM foo | WHERE field =="
                esqlVariables={[]}
              />
            </IntlProvider>
          </KibanaContextProvider>
        );
        // control type dropdown should be rendered and default to 'Values from a query'
        expect(await findByTestId('esqlControlTypeDropdown')).toBeInTheDocument();
        expect(await findByTestId('esqlControlTypeDropdown')).toHaveTextContent(
          `Values from a query`
        );

        // values preview panel should be rendered
        expect(await findByTestId('esqlValuesPreviewStrings')).toBeInTheDocument();
      });

      it('should be able to change in fields type', async () => {
        const { findByTestId } = render(
          <IntlProvider locale="en">
            <KibanaContextProvider services={services}>
              <ESQLControlsFlyout
                {...defaultProps}
                initialVariableType={ESQLVariableType.VALUES}
                queryString="FROM foo | WHERE field =="
              />
            </KibanaContextProvider>
          </IntlProvider>
        );
        // variable name input should be rendered and with the default value
        expect(await findByTestId('esqlVariableName')).toHaveValue('?field');
        // change the variable name to ?value
        const variableNameInput = await findByTestId('esqlVariableName');
        fireEvent.change(variableNameInput, { target: { value: '??field' } });

        expect(await findByTestId('esqlControlTypeDropdown')).toBeInTheDocument();
        expect(await findByTestId('esqlControlTypeDropdown')).toHaveTextContent(`Static values`);
        // identifiers dropdown should be rendered
        const identifiersOptionsDropdown = await findByTestId('esqlIdentifiersOptions');
        expect(identifiersOptionsDropdown).toBeInTheDocument();
      });

      it('should call getESQLResults with the provided timeRange when query is submitted', async () => {
        const mockTimeRange = { from: '2023-01-01', to: '2023-01-02' };

        render(
          <IntlProvider locale="en">
            <KibanaContextProvider services={services}>
              <ESQLControlsFlyout
                {...defaultProps}
                initialVariableType={ESQLVariableType.VALUES}
                queryString="FROM foo | WHERE field =="
                timeRange={mockTimeRange}
              />
            </KibanaContextProvider>
          </IntlProvider>
        );

        await waitFor(() => {
          expect(getESQLResults).toHaveBeenCalledWith(
            expect.objectContaining({
              timeRange: mockTimeRange,
              signal: expect.any(AbortSignal),
            })
          );
        });
      });

      it('should preserve custom esqlQuery when editing an existing VALUES_FROM_QUERY control', async () => {
        const customQuery = 'FROM custom-logs* | STATS BY custom_field';
        const initialState = {
          ...DEFAULT_PINNED_CONTROL_STATE,
          ...DEFAULT_ESQL_OPTIONS_LIST_STATE,
          title: 'Custom Query Control',
          available_options: [],
          variable_name: 'customVar',
          variable_type: ESQLVariableType.VALUES,
          esql_query: customQuery,
          control_type: EsqlControlType.VALUES_FROM_QUERY,
        } as OptionsListESQLControlState;

        const getESQLResultsMock = getESQLResults as jest.Mock;
        getESQLResultsMock.mockClear();

        render(
          <KibanaContextProvider services={services}>
            <IntlProvider locale="en">
              <ESQLControlsFlyout
                {...defaultProps}
                initialVariableType={ESQLVariableType.VALUES}
                queryString="FROM foo | WHERE field =="
                initialState={initialState}
              />
            </IntlProvider>
          </KibanaContextProvider>
        );

        await waitFor(() => {
          // Verify that getESQLResults was called with the custom query
          expect(getESQLResultsMock).toHaveBeenCalledWith(
            expect.objectContaining({
              esqlQuery: customQuery,
            })
          );
        });

        // Custom query is displayed in the query editor
        const queryEditor = await waitFor(() =>
          document.querySelector('[data-test-subj*="queryInput"]')
        );
        if (queryEditor) {
          expect(queryEditor.textContent).toContain('custom-logs');
        }
      });

      it('should disable the save button until the values preview is successfully validated', async () => {
        const { getByTestId } = render(
          <IntlProvider locale="en">
            <KibanaContextProvider services={services}>
              <ESQLControlsFlyout
                {...defaultProps}
                initialVariableType={ESQLVariableType.VALUES}
                queryString="FROM foo | WHERE field =="
              />
            </KibanaContextProvider>
          </IntlProvider>
        );

        const saveButton = getByTestId('saveEsqlControlsFlyoutButton');
        expect(saveButton).toBeEuiDisabled();

        await waitFor(() => {
          expect(saveButton).not.toBeEuiDisabled();
        });
      });
    });
  });
});
