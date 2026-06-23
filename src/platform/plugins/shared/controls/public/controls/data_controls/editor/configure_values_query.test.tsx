/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import {
  ControlValuesSource,
  DEFAULT_ESQL_OPTIONS_LIST_STATE,
  ESQL_CONTROL,
} from '@kbn/controls-constants';
import type { ESQLControlsContext } from '@kbn/esql-types';
import { ConfigureValuesQuery } from './configure_values_query';

const mockLastControlsContext: { current: ESQLControlsContext | undefined } = {
  current: undefined,
};

// Avoid mounting the Monaco editor in tests; we only care about the orchestration
// between the toggle, the preview, the validation callback, and the controlsContext wiring.
jest.mock('@kbn/esql/public', () => ({
  ESQLLangEditor: ({ controlsContext }: { controlsContext?: ESQLControlsContext }) => {
    mockLastControlsContext.current = controlsContext;
    return <div data-test-subj="mock-esql-editor" />;
  },
}));

const mockGetESQLSingleColumnValues = jest.fn();
jest.mock('../../../../common/options_list/get_esql_single_column_values', () => {
  const fn = (...args: unknown[]) => mockGetESQLSingleColumnValues(...args);
  fn.isSuccess = (result: unknown) => !!result && 'values' in (result as Record<string, unknown>);
  fn.isMultiColumnError = (result: unknown) =>
    !!result && 'columns' in (result as Record<string, unknown>);
  fn.hasNoResults = (result: unknown) =>
    fn.isSuccess(result) && !(result as { values: unknown[] }).values.length;
  fn.isNumericResult = () => false;
  return { getESQLSingleColumnValues: fn };
});

jest.mock('../../utils/get_controls_timezone', () => ({
  getControlsTimezone: () => 'UTC',
}));

const baseProps = {
  selectedDataView: undefined,
  isEdit: false,
  setESQLQueryValidation: jest.fn(),
};

const renderConfigureValuesQuery = (
  overrides: Partial<React.ComponentProps<typeof ConfigureValuesQuery>> = {}
) => {
  const editorState: Partial<React.ComponentProps<typeof ConfigureValuesQuery>['editorState']> =
    overrides.editorState ?? {
      values_source: ControlValuesSource.ESQL,
      esql_query: 'FROM logs | KEEP os',
    };
  return render(
    <I18nProvider>
      <ConfigureValuesQuery
        editorState={editorState}
        updateEditorState={jest.fn()}
        {...baseProps}
        {...overrides}
      />
    </I18nProvider>
  );
};

describe('ConfigureValuesQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLastControlsContext.current = undefined;
  });

  it('reports the query as valid when a successful run returns at least one option', async () => {
    mockGetESQLSingleColumnValues.mockResolvedValueOnce({
      values: [
        'hello code reviewer',
        'just wanted to make sure youre paying attention',
        'have a nice day',
      ],
      column: { name: 'os', type: 'keyword' },
    });
    const setESQLQueryValidation = jest.fn();

    renderConfigureValuesQuery({ isEdit: true, setESQLQueryValidation });

    await waitFor(() => {
      expect(setESQLQueryValidation).toHaveBeenLastCalledWith(true);
    });
  });

  it('reports the query as invalid when it succeeds but returns no values', async () => {
    mockGetESQLSingleColumnValues.mockResolvedValueOnce({
      values: [],
      column: { name: 'os', type: 'keyword' },
    });
    const setESQLQueryValidation = jest.fn();

    renderConfigureValuesQuery({ isEdit: true, setESQLQueryValidation });

    await waitFor(() => {
      expect(setESQLQueryValidation).toHaveBeenLastCalledWith(false);
    });
  });

  describe('Create control wiring', () => {
    it('omits controlsContext when no parent supports adding panels', () => {
      renderConfigureValuesQuery({ parentApi: {} });
      expect(mockLastControlsContext.current).toBeUndefined();
    });

    it('adds a new ESQL control panel and reopens the editor with the spliced query on save', async () => {
      const addNewPanel = jest.fn().mockResolvedValue(undefined);
      const reopenEditor = jest.fn();
      const updateEditorState = jest.fn();

      renderConfigureValuesQuery({
        parentApi: { addNewPanel },
        reopenEditor,
        updateEditorState,
      });

      expect(mockLastControlsContext.current?.supportsControls).toBe(true);

      const controlState = { variableName: '?theme', variableType: 'values' };
      const updatedQuery = 'FROM logs | KEEP ?theme';

      await act(async () => {
        await mockLastControlsContext.current?.onSaveControl(controlState, updatedQuery);
      });

      expect(addNewPanel).toHaveBeenCalledWith({
        panelType: ESQL_CONTROL,
        serializedState: {
          ...DEFAULT_ESQL_OPTIONS_LIST_STATE,
          ...controlState,
        },
      });
      expect(reopenEditor).toHaveBeenCalledWith({ esql_query: updatedQuery });
      // When reopening, we leave query state to the fresh editor instance.
      expect(updateEditorState).not.toHaveBeenCalled();
    });

    it('falls back to in-place state update when no reopenEditor is provided', async () => {
      const addNewPanel = jest.fn().mockResolvedValue(undefined);
      const updateEditorState = jest.fn();
      mockGetESQLSingleColumnValues.mockResolvedValueOnce({
        values: ['kanagawa', 'rose-pine', 'gruvbox'],
        column: { name: 'theme', type: 'keyword' },
      });

      renderConfigureValuesQuery({
        parentApi: { addNewPanel },
        updateEditorState,
      });

      const updatedQuery = 'FROM logs | KEEP ?theme';

      await act(async () => {
        await mockLastControlsContext.current?.onSaveControl(
          { variableName: '?theme' },
          updatedQuery
        );
      });

      expect(updateEditorState).toHaveBeenCalledWith(
        expect.objectContaining({ esql_query: updatedQuery })
      );
      expect(mockGetESQLSingleColumnValues).toHaveBeenCalledWith(
        expect.objectContaining({ query: updatedQuery })
      );
    });

    it('forwards the dashboard time range to getESQLSingleColumnValues', async () => {
      mockGetESQLSingleColumnValues.mockResolvedValueOnce({
        type: 'success',
        column: { name: 'theme' },
        values: [],
      });

      renderConfigureValuesQuery({
        isEdit: true,
        editorState: { esql_query: 'FROM logs | WHERE @timestamp >= ?_tstart' },
      });

      await waitFor(() => {
        expect(mockGetESQLSingleColumnValues).toHaveBeenCalledWith(
          expect.objectContaining({
            timeRange: expect.objectContaining({
              from: expect.any(String),
              to: expect.any(String),
            }),
          })
        );
      });
    });

    it('reopens the editor unchanged on cancel', () => {
      const reopenEditor = jest.fn();
      renderConfigureValuesQuery({
        parentApi: { addNewPanel: jest.fn() },
        reopenEditor,
      });

      mockLastControlsContext.current?.onCancelControl();

      expect(reopenEditor).toHaveBeenCalledTimes(1);
      expect(reopenEditor).toHaveBeenCalledWith();
    });

    it('prefers addPinnedPanel when the parent supports pinning', async () => {
      const addPinnedPanel = jest.fn().mockResolvedValue(undefined);
      const addNewPanel = jest.fn();
      const parentApi = {
        addPinnedPanel,
        addNewPanel,
        pinPanel: jest.fn(),
        unpinPanel: jest.fn(),
        panelIsPinned: jest.fn(),
      };

      renderConfigureValuesQuery({ parentApi, reopenEditor: jest.fn() });

      await act(async () => {
        await mockLastControlsContext.current?.onSaveControl(
          { variableName: '?env' },
          'FROM logs | KEEP ?env'
        );
      });

      expect(addPinnedPanel).toHaveBeenCalledTimes(1);
      expect(addNewPanel).not.toHaveBeenCalled();
    });
  });
});
