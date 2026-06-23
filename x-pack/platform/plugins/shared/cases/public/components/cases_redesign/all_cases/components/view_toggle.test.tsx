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
import { ViewToggle } from './view_toggle';
import { VIEW_TOGGLE_LIST_ID, VIEW_TOGGLE_TABLE_ID } from '../constants';

describe('ViewToggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders list and table toggle buttons', () => {
    renderWithTestingProviders(
      <ViewToggle idSelected={VIEW_TOGGLE_LIST_ID} onChange={jest.fn()} />
    );

    expect(screen.getByRole('group', { name: /view toggle/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('highlights the selected option', () => {
    renderWithTestingProviders(
      <ViewToggle idSelected={VIEW_TOGGLE_TABLE_ID} onChange={jest.fn()} />
    );

    expect(screen.getByRole('button', { name: /table view/i, pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /list view/i, pressed: false })).toBeInTheDocument();
  });

  it('calls onChange with the clicked option id', async () => {
    const onChange = jest.fn();

    renderWithTestingProviders(<ViewToggle idSelected={VIEW_TOGGLE_LIST_ID} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /table view/i }));

    expect(onChange).toHaveBeenCalledWith(VIEW_TOGGLE_TABLE_ID);
  });

  it('calls onChange when switching from table to list', async () => {
    const onChange = jest.fn();

    renderWithTestingProviders(
      <ViewToggle idSelected={VIEW_TOGGLE_TABLE_ID} onChange={onChange} />
    );

    await userEvent.click(screen.getByRole('button', { name: /list view/i }));

    expect(onChange).toHaveBeenCalledWith(VIEW_TOGGLE_LIST_ID);
  });
});
