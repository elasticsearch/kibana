/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShowMoreActivities } from './show_more_activities';

const onClickMock = jest.fn();

describe('ShowMoreActivities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with count', () => {
    render(<ShowMoreActivities count={5} onClick={onClickMock} />);

    expect(screen.getByTestId('cases-show-more-user-actions')).toBeInTheDocument();
    expect(screen.getByText('5 more activities')).toBeInTheDocument();
  });

  it('renders singular form for count of 1', () => {
    render(<ShowMoreActivities count={1} onClick={onClickMock} />);

    expect(screen.getByText('1 more activity')).toBeInTheDocument();
  });

  it('is disabled when isLoading is true', () => {
    render(<ShowMoreActivities count={5} onClick={onClickMock} isLoading={true} />);

    expect(screen.getByTestId('cases-show-more-user-actions')).toBeDisabled();
  });

  it('calls onClick on click', async () => {
    render(<ShowMoreActivities count={5} onClick={onClickMock} />);

    await userEvent.click(screen.getByTestId('cases-show-more-user-actions'));
    expect(onClickMock).toHaveBeenCalled();
  });
});
