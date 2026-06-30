/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RuleChangesHistory } from './changes_history';
import { useInfiniteChangeHistory } from '../../../rule_management/api/hooks/use_infinite_change_history';
import type { RuleHistoryItem } from '../../../../../common/api/detection_engine/rule_management';
import { TestProviders } from '../../../../common/mock';
import type { RuleResponse } from '../../../../../common/api/detection_engine/model/rule_schema';

// IntersectionObserver is used by the rule changes history timeline's scroll-to-load-more sentinel but is absent in jsdom.
class MockIntersectionObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
});

jest.mock('../../../rule_management/api/hooks/use_infinite_change_history');

const mockUseInfiniteChangeHistory = useInfiniteChangeHistory as jest.Mock;

describe('RuleChangesHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('selects the first active item of the new rule when ruleId changes', async () => {
    mockUseInfiniteChangeHistory.mockImplementation(({ ruleId }: { ruleId: string }) =>
      mockUseInfiniteQueryResult([
        ruleId === 'rule-1' ? MOCK_RULE_1_HISTORY_ITEM : MOCK_RULE_2_HISTORY_ITEM,
      ])
    );

    const { rerender } = render(
      <TestProviders>
        <RuleChangesHistory ruleId="rule-1" header={<span />} />
      </TestProviders>
    );

    // The timeline auto-selects the first diffable item for rule-1.
    await waitFor(() => {
      expect(screen.getByTestId('ruleChangesHistoryDiff')).toBeInTheDocument();
    });

    // Navigate to a different rule.
    rerender(
      <TestProviders>
        <RuleChangesHistory ruleId="rule-2" header={<span />} />
      </TestProviders>
    );

    // The timeline auto-selects the first diffable item for rule-2.
    await waitFor(() => {
      expect(screen.getByTestId('ruleChangesHistoryDiff')).toBeInTheDocument();
    });
  });

  it('does not auto-advance when a new change appears at the top after the initial selection', async () => {
    const createItem = createHistoryItem({
      id: 'create-1',
      action: 'rule_create',
      rule: { name: 'AlphaRule' } as RuleResponse,
    });
    mockUseInfiniteChangeHistory.mockReturnValue(mockUseInfiniteQueryResult([createItem]));

    const { rerender } = render(
      <TestProviders>
        <RuleChangesHistory ruleId="rule-1" header={<span />} />
      </TestProviders>
    );

    // The only item is auto-selected on mount.
    await waitFor(() => {
      expect(screen.getByTestId('ruleChangesHistoryDiff')).toHaveTextContent('AlphaRule');
    });

    // A new change is recorded and becomes the newest item.
    const updateItem = createHistoryItem({
      id: 'update-1',
      action: 'rule_update',
      rule: { name: 'BetaRule', revision: 1, rule_source: { type: 'internal' } } as RuleResponse,
      old_values: { name: 'AlphaRule' },
    });
    mockUseInfiniteChangeHistory.mockReturnValue(
      mockUseInfiniteQueryResult([updateItem, createItem])
    );
    rerender(
      <TestProviders>
        <RuleChangesHistory ruleId="rule-1" header={<span />} />
      </TestProviders>
    );

    // The selection stays on the initial item — no auto-advance for new changes.
    await waitFor(() => {
      expect(screen.getByTestId('ruleChangesHistoryDiff')).toHaveTextContent('AlphaRule');
    });
  });

  it('preserves a manually selected item when a new change appears', async () => {
    const oldItem = createHistoryItem({
      id: 'create-old',
      action: 'rule_create',
      rule: { name: 'OldRule' } as RuleResponse,
    });
    const newestItem = createHistoryItem({
      id: 'update-newest',
      action: 'rule_update',
      rule: { name: 'NewestRule', revision: 1, rule_source: { type: 'internal' } } as RuleResponse,
      old_values: { name: 'OldRule' },
    });
    mockUseInfiniteChangeHistory.mockReturnValue(mockUseInfiniteQueryResult([newestItem, oldItem]));

    const { rerender } = render(
      <TestProviders>
        <RuleChangesHistory ruleId="rule-1" header={<span />} />
      </TestProviders>
    );

    // The newest item is auto-selected on mount.
    await waitFor(() => {
      expect(screen.getByTestId('ruleChangesHistoryDiff')).toHaveTextContent('NewestRule');
    });

    // The user manually selects the older item.
    fireEvent.click(screen.getByTestId(`ruleChangeHistoryItem-${oldItem.id}`));
    await waitFor(() => {
      expect(screen.getByTestId('ruleChangesHistoryDiff')).toHaveTextContent('OldRule');
    });

    // A new change is recorded at the top.
    const brandNewItem = createHistoryItem({
      id: 'update-brandnew',
      action: 'rule_update',
      rule: {
        name: 'BrandNewRule',
        revision: 2,
        rule_source: { type: 'internal' },
      } as RuleResponse,
      old_values: { name: 'NewestRule' },
    });
    mockUseInfiniteChangeHistory.mockReturnValue(
      mockUseInfiniteQueryResult([brandNewItem, newestItem, oldItem])
    );
    rerender(
      <TestProviders>
        <RuleChangesHistory ruleId="rule-1" header={<span />} />
      </TestProviders>
    );

    // The manual selection is kept; the diff keeps showing the older item.
    await waitFor(() => {
      expect(screen.getByTestId('ruleChangesHistoryDiff')).toHaveTextContent('OldRule');
    });
    expect(screen.getByTestId('ruleChangesHistoryDiff')).not.toHaveTextContent('BrandNewRule');
  });

  it('auto-selects the newest item from fresh data when stale cache had a different first item', async () => {
    const staleItem = createHistoryItem({
      id: 'create-stale',
      action: 'rule_create',
      rule: { name: 'StaleRule' } as RuleResponse,
    });
    const freshItem = createHistoryItem({
      id: 'update-fresh',
      action: 'rule_update',
      rule: { name: 'FreshRule', revision: 1, rule_source: { type: 'internal' } } as RuleResponse,
      old_values: { name: 'StaleRule' },
    });

    // Simulate stale cache: data present but background refetch in progress.
    mockUseInfiniteChangeHistory.mockReturnValue(
      mockUseInfiniteQueryResult([staleItem], { isFetching: true })
    );

    const { rerender } = render(
      <TestProviders>
        <RuleChangesHistory ruleId="rule-1" header={<span />} />
      </TestProviders>
    );

    // Stale item is shown immediately while fetch is in progress.
    await waitFor(() => {
      expect(screen.getByTestId('ruleChangesHistoryDiff')).toHaveTextContent('StaleRule');
    });

    // Fresh data arrives: new item prepended, fetch complete.
    mockUseInfiniteChangeHistory.mockReturnValue(
      mockUseInfiniteQueryResult([freshItem, staleItem])
    );
    rerender(
      <TestProviders>
        <RuleChangesHistory ruleId="rule-1" header={<span />} />
      </TestProviders>
    );

    // Selection advances to the newest item from the server response.
    await waitFor(() => {
      expect(screen.getByTestId('ruleChangesHistoryDiff')).toHaveTextContent('FreshRule');
    });
  });

  it('preserves a manual selection made while the first-page fetch was still in progress', async () => {
    const staleItem = createHistoryItem({
      id: 'create-stale',
      action: 'rule_create',
      rule: { name: 'StaleRule' } as RuleResponse,
    });
    const anotherStaleItem = createHistoryItem({
      id: 'update-stale',
      action: 'rule_update',
      rule: {
        name: 'AnotherStaleRule',
        revision: 1,
        rule_source: { type: 'internal' },
      } as RuleResponse,
      old_values: { name: 'StaleRule' },
    });
    const freshItem = createHistoryItem({
      id: 'update-fresh',
      action: 'rule_update',
      rule: { name: 'FreshRule', revision: 2, rule_source: { type: 'internal' } } as RuleResponse,
      old_values: { name: 'AnotherStaleRule' },
    });

    // Stale cache has two items; the newest is auto-selected while fetching.
    mockUseInfiniteChangeHistory.mockReturnValue(
      mockUseInfiniteQueryResult([anotherStaleItem, staleItem], { isFetching: true })
    );

    const { rerender } = render(
      <TestProviders>
        <RuleChangesHistory ruleId="rule-1" header={<span />} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('ruleChangesHistoryDiff')).toHaveTextContent('AnotherStaleRule');
    });

    // User manually selects the older item before the fetch completes.
    fireEvent.click(screen.getByTestId('ruleChangeHistoryItem-create-stale'));

    await waitFor(() => {
      expect(screen.getByTestId('ruleChangesHistoryDiff')).toHaveTextContent('StaleRule');
    });

    // Fresh data arrives with a brand-new item at the top.
    mockUseInfiniteChangeHistory.mockReturnValue(
      mockUseInfiniteQueryResult([freshItem, anotherStaleItem, staleItem])
    );
    rerender(
      <TestProviders>
        <RuleChangesHistory ruleId="rule-1" header={<span />} />
      </TestProviders>
    );

    // The manual selection is preserved; fresh data does not override it.
    await waitFor(() => {
      expect(screen.getByTestId('ruleChangesHistoryDiff')).toHaveTextContent('StaleRule');
    });
    expect(screen.getByTestId('ruleChangesHistoryDiff')).not.toHaveTextContent('FreshRule');
  });

  it('shows nothing-selected state when the first page has no diffable items', async () => {
    const disableItem = createHistoryItem({ id: 'disable-1', action: 'rule_disable' });
    const enableItem = createHistoryItem({ id: 'enable-1', action: 'rule_enable' });
    mockUseInfiniteChangeHistory.mockReturnValue(
      mockUseInfiniteQueryResult([disableItem, enableItem], { hasNextPage: true })
    );

    render(
      <TestProviders>
        <RuleChangesHistory ruleId="rule-1" header={<span />} />
      </TestProviders>
    );

    // First page has only non-diffable events: nothing is auto-selected and no
    // further pages are loaded automatically.
    await waitFor(() => {
      expect(screen.getByTestId('ruleChangesHistoryNothingSelected')).toBeInTheDocument();
    });
  });
});

const MOCK_RULE: RuleResponse = { rule_source: { type: 'internal' } } as RuleResponse;

// 'rule_create' is in DIFFABLE_CHANGE_ACTIONS so the timeline auto-selects it on mount.
const MOCK_RULE_1_HISTORY_ITEM: RuleHistoryItem = {
  id: 'item-rule-1',
  timestamp: new Date().toISOString(),
  action: 'rule_create',
  rule: MOCK_RULE,
  old_values: null,
};

const MOCK_RULE_2_HISTORY_ITEM: RuleHistoryItem = {
  id: 'item-rule-2',
  timestamp: new Date().toISOString(),
  action: 'rule_create',
  rule: MOCK_RULE,
  old_values: null,
};

function createHistoryItem(
  overrides: Partial<Omit<RuleHistoryItem, 'rule'>> &
    Pick<RuleHistoryItem, 'id'> & { rule?: Partial<RuleResponse> }
): RuleHistoryItem {
  return {
    timestamp: new Date().toISOString(),
    action: 'rule_create',
    old_values: null,
    ...overrides,
    rule: { ...MOCK_RULE, ...overrides.rule } as RuleResponse,
  };
}

interface MockUseInfiniteQueryResultOptions {
  hasNextPage?: boolean;
  fetchNextPage?: jest.Mock;
  isFetching?: boolean;
}

function mockUseInfiniteQueryResult(
  items: RuleHistoryItem[],
  {
    hasNextPage = false,
    fetchNextPage = jest.fn(),
    isFetching = false,
  }: MockUseInfiniteQueryResultOptions = {}
) {
  return {
    data: {
      pages: [
        {
          items,
          page: 1,
          per_page: 20,
          total: hasNextPage ? items.length + 1 : items.length,
          tracking_started_at: new Date().toISOString(),
        },
      ],
    },
    isLoading: false,
    isFetching,
    isFetchingNextPage: false,
    fetchNextPage,
    hasNextPage,
  };
}
