/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useIsWithinMaxBreakpoint } from '@elastic/eui';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { TransactionsTable } from '.';
import type { TransactionGroup } from './types';

const renderWithIntl = (ui: React.ReactElement) =>
  render(<IntlProvider locale="en">{ui}</IntlProvider>);

jest.mock('@elastic/eui', () => ({
  ...jest.requireActual('@elastic/eui'),
  useIsWithinMaxBreakpoint: jest.fn(),
}));

const items: TransactionGroup[] = [
  {
    name: 'GET /api',
    latency: { value: 100000 },
    throughput: { value: 10 },
    errorRate: { value: 0.01 },
  },
];

const itemsWithOther: TransactionGroup[] = [
  ...items,
  {
    name: '_other',
    latency: { value: 50000 },
    throughput: { value: 5 },
    errorRate: { value: 0.02 },
  },
];

describe('TransactionsTable', () => {
  beforeEach(() => {
    (useIsWithinMaxBreakpoint as jest.Mock).mockReturnValue(false);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the loading message when isLoading is true', () => {
    renderWithIntl(<TransactionsTable items={[]} isLoading={true} maxCountExceeded={false} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders the no-results message when items are empty and not loading', () => {
    renderWithIntl(<TransactionsTable items={[]} isLoading={false} maxCountExceeded={false} />);
    expect(screen.getByText('No transactions found')).toBeInTheDocument();
  });

  it('shows the cardinality warning when maxCountExceeded and showMaxTransactionGroupsExceededWarning are true', () => {
    renderWithIntl(
      <TransactionsTable
        items={items}
        isLoading={false}
        maxCountExceeded={true}
        showMaxTransactionGroupsExceededWarning={true}
      />
    );
    expect(
      screen.getByText(/Number of transaction groups exceed the allowed maximum/)
    ).toBeInTheDocument();
  });

  it('does not show the cardinality warning when maxCountExceeded is false', () => {
    renderWithIntl(
      <TransactionsTable
        items={items}
        isLoading={false}
        maxCountExceeded={false}
        showMaxTransactionGroupsExceededWarning={true}
      />
    );
    expect(
      screen.queryByText(/Number of transaction groups exceed the allowed maximum/)
    ).not.toBeInTheDocument();
  });

  describe('title and header actions', () => {
    it('renders the default title "Transactions"', () => {
      renderWithIntl(<TransactionsTable items={[]} isLoading={false} maxCountExceeded={false} />);
      expect(screen.getByRole('heading', { name: 'Transactions' })).toBeInTheDocument();
    });

    it('renders a custom title when the title prop is provided', () => {
      renderWithIntl(
        <TransactionsTable
          items={[]}
          isLoading={false}
          maxCountExceeded={false}
          title="My custom title"
        />
      );
      expect(screen.getByRole('heading', { name: 'My custom title' })).toBeInTheDocument();
    });

    it('does not render header action links when headerActions is not provided', () => {
      renderWithIntl(<TransactionsTable items={[]} isLoading={false} maxCountExceeded={false} />);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('renders header action links when headerActions is provided', () => {
      renderWithIntl(
        <TransactionsTable
          items={[]}
          isLoading={false}
          maxCountExceeded={false}
          headerActions={[
            {
              label: 'View transactions',
              href: '#transactions',
              ebt: { action: 'viewTransactions', element: 'transactionsTableHeader' },
            },
          ]}
        />
      );
      expect(screen.getByRole('link', { name: 'View transactions' })).toBeInTheDocument();
    });

    it('calls onClick when a header action with onClick is clicked', () => {
      const onClick = jest.fn();
      renderWithIntl(
        <TransactionsTable
          items={[]}
          isLoading={false}
          maxCountExceeded={false}
          headerActions={[
            {
              label: 'Go somewhere',
              onClick,
              ebt: { action: 'goSomewhere', element: 'transactionsTableHeader' },
            },
          ]}
        />
      );
      fireEvent.click(screen.getByText('Go somewhere'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('remaining transactions row', () => {
    it('renders "Remaining Transactions" for the _other item', () => {
      renderWithIntl(
        <TransactionsTable items={itemsWithOther} isLoading={false} maxCountExceeded={false} />
      );
      expect(screen.getByText('Remaining Transactions')).toBeInTheDocument();
    });

    it('opens the popover with default content when the warning button is clicked', () => {
      renderWithIntl(
        <TransactionsTable items={itemsWithOther} isLoading={false} maxCountExceeded={false} />
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'More information about remaining transactions' })
      );
      expect(
        screen.getByText(/The maximum number of transaction groups has been reached/)
      ).toBeInTheDocument();
    });

    it('shows custom tooltip content when remainingTransactionsCellTooltipContent is provided', () => {
      renderWithIntl(
        <TransactionsTable
          items={itemsWithOther}
          isLoading={false}
          maxCountExceeded={false}
          remainingTransactionsCellTooltipContent={<span>Custom content</span>}
        />
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'More information about remaining transactions' })
      );
      expect(screen.getByText('Custom content')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('renders the error callout with the provided message', () => {
      renderWithIntl(
        <TransactionsTable
          items={[]}
          isLoading={false}
          maxCountExceeded={false}
          errorMessage="Failed to load transaction data"
        />
      );
      expect(screen.getByText('Failed to load transaction data')).toBeInTheDocument();
    });

    it('does not render the table when errorMessage is set', () => {
      renderWithIntl(
        <TransactionsTable
          items={items}
          isLoading={false}
          maxCountExceeded={false}
          errorMessage="Failed to load transaction data"
        />
      );
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    });

    it('keeps the title and header actions visible when errorMessage is set', () => {
      renderWithIntl(
        <TransactionsTable
          items={[]}
          isLoading={false}
          maxCountExceeded={false}
          errorMessage="Failed to load transaction data"
          headerActions={[
            {
              label: 'Open in APM',
              href: '#apm',
              ebt: { action: 'openInApm', element: 'transactionsTableHeader' },
            },
          ]}
        />
      );
      expect(screen.getByRole('heading', { name: 'Transactions' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Open in APM' })).toBeInTheDocument();
    });
  });

  describe('search behavior', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('calls onSearchQueryChange after debounce when the new query does not include the previous one', () => {
      const onSearchQueryChange = jest.fn();
      renderWithIntl(
        <TransactionsTable
          items={items}
          isLoading={false}
          maxCountExceeded={false}
          onSearchQueryChange={onSearchQueryChange}
        />
      );

      const searchInput = screen.getByRole('searchbox');

      // Establish 'banana' as current query — extends '' so no server call
      fireEvent.change(searchInput, { target: { value: 'banana' } });
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(onSearchQueryChange).not.toHaveBeenCalled();

      // Change to 'cherry' — does not include 'banana', triggers server fetch
      fireEvent.change(searchInput, { target: { value: 'cherry' } });
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(onSearchQueryChange).toHaveBeenCalledWith('cherry');
    });

    it('does not call onSearchQueryChange when the new query extends the previous one', () => {
      const onSearchQueryChange = jest.fn();
      renderWithIntl(
        <TransactionsTable
          items={items}
          isLoading={false}
          maxCountExceeded={false}
          onSearchQueryChange={onSearchQueryChange}
        />
      );

      const searchInput = screen.getByRole('searchbox');

      fireEvent.change(searchInput, { target: { value: 'ban' } });
      act(() => {
        jest.advanceTimersByTime(300);
      });

      fireEvent.change(searchInput, { target: { value: 'banana' } });
      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(onSearchQueryChange).not.toHaveBeenCalled();
    });

    it('calls onSearchQueryChange when maxCountExceeded is true even if query extends the previous one', () => {
      const onSearchQueryChange = jest.fn();
      renderWithIntl(
        <TransactionsTable
          items={items}
          isLoading={false}
          maxCountExceeded={true}
          onSearchQueryChange={onSearchQueryChange}
        />
      );

      const searchInput = screen.getByRole('searchbox');

      fireEvent.change(searchInput, { target: { value: 'ban' } });
      act(() => {
        jest.advanceTimersByTime(300);
      });

      fireEvent.change(searchInput, { target: { value: 'banana' } });
      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(onSearchQueryChange).toHaveBeenCalledTimes(2);
    });
  });
});
