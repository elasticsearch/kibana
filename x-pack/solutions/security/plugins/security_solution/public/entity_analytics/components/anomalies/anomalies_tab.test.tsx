/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import type { SeverityOption } from '@kbn/ml-plugin/public/application/explorer/hooks/use_severity_options';
import { AnomaliesTab } from './anomalies_tab';

// ─── Hook mocks ──────────────────────────────────────────────────────────────

const mockUseAnomalyOverview = jest.fn();
const mockUseAnomalySummary = jest.fn();

jest.mock('../../api/hooks/use_anomaly_overview', () => ({
  useAnomalyOverview: (...args: unknown[]) => mockUseAnomalyOverview(...args),
}));

jest.mock('../../api/hooks/use_anomaly_summary', () => ({
  useAnomalySummary: (...args: unknown[]) => mockUseAnomalySummary(...args),
}));

// ─── Severity options ─────────────────────────────────────────────────────────

// Five fixed options mirroring the real ML anomaly thresholds.
// Defined here for use in test bodies; the mock factory below must inline its
// own copy because jest.mock factories are hoisted before these declarations.
const WARNING = {
  val: 25,
  display: 'Warning',
  color: '',
  threshold: { min: 25, max: 50 } as const,
};
const MINOR = { val: 50, display: 'Minor', color: '', threshold: { min: 50, max: 75 } as const };
const MAJOR = { val: 75, display: 'Major', color: '', threshold: { min: 75, max: 100 } as const };
const CRITICAL = { val: 100, display: 'Critical', color: '', threshold: { min: 100 } as const };

// Capture the SeverityLegendControl onChange so tests can drive severity changes.
let onSeverityChange: ((opts: SeverityOption[]) => void) | undefined;

// ─── Child component mocks ────────────────────────────────────────────────────

jest.mock('@kbn/date-range-picker', () => ({
  DateRangePicker: () => <div data-test-subj="mock-date-range-picker" />,
}));

// Capture onSelectTactic so tests can drive tactic selection.
let onSelectTactic: ((tactic: string) => void) | undefined;
jest.mock('./mitre/components/mitre_attack_chain', () => ({
  MitreAttackChain: ({
    onSelectTactic: handler,
    selectedTactic,
    anomalyCountByTactic,
    triggeredTactics,
  }: {
    onSelectTactic?: (t: string) => void;
    selectedTactic?: string | null;
    anomalyCountByTactic?: Record<string, number>;
    triggeredTactics: string[];
  }) => {
    onSelectTactic = handler;
    return (
      <div
        data-test-subj="mock-mitre-attack-chain"
        data-selected-tactic={selectedTactic ?? ''}
        data-tactic-counts={JSON.stringify(anomalyCountByTactic ?? {})}
        data-triggered-tactics={JSON.stringify(triggeredTactics)}
      />
    );
  },
}));

jest.mock('./anomalies_tab_timeline', () => ({
  AnomalyTabTimelineSection: () => <div data-test-subj="mock-timeline" />,
}));

jest.mock('./anomalies_tab_table', () => ({
  AnomalyTabTableSection: () => <div data-test-subj="mock-table" />,
}));

// ─── Infrastructure mocks ─────────────────────────────────────────────────────

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  return {
    ...actual,
    useEuiTheme: () => ({
      euiTheme: { colors: {}, font: { weight: {} }, size: {}, levels: {} },
    }),
    useEuiFontSize: () => ({ fontSize: '12px' }),
  };
});

jest.mock('../../../common/lib/kibana', () => ({
  useKibana: () => ({ services: { ml: {} } }),
}));

jest.mock('@kbn/ml-plugin/public', () => ({
  ML_PAGES: { ANOMALY_DETECTION_JOBS_MANAGE: 'jobs' },
  useMlManagementHref: () => '/ml/jobs',
  useSeverityOptions: () => [
    { val: 0, display: 'Low', color: '', threshold: { min: 0, max: 25 } },
    { val: 25, display: 'Warning', color: '', threshold: { min: 25, max: 50 } },
    { val: 50, display: 'Minor', color: '', threshold: { min: 50, max: 75 } },
    { val: 75, display: 'Major', color: '', threshold: { min: 75, max: 100 } },
    { val: 100, display: 'Critical', color: '', threshold: { min: 100 } },
  ],
  SeverityLegendControl: ({ onChange }: { onChange: (opts: SeverityOption[]) => void }) => {
    onSeverityChange = onChange;
    return <div data-test-subj="mock-severity-control" />;
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const emptyOverview = {
  data: { tacticCounts: {}, anomalyByTimeBucket: [], recentAnomalies: [], from: 0, to: 1 },
  error: null,
  isFetching: false,
};
const emptySummary = {
  data: { anomalies: [], page: 1, page_size: 10, total: 0 },
  error: null,
};

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <IntlProvider locale="en">{children}</IntlProvider>
);

const defaultProps = { entityId: 'host-1', entityType: 'host' as const };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AnomaliesTab', () => {
  beforeEach(() => {
    mockUseAnomalyOverview.mockReturnValue(emptyOverview);
    mockUseAnomalySummary.mockReturnValue(emptySummary);
    onSeverityChange = undefined;
    onSelectTactic = undefined;
  });

  describe('basic structure', () => {
    it('renders the "Attack chain" section heading', () => {
      render(<AnomaliesTab {...defaultProps} />, { wrapper: Wrapper });
      expect(screen.getByText('Attack chain')).toBeInTheDocument();
    });

    it('renders the "Manage ML jobs" link', () => {
      render(<AnomaliesTab {...defaultProps} />, { wrapper: Wrapper });
      expect(screen.getByText('Manage ML jobs')).toBeInTheDocument();
    });

    it('renders the attack chain, timeline, and table sections', () => {
      render(<AnomaliesTab {...defaultProps} />, { wrapper: Wrapper });
      expect(screen.getByTestId('mock-mitre-attack-chain')).toBeInTheDocument();
      expect(screen.getByTestId('mock-timeline')).toBeInTheDocument();
      expect(screen.getByTestId('mock-table')).toBeInTheDocument();
    });
  });

  describe('scoreFilter', () => {
    it('passes no min/max score when all severities are selected', () => {
      render(<AnomaliesTab {...defaultProps} />, { wrapper: Wrapper });
      expect(mockUseAnomalyOverview).toHaveBeenLastCalledWith(
        expect.objectContaining({ minScore: undefined, maxScore: undefined })
      );
    });

    it('computes min/max scores when a subset (no critical) is selected', () => {
      render(<AnomaliesTab {...defaultProps} />, { wrapper: Wrapper });
      // Select only Warning [25,50) and Minor [50,75)
      act(() => {
        onSeverityChange!([WARNING, MINOR] as unknown as SeverityOption[]);
      });
      // min = Math.min(25, 50) = 25; max = Math.max(50, 75) - 1 = 74
      expect(mockUseAnomalyOverview).toHaveBeenLastCalledWith(
        expect.objectContaining({ minScore: 25, maxScore: 75 })
      );
    });

    it('sets no upper bound when critical is included in the subset', () => {
      render(<AnomaliesTab {...defaultProps} />, { wrapper: Wrapper });
      // Select Minor [50,75) and Critical [100,∞)
      act(() => {
        onSeverityChange!([MINOR, CRITICAL] as unknown as SeverityOption[]);
      });
      // min = Math.min(50, 100) = 50; critical has no max → maxScore undefined
      expect(mockUseAnomalyOverview).toHaveBeenLastCalledWith(
        expect.objectContaining({ minScore: 50, maxScore: undefined })
      );
    });

    it('passes the same scores to useAnomalySummary', () => {
      render(<AnomaliesTab {...defaultProps} />, { wrapper: Wrapper });
      act(() => {
        onSeverityChange!([MAJOR] as unknown as SeverityOption[]);
      });
      // min = 75; max = 100 - 1 = 99
      expect(mockUseAnomalySummary).toHaveBeenLastCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ min_score: 75, max_score: 100 }),
        })
      );
    });
  });

  describe('date range too old error', () => {
    it('shows error callout when overview returns a 400 with the date-range message', () => {
      mockUseAnomalyOverview.mockReturnValue({
        ...emptyOverview,
        data: null,
        error: {
          response: { status: 400 },
          body: { message: '`from` must not be older than 1 year' },
        },
      });
      render(<AnomaliesTab {...defaultProps} />, { wrapper: Wrapper });
      expect(
        screen.getByText(
          'Anomaly data is only available for the past year. Select a more recent start date.'
        )
      ).toBeInTheDocument();
    });

    it('shows error callout when summary returns the same 400 error', () => {
      mockUseAnomalySummary.mockReturnValue({
        ...emptySummary,
        data: null,
        error: {
          response: { status: 400 },
          body: { message: '`from` must not be older than 1 year' },
        },
      });
      render(<AnomaliesTab {...defaultProps} />, { wrapper: Wrapper });
      expect(
        screen.getByText(
          'Anomaly data is only available for the past year. Select a more recent start date.'
        )
      ).toBeInTheDocument();
    });

    it('does not show error callout when there is no error', () => {
      render(<AnomaliesTab {...defaultProps} />, { wrapper: Wrapper });
      expect(
        screen.queryByText(
          'Anomaly data is only available for the past year. Select a more recent start date.'
        )
      ).not.toBeInTheDocument();
    });
  });

  describe('tactic selection', () => {
    // The auto-clear useEffect wipes selectedTactic when it is absent from uniqueTactics.
    // These tests prime tacticCounts with the tactic so the effect does not intervene.

    it('passes selectedTactic to useAnomalyOverview when a tactic is selected', () => {
      mockUseAnomalyOverview.mockReturnValue({
        ...emptyOverview,
        data: { ...emptyOverview.data, tacticCounts: { 'Initial Access': 3 } },
      });
      render(<AnomaliesTab {...defaultProps} />, { wrapper: Wrapper });
      act(() => {
        onSelectTactic!('Initial Access');
      });
      expect(mockUseAnomalyOverview).toHaveBeenLastCalledWith(
        expect.objectContaining({ threatTactics: ['Initial Access'] })
      );
    });

    it('passes selectedTactic as a filter to useAnomalySummary', () => {
      mockUseAnomalyOverview.mockReturnValue({
        ...emptyOverview,
        data: { ...emptyOverview.data, tacticCounts: { Execution: 2 } },
      });
      render(<AnomaliesTab {...defaultProps} />, { wrapper: Wrapper });
      act(() => {
        onSelectTactic!('Execution');
      });
      expect(mockUseAnomalySummary).toHaveBeenLastCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ threat_tactics: ['Execution'] }),
        })
      );
    });

    it('deselects the tactic when the same tactic is selected again', () => {
      mockUseAnomalyOverview.mockReturnValue({
        ...emptyOverview,
        data: { ...emptyOverview.data, tacticCounts: { 'Initial Access': 3 } },
      });
      render(<AnomaliesTab {...defaultProps} />, { wrapper: Wrapper });
      act(() => {
        onSelectTactic!('Initial Access');
      });
      act(() => {
        onSelectTactic!('Initial Access');
      });
      expect(mockUseAnomalyOverview).toHaveBeenLastCalledWith(
        expect.objectContaining({ threatTactics: undefined })
      );
    });

    it('reflects selectedTactic on the MitreAttackChain', () => {
      mockUseAnomalyOverview.mockReturnValue({
        ...emptyOverview,
        data: { ...emptyOverview.data, tacticCounts: { Persistence: 1 } },
      });
      render(<AnomaliesTab {...defaultProps} />, { wrapper: Wrapper });
      act(() => {
        onSelectTactic!('Persistence');
      });
      expect(screen.getByTestId('mock-mitre-attack-chain')).toHaveAttribute(
        'data-selected-tactic',
        'Persistence'
      );
    });

    it('auto-clears selectedTactic when it is absent from the overview tactic counts', async () => {
      mockUseAnomalyOverview.mockReturnValue({
        ...emptyOverview,
        data: { ...emptyOverview.data, tacticCounts: { 'Initial Access': 3 } },
      });
      const { rerender } = render(<AnomaliesTab {...defaultProps} />, { wrapper: Wrapper });

      act(() => {
        onSelectTactic!('Initial Access');
      });

      // Simulate the overview returning without the selected tactic (e.g. after a refetch).
      // We need to rerender so the component picks up the updated mock return value.
      mockUseAnomalyOverview.mockReturnValue({
        ...emptyOverview,
        data: { ...emptyOverview.data, tacticCounts: {} },
        isFetching: false,
      });
      rerender(<AnomaliesTab {...defaultProps} />);

      // The useEffect sees selectedTactic not in uniqueTactics and calls setSelectedTactic(null),
      // which triggers another render where useAnomalyOverview receives threatTactics: undefined.
      await waitFor(() => {
        expect(mockUseAnomalyOverview).toHaveBeenLastCalledWith(
          expect.objectContaining({ threatTactics: undefined })
        );
      });
    });
  });

  describe('MitreAttackChain data', () => {
    it('passes tacticCounts from overview data to MitreAttackChain', () => {
      const tacticCounts = { 'Initial Access': 3, Execution: 1 };
      mockUseAnomalyOverview.mockReturnValue({
        ...emptyOverview,
        data: { ...emptyOverview.data, tacticCounts },
      });
      render(<AnomaliesTab {...defaultProps} />, { wrapper: Wrapper });
      const chain = screen.getByTestId('mock-mitre-attack-chain');
      expect(JSON.parse(chain.getAttribute('data-tactic-counts') ?? '{}')).toEqual(tacticCounts);
    });

    it('passes the tactic keys as triggeredTactics', () => {
      const tacticCounts = { 'Initial Access': 3, Execution: 1 };
      mockUseAnomalyOverview.mockReturnValue({
        ...emptyOverview,
        data: { ...emptyOverview.data, tacticCounts },
      });
      render(<AnomaliesTab {...defaultProps} />, { wrapper: Wrapper });
      const chain = screen.getByTestId('mock-mitre-attack-chain');
      const triggeredTactics = JSON.parse(chain.getAttribute('data-triggered-tactics') ?? '[]');
      expect(triggeredTactics).toEqual(expect.arrayContaining(['Initial Access', 'Execution']));
    });
  });
});
