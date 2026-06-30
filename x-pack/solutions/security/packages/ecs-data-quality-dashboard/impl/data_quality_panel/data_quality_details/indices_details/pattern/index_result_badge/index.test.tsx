/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { IndexResultBadge } from '.';

describe('IndexResultBadge', () => {
  it('should render the index result badge', () => {
    render(<IndexResultBadge incompatible={0} />);

    expect(screen.getByTestId('indexResultBadge')).toHaveTextContent('Pass');
  });

  describe('when incompatible is > 0', () => {
    it('should render the index result badge with `Fail` content', () => {
      render(<IndexResultBadge incompatible={1} />);

      expect(screen.getByTestId('indexResultBadge')).toHaveTextContent('Fail');
    });
  });

  describe('when tooltipText is given', () => {
    it('should render the index result badge with the given tooltip text', async () => {
      render(<IndexResultBadge incompatible={0} tooltipText="Tooltip text" />);

      await userEvent.hover(screen.getByTestId('indexResultBadge'));

      await waitFor(() =>
        expect(screen.getByText('Tooltip text').closest('[role="tooltip"]')).toBeInTheDocument()
      );
    });
  });
});
