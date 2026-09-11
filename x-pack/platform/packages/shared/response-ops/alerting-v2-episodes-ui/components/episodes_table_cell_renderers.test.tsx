/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@kbn/i18n-react';
import type { FindRulesResponse } from '@kbn/alerting-v2-schemas';
import {
  EpisodeDurationCell,
  EpisodeStatusCell,
  EpisodeTagsCell,
  EpisodeRuleCell,
  EpisodeRuleTagsCell,
  EpisodeSeverityCell,
} from './episodes_table_cell_renderers';

const renderWithI18n = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

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

describe('EpisodeStatusCell', () => {
  it('renders the status label plus snooze + ack indicators when the row carries those action fields', () => {
    const row = makeRow({
      'episode.status': 'active',
      'episode.id': 'ep1',
      'rule.id': 'r1',
      group_hash: 'gh1',
      last_ack_action: 'ack',
      last_snooze_action: 'snooze',
      snooze_expiry: '3035-01-01T00:00:00Z',
    });
    renderWithI18n(<EpisodeStatusCell {...baseCellProps} columnId="episode.status" row={row} />);

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByTestId('alertEpisodeStatusCellSnoozeIndicator')).toBeInTheDocument();
    expect(screen.getByTestId('alertEpisodeStatusCellAckIndicator')).toBeInTheDocument();
  });

  it('renders only the status label when the row has no action fields', () => {
    const row = makeRow({
      'episode.status': 'active',
      'episode.id': 'ep1',
      'rule.id': 'r1',
      group_hash: 'gh1',
    });
    renderWithI18n(<EpisodeStatusCell {...baseCellProps} columnId="episode.status" row={row} />);

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.queryByTestId('alertEpisodeStatusCellSnoozeIndicator')).not.toBeInTheDocument();
    expect(screen.queryByTestId('alertEpisodeStatusCellAckIndicator')).not.toBeInTheDocument();
  });
});

describe('EpisodeDurationCell', () => {
  const mockDataView = {
    getFieldByName: jest.fn().mockReturnValue({ name: 'duration' }),
    getFormatterForField: jest
      .fn()
      .mockReturnValue({ convertToText: (value: number) => `${value} ms` }),
  } as never;
  const durationCellProps = { ...baseCellProps, columnId: 'duration', dataView: mockDataView };

  it('renders the formatted duration when the episode start was seen', () => {
    renderWithI18n(
      <EpisodeDurationCell
        {...durationCellProps}
        row={makeRow({ duration: 840000, duration_is_lower_bound: false })}
      />
    );

    expect(screen.getByText('840000 ms')).toBeInTheDocument();
    expect(screen.queryByTestId('episodeDurationLowerBound')).not.toBeInTheDocument();
  });

  it('marks the duration as a lower bound when the episode started before the time range', () => {
    renderWithI18n(
      <EpisodeDurationCell
        {...durationCellProps}
        row={makeRow({ duration: 840000, duration_is_lower_bound: true })}
      />
    );

    expect(screen.getByTestId('episodeDurationLowerBound')).toHaveTextContent('≥ 840000 ms');
  });

  it('renders an empty value when the row has no duration', () => {
    renderWithI18n(<EpisodeDurationCell {...durationCellProps} row={makeRow({})} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('EpisodeTagsCell', () => {
  it('renders a badge for each tag in the row last_tags field', () => {
    const row = makeRow({ group_hash: 'gh3', last_tags: ['foo', 'bar'] });
    renderWithI18n(<EpisodeTagsCell {...baseCellProps} row={row} />);

    expect(screen.getByText('foo')).toBeInTheDocument();
    expect(screen.getByText('bar')).toBeInTheDocument();
  });

  it('renders an empty value when the row has no tags', () => {
    const row = makeRow({ group_hash: 'gh3', last_tags: [] });
    renderWithI18n(<EpisodeTagsCell {...baseCellProps} row={row} />);

    expect(screen.getByTestId('episodeTagsCell')).toHaveTextContent('—');
  });

  it('renders an empty value when the row has no last_tags field at all', () => {
    const row = makeRow({ group_hash: 'gh3' });
    renderWithI18n(<EpisodeTagsCell {...baseCellProps} row={row} />);

    expect(screen.getByTestId('episodeTagsCell')).toHaveTextContent('—');
  });
});

describe('EpisodeRuleTagsCell', () => {
  const makeRuleWithTags = (tags?: string[]): Rule =>
    ({ metadata: { name: 'rule name', ...(tags ? { tags } : {}) } } as unknown as Rule);

  const ruleTagsCellProps = { ...baseCellProps, columnId: 'rule_tags' };

  it('renders a badge for each tag of the row rule', () => {
    const row = makeRow({ 'rule.id': 'r1' });
    renderWithI18n(
      <EpisodeRuleTagsCell
        {...ruleTagsCellProps}
        row={row}
        rulesCache={{ r1: makeRuleWithTags(['production', 'cpu']) }}
        isLoadingRules={false}
      />
    );

    expect(screen.getByText('production')).toBeInTheDocument();
    expect(screen.getByText('cpu')).toBeInTheDocument();
  });

  it('renders an empty value when the rule has no tags', () => {
    const row = makeRow({ 'rule.id': 'r1' });
    renderWithI18n(
      <EpisodeRuleTagsCell
        {...ruleTagsCellProps}
        row={row}
        rulesCache={{ r1: makeRuleWithTags() }}
        isLoadingRules={false}
      />
    );

    expect(screen.getByTestId('episodeRuleTagsCell')).toHaveTextContent('—');
  });

  it('renders an empty value when the rule is not available', () => {
    const row = makeRow({ 'rule.id': 'deleted-rule' });
    renderWithI18n(
      <EpisodeRuleTagsCell
        {...ruleTagsCellProps}
        row={row}
        rulesCache={{}}
        isLoadingRules={false}
      />
    );

    expect(screen.getByTestId('episodeRuleTagsCell')).toHaveTextContent('—');
  });

  it('renders an empty value when the row has no rule id, without waiting for the rules fetch', () => {
    const row = makeRow({ 'episode.id': 'ep1' });
    renderWithI18n(
      <EpisodeRuleTagsCell {...ruleTagsCellProps} row={row} rulesCache={{}} isLoadingRules />
    );

    expect(screen.getByTestId('episodeRuleTagsCell')).toHaveTextContent('—');
  });

  it('renders a skeleton while the row rule is still loading', () => {
    const row = makeRow({ 'rule.id': 'r1' });
    renderWithI18n(
      <EpisodeRuleTagsCell {...ruleTagsCellProps} row={row} rulesCache={{}} isLoadingRules />
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByTestId('episodeRuleTagsCell')).not.toBeInTheDocument();
  });

  it('does not read the episode tags of the row', () => {
    const row = makeRow({ 'rule.id': 'r1', last_tags: ['episode-only-tag'] });
    renderWithI18n(
      <EpisodeRuleTagsCell
        {...ruleTagsCellProps}
        row={row}
        rulesCache={{ r1: makeRuleWithTags(['production']) }}
        isLoadingRules={false}
      />
    );

    expect(screen.getByText('production')).toBeInTheDocument();
    expect(screen.queryByText('episode-only-tag')).not.toBeInTheDocument();
  });
});

describe('EpisodeSeverityCell', () => {
  it('renders the severity badge for the row severity field', () => {
    const row = makeRow({ severity: 'high' });
    renderWithI18n(<EpisodeSeverityCell {...baseCellProps} row={row} />);

    expect(screen.getByTestId('alertingV2EpisodeSeverityBadge-high')).toHaveTextContent('High');
  });
});

describe('EpisodeRuleCell', () => {
  const makeRule = (name: string, grouping?: { fields: string[] }): Rule =>
    ({
      metadata: { name },
      query: { format: 'standalone', breach: { query: `FROM ${name}` } },
      ...(grouping ? { grouping } : {}),
    } as unknown as Rule);

  const getRuleDetailsHref = (ruleId: string) => `/app/alerting/rules/${ruleId}`;

  const ruleCellProps = {
    ...baseCellProps,
    columnId: 'rule.id',
    getRuleDetailsHref,
  };

  it('renders a skeleton when rules are loading and cache is empty', () => {
    const row = makeRow({ 'rule.id': 'r1' });
    render(
      <EpisodeRuleCell {...ruleCellProps} row={row} rulesCache={{}} isLoadingRules rowHeight={2} />
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders the rule name as a link to the rule details page when the rule is in cache', () => {
    const row = makeRow({ 'rule.id': 'r1' });
    render(
      <EpisodeRuleCell
        {...ruleCellProps}
        row={row}
        rulesCache={{ r1: makeRule('My Rule') }}
        isLoadingRules={false}
        rowHeight={2}
      />
    );
    const link = screen.getByTestId('episodeRuleCellNameLink');
    expect(link).toHaveTextContent('My Rule');
    expect(link).toHaveAttribute('href', '/app/alerting/rules/r1');
  });

  describe('with onRuleNameClick', () => {
    const mockOnRuleNameClick = jest.fn();

    const renderRuleNameLink = () => {
      render(
        <EpisodeRuleCell
          {...ruleCellProps}
          row={makeRow({ 'rule.id': 'r1' })}
          rulesCache={{ r1: makeRule('My Rule') }}
          isLoadingRules={false}
          rowHeight={2}
          onRuleNameClick={mockOnRuleNameClick}
        />
      );
      return screen.getByTestId('episodeRuleCellNameLink');
    };

    beforeEach(() => {
      mockOnRuleNameClick.mockClear();
    });

    it('keeps the rule details page href on the link', () => {
      expect(renderRuleNameLink()).toHaveAttribute('href', '/app/alerting/rules/r1');
    });

    it('calls back with the rule id and prevents navigation on a plain click', () => {
      // fireEvent returns false when the handler called preventDefault
      expect(fireEvent.click(renderRuleNameLink())).toBe(false);
      expect(mockOnRuleNameClick).toHaveBeenCalledWith('r1');
    });

    it('lets a modified click follow the link', () => {
      expect(fireEvent.click(renderRuleNameLink(), { metaKey: true })).toBe(true);
      expect(mockOnRuleNameClick).not.toHaveBeenCalled();
    });

    it('lets a middle click follow the link', () => {
      expect(fireEvent.click(renderRuleNameLink(), { button: 1 })).toBe(true);
      expect(mockOnRuleNameClick).not.toHaveBeenCalled();
    });
  });

  it('renders data.rule_name without a link when the rule SO is missing', () => {
    const row = makeRow({
      'rule.id': 'prometheus/HighCPU',
      'rule.name': 'Prometheus HighCPU',
      episode_data: JSON.stringify({ rule_name: 'High CPU on web-01' }),
    });
    render(
      <EpisodeRuleCell
        {...ruleCellProps}
        row={row}
        rulesCache={{}}
        isLoadingRules={false}
        rowHeight={2}
      />
    );
    expect(screen.getByText('High CPU on web-01')).toBeInTheDocument();
    expect(screen.queryByTestId('episodeRuleCellNameLink')).not.toBeInTheDocument();
  });

  it('falls back to the event rule.name when the rule SO and data.rule_name are missing', () => {
    const row = makeRow({
      'rule.id': 'prometheus/HighCPU',
      'rule.name': 'Prometheus HighCPU',
      episode_data: JSON.stringify({}),
    });
    render(
      <EpisodeRuleCell
        {...ruleCellProps}
        row={row}
        rulesCache={{}}
        isLoadingRules={false}
        rowHeight={2}
      />
    );
    expect(screen.getByText('Prometheus HighCPU')).toBeInTheDocument();
    expect(screen.queryByTestId('episodeRuleCellNameLink')).not.toBeInTheDocument();
  });

  it('renders a shortened rule id with no link when the rule and every name are missing', () => {
    const row = makeRow({ 'rule.id': 'deleted-rule-1234567890' });
    render(
      <EpisodeRuleCell
        {...ruleCellProps}
        row={row}
        rulesCache={{}}
        isLoadingRules={false}
        rowHeight={2}
      />
    );
    const missingRule = screen.getByTestId('episodeRuleCellMissingRule');
    expect(missingRule).toHaveTextContent('Unavailable rule');
    expect(missingRule.querySelector('code')).toHaveTextContent('deleted');
    expect(screen.queryByTestId('episodeRuleCellNameLink')).not.toBeInTheDocument();
  });

  it('copies the full rule id when the unavailable rule label is clicked', async () => {
    const user = userEvent.setup();
    const mockExecCommand = jest.fn().mockReturnValue(true);
    document.execCommand = mockExecCommand;
    const row = makeRow({ 'rule.id': 'deleted-rule-1234567890' });
    render(
      <EpisodeRuleCell
        {...ruleCellProps}
        row={row}
        rulesCache={{}}
        isLoadingRules={false}
        rowHeight={2}
      />
    );

    await user.click(screen.getByTestId('episodeRuleCellCopyRuleId'));

    expect(mockExecCommand).toHaveBeenCalledWith('copy');
    // Rendered twice: the tooltip and the screen reader live region.
    expect(await screen.findAllByText('Rule ID copied')).not.toHaveLength(0);
  });

  it('renders an em dash when rule SO, rule.id, rule.name and data.rule_name are all absent', () => {
    const row = makeRow({ episode_data: JSON.stringify({}) });
    render(
      <EpisodeRuleCell
        {...ruleCellProps}
        row={row}
        rulesCache={{}}
        isLoadingRules={false}
        rowHeight={1}
      />
    );
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByTestId('episodeRuleCellMissingRule')).not.toBeInTheDocument();
  });

  it('renders the breach query below the rule name when rowHeight > 1', () => {
    const row = makeRow({ 'rule.id': 'r1' });
    render(
      <EpisodeRuleCell
        {...ruleCellProps}
        row={row}
        rulesCache={{ r1: makeRule('My Rule') }}
        isLoadingRules={false}
        rowHeight={2}
      />
    );
    expect(screen.getByTestId('episodeRuleCellBreachQuery')).toHaveTextContent('FROM My Rule');
  });

  it('renders the breach query when the row height is auto', () => {
    const row = makeRow({ 'rule.id': 'r1' });
    render(
      <EpisodeRuleCell
        {...ruleCellProps}
        row={row}
        rulesCache={{ r1: makeRule('My Rule') }}
        isLoadingRules={false}
        rowHeight={-1}
      />
    );
    expect(screen.getByTestId('episodeRuleCellBreachQuery')).toBeInTheDocument();
  });

  it('does not render the query when rowHeight is 1', () => {
    const row = makeRow({ 'rule.id': 'r1' });
    render(
      <EpisodeRuleCell
        {...ruleCellProps}
        row={row}
        rulesCache={{ r1: makeRule('My Rule') }}
        isLoadingRules={false}
        rowHeight={1}
      />
    );
    expect(screen.getByTestId('episodeRuleCellNameLink')).toHaveTextContent('My Rule');
    expect(screen.queryByTestId('episodeRuleCellBreachQuery')).not.toBeInTheDocument();
  });

  it('renders grouping value tags inline after the rule name', () => {
    const row = makeRow({
      'rule.id': 'r1',
      episode_data: JSON.stringify({ host: { name: 'server-1' } }),
    });
    render(
      <EpisodeRuleCell
        {...ruleCellProps}
        row={row}
        rulesCache={{ r1: makeRule('My Rule', { fields: ['host.name'] }) }}
        isLoadingRules={false}
        rowHeight={2}
      />
    );
    const tags = screen.getByTestId('episodeRuleCellGroupingTags');
    expect(screen.getByLabelText('host.name: server-1')).toBeInTheDocument();
    expect(screen.getByText('server-1')).toBeInTheDocument();
    // The grid clamps the cell to a line count, which only works on inline content.
    expect(tags.tagName).toBe('SPAN');
  });

  it('does not render grouping tags when rule has no grouping.fields', () => {
    const row = makeRow({ 'rule.id': 'r1' });
    render(
      <EpisodeRuleCell
        {...ruleCellProps}
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
        {...ruleCellProps}
        row={row}
        rulesCache={{ r1: makeRule('My Rule', { fields: ['host.name'] }) }}
        isLoadingRules={false}
        rowHeight={2}
      />
    );
    expect(screen.queryByTestId('episodeRuleCellGroupingTags')).not.toBeInTheDocument();
    expect(screen.getByTestId('episodeRuleCellBreachQuery')).toHaveTextContent('FROM My Rule');
  });

  it('renders classic rule via rules cache when resolved by classic fallback', () => {
    const row = makeRow({
      'rule.id': 'v1-rule-id',
      supports_actions: false,
      supports_timeline: false,
    });
    render(
      <EpisodeRuleCell
        {...ruleCellProps}
        row={row}
        rulesCache={{ 'v1-rule-id': makeRule('Classic CPU Rule') }}
        isLoadingRules={false}
        rowHeight={1}
      />
    );
    expect(screen.getByText('Classic CPU Rule')).toBeInTheDocument();
  });

  it('renders classic rule name without query when rowHeight > 1 and rule has no query', () => {
    const v1Rule = {
      metadata: { name: 'Classic CPU Rule' },
    } as unknown as Rule;
    const row = makeRow({
      'rule.id': 'v1-rule-id',
      supports_actions: false,
      supports_timeline: false,
    });
    render(
      <EpisodeRuleCell
        {...ruleCellProps}
        row={row}
        rulesCache={{ 'v1-rule-id': v1Rule }}
        isLoadingRules={false}
        rowHeight={2}
      />
    );
    expect(screen.getByText('Classic CPU Rule')).toBeInTheDocument();
    expect(screen.queryByRole('code')).not.toBeInTheDocument();
  });
});
