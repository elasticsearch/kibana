/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import {
  ComposeDiscoverTabs,
  isAlertTabDisabled,
  resolveActiveQueryTab,
} from './compose_discover_tabs';

jest.mock('@kbn/code-editor', () => {
  const ReactActual = jest.requireActual('react');

  return {
    ESQL_LANG_ID: 'esql',
    CodeEditor: ({
      value,
      languageId,
      editorDidMount,
    }: {
      value: string;
      languageId: string;
      editorDidMount?: (editor: unknown) => void;
    }) => {
      ReactActual.useEffect(() => {
        editorDidMount?.({ getModel: () => ({ id: value }) });
      }, [editorDidMount, value]);

      return (
        <pre data-language-id={languageId} data-test-subj="codeEditorMock">
          {value}
        </pre>
      );
    },
  };
});

describe('ComposeDiscoverTabs', () => {
  const baseQuery = 'FROM logs-*\n| STATS count = COUNT(*) BY host.name';
  const alertBlock = '| WHERE count > 100';
  const recoveryBlock = '| WHERE count < 100';
  const defaultProps = {
    baseQuery,
    alertBlock,
    recoveryBlock,
    onBaseQueryChange: jest.fn(),
    onAlertBlockChange: jest.fn(),
    onRecoveryBlockChange: jest.fn(),
    onTabChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('mounts the recovery query editor with the recovery completion handler', async () => {
    const onAlertEditorMount = jest.fn();
    const onRecoveryEditorMount = jest.fn();

    render(
      <ComposeDiscoverTabs
        {...defaultProps}
        activeTab="recovery"
        tabs={['recovery']}
        onAlertEditorMount={onAlertEditorMount}
        onRecoveryEditorMount={onRecoveryEditorMount}
      />
    );

    await waitFor(() => {
      expect(onRecoveryEditorMount).toHaveBeenCalledTimes(1);
    });
    expect(onAlertEditorMount).not.toHaveBeenCalled();
  });

  it('uses the ES|QL language for base and split block editors', () => {
    render(
      <ComposeDiscoverTabs
        {...defaultProps}
        activeTab="alert"
        tabs={['base', 'alert']}
        onAlertEditorMount={jest.fn()}
        onRecoveryEditorMount={jest.fn()}
      />
    );

    expect(screen.getAllByTestId('codeEditorMock')).toHaveLength(2);
    expect(screen.getAllByTestId('codeEditorMock')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dataset: expect.objectContaining({ languageId: 'esql' }) }),
      ])
    );
  });

  it('disables the alert tab when the base query is empty', () => {
    render(
      <I18nProvider>
        <ComposeDiscoverTabs
          {...defaultProps}
          baseQuery=""
          activeTab="base"
          tabs={['base', 'alert']}
        />
      </I18nProvider>
    );

    expect(screen.getByTestId('composeDiscoverTab-alert')).toBeDisabled();
    expect(screen.getByTestId('composeDiscoverTab-base')).not.toBeDisabled();
  });

  it('enables the alert tab when the base query is populated', () => {
    render(
      <I18nProvider>
        <ComposeDiscoverTabs {...defaultProps} activeTab="base" tabs={['base', 'alert']} />
      </I18nProvider>
    );

    expect(screen.getByTestId('composeDiscoverTab-alert')).not.toBeDisabled();
  });

  it('does not select the alert tab when it is disabled', () => {
    const onTabChange = jest.fn();

    render(
      <I18nProvider>
        <ComposeDiscoverTabs
          {...defaultProps}
          baseQuery=""
          activeTab="base"
          tabs={['base', 'alert']}
          onTabChange={onTabChange}
        />
      </I18nProvider>
    );

    screen.getByTestId('composeDiscoverTab-alert').click();

    expect(onTabChange).not.toHaveBeenCalledWith('alert');
  });

  it('switches to the base tab when alert is active without a base query', async () => {
    const onTabChange = jest.fn();

    render(
      <I18nProvider>
        <ComposeDiscoverTabs
          {...defaultProps}
          baseQuery=""
          activeTab="alert"
          tabs={['base', 'alert']}
          onTabChange={onTabChange}
        />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(onTabChange).toHaveBeenCalledWith('base');
    });
  });
});

describe('isAlertTabDisabled', () => {
  it('returns true when alert tab is shown and base query is empty', () => {
    expect(isAlertTabDisabled(['base', 'alert'], '')).toBe(true);
    expect(isAlertTabDisabled(['base', 'alert'], '   ')).toBe(true);
  });

  it('returns false when base query is populated or alert tab is absent', () => {
    expect(isAlertTabDisabled(['base', 'alert'], 'FROM logs-*')).toBe(false);
    expect(isAlertTabDisabled(['recovery'], '')).toBe(false);
  });

  it('allows the alert tab for standalone queries with breach content', () => {
    expect(
      isAlertTabDisabled(['base', 'alert'], {
        format: 'standalone',
        breach: { query: 'FROM kbn*' },
      })
    ).toBe(false);
  });
});

describe('resolveActiveQueryTab', () => {
  it('returns base when alert is active but disabled', () => {
    expect(resolveActiveQueryTab(['base', 'alert'], 'alert', '')).toBe('base');
  });

  it('preserves alert when base query exists', () => {
    expect(resolveActiveQueryTab(['base', 'alert'], 'alert', 'FROM logs-*')).toBe('alert');
  });
});
