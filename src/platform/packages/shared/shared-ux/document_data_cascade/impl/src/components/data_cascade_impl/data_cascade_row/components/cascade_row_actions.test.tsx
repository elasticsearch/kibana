/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ComponentProps } from 'react';
import React from 'react';
import { EuiThemeProvider } from '@elastic/eui';
import { render, screen, fireEvent } from '@testing-library/react';
import { CascadeRowActions } from './cascade_row_actions';

const defaultHeaderRowActions = [
  {
    label: 'Action 1',
    iconType: 'pencil',
    onClick: jest.fn(),
  },
  {
    label: 'Action 2',
    iconType: 'trash',
    onClick: jest.fn(),
  },
  {
    label: 'Action 3',
    iconType: 'eye',
    onClick: jest.fn(),
  },
  {
    label: 'Action 4',
    iconType: 'inspect',
    onClick: jest.fn(),
  },
];

const renderComponent = ({
  isMobile = false,
  headerRowActions = defaultHeaderRowActions,
}: Partial<
  Pick<ComponentProps<typeof CascadeRowActions>, 'isMobile' | 'headerRowActions'>
> = {}) => {
  render(
    <EuiThemeProvider>
      <CascadeRowActions isMobile={isMobile} headerRowActions={headerRowActions} />
    </EuiThemeProvider>
  );
};

describe('CascadeRowActions', () => {
  describe('when isMobile is true', () => {
    it('will render the select more options button when the configured actions are more than 1', () => {
      renderComponent({ isMobile: true });
      expect(screen.queryByText('Action 1')).not.toBeInTheDocument();
      expect(screen.queryByText('Action 2')).not.toBeInTheDocument();
      expect(screen.queryByText('Action 3')).not.toBeInTheDocument();
      expect(screen.queryByText('Action 4')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Select more options')).toBeInTheDocument();
    });

    it('will render the configured action when there is just 1 action', () => {
      renderComponent({
        isMobile: true,
        headerRowActions: defaultHeaderRowActions.slice(0, 1),
      });
      expect(screen.getByText('Action 1')).toBeInTheDocument();
    });
  });

  describe('when isMobile is false', () => {
    it('will only render the first two actions by default', () => {
      renderComponent();

      // Check that the first two actions are visible
      expect(screen.getByText('Action 1')).toBeInTheDocument();
      expect(screen.getByText('Action 2')).toBeInTheDocument();
      expect(screen.getByText('Action 3')).toBeInTheDocument();
      expect(screen.queryByText('Action 4')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Select more options')).toBeInTheDocument();
    });

    it('clicking the select more options button reveals additional actions', () => {
      renderComponent();

      // Click the "Select more options" button
      fireEvent.click(screen.getByLabelText('Select more options'));

      // Check that the third action is now visible
      expect(screen.getByText('Action 4')).toBeInTheDocument();
    });
  });
});
