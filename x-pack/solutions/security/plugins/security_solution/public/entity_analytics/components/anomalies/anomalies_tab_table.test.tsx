/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import type { AnomalySummaryEntry } from '../../../../common/api/entity_analytics';
import { AnomalyTabTableSection } from './anomalies_tab_table';

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  return {
    ...actual,
    useEuiTheme: () => ({
      euiTheme: {
        colors: { danger: '#cc0000', subduedText: '#6a6a6a', primary: '#0070f3' },
        font: { weight: { bold: 700 } },
        size: { s: '8px', m: '16px' },
        levels: { content: '100' },
      },
    }),
    useEuiFontSize: () => ({ fontSize: '12px' }),
  };
});

jest.mock('../../../common/components/ml/hooks/use_get_jobs', () => ({
  useGetInstalledJob: () => ({ jobs: [] }),
}));

jest.mock('./table/anomaly_job_name', () => ({
  AnomalyJobName: ({ jobName }: { jobName: string }) => (
    <span data-test-subj="mock-job-name">{jobName}</span>
  ),
}));

jest.mock('./table/anomaly_tactic_badges', () => ({
  AnomalyTacticBadges: ({ tactics }: { tactics: string[] }) => (
    <span data-test-subj="mock-tactic-badges">{tactics.join(', ')}</span>
  ),
}));

jest.mock('./table/anomaly_timestamp', () => ({
  AnomalyTimestamp: ({ timestamp }: { timestamp: number }) => (
    <span data-test-subj="mock-timestamp">{timestamp}</span>
  ),
}));

jest.mock('./table/anomaly_expanded_row', () => ({
  AnomalyExpandedRow: () => <div data-test-subj="mock-expanded-row">{'Expanded content'}</div>,
}));

jest.mock('./table/anomaly_score_badge', () => ({
  AnomalyScoreBadge: ({ score }: { score: number }) => (
    <span data-test-subj="mock-score-badge">{score}</span>
  ),
}));

jest.mock('./table/anomaly_row_actions_menu', () => ({
  AnomalyRowActionsMenu: () => <div data-test-subj="mock-row-actions-menu" />,
}));

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <IntlProvider locale="en">{children}</IntlProvider>
);

const makeAnomaly = (overrides: Partial<AnomalySummaryEntry> = {}): AnomalySummaryEntry => ({
  jobId: 'job-1',
  jobName: 'Test Job',
  detectorIndex: 0,
  detectorFunction: 'high_count',
  fieldName: null,
  byFieldName: null,
  byFieldValue: null,
  overFieldName: null,
  overFieldValue: null,
  partitionFieldName: null,
  partitionFieldValue: null,
  recordScore: 75,
  recordId: 'record-1',
  timestamp: '2024-01-15T10:00:00.000Z',
  actual: [100],
  typical: [10],
  baselineValues: ['10'],
  anomalousValue: '100',
  threatTactics: ['Initial Access'],
  ...overrides,
});

const defaultProps = {
  anomalies: [makeAnomaly()],
  entityType: 'host' as const,
  onTableChange: jest.fn(),
  page: 1,
  pageSize: 10,
  sortField: 'timestamp' as const,
  sortDirection: 'desc' as const,
  timeRange: { from: 'now-30d', to: 'now' },
  total: 1,
};

describe('AnomalyTabTableSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('structure', () => {
    it('renders the "Anomalies" section heading', () => {
      render(<AnomalyTabTableSection {...defaultProps} />, { wrapper: Wrapper });
      expect(screen.getByRole('heading', { name: 'Anomalies' })).toBeInTheDocument();
    });

    it('renders column headers', () => {
      render(<AnomalyTabTableSection {...defaultProps} />, { wrapper: Wrapper });
      expect(screen.getByText('ML job')).toBeInTheDocument();
      expect(screen.getByText('Tactic')).toBeInTheDocument();
      expect(screen.getByText('Timestamp')).toBeInTheDocument();
      expect(screen.getByText('Baseline')).toBeInTheDocument();
      expect(screen.getByText('Anomaly')).toBeInTheDocument();
      expect(screen.getByText('Anomaly score')).toBeInTheDocument();
    });

    it('renders the score column tooltip icon alongside the column label', () => {
      render(<AnomalyTabTableSection {...defaultProps} />, { wrapper: Wrapper });
      // The score column header is a sortable <th> that contains both the "Anomaly score"
      // label and the EuiIconTip. EuiBasicTable also injects a sort indicator icon, so the
      // header has at least 2 data-euiicon-type elements (tip icon + sort icon).
      const scoreHeader = Array.from(document.querySelectorAll('[role="columnheader"]')).find(
        (el) => el.textContent?.includes('Anomaly score')
      );
      expect(scoreHeader).toBeTruthy();
      const icons = scoreHeader!.querySelectorAll('[data-euiicon-type]');
      expect(icons.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('pagination text', () => {
    // The FormattedMessage wraps from/to/total in <strong> elements.
    // <strong> has no ARIA role, so we query via the DOM directly.
    const strongTexts = () =>
      Array.from(document.querySelectorAll('strong')).map((el) => el.textContent);

    it('shows 1-1 of 1 for a single result', () => {
      render(<AnomalyTabTableSection {...defaultProps} page={1} pageSize={10} total={1} />, {
        wrapper: Wrapper,
      });
      expect(strongTexts()).toEqual(['1', '1', '1']);
    });

    it('shows the correct range for page 2 of 25', () => {
      render(<AnomalyTabTableSection {...defaultProps} page={2} pageSize={10} total={25} />, {
        wrapper: Wrapper,
      });
      // from = (2-1)*10 + 1 = 11, to = min(20, 25) = 20
      expect(strongTexts()).toEqual(['11', '20', '25']);
    });

    it('caps "to" at total on the last partial page', () => {
      render(<AnomalyTabTableSection {...defaultProps} page={3} pageSize={10} total={25} />, {
        wrapper: Wrapper,
      });
      // from = 21, to = min(30, 25) = 25
      expect(strongTexts()).toEqual(['21', '25', '25']);
    });

    it('shows 0-0 of 0 with no anomalies', () => {
      render(<AnomalyTabTableSection {...defaultProps} anomalies={[]} total={0} />, {
        wrapper: Wrapper,
      });
      expect(strongTexts()).toEqual(['0', '0', '0']);
    });
  });

  describe('rows', () => {
    it('renders a row for each anomaly', () => {
      const anomalies = [
        makeAnomaly({ jobId: 'job-1', jobName: 'Alpha Job' }),
        makeAnomaly({ jobId: 'job-2', jobName: 'Beta Job' }),
      ];
      render(<AnomalyTabTableSection {...defaultProps} anomalies={anomalies} total={2} />, {
        wrapper: Wrapper,
      });
      expect(screen.getByText('Alpha Job')).toBeInTheDocument();
      expect(screen.getByText('Beta Job')).toBeInTheDocument();
    });

    it('renders the anomaly score for each row', () => {
      const anomalies = [makeAnomaly({ recordScore: 88 })];
      render(<AnomalyTabTableSection {...defaultProps} anomalies={anomalies} />, {
        wrapper: Wrapper,
      });
      expect(screen.getByText('88')).toBeInTheDocument();
    });

    it('renders tactic badges for each row', () => {
      const anomalies = [makeAnomaly({ threatTactics: ['Persistence', 'Execution'] })];
      render(<AnomalyTabTableSection {...defaultProps} anomalies={anomalies} />, {
        wrapper: Wrapper,
      });
      expect(screen.getByText('Persistence, Execution')).toBeInTheDocument();
    });
  });

  describe('row expansion', () => {
    it('does not show expanded content initially', () => {
      render(<AnomalyTabTableSection {...defaultProps} />, { wrapper: Wrapper });
      expect(screen.queryByTestId('mock-expanded-row')).not.toBeInTheDocument();
    });

    it('shows expanded content when the expand button is clicked', () => {
      render(<AnomalyTabTableSection {...defaultProps} />, { wrapper: Wrapper });
      fireEvent.click(screen.getByRole('button', { name: 'Expand row' }));
      expect(screen.getByTestId('mock-expanded-row')).toBeInTheDocument();
    });

    it('hides expanded content when the collapse button is clicked', () => {
      render(<AnomalyTabTableSection {...defaultProps} />, { wrapper: Wrapper });
      fireEvent.click(screen.getByRole('button', { name: 'Expand row' }));
      expect(screen.getByTestId('mock-expanded-row')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Collapse row' }));
      expect(screen.queryByTestId('mock-expanded-row')).not.toBeInTheDocument();
    });

    it('expands only the clicked row when multiple rows are present', () => {
      const anomalies = [
        makeAnomaly({ jobId: 'job-1', jobName: 'Alpha Job' }),
        makeAnomaly({ jobId: 'job-2', jobName: 'Beta Job' }),
      ];
      render(<AnomalyTabTableSection {...defaultProps} anomalies={anomalies} total={2} />, {
        wrapper: Wrapper,
      });
      const expandButtons = screen.getAllByRole('button', { name: 'Expand row' });
      fireEvent.click(expandButtons[0]);
      expect(screen.getAllByTestId('mock-expanded-row')).toHaveLength(1);
    });
  });

  describe('onTableChange', () => {
    it('calls onTableChange with sort info when a sortable column header is clicked', () => {
      const onTableChange = jest.fn();
      render(
        <AnomalyTabTableSection
          {...defaultProps}
          onTableChange={onTableChange}
          sortField="timestamp"
          sortDirection="desc"
        />,
        { wrapper: Wrapper }
      );
      // "Timestamp" is a sortable column header button
      const timestampHeader = screen.getByRole('button', { name: /timestamp/i });
      fireEvent.click(timestampHeader);
      expect(onTableChange).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: expect.objectContaining({ field: 'timestamp' }),
        })
      );
    });
  });
});
