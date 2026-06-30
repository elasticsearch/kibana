/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { StatsRow, type StatItem } from './stats_row';

const stats: StatItem[] = [
  { title: '42', description: 'Total firings', dataTestSubj: 'statTotal' },
  { title: '3.5', description: 'Average per hour', dataTestSubj: 'statAverage' },
  { title: '12m ago', description: 'Last firing', dataTestSubj: 'statLast' },
];

describe('StatsRow', () => {
  it('renders each stat with its value and description', () => {
    render(<StatsRow stats={stats} data-test-subj="signalStatsRow" />);

    expect(screen.getByTestId('signalStatsRow')).toBeInTheDocument();
    expect(screen.getByTestId('statTotal')).toHaveTextContent('42');
    expect(screen.getByTestId('statTotal')).toHaveTextContent('Total firings');
    expect(screen.getByTestId('statAverage')).toHaveTextContent('3.5');
    expect(screen.getByTestId('statLast')).toHaveTextContent('12m ago');
  });

  it('renders nothing in the row when given an empty list', () => {
    render(<StatsRow stats={[]} data-test-subj="emptyRow" />);
    expect(screen.getByTestId('emptyRow')).toBeEmptyDOMElement();
  });
});
