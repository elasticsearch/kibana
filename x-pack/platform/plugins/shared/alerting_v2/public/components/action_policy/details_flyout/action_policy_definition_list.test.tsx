/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { ActionPolicyDefinitionList } from './action_policy_definition_list';
import type { ActionPolicyDefinitionListProps } from './action_policy_definition_list';
import userEvent from '@testing-library/user-event';

const renderWithI18n = (props: ActionPolicyDefinitionListProps) =>
  render(
    <I18nProvider>
      <ActionPolicyDefinitionList {...props} />
    </I18nProvider>
  );

jest.mock('@kbn/core-di-browser', () => ({
  CoreStart: (key: string) => key,
  useService: (token: unknown) => {
    if (token === 'http') {
      return { basePath: { prepend: (path: string) => `/base${path}` } };
    }
    return {};
  },
}));

jest.mock('../badge_list', () => ({
  BadgeList: ({ items }: { items: string[] }) => (
    <span data-test-subj="mockBadgeList">{items.join(', ')}</span>
  ),
}));

jest.mock('./destination_row', () => ({
  DestinationRow: ({ destination }: { destination: { type: string; id: string } }) => (
    <span data-test-subj="mockDestinationRow">{destination.id}</span>
  ),
}));

jest.mock('../labels', () => ({
  getGroupingModeLabel: (mode: string | undefined) => mode ?? 'Not configured',
  getThrottleStrategyLabel: (strategy: string | undefined) => strategy ?? 'Not configured',
}));

const defaultProps: ActionPolicyDefinitionListProps = {
  policy: {
    description: 'A test description',
    tags: ['tag-a', 'tag-b'],
    matcher: 'rule.id: "abc"',
    groupingMode: 'per_episode',
    destinations: [
      { type: 'workflow', id: 'wf-1' },
      { type: 'workflow', id: 'wf-2' },
    ],
    throttle: { strategy: 'on_status_change', interval: '5m' },
  },
};

describe('ActionPolicyDefinitionList', () => {
  it('renders all definition fields', () => {
    renderWithI18n(defaultProps);

    expect(screen.getByText('Description')).toBeDefined();
    expect(screen.getByText('A test description')).toBeDefined();
    expect(screen.getByText('Tags')).toBeDefined();
    expect(screen.getByText('tag-a')).toBeDefined();
    expect(screen.getByText('Matcher')).toBeDefined();
    expect(screen.getByText('Dispatch per')).toBeDefined();
    expect(screen.getByText('Frequency')).toBeDefined();
    expect(screen.getByText('Destinations')).toBeDefined();
    expect(screen.getAllByTestId('mockDestinationRow')).toHaveLength(2);
  });

  it('renders a expandable list of tags when there are more than one', () => {
    renderWithI18n(defaultProps);

    expect(screen.getByText('tag-a')).toBeDefined();
    expect(screen.getByText('+1')).toBeDefined();
  });

  it('opens the tags popover when the "+N" button is clicked', async () => {
    const user = userEvent.setup();

    renderWithI18n(defaultProps);

    await user.click(screen.getByText('+1'));

    expect(screen.getByText('tag-b')).toBeInTheDocument();
  });

  it('renders empty values when fields are missing', () => {
    renderWithI18n({ policy: {} });

    expect(screen.getByText('Description')).toBeDefined();
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Matches all alerts.')).toBeDefined();
  });

  it('renders Group by when groupingMode is per_field', () => {
    renderWithI18n({
      policy: {
        ...defaultProps.policy,
        groupingMode: 'per_field',
        groupBy: ['host.name', 'service.name'],
      },
    });

    expect(screen.getByText('Group by')).toBeDefined();
    expect(screen.getByText('host.name, service.name')).toBeDefined();
  });

  it('does not render Group by when groupingMode is not per_field', () => {
    renderWithI18n({ policy: { ...defaultProps.policy, groupingMode: 'per_episode' } });

    expect(screen.queryByText('Group by')).toBeNull();
  });

  it('renders destination rows', () => {
    renderWithI18n(defaultProps);

    expect(screen.getAllByTestId('mockDestinationRow')).toHaveLength(2);
  });

  it('renders frequency interval when present', () => {
    renderWithI18n(defaultProps);

    expect(screen.getByText(/Every 5m/)).toBeDefined();
  });
});
