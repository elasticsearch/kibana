/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import type { FC } from 'react';
import { KbnCallout } from '../components/base/base_callout';
import type { KbnInfoCalloutProps } from '../components/info_callout';
import { KbnInfoCallout } from '../components/info_callout';
import { KbnDangerCallout } from '../components/danger_callout';
import { KbnSuccessCallout } from '../components/success_callout';
import { KbnWarningCallout } from '../components/warning_callout';

describe('Kbn*Callout', () => {
  it('renders the title and content', () => {
    render(<KbnInfoCallout title="Heads up" content="Message body" />);
    expect(screen.getByText('Heads up')).toBeInTheDocument();
    expect(screen.getByText('Message body')).toBeInTheDocument();
  });

  it('renders rich content nodes', () => {
    render(<KbnInfoCallout title="Heads up" content={<span>Rich content</span>} />);
    expect(screen.getByText('Rich content')).toBeInTheDocument();
  });

  it('reflects the requested size on the root element', () => {
    render(<KbnInfoCallout title="t" content="b" size="s" data-test-subj="cb" />);
    expect(screen.getByTestId('cb')).toHaveAttribute('data-size', 's');
  });

  it.each([
    ['KbnInfoCallout', KbnInfoCallout],
    ['KbnSuccessCallout', KbnSuccessCallout],
    ['KbnWarningCallout', KbnWarningCallout],
    ['KbnDangerCallout', KbnDangerCallout],
  ] as const)(
    '%s sets a distinct variant stripe color',
    (_name, Component: FC<KbnInfoCalloutProps>) => {
      const { getByTestId } = render(<Component title="t" content="b" data-test-subj="cb" />);
      expect(getByTestId('cb').style.getPropertyValue('--kbnCalloutTypeColor')).not.toBe('');
    }
  );

  it('renders the dismiss button only when onDismiss is provided', () => {
    const onDismiss = jest.fn();
    const { rerender } = render(<KbnDangerCallout title="t" content="b" />);
    expect(screen.queryByTestId('kbnCalloutDismissButton')).not.toBeInTheDocument();

    rerender(<KbnDangerCallout title="t" content="b" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId('kbnCalloutDismissButton'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders both actions and fires their handlers', () => {
    const onPrimary = jest.fn();
    const onSecondary = jest.fn();
    render(
      <KbnInfoCallout
        title="t"
        content="b"
        actions={{
          primary: { label: 'Confirm', onClick: onPrimary, 'data-test-subj': 'primary' },
          secondary: { label: 'Cancel', onClick: onSecondary, 'data-test-subj': 'secondary' },
        }}
      />
    );
    fireEvent.click(screen.getByTestId('primary'));
    fireEvent.click(screen.getByTestId('secondary'));
    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it('renders a primary action as a link when given an href', () => {
    render(
      <KbnInfoCallout
        title="t"
        content="b"
        actions={{ primary: { label: 'Docs', href: '/docs', 'data-test-subj': 'primary' } }}
      />
    );
    expect(screen.getByTestId('primary').closest('a')).toHaveAttribute('href', '/docs');
  });

  it('renders a custom icon when iconType is provided to the base KbnCallout', () => {
    const { container } = render(
      <KbnCallout title="t" content="b" color="primary" iconType="bell" />
    );
    expect(container.querySelector('[data-euiicon-type="bell"]')).toBeInTheDocument();
  });
});
