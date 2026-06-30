/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import type { ESQLColumn } from '@kbn/es-types';
import { ESQLValuesPreview } from './esql_values_preview';

const noopProps = {
  updateQuery: jest.fn(),
  isQueryRunning: false,
  queryNeedsRunning: false,
  dataSource: 'index',
};

const numericColumn: ESQLColumn = { name: 'bytes', type: 'long' };
const stringColumn: ESQLColumn = { name: 'os', type: 'keyword' };

describe('ESQLValuesPreview', () => {
  it('renders min/max stats for numeric columns', () => {
    const { getByText, getByTestId } = render(
      <I18nProvider>
        <ESQLValuesPreview
          {...noopProps}
          previewOptions={[6, 7, 67]}
          previewColumns={[numericColumn]}
        />
      </I18nProvider>
    );

    expect(getByTestId('esqlValuesPreviewRange')).toBeInTheDocument();
    expect(getByText('6')).toBeInTheDocument();
    expect(getByText('67')).toBeInTheDocument();
  });
  it('renders a list of values for string columns', () => {
    const { getByTestId } = render(
      <I18nProvider>
        <ESQLValuesPreview
          {...noopProps}
          previewOptions={[
            'some',
            'BODY',
            'once',
            'told me',
            'the',
            'world',
            'is',
            'gonna',
            'roll me',
            'i aint',
            'the sharpest tool',
            'in the shed',
            'she was lookin',
            'kinda dumb',
            'with her finger',
            'and her thumb',
            'in the SHAPE',
            'of. an. L.',
            'on her fore',
            'head',
          ]}
          previewColumns={[stringColumn]}
        />
      </I18nProvider>
    );

    expect(getByTestId('esqlValuesPreviewStrings')).toBeInTheDocument();
  });

  it('shows the column picker when the query returns multiple columns', () => {
    const { getByText, getByTestId } = render(
      <I18nProvider>
        <ESQLValuesPreview
          {...noopProps}
          previewOptions={[]}
          previewColumns={[numericColumn, stringColumn]}
        />
      </I18nProvider>
    );

    expect(getByText('Query must return a single column')).toBeInTheDocument();
    expect(getByTestId('chooseColumnBtn')).toBeInTheDocument();
  });
});
