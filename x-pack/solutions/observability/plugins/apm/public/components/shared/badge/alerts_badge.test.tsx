/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { AlertsBadge } from './alerts_badge';

function renderBadge(props: React.ComponentProps<typeof AlertsBadge>) {
  return render(
    <IntlProvider locale="en">
      <AlertsBadge {...props} />
    </IntlProvider>
  );
}

describe('AlertsBadge', () => {
  it('renders the count', () => {
    renderBadge({ count: 4, serviceName: 'svc' });
    expect(screen.getByTestId('apmAlertsBadge')).toHaveTextContent('4');
  });

  it('uses a custom data-test-subj when provided', () => {
    renderBadge({ count: 1, serviceName: 'svc', 'data-test-subj': 'customBadge' });
    expect(screen.getByTestId('customBadge')).toBeInTheDocument();
  });

  it('renders an interactive button that fires onClick', () => {
    const onClick = jest.fn();
    renderBadge({ count: 2, serviceName: 'svc', onClick });

    const badge = screen.getByTestId('apmAlertsBadge');
    expect(badge.tagName.toLowerCase()).toBe('button');

    fireEvent.click(badge);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a focusable, non-interactive badge when no onClick is provided', () => {
    renderBadge({ count: 2, serviceName: 'svc' });

    const badge = screen.getByTestId('apmAlertsBadge');
    expect(badge.tagName.toLowerCase()).not.toBe('button');
    // Tooltip anchor wrapper must be focusable for accessibility.
    expect(badge.closest('span[tabindex="0"]')).not.toBeNull();
  });

  it('does not wrap in a focusable tooltip anchor when hideTooltip is set', () => {
    renderBadge({ count: 5, serviceName: 'svc', hideTooltip: true });

    const badge = screen.getByTestId('apmAlertsBadge');
    expect(badge.closest('span[tabindex="0"]')).toBeNull();
  });

  it('sets data-ebt-* attributes when ebt is provided with onClick', () => {
    renderBadge({
      count: 1,
      serviceName: 'svc',
      onClick: jest.fn(),
      ebt: { action: 'viewAlerts', element: 'serviceFlyoutAlertsBadge' },
    });

    const badge = screen.getByTestId('apmAlertsBadge');
    expect(badge).toHaveAttribute('data-ebt-action', 'viewAlerts');
    expect(badge).toHaveAttribute('data-ebt-element', 'serviceFlyoutAlertsBadge');
  });

  it('does not set data-ebt-* attributes when ebt is provided without onClick', () => {
    renderBadge({
      count: 1,
      serviceName: 'svc',
      ebt: { action: 'viewAlerts', element: 'serviceFlyoutAlertsBadge' },
    });

    const badge = screen.getByTestId('apmAlertsBadge');
    expect(badge).not.toHaveAttribute('data-ebt-action');
  });
});
