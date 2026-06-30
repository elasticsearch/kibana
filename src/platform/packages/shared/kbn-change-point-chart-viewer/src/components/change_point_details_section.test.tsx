/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChangePointDetailsSection } from './change_point_details_section';
import type { ChangePointCardModel } from '../utils/derive_change_point_cards';
import type { UnifiedHistogramServices } from '@kbn/unified-histogram/types';

const fieldFormats = {
  getDefaultInstance: () => ({
    convertToText: (value: number) => new Date(value).toLocaleString(),
  }),
} as unknown as UnifiedHistogramServices['fieldFormats'];

const card: ChangePointCardModel = {
  id: 'card-1',
  title: 'GN',
  lineEsql: 'FROM idx',
  byColumns: undefined,
  annotationEvents: [
    { name: 'dip', datetime: '2026-05-19T06:00:00.000Z' },
    { name: 'spike', datetime: '2026-05-20T06:00:00.000Z' },
  ],
  minPvalue: 0.001,
  changePointTypes: ['dip', 'spike'],
  typeColumnId: 'type',
  pvalueColumnId: 'pvalue',
  entityValues: { 'geo.dest': 'GN' },
  entityDescription: 'geo.dest: GN',
};

describe('ChangePointDetailsSection', () => {
  it('renders time, type, and description from the selected row', () => {
    render(
      <ChangePointDetailsSection
        card={card}
        row={{
          avg_bytes: 17563,
          'geo.dest': 'GN',
          day: '2026-05-20T00:00:00.000-06:00',
          type: 'spike',
          pvalue: 0.0009927188290498323,
        }}
        seriesColumns={{ valueColumn: 'avg_bytes', timeColumn: 'day' }}
        fieldFormats={fieldFormats}
      />
    );

    expect(
      screen.getByText(new Date('2026-05-20T00:00:00.000-06:00').toLocaleString())
    ).toBeInTheDocument();
    expect(screen.getByText('Spike')).toBeInTheDocument();
    expect(
      screen.getByText(
        'A spike with moderate statistical significance occurs at this change point.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('Dip, Spike')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'A dip with moderate statistical significance occurs at this change point.'
      )
    ).not.toBeInTheDocument();
  });
});
