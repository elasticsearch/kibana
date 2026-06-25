/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { FindRulesResponse } from '@kbn/alerting-v2-schemas';
import {
  EpisodeStatusCell,
  EpisodeTagsCell,
  EpisodeRuleCell,
  EpisodeSeverityCell,
} from './episodes_table_cell_renderers';
import { AlertEpisodeStatusBadges } from './status/status_badges';
import { AlertEpisodeTags } from './actions/tags';
import { AlertEpisodeSeverityBadge } from './severity/episode_severity_badge';

jest.mock('./status/status_badges', () => ({
  AlertEpisodeStatusBadges: jest.fn(() => <div data-test-subj="statusBadges" />),
}));
jest.mock('./actions/tags', () => ({
  AlertEpisodeTags: jest.fn(() => <div data-test-subj="episodeTags" />),
}));
jest.mock('./severity/episode_severity_badge', () => ({
  AlertEpisodeSeverityBadge: jest.fn(() => <div data-test-subj="severityBadge" />),
}));

const mockStatusBadges = jest.mocked(AlertEpisodeStatusBadges);
const mockTags = jest.mocked(AlertEpisodeTags);
const mockSeverityBadge = jest.mocked(AlertEpisodeSeverityBadge);

type Rule = FindRulesResponse['items'][number];

const makeRow = (fields: Record<string, unknown>) => ({
  id: '0',
  raw: {},
  flattened: fields,
});

const baseCellProps = {
  columnId: 'episode.status',
  dataView: {} as never,
  fieldFormats: {} as never,
  closePopover: jest.fn(),
  setCellProps: jest.fn(),
  rowIndex: 0,
  colIndex: 0,
  columnsMeta: undefined,
  isDetails: false,
  isExpanded: false,
  isExpandable: false,
};

beforeEach(() => jest.clearAllMocks());

describe('EpisodeStatusCell', () => {
  it('renders AlertEpisodeStatusBadges', () => {
    const row = makeRow({
      'episode.status': 'active',
      'episode.id': 'ep1',
      'rule.id': 'r1',
      group_hash: 'gh1',
    });
    render(<EpisodeStatusCell {...baseCellProps} columnId="episode.status" row={row} />);
    expect(screen.getByTestId('statusBadges')).toBeInTheDocument();
  });

  it('passes status, episodeAction and groupAction derived from row fields', () => {
    const row = makeRow({
      'episode.status': 'active',
      'episode.id': 'ep1',
      'rule.id': 'r1',
      group_hash: 'gh1',
      last_ack_action: 'ack',
      last_snooze_action: 'snooze',
      snooze_expiry: '2025-01-01T00:00:00Z',
      last_deactivate_action: 'deactivate',
      last_tags: ['x'],
    });
    render(<EpisodeStatusCell {...baseCellProps} columnId="episode.status" row={row} />);
    const props = mockStatusBadges.mock.calls[0][0];
    expect(props.status).toBe('active');
    expect(props.episodeAction).toMatchObject({ episodeId: 'ep1', lastAckAction: 'ack' });
    expect(props.groupAction).toMatchObject({
      groupHash: 'gh1',
      lastSnoozeAction: 'snooze',
      snoozeExpiry: '2025-01-01T00:00:00Z',
      lastDeactivateAction: 'deactivate',
      tags: ['x'],
    });
  });

  it('passes null action fields and empty tags when row fields are absent', () => {
    const row = makeRow({
      'episode.status': 'active',
      'episode.id': 'ep1',
      'rule.id': 'r1',
      group_hash: 'gh1',
    });
    render(<EpisodeStatusCell {...baseCellProps} columnId="episode.status" row={row} />);
    const props = mockStatusBadges.mock.calls[0][0];
    expect(props.episodeAction).toMatchObject({ lastAckAction: null });
    expect(props.groupAction).toMatchObject({
      lastSnoozeAction: null,
      lastDeactivateAction: null,
      snoozeExpiry: null,
      tags: [],
    });
  });
});

describe('EpisodeTagsCell', () => {
  it('passes tags from row last_tags field', () => {
    const row = makeRow({ group_hash: 'gh3', last_tags: ['foo', 'bar'] });
    render(<EpisodeTagsCell {...baseCellProps} row={row} />);
    const props = mockTags.mock.calls[0][0];
    expect(props.tags).toEqual(['foo', 'bar']);
  });

  it('passes empty tags when last_tags is absent from the row', () => {
    const row = makeRow({ group_hash: 'gh3' });
    render(<EpisodeTagsCell {...baseCellProps} row={row} />);
    const props = mockTags.mock.calls[0][0];
    expect(props.tags).toEqual([]);
  });
});

describe('EpisodeSeverityCell', () => {
  it('passes severity from row flattened field', () => {
    const row = makeRow({ severity: 'high' });
    render(<EpisodeSeverityCell {...baseCellProps} row={row} />);
    expect(screen.getByTestId('severityBadge')).toBeInTheDocument();
    expect(mockSeverityBadge.mock.calls[0][0].severity).toBe('high');
  });

  it('passes undefined severity when row field is absent', () => {
    const row = makeRow({});
    render(<EpisodeSeverityCell {...baseCellProps} row={row} />);
    expect(mockSeverityBadge.mock.calls[0][0].severity).toBeUndefined();
  });
});

describe('EpisodeRuleCell', () => {
  const makeRule = (name: string, grouping?: { fields: string[] }): Rule =>
    ({
      metadata: { name },
      query: { format: 'standalone', breach: { query: `FROM ${name}` } },
      ...(grouping ? { grouping } : {}),
    } as unknown as Rule);

  it('renders a skeleton when rules are loading and cache is empty', () => {
    const row = makeRow({ 'rule.id': 'r1' });
    render(
      <EpisodeRuleCell
        {...baseCellProps}
        columnId="rule.id"
        row={row}
        rulesCache={{}}
        isLoadingRules={true}
        rowHeight={2}
      />
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders the raw ruleId when the rule id is missing from bulk get', () => {
    const row = makeRow({ 'rule.id': 'deleted-rule' });
    render(
      <EpisodeRuleCell
        {...baseCellProps}
        columnId="rule.id"
        row={row}
        rulesCache={{}}
        isLoadingRules={false}
        rowHeight={1}
      />
    );
    expect(screen.getByText('deleted-rule')).toBeInTheDocument();
  });

  it('renders the raw ruleId when the rule is not in cache', () => {
    const row = makeRow({ 'rule.id': 'unknown-rule' });
    render(
      <EpisodeRuleCell
        {...baseCellProps}
        columnId="rule.id"
        row={row}
        rulesCache={{}}
        isLoadingRules={false}
        rowHeight={2}
      />
    );
    expect(screen.getByText('unknown-rule')).toBeInTheDocument();
  });

  it('renders the rule name when rule is in cache', () => {
    const row = makeRow({ 'rule.id': 'r1' });
    render(
      <EpisodeRuleCell
        {...baseCellProps}
        columnId="rule.id"
        row={row}
        rulesCache={{ r1: makeRule('My Rule') }}
        isLoadingRules={false}
        rowHeight={2}
      />
    );
    expect(screen.getByText('My Rule')).toBeInTheDocument();
  });

  it('renders the ES|QL query below the rule row when rowHeight > 1', () => {
    const row = makeRow({ 'rule.id': 'r1' });
    render(
      <EpisodeRuleCell
        {...baseCellProps}
        columnId="rule.id"
        row={row}
        rulesCache={{ r1: makeRule('My Rule', { fields: ['host.name'] }) }}
        isLoadingRules={false}
        rowHeight={2}
      />
    );
    expect(screen.getByText('FROM My Rule')).toBeInTheDocument();
  });

  it('renders grouping value tags after the rule name when rule has grouping.fields and episode_data', () => {
    const row = makeRow({
      'rule.id': 'r1',
      episode_data: JSON.stringify({ host: { name: 'server-1' } }),
    });
    render(
      <EpisodeRuleCell
        {...baseCellProps}
        columnId="rule.id"
        row={row}
        rulesCache={{ r1: makeRule('My Rule', { fields: ['host.name'] }) }}
        isLoadingRules={false}
        rowHeight={2}
      />
    );
    expect(screen.getByTestId('episodeRuleCellGroupingTags')).toBeInTheDocument();
    expect(screen.getByLabelText('host.name: server-1')).toBeInTheDocument();
    expect(screen.getByText('server-1')).toBeInTheDocument();
  });

  it('does not render the query when rowHeight is 1', () => {
    const row = makeRow({ 'rule.id': 'r1' });
    render(
      <EpisodeRuleCell
        {...baseCellProps}
        columnId="rule.id"
        row={row}
        rulesCache={{ r1: makeRule('My Rule') }}
        isLoadingRules={false}
        rowHeight={1}
      />
    );
    expect(screen.getByText('My Rule')).toBeInTheDocument();
    expect(screen.queryByText('FROM My Rule')).not.toBeInTheDocument();
  });

  it('does not render grouping tags when rule has no grouping.fields', () => {
    const row = makeRow({ 'rule.id': 'r1' });
    render(
      <EpisodeRuleCell
        {...baseCellProps}
        columnId="rule.id"
        row={row}
        rulesCache={{ r1: makeRule('My Rule') }}
        isLoadingRules={false}
        rowHeight={2}
      />
    );
    expect(screen.queryByTestId('episodeRuleCellGroupingTags')).not.toBeInTheDocument();
  });

  it('does not render grouping tags when all grouping values are empty', () => {
    const row = makeRow({
      'rule.id': 'r1',
      episode_data: JSON.stringify({}),
    });
    render(
      <EpisodeRuleCell
        {...baseCellProps}
        columnId="rule.id"
        row={row}
        rulesCache={{ r1: makeRule('My Rule', { fields: ['host.name'] }) }}
        isLoadingRules={false}
        rowHeight={2}
      />
    );
    expect(screen.queryByTestId('episodeRuleCellGroupingTags')).not.toBeInTheDocument();
    expect(screen.getByText('FROM My Rule')).toBeInTheDocument();
  });
});
