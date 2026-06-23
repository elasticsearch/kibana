/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithTestingProviders } from '../../../../common/mock';
import { SortFilter } from './sort_filter';

describe('SortFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a select with newest first and oldest first options', () => {
    renderWithTestingProviders(<SortFilter sortOrder="desc" onChange={jest.fn()} />);

    const select = screen.getByTestId('cases-list-sort-select');
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('desc');
  });

  it('displays "Newest first" when sortOrder is desc', () => {
    renderWithTestingProviders(<SortFilter sortOrder="desc" onChange={jest.fn()} />);

    const select = screen.getByTestId('cases-list-sort-select');
    expect(select).toHaveValue('desc');
  });

  it('displays "Oldest first" when sortOrder is asc', () => {
    renderWithTestingProviders(<SortFilter sortOrder="asc" onChange={jest.fn()} />);

    const select = screen.getByTestId('cases-list-sort-select');
    expect(select).toHaveValue('asc');
  });

  it('calls onChange with "asc" when selecting oldest first', async () => {
    const onChange = jest.fn();
    renderWithTestingProviders(<SortFilter sortOrder="desc" onChange={onChange} />);

    await userEvent.selectOptions(screen.getByTestId('cases-list-sort-select'), 'asc');

    expect(onChange).toHaveBeenCalledWith('asc');
  });

  it('calls onChange with "desc" when selecting newest first', async () => {
    const onChange = jest.fn();
    renderWithTestingProviders(<SortFilter sortOrder="asc" onChange={onChange} />);

    await userEvent.selectOptions(screen.getByTestId('cases-list-sort-select'), 'desc');

    expect(onChange).toHaveBeenCalledWith('desc');
  });
});
