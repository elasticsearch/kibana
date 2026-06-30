/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { AnomaliesOverview } from './anomalies_overview';
import type {
  AnomalyOverviewHit,
  GetAnomalyOverviewResponse,
} from '../../../../common/api/entity_analytics';
import { EntityDetailsLeftPanelTab } from '../../../flyout/entity_details/shared/components/left_panel/left_panel_header';

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  return {
    ...actual,
    useEuiTheme: () => ({
      euiTheme: {
        colors: {},
        font: { weight: { bold: 700, semiBold: 600 } },
      },
    }),
    useEuiFontSize: () => ({ fontSize: '12px' }),
  };
});

jest.mock('./mitre/components/mitre_attack_chain', () => ({
  MitreAttackChain: ({
    triggeredTactics,
    anomalyCountByTactic,
  }: {
    triggeredTactics: string[];
    anomalyCountByTactic: Record<string, number>;
  }) => (
    <div
      data-test-subj="mock-mitre-attack-chain"
      data-triggered-tactics={JSON.stringify(triggeredTactics)}
      data-tactic-counts={JSON.stringify(anomalyCountByTactic)}
    />
  ),
}));

jest.mock('./table/anomaly_job_name', () => ({
  AnomalyJobName: ({
    jobId,
    jobName,
    timeRange,
  }: {
    jobId: string;
    jobName: string;
    timeRange: { from: string; to: string };
  }) => (
    <span
      data-test-subj="mock-anomaly-job-name"
      data-job-id={jobId}
      data-job-name={jobName}
      data-time-range={JSON.stringify(timeRange)}
    />
  ),
}));

jest.mock('./table/anomaly_timestamp', () => ({
  AnomalyTimestamp: ({ timestamp }: { timestamp: string }) => (
    <span data-test-subj="mock-anomaly-timestamp" data-timestamp={timestamp} />
  ),
}));

jest.mock('../../../flyout_v2/shared/components/expandable_panel', () => ({
  ExpandablePanel: ({
    children,
    header,
  }: {
    children: React.ReactNode;
    header: { link: { callback: () => void } };
  }) => (
    <div>
      <button type="button" data-test-subj="expandable-panel-link" onClick={header.link.callback} />
      {children}
    </div>
  ),
}));

const makeHit = (overrides: Partial<AnomalyOverviewHit> = {}): AnomalyOverviewHit => ({
  jobId: 'security-job-1',
  jobName: 'Security Job',
  timestamp: '2026-05-19T13:41:58.725Z',
  anomalousValue: '1000 events',
  recordId: 'record-1',
  ...overrides,
});

const makeData = (
  overrides: Partial<GetAnomalyOverviewResponse> = {}
): GetAnomalyOverviewResponse => ({
  entityId: 'test-entity',
  anomalyByTimeBucket: [],
  recentAnomalies: [],
  tacticCounts: {},
  totalAnomaliesCount: 5,
  from: 1_000_000,
  to: 2_000_000,
  ...overrides,
});

const openDetailsPanel = jest.fn();

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <IntlProvider locale="en">{children}</IntlProvider>
);

describe('AnomaliesOverview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the total anomaly count in the stat heading', () => {
    render(
      <AnomaliesOverview
        data={makeData({ totalAnomaliesCount: 5 })}
        openDetailsPanel={openDetailsPanel}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('5');
  });

  it('shows singular "Anomaly" count label when count is 1', () => {
    render(
      <AnomaliesOverview
        data={makeData({ totalAnomaliesCount: 1 })}
        openDetailsPanel={openDetailsPanel}
      />,
      { wrapper: Wrapper }
    );
    // "Anomaly" appears as both the count label and the table column header
    expect(screen.getAllByText('Anomaly').length).toBeGreaterThanOrEqual(2);
  });

  it('shows plural "Anomalies" count label when count is greater than 1', () => {
    render(
      <AnomaliesOverview
        data={makeData({ totalAnomaliesCount: 5 })}
        openDetailsPanel={openDetailsPanel}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByText('Anomalies')).toBeInTheDocument();
  });

  it('renders the "Recent anomalies" section header', () => {
    render(<AnomaliesOverview data={makeData()} openDetailsPanel={openDetailsPanel} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByText('Recent anomalies')).toBeInTheDocument();
  });

  describe('MitreAttackChain', () => {
    it('passes the tactic keys as triggeredTactics', () => {
      const data = makeData({ tacticCounts: { TA0001: 3, TA0002: 1 } });
      render(<AnomaliesOverview data={data} openDetailsPanel={openDetailsPanel} />, {
        wrapper: Wrapper,
      });
      const chain = screen.getByTestId('mock-mitre-attack-chain');
      const triggeredTactics = JSON.parse(chain.getAttribute('data-triggered-tactics') ?? '[]');
      expect(triggeredTactics).toEqual(expect.arrayContaining(['TA0001', 'TA0002']));
      expect(triggeredTactics).toHaveLength(2);
    });

    it('passes tacticCounts as anomalyCountByTactic', () => {
      const tacticCounts = { TA0001: 7 };
      render(
        <AnomaliesOverview data={makeData({ tacticCounts })} openDetailsPanel={openDetailsPanel} />,
        { wrapper: Wrapper }
      );
      const chain = screen.getByTestId('mock-mitre-attack-chain');
      expect(JSON.parse(chain.getAttribute('data-tactic-counts') ?? '{}')).toEqual(tacticCounts);
    });

    it('passes an empty array when there are no tactic counts', () => {
      render(
        <AnomaliesOverview
          data={makeData({ tacticCounts: {} })}
          openDetailsPanel={openDetailsPanel}
        />,
        { wrapper: Wrapper }
      );
      const chain = screen.getByTestId('mock-mitre-attack-chain');
      expect(JSON.parse(chain.getAttribute('data-triggered-tactics') ?? '[]')).toEqual([]);
    });
  });

  describe('recent anomalies table', () => {
    it('renders one row per anomaly hit', () => {
      const data = makeData({ recentAnomalies: [makeHit(), makeHit({ jobId: 'job-2' })] });
      render(<AnomaliesOverview data={data} openDetailsPanel={openDetailsPanel} />, {
        wrapper: Wrapper,
      });
      expect(screen.getAllByTestId('mock-anomaly-job-name')).toHaveLength(2);
    });

    it('passes jobId and jobName to AnomalyJobName', () => {
      const hit = makeHit({ jobId: 'my-job', jobName: 'My Job' });
      render(
        <AnomaliesOverview
          data={makeData({ recentAnomalies: [hit] })}
          openDetailsPanel={openDetailsPanel}
        />,
        { wrapper: Wrapper }
      );
      const el = screen.getByTestId('mock-anomaly-job-name');
      expect(el).toHaveAttribute('data-job-id', 'my-job');
      expect(el).toHaveAttribute('data-job-name', 'My Job');
    });

    it('uses jobId as fallback display name when jobName is null', () => {
      const hit = makeHit({ jobId: 'fallback-id', jobName: null });
      render(
        <AnomaliesOverview
          data={makeData({ recentAnomalies: [hit] })}
          openDetailsPanel={openDetailsPanel}
        />,
        { wrapper: Wrapper }
      );
      expect(screen.getByTestId('mock-anomaly-job-name')).toHaveAttribute(
        'data-job-name',
        'fallback-id'
      );
    });

    it('passes the from/to time range derived from data to AnomalyJobName', () => {
      const data = makeData({ from: 1_000_000, to: 2_000_000, recentAnomalies: [makeHit()] });
      render(<AnomaliesOverview data={data} openDetailsPanel={openDetailsPanel} />, {
        wrapper: Wrapper,
      });
      const timeRange = JSON.parse(
        screen.getByTestId('mock-anomaly-job-name').getAttribute('data-time-range') ?? '{}'
      );
      expect(timeRange.from).toBe(new Date(1_000_000).toISOString());
      expect(timeRange.to).toBe(new Date(2_000_000).toISOString());
    });

    it('passes the timestamp to AnomalyTimestamp', () => {
      const hit = makeHit({ timestamp: '2026-05-19T13:41:58.725Z' });
      render(
        <AnomaliesOverview
          data={makeData({ recentAnomalies: [hit] })}
          openDetailsPanel={openDetailsPanel}
        />,
        { wrapper: Wrapper }
      );
      expect(screen.getByTestId('mock-anomaly-timestamp')).toHaveAttribute(
        'data-timestamp',
        '2026-05-19T13:41:58.725Z'
      );
    });

    it('renders the anomalous value as text', () => {
      const hit = makeHit({ anomalousValue: '42 events' });
      render(
        <AnomaliesOverview
          data={makeData({ recentAnomalies: [hit] })}
          openDetailsPanel={openDetailsPanel}
        />,
        { wrapper: Wrapper }
      );
      expect(screen.getByText('42 events')).toBeInTheDocument();
    });

    it('renders nothing in the anomalous value cell when anomalousValue is null', () => {
      const hit = makeHit({ anomalousValue: null });
      render(
        <AnomaliesOverview
          data={makeData({ recentAnomalies: [hit] })}
          openDetailsPanel={openDetailsPanel}
        />,
        { wrapper: Wrapper }
      );
      // no crash and the row still renders
      expect(screen.getByTestId('mock-anomaly-job-name')).toBeInTheDocument();
    });

    it('renders no rows when recentAnomalies is empty', () => {
      render(
        <AnomaliesOverview
          data={makeData({ recentAnomalies: [] })}
          openDetailsPanel={openDetailsPanel}
        />,
        { wrapper: Wrapper }
      );
      expect(screen.queryByTestId('mock-anomaly-job-name')).not.toBeInTheDocument();
    });
  });

  describe('header link', () => {
    it('calls openDetailsPanel with the anomalies tab when clicked', () => {
      render(<AnomaliesOverview data={makeData()} openDetailsPanel={openDetailsPanel} />, {
        wrapper: Wrapper,
      });
      fireEvent.click(screen.getByTestId('expandable-panel-link'));
      expect(openDetailsPanel).toHaveBeenCalledTimes(1);
      expect(openDetailsPanel).toHaveBeenCalledWith({
        tab: EntityDetailsLeftPanelTab.ANOMALIES,
      });
    });
  });
});
