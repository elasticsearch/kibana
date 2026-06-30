/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { BULK_FILTER_MAX_RULES } from '@kbn/alerting-v2-schemas';
import { RULE_KIND_TOOLTIPS } from '@kbn/alerting-v2-constants';
import { RulesListTable, type RulesListTableProps } from './rules_list_table';

const mockRules = [
  {
    id: 'rule-1',
    kind: 'alert',
    enabled: true,
    metadata: { name: 'Rule One', tags: ['prod'] },
    schedule: { every: '1m' },
    query: { format: 'standalone', breach: { query: 'FROM logs-* | LIMIT 1' } },
  },
  {
    id: 'rule-2',
    kind: 'signal',
    enabled: false,
    metadata: { name: 'Rule Two', tags: [] },
    schedule: { every: '5m' },
    query: { format: 'standalone', breach: { query: 'FROM metrics-*' } },
  },
];

const mockRulesWithManyTags = [
  {
    id: 'rule-many-tags',
    kind: 'alert',
    enabled: true,
    metadata: {
      name: 'Rule With Many Tags',
      tags: ['new', 'rna', 'production', 'fix', 'this', 'tags', 'more', 'than', 'enough'],
    },
    schedule: { every: '1m' },
    query: { format: 'standalone', breach: { query: 'FROM logs-* | LIMIT 1' } },
  },
];

const mockRulesWithLongTags = [
  {
    id: 'rule-long-tags',
    kind: 'alert',
    enabled: true,
    metadata: {
      name: 'Rule With Long Tags',
      tags: ['this-is-a-very-long-tag-name-that-should-be-truncated'],
    },
    schedule: { every: '1m' },
    query: { format: 'standalone', breach: { query: 'FROM logs-* | LIMIT 1' } },
  },
];

const defaultProps: RulesListTableProps = {
  items: mockRules as any,
  totalItemCount: 2,
  page: 1,
  perPage: 20,
  search: '',
  hasActiveFilters: false,
  sortField: undefined,
  sortDirection: undefined,
  isLoading: false,
  selectedCount: 0,
  isAllSelected: false,
  isPageSelected: false,
  isRowSelected: () => false,
  onSelectRow: jest.fn(),
  onSelectPage: jest.fn(),
  onSelectAll: jest.fn(),
  onClearSelection: jest.fn(),
  onBulkEnable: jest.fn(),
  onBulkDisable: jest.fn(),
  onBulkDelete: jest.fn(),
  onNavigateToDetails: jest.fn(),
  onExpand: jest.fn(),
  onQuickEdit: jest.fn(),
  onEdit: jest.fn(),
  onClone: jest.fn(),
  onDelete: jest.fn(),
  onToggleEnabled: jest.fn(),
  onTableChange: jest.fn(),
};

const renderTable = (overrides: Partial<RulesListTableProps> = {}) => {
  const props = { ...defaultProps, ...overrides };
  return render(
    <I18nProvider>
      <RulesListTable {...props} />
    </I18nProvider>
  );
};

describe('RulesListTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders items in the table', () => {
      renderTable();

      expect(screen.getByText('Rule One')).toBeInTheDocument();
      expect(screen.getByText('Rule Two')).toBeInTheDocument();
    });

    it('renders the "Showing" label with correct range', () => {
      renderTable();

      const label = screen.getByTestId('rulesListShowingLabel');
      expect(label).toHaveTextContent('Showing 1-2 of 2 Rules');
    });

    it('renders "Showing 0-0 of 0 Rules" when empty', () => {
      renderTable({ items: [], totalItemCount: 0 });

      const label = screen.getByTestId('rulesListShowingLabel');
      expect(label).toHaveTextContent('Showing 0-0 of 0 Rules');
    });

    it('renders a generic empty state when there are no rules', () => {
      renderTable({ items: [], totalItemCount: 0, search: '', hasActiveFilters: false });

      expect(screen.getByText('No rules found.')).toBeInTheDocument();
    });

    it('renders a search-specific empty state when no rules match', () => {
      renderTable({ items: [], totalItemCount: 0, search: 'prod' });

      expect(screen.getByText('No rules match your search or filters.')).toBeInTheDocument();
    });

    it('renders a filter-specific empty state when no rules match', () => {
      renderTable({ items: [], totalItemCount: 0, search: '', hasActiveFilters: true });

      expect(screen.getByText('No rules match your search or filters.')).toBeInTheDocument();
    });

    it('renders the Source column with extracted index pattern', () => {
      renderTable();

      expect(screen.getByText('logs-*')).toBeInTheDocument();
      expect(screen.getByText('metrics-*')).toBeInTheDocument();
    });

    it('renders Status column with Enabled and Disabled badges', () => {
      renderTable();

      expect(screen.getByTestId('ruleStatusEnabled')).toHaveTextContent('Enabled');
      expect(screen.getByTestId('ruleStatusDisabled')).toHaveTextContent('Disabled');
    });

    it('renders Mode column with Alert and Signal', () => {
      renderTable();

      expect(screen.getByText('Alert')).toBeInTheDocument();
      expect(screen.getByText('Signal')).toBeInTheDocument();
    });

    it('renders kind-specific tooltip for Alert mode badge', async () => {
      renderTable();

      fireEvent.mouseOver(screen.getByText('Alert'));

      await waitFor(() => {
        expect(screen.getByText(RULE_KIND_TOOLTIPS.alert)).toBeInTheDocument();
      });
      expect(
        screen.queryByText('Mode can be changed in the rule edit form')
      ).not.toBeInTheDocument();
    });

    it('renders kind-specific tooltip for Signal mode badge', async () => {
      renderTable();

      fireEvent.mouseOver(screen.getByText('Signal'));

      await waitFor(() => {
        expect(screen.getByText(RULE_KIND_TOOLTIPS.signal)).toBeInTheDocument();
      });
    });

    it('renders tag badges for rules with tags', () => {
      renderTable();

      expect(screen.getByText('prod')).toBeInTheDocument();
    });

    it('truncates tags to show only the first 1 and a +N badge for overflow', () => {
      renderTable({
        items: mockRulesWithManyTags as any,
        totalItemCount: 1,
      });

      // First tag should be visible
      expect(screen.getByText('new')).toBeInTheDocument();

      // Remaining 8 tags should be hidden behind +8 badge
      expect(screen.getByTestId('overflowTagsBadge')).toHaveTextContent('+8');

      // Overflow tags should not be directly visible
      expect(screen.queryByText('rna')).not.toBeInTheDocument();
    });

    it('renders long tag text with native EuiBadge truncation', () => {
      renderTable({
        items: mockRulesWithLongTags as any,
        totalItemCount: 1,
      });

      // The full tag text is in the DOM; CSS handles visual truncation
      expect(
        screen.getByText('this-is-a-very-long-tag-name-that-should-be-truncated')
      ).toBeInTheDocument();
    });
  });

  describe('selection checkboxes', () => {
    it('renders a header checkbox and one per row', () => {
      renderTable();

      const checkboxes = screen.getAllByRole('checkbox');
      // 1 header + 2 rows
      expect(checkboxes).toHaveLength(3);
    });

    it('calls onSelectPage when header checkbox is clicked', () => {
      const onSelectPage = jest.fn();
      renderTable({ onSelectPage });

      fireEvent.click(screen.getByTestId('selectAllRulesOnPage'));

      expect(onSelectPage).toHaveBeenCalledTimes(1);
    });

    it('calls onSelectRow when a row checkbox is clicked', () => {
      const onSelectRow = jest.fn();
      renderTable({ onSelectRow });

      fireEvent.click(screen.getByTestId('checkboxSelectRow-rule-1'));

      expect(onSelectRow).toHaveBeenCalledWith('rule-1');
    });

    it('shows checked state based on isRowSelected', () => {
      renderTable({ isRowSelected: (id) => id === 'rule-1' });

      const checkbox1 = screen.getByTestId('checkboxSelectRow-rule-1');
      const checkbox2 = screen.getByTestId('checkboxSelectRow-rule-2');

      expect(checkbox1).toBeChecked();
      expect(checkbox2).not.toBeChecked();
    });

    it('shows checked header checkbox based on isPageSelected', () => {
      renderTable({ isPageSelected: true });

      expect(screen.getByTestId('selectAllRulesOnPage')).toBeChecked();
    });
  });

  describe('bulk action toolbar', () => {
    it('does not show toolbar when selectedCount is 0', () => {
      renderTable({ selectedCount: 0 });

      expect(screen.queryByTestId('bulkActionsButton')).not.toBeInTheDocument();
      expect(screen.queryByTestId('clearSelectionButton')).not.toBeInTheDocument();
      expect(screen.queryByTestId('selectAllRulesButton')).not.toBeInTheDocument();
    });

    it('shows toolbar with count when selectedCount > 0', () => {
      renderTable({ selectedCount: 1 });

      expect(screen.getByTestId('bulkActionsButton')).toHaveTextContent('1 Selected');
      expect(screen.getByTestId('clearSelectionButton')).toBeInTheDocument();
      expect(screen.getByTestId('selectAllRulesButton')).toBeInTheDocument();
    });

    it('shows "Select all N rules" when not all selected', () => {
      renderTable({ selectedCount: 1, isAllSelected: false, totalItemCount: 5 });

      expect(screen.getByTestId('selectAllRulesButton')).toHaveTextContent('Select all 5 rules');
    });

    it('shows "Select first {max} rules" without disclosure until select-all is active', () => {
      renderTable({
        selectedCount: 1,
        isAllSelected: false,
        totalItemCount: BULK_FILTER_MAX_RULES + 2000,
      });

      const btn = screen.getByTestId('selectAllRulesButton');
      expect(btn).toHaveTextContent('Select first');
      expect(btn.textContent?.replace(/\s/g, '')).toMatch(/10,?000/);

      expect(screen.queryByTestId('bulkSelectAllLimitDisclosure')).not.toBeInTheDocument();
    });

    it('shows disclosure only after select-all when total exceeds bulk cap', () => {
      renderTable({
        selectedCount: BULK_FILTER_MAX_RULES,
        isAllSelected: true,
        totalItemCount: BULK_FILTER_MAX_RULES + 2000,
      });

      expect(screen.getByTestId('bulkActionsButton')).toHaveTextContent('Selected');
      expect(screen.getByTestId('bulkActionsButton').textContent?.replace(/\s/g, '')).toMatch(
        /10,?000/
      );
      const disc = screen.getByTestId('bulkSelectAllLimitDisclosure');
      expect(disc).toHaveTextContent('Only the first');
      expect(disc.textContent?.replace(/\s/g, '')).toMatch(/10,?000/);
    });

    it('hides "Select all" button when all selected', () => {
      renderTable({ selectedCount: 5, isAllSelected: true, totalItemCount: 5 });

      expect(screen.queryByTestId('selectAllRulesButton')).not.toBeInTheDocument();
    });

    it('calls onSelectAll when select all button is clicked', () => {
      const onSelectAll = jest.fn();
      renderTable({ selectedCount: 1, isAllSelected: false, onSelectAll });

      fireEvent.click(screen.getByTestId('selectAllRulesButton'));

      expect(onSelectAll).toHaveBeenCalledTimes(1);
    });

    it('calls onClearSelection when clear button is clicked', () => {
      const onClearSelection = jest.fn();
      renderTable({ selectedCount: 1, onClearSelection });

      fireEvent.click(screen.getByTestId('clearSelectionButton'));

      expect(onClearSelection).toHaveBeenCalledTimes(1);
    });

    it('opens bulk actions popover and calls onBulkEnable', async () => {
      const onBulkEnable = jest.fn();
      renderTable({ selectedCount: 1, onBulkEnable });

      fireEvent.click(screen.getByTestId('bulkActionsButton'));

      await waitFor(() => {
        expect(screen.getByTestId('bulkEnableRules')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('bulkEnableRules'));

      expect(onBulkEnable).toHaveBeenCalledTimes(1);
    });

    it('opens bulk actions popover and calls onBulkDisable', async () => {
      const onBulkDisable = jest.fn();
      renderTable({ selectedCount: 1, onBulkDisable });

      fireEvent.click(screen.getByTestId('bulkActionsButton'));

      await waitFor(() => {
        expect(screen.getByTestId('bulkDisableRules')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('bulkDisableRules'));

      expect(onBulkDisable).toHaveBeenCalledTimes(1);
    });

    it('opens bulk actions popover and calls onBulkDelete', async () => {
      const onBulkDelete = jest.fn();
      renderTable({ selectedCount: 1, onBulkDelete });

      fireEvent.click(screen.getByTestId('bulkActionsButton'));

      await waitFor(() => {
        expect(screen.getByTestId('bulkDeleteRules')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('bulkDeleteRules'));

      expect(onBulkDelete).toHaveBeenCalledTimes(1);
    });

    it('closes the popover after clicking a bulk action', async () => {
      renderTable({ selectedCount: 1 });

      fireEvent.click(screen.getByTestId('bulkActionsButton'));

      await waitFor(() => {
        expect(screen.getByTestId('bulkEnableRules')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('bulkEnableRules'));

      await waitFor(() => {
        expect(screen.queryByTestId('bulkEnableRules')).not.toBeInTheDocument();
      });
    });
  });

  describe('row actions menu', () => {
    it('calls onEdit when edit action is clicked', async () => {
      const onEdit = jest.fn();
      renderTable({ onEdit });

      fireEvent.click(screen.getByTestId('ruleActionsButton-rule-1'));

      await waitFor(() => {
        expect(screen.getByTestId('editRule-rule-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('editRule-rule-1'));

      expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'rule-1' }));
    });

    it('calls onClone when clone action is clicked', async () => {
      const onClone = jest.fn();
      renderTable({ onClone });

      fireEvent.click(screen.getByTestId('ruleActionsButton-rule-1'));

      await waitFor(() => {
        expect(screen.getByTestId('cloneRule-rule-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('cloneRule-rule-1'));

      expect(onClone).toHaveBeenCalledWith(expect.objectContaining({ id: 'rule-1' }));
    });

    it('calls onDelete when delete action is clicked', async () => {
      const onDelete = jest.fn();
      renderTable({ onDelete });

      fireEvent.click(screen.getByTestId('ruleActionsButton-rule-1'));

      await waitFor(() => {
        expect(screen.getByTestId('deleteRule-rule-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('deleteRule-rule-1'));

      expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'rule-1' }));
    });

    it('calls onToggleEnabled when toggle action is clicked', async () => {
      const onToggleEnabled = jest.fn();
      renderTable({ onToggleEnabled });

      fireEvent.click(screen.getByTestId('ruleActionsButton-rule-1'));

      await waitFor(() => {
        expect(screen.getByTestId('toggleEnabledRule-rule-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('toggleEnabledRule-rule-1'));

      expect(onToggleEnabled).toHaveBeenCalledWith(expect.objectContaining({ id: 'rule-1' }));
    });

    it('shows "Disable" for enabled rules and "Enable" for disabled rules', async () => {
      renderTable();

      // Enabled rule
      fireEvent.click(screen.getByTestId('ruleActionsButton-rule-1'));
      await waitFor(() => {
        expect(screen.getByTestId('toggleEnabledRule-rule-1')).toHaveTextContent('Disable');
      });

      // Close popover by clicking the button again
      fireEvent.click(screen.getByTestId('ruleActionsButton-rule-1'));

      // Disabled rule
      fireEvent.click(screen.getByTestId('ruleActionsButton-rule-2'));
      await waitFor(() => {
        expect(screen.getByTestId('toggleEnabledRule-rule-2')).toHaveTextContent('Enable');
      });
    });
  });

  describe('rule name link', () => {
    it('renders rule name as a clickable link', () => {
      renderTable();

      expect(screen.getByTestId('ruleNameLink-rule-1')).toBeInTheDocument();
    });

    it('calls onNavigateToDetails when rule name link is clicked', () => {
      const onNavigateToDetails = jest.fn();
      renderTable({ onNavigateToDetails });

      fireEvent.click(screen.getByTestId('ruleNameLink-rule-1'));

      expect(onNavigateToDetails).toHaveBeenCalledWith(expect.objectContaining({ id: 'rule-1' }));
    });
  });

  describe('expand button', () => {
    it('renders an expand button for each row', () => {
      renderTable();

      expect(screen.getByTestId('expandRule-rule-1')).toBeInTheDocument();
      expect(screen.getByTestId('expandRule-rule-2')).toBeInTheDocument();
    });

    it('calls onExpand with the row rule when the expand button is clicked', () => {
      const onExpand = jest.fn();
      renderTable({ onExpand });

      fireEvent.click(screen.getByTestId('expandRule-rule-1'));

      expect(onExpand).toHaveBeenCalledWith(expect.objectContaining({ id: 'rule-1' }));
    });
  });
});
