/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { copyToClipboard } from '@elastic/eui';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import { I18nProvider } from '@kbn/i18n-react';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { TestQueryRow } from './test_query_row';

jest.mock('@elastic/eui', () => {
  const original = jest.requireActual('@elastic/eui');
  return {
    __esModule: true,
    ...original,
    copyToClipboard: jest.fn(() => true),
  };
});

const COPIED_QUERY = 'COPIED QUERY';
const onFetch = () =>
  Promise.resolve({
    testResults: {
      results: [{ group: 'all documents', hits: [], count: 42, sourceFields: {} }],
      truncated: false,
    },
    isGrouped: false,
    timeWindow: '5m',
  });
const onCopyQuery = () => COPIED_QUERY;

describe('TestQueryRow', () => {
  it('should render the copy query button if copyQuery is provided', () => {
    renderWithI18n(
      <TestQueryRow fetch={onFetch} copyQuery={onCopyQuery} hasValidationErrors={false} />
    );
    expect(screen.getByTestId('copyQuery')).toBeInTheDocument();
  });

  it('should not render the copy query button if copyQuery is not provided', () => {
    renderWithI18n(<TestQueryRow fetch={onFetch} hasValidationErrors={false} />);
    expect(screen.queryByTestId('copyQuery')).not.toBeInTheDocument();
  });

  it('should disable the test query and copy query buttons if hasValidationErrors is true', () => {
    renderWithI18n(
      <TestQueryRow fetch={onFetch} copyQuery={onCopyQuery} hasValidationErrors={true} />
    );
    expect(screen.getByTestId('testQuery')).toBeDisabled();
    expect(screen.getByTestId('copyQuery')).toBeDisabled();
  });

  it('should not disable the test query and copy query buttons if hasValidationErrors is false', () => {
    renderWithI18n(
      <TestQueryRow fetch={onFetch} copyQuery={onCopyQuery} hasValidationErrors={false} />
    );
    expect(screen.getByTestId('testQuery')).not.toBeDisabled();
    expect(screen.getByTestId('copyQuery')).not.toBeDisabled();
  });

  it('should call the fetch callback when the test query button is clicked', async () => {
    const localOnFetch = jest.fn(onFetch);
    renderWithI18n(<TestQueryRow fetch={localOnFetch} hasValidationErrors={false} />);
    await userEvent.click(screen.getByTestId('testQuery'));
    expect(localOnFetch).toHaveBeenCalled();
  });

  it('should call the copyQuery callback and pass the returned value to copyToClipboard when the copy query button is clicked', async () => {
    const localOnCopyQuery = jest.fn(onCopyQuery);
    renderWithI18n(
      <TestQueryRow fetch={onFetch} copyQuery={localOnCopyQuery} hasValidationErrors={false} />
    );
    await userEvent.click(screen.getByTestId('copyQuery'));
    expect(localOnCopyQuery).toHaveBeenCalled();
    expect(copyToClipboard).toHaveBeenCalledWith(COPIED_QUERY);
  });

  it('should display an error when copyQuery throws an error', async () => {
    const errorMessage = 'Expected AND, OR, end of input but ":" found.';
    const localOnCopyQuery = jest.fn(() => {
      throw new Error(errorMessage);
    });
    renderWithI18n(
      <TestQueryRow fetch={onFetch} copyQuery={localOnCopyQuery} hasValidationErrors={false} />
    );
    await userEvent.click(screen.getByTestId('copyQuery'));
    expect(localOnCopyQuery).toHaveBeenCalled();
    expect(screen.getByTestId('copyQueryError')).toBeInTheDocument();
    expect(screen.getByTestId('copyQueryError')).toHaveTextContent(errorMessage);
  });

  it('should clear copyQuery error when clicking copy query again', async () => {
    const errorMessage = 'Expected AND, OR, end of input but ":" found.';
    let shouldThrow = true;
    const localOnCopyQuery = jest.fn(() => {
      if (shouldThrow) {
        throw new Error(errorMessage);
      }
      return COPIED_QUERY;
    });
    renderWithI18n(
      <TestQueryRow fetch={onFetch} copyQuery={localOnCopyQuery} hasValidationErrors={false} />
    );

    await userEvent.click(screen.getByTestId('copyQuery'));
    expect(screen.getByTestId('copyQueryError')).toBeInTheDocument();

    shouldThrow = false;
    await userEvent.click(screen.getByTestId('copyQuery'));
    expect(screen.queryByTestId('copyQueryError')).not.toBeInTheDocument();
  });

  it('should clear copyQuery error when clicking test query', async () => {
    const errorMessage = 'Expected AND, OR, end of input but ":" found.';
    const localOnCopyQuery = jest.fn(() => {
      throw new Error(errorMessage);
    });
    renderWithI18n(
      <TestQueryRow fetch={onFetch} copyQuery={localOnCopyQuery} hasValidationErrors={false} />
    );

    await userEvent.click(screen.getByTestId('copyQuery'));
    expect(screen.getByTestId('copyQueryError')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('testQuery'));
    expect(screen.queryByTestId('copyQueryError')).not.toBeInTheDocument();
  });

  it('should clear testQuery error when clicking copy query', async () => {
    const localOnFetch = jest.fn(() => Promise.reject(new Error('Test query failed')));
    renderWithI18n(
      <TestQueryRow fetch={localOnFetch} copyQuery={onCopyQuery} hasValidationErrors={false} />
    );

    await userEvent.click(screen.getByTestId('testQuery'));
    await screen.findByTestId('testQueryError');

    await userEvent.click(screen.getByTestId('copyQuery'));
    expect(screen.queryByTestId('testQueryError')).not.toBeInTheDocument();
  });

  it('should clear copyQuery error when fetch prop changes', async () => {
    const errorMessage = 'Expected AND, OR, end of input but ":" found.';
    const localOnCopyQuery = jest.fn(() => {
      throw new Error(errorMessage);
    });
    const { rerender } = renderWithI18n(
      <TestQueryRow fetch={onFetch} copyQuery={localOnCopyQuery} hasValidationErrors={false} />
    );

    await userEvent.click(screen.getByTestId('copyQuery'));
    expect(screen.getByTestId('copyQueryError')).toBeInTheDocument();

    const newFetch = () =>
      Promise.resolve({
        testResults: {
          results: [{ group: 'all documents', hits: [], count: 10, sourceFields: {} }],
          truncated: false,
        },
        isGrouped: false,
        timeWindow: '10m',
      });

    rerender(
      <I18nProvider>
        <TestQueryRow fetch={newFetch} copyQuery={localOnCopyQuery} hasValidationErrors={false} />
      </I18nProvider>
    );
    expect(screen.queryByTestId('copyQueryError')).not.toBeInTheDocument();
  });
});
