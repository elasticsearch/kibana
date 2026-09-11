/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MonitorTypeBadge } from './monitor_type_badge';

describe('MonitorTypeBadge', () => {
  it('renders the visible badge title for a browser monitor', () => {
    render(<MonitorTypeBadge monitorType="browser" />);
    expect(screen.getByText('Browser')).toBeInTheDocument();
  });

  it('keeps the visible text as the accessible name when not clickable', () => {
    render(<MonitorTypeBadge monitorType="browser" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Browser')).toBeInTheDocument();
  });

  it('announces the visible badge text before the filter instructions', () => {
    render(<MonitorTypeBadge monitorType="browser" onClick={jest.fn()} />);

    expect(
      screen.getByRole('button', {
        name: 'Browser. Click to filter monitors for this type',
      })
    ).toBeInTheDocument();
  });

  it('announces the visible badge text for non-browser monitors', () => {
    render(<MonitorTypeBadge monitorType="http" onClick={jest.fn()} />);

    expect(
      screen.getByRole('button', {
        name: 'HTTP. Click to filter monitors for this type',
      })
    ).toBeInTheDocument();
  });

  it('calls onClick when the badge is activated', async () => {
    const onClick = jest.fn();
    render(<MonitorTypeBadge monitorType="browser" onClick={onClick} />);

    await userEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
