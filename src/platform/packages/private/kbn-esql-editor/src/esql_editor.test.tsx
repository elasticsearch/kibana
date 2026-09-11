/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import '@testing-library/jest-dom';
import type { SerializedStyles } from '@emotion/react';
import type { IUiSettingsClient } from '@kbn/core/public';
import { coreMock } from '@kbn/core/public/mocks';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { kqlPluginMock } from '@kbn/kql/public/mocks';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import { waitFor } from '@testing-library/dom';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { BehaviorSubject } from 'rxjs';
import { ESQLEditor } from './esql_editor';
import { VALIDATION_DEBOUNCE_MS } from './hooks/use_query_validation';
import type { ESQLEditorProps } from './types';

const mockValidate = jest.fn().mockResolvedValue({ errors: [], warnings: [] });

jest.mock('@kbn/code-editor', () => ({
  ...jest.requireActual('@kbn/code-editor'),
  ESQLLang: {
    ...jest.requireActual('@kbn/code-editor').ESQLLang,
    getEsqlLanguage: jest.fn(() => ({
      id: 'esql',
      name: 'ESQL',
      extensions: ['.esql'],
      aliases: ['ESQL', 'esql'],
      mimetypes: ['application/esql'],
    })),
    validate: async () => mockValidate(),
  },
}));

jest.mock('monaco-promql', () => ({
  promLanguageDefinition: {
    id: 'promql',
    extensions: ['.promql'],
    aliases: [],
    mimetypes: [],
    loader: jest.fn().mockResolvedValue({
      language: { tokenizer: { root: [] } },
      languageConfiguration: {},
    }),
  },
}));

jest.mock('./lookup_join', () => {
  return {
    useCanCreateLookupIndex: jest.fn().mockReturnValue(jest.fn().mockReturnValue(true)),
    useLookupIndexCommand: jest.fn().mockReturnValue({
      lookupIndexBadgeStyle: {} as SerializedStyles,
      addLookupIndicesDecorator: jest.fn(),
    }),
  };
});

window.performance.mark = jest.fn();

describe('ESQLEditor', () => {
  const uiConfig: Record<string, any> = {};
  const uiSettings = {
    get: (key: string) => uiConfig[key],
  } as IUiSettingsClient;

  const corePluginMock = coreMock.createStart();
  corePluginMock.chrome.getActiveSolutionNavId$.mockReturnValue(new BehaviorSubject('oblt'));

  corePluginMock.http.get = jest.fn().mockImplementation((url: string) => {
    if (url.includes('/internal/esql/autocomplete/sources/')) {
      return Promise.resolve([
        { name: 'test_index', hidden: false, type: 'index' },
        { name: 'logs', hidden: false, type: 'index' },
      ]);
    }
    return Promise.resolve([]);
  });

  const kqlMock = kqlPluginMock.createStartContract();
  (kqlMock.autocomplete.hasQuerySuggestions as jest.Mock).mockReturnValue(true);

  const services = {
    uiSettings,
    settings: {
      client: uiSettings,
    },
    core: corePluginMock,
    data: dataPluginMock.createStartContract(),
    kql: kqlMock,
  };

  function renderESQLEditorComponent(testProps: ESQLEditorProps) {
    return (
      <KibanaContextProvider services={services}>
        <ESQLEditor {...testProps} />
      </KibanaContextProvider>
    );
  }
  let props: ESQLEditorProps;

  beforeEach(() => {
    props = {
      query: { esql: 'from test' },
      onTextLangQueryChange: jest.fn(),
      onTextLangQuerySubmit: jest.fn(),
    };
    mockValidate.mockResolvedValue({ errors: [], warnings: [] });

    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (contextId, options) =>
        ({
          webkitBackingStorePixelRatio: 1,
        } as unknown as RenderingContext)
    );

    localStorage.clear();
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  it('should  render the editor component', async () => {
    const { getByTestId } = renderWithI18n(renderESQLEditorComponent({ ...props }));
    expect(getByTestId('ESQLEditor')).toBeInTheDocument();
  });

  it('should not render the query history icon when hideQueryHistory is true', async () => {
    const newProps = {
      ...props,
      editorIsInline: true,
      hideQueryHistory: true,
    };
    const { queryByTestId } = renderWithI18n(renderESQLEditorComponent({ ...newProps }));
    expect(queryByTestId('ESQLEditor-toggle-query-history-icon')).not.toBeInTheDocument();
  });

  it('should support controlling query history visibility', () => {
    const { getByTestId, queryByTestId, rerender } = renderWithI18n(
      renderESQLEditorComponent({ ...props, isHistoryOpen: true })
    );
    expect(getByTestId('ESQLEditor-history-container')).toBeInTheDocument();

    rerender(renderESQLEditorComponent({ ...props, isHistoryOpen: false }));
    expect(queryByTestId('ESQLEditor-history-container')).not.toBeInTheDocument();
  });

  it('should render the correct buttons for the expanded code editor mode', async () => {
    const { queryByTestId } = renderWithI18n(renderESQLEditorComponent({ ...props }));
    const toggleWordWrapButton = queryByTestId('ESQLEditor-toggleWordWrap');
    expect(toggleWordWrapButton).toBeInTheDocument();
  });

  it('should render the resize for the expanded code editor mode', async () => {
    const { queryByTestId } = renderWithI18n(renderESQLEditorComponent({ ...props }));
    expect(queryByTestId('ESQLEditor-resize')).toBeInTheDocument();
  });

  it('should render the footer for the expanded code editor mode', async () => {
    const { queryByTestId } = renderWithI18n(renderESQLEditorComponent({ ...props }));
    expect(queryByTestId('ESQLEditor-footer')).toBeInTheDocument();
  });

  it('should render the doc icon if the displayDocumentationAsFlyout is true', async () => {
    const newProps = {
      ...props,
      displayDocumentationAsFlyout: true,
      editorIsInline: false,
    };
    const { queryByTestId } = renderWithI18n(renderESQLEditorComponent({ ...newProps }));
    expect(queryByTestId('ESQLEditor-documentation')).toBeInTheDocument();
  });

  it('should render correctly if editorIsInline prop is set to true', async () => {
    const newProps = {
      ...props,
      editorIsInline: true,
    };
    const { queryByTestId } = renderWithI18n(renderESQLEditorComponent({ ...newProps }));

    const runQueryButton = queryByTestId('ESQLEditor-run-query-button');
    expect(runQueryButton).toBeInTheDocument(); // Assert it exists
  });

  it('should not render the run query button if the hideRunQueryButton prop is set to true and editorIsInline prop is set to true', async () => {
    const newProps = {
      ...props,
      hideRunQueryButton: true,
      editorIsInline: true,
    };
    const { queryByTestId } = renderWithI18n(renderESQLEditorComponent({ ...newProps }));
    expect(queryByTestId('ESQLEditor-run-query-button')).not.toBeInTheDocument();
  });

  it('should render the visor by default', async () => {
    const { queryByTestId } = renderWithI18n(renderESQLEditorComponent({ ...props }));
    expect(queryByTestId('ESQLEditor-quick-search-visor')).toBeInTheDocument();
  });

  it('should hide the visor by default if the hideQuickSearch prop is set to true', async () => {
    const newProps = {
      ...props,
      hideQuickSearch: true,
    };
    const { queryByTestId } = renderWithI18n(renderESQLEditorComponent({ ...newProps }));
    expect(queryByTestId('ESQLEditor-quick-search-visor')).not.toBeInTheDocument();
  });

  describe('data errors switch', () => {
    test('shown with errors enabled', async () => {
      const newProps = {
        ...props,
        dataErrorsControl: { enabled: true, onChange: jest.fn() },
      };
      mockValidate.mockResolvedValue({
        errors: [
          { message: 'Data error example', severity: 'error', code: 'unknownColumn' },
          { message: 'Data error example', severity: 'error', code: 'unknownIndex' },
        ],
        warnings: [],
      });
      const { queryByTestId, queryAllByText } = renderWithI18n(renderESQLEditorComponent(newProps));
      await waitFor(() => {
        expect(queryByTestId('ESQLEditor-footerPopoverButton-error')).toBeInTheDocument();
      });
      act(() => {
        queryByTestId('ESQLEditor-footerPopoverButton-error')?.click();
      });
      expect(queryByTestId('ESQLEditor-footerPopover-dataErrorsSwitch')).toBeInTheDocument();

      expect(queryAllByText('Data error example')).toHaveLength(2);
    });

    test('shown with errors disabled', async () => {
      const newProps = {
        ...props,
        dataErrorsControl: { enabled: false, onChange: jest.fn() },
      };
      mockValidate.mockResolvedValue({
        errors: [
          { message: 'Data error example', severity: 'error', code: 'unknownColumn' },
          { message: 'Data error example', severity: 'error', code: 'unknownIndex' },
        ],
        warnings: [],
      });
      const { queryByTestId, queryAllByText } = renderWithI18n(renderESQLEditorComponent(newProps));
      await waitFor(() => {
        expect(queryByTestId('ESQLEditor-footerPopoverButton-error')).toBeInTheDocument();
      });
      act(() => {
        queryByTestId('ESQLEditor-footerPopoverButton-error')?.click();
      });
      expect(queryByTestId('ESQLEditor-footerPopover-dataErrorsSwitch')).toBeInTheDocument();

      expect(queryAllByText('Data error example')).toHaveLength(0);
    });

    test('not shown when prop not set', async () => {
      mockValidate.mockResolvedValue({
        errors: [{ message: 'Data error example', severity: 'error' }],
        warnings: [],
      });
      const { queryByTestId } = renderWithI18n(renderESQLEditorComponent(props));
      await waitFor(() => {
        expect(queryByTestId('ESQLEditor-footerPopoverButton-error')).toBeInTheDocument();
      });
      act(() => {
        queryByTestId('ESQLEditor-footerPopoverButton-error')?.click();
      });
      expect(queryByTestId('ESQLEditor-footerPopover-dataErrorsSwitch')).not.toBeInTheDocument();
    });
  });

  it('displays server errors when query is submitted from editors parent', async () => {
    jest.useFakeTimers();

    const executedQuery = 'FROM logs | COMPLETION "prompt" WITH { "inference_id": "bad" }';
    const serverErrorMessage = 'Unknown inference_id [bad]';

    const { rerender } = renderWithI18n(
      renderESQLEditorComponent({
        ...props,
        isLoading: false,
      })
    );

    await waitFor(() => {
      expect(screen.getByTestId('ESQLEditor')).toBeInTheDocument();
    });

    // Simulate query bar Search: parent sets loading true.
    await act(async () => {
      rerender(
        renderESQLEditorComponent({
          ...props,
          query: { esql: executedQuery },
          isLoading: true,
        })
      );
    });

    // Query failed: parent passes server errors and clears loading.
    await act(async () => {
      rerender(
        renderESQLEditorComponent({
          ...props,
          query: { esql: executedQuery },
          isLoading: false,
          errors: [new Error(serverErrorMessage)],
        })
      );
    });

    await act(async () => {
      jest.advanceTimersByTime(VALIDATION_DEBOUNCE_MS);
    });

    await waitFor(() => {
      expect(screen.getByText('1 error')).toBeInTheDocument();
    });

    await act(async () => {
      await userEvent
        .setup({ advanceTimers: jest.advanceTimersByTime })
        .click(screen.getByText('1 error'));
    });

    await waitFor(() => {
      expect(screen.getByText(serverErrorMessage)).toBeInTheDocument();
    });

    jest.useRealTimers();
  });

  it('displays server warnings when query is submitted from editors parent', async () => {
    jest.useFakeTimers();

    const executedQuery = 'FROM logs';
    const serverWarningMessage = 'No limit defined, adding default limit of [1000].';

    const { rerender } = renderWithI18n(
      renderESQLEditorComponent({
        ...props,
        isLoading: false,
      })
    );

    await waitFor(() => {
      expect(screen.getByTestId('ESQLEditor')).toBeInTheDocument();
    });

    // Simulate query bar Search: parent sets loading true.
    await act(async () => {
      rerender(
        renderESQLEditorComponent({
          ...props,
          query: { esql: executedQuery },
          isLoading: true,
        })
      );
    });

    // Query succeeded with warning: parent passes server warning and clears loading.
    await act(async () => {
      rerender(
        renderESQLEditorComponent({
          ...props,
          query: { esql: executedQuery },
          isLoading: false,
          warning: serverWarningMessage,
        })
      );
    });

    await act(async () => {
      jest.advanceTimersByTime(VALIDATION_DEBOUNCE_MS);
    });

    await waitFor(() => {
      expect(screen.getByText('1 warning')).toBeInTheDocument();
    });

    await act(async () => {
      await userEvent
        .setup({ advanceTimers: jest.advanceTimersByTime })
        .click(screen.getByText('1 warning'));
    });

    await waitFor(() => {
      expect(screen.getByText(serverWarningMessage)).toBeInTheDocument();
    });

    jest.useRealTimers();
  });

  it('should render warning if the warning and mergeExternalMessages props are set', async () => {
    const user = userEvent.setup();

    mockValidate.mockResolvedValue({
      errors: [],
      warnings: [],
    });

    renderWithI18n(
      renderESQLEditorComponent({
        ...props,
        warning: 'Client warning example',
        mergeExternalMessages: true,
      })
    );

    await waitFor(() => {
      expect(screen.getByText('1 warning')).toBeInTheDocument();
    });

    await user.click(screen.getByText('1 warning'));

    await waitFor(() => {
      expect(screen.getByText('Client warning example')).toBeInTheDocument();
    });
  });
});
