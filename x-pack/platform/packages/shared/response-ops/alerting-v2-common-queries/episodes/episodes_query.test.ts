/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERT_ACTIONS_DATA_STREAM, ALERT_EVENTS_DATA_STREAM } from '@kbn/alerting-v2-constants';
import { PAGE_SIZE_ESQL_VARIABLE } from './constants';
import { buildEpisodesBaseQuery, buildEpisodesQuery } from './episodes_query';

const SPACE_ID = 'default';

describe('buildEpisodesBaseQuery', () => {
  it('should build query with correct structure', () => {
    const query = buildEpisodesBaseQuery(SPACE_ID);
    const queryString = query.print('basic');

    expect(queryString).toContain(`FROM ${ALERT_EVENTS_DATA_STREAM}`);
    expect(queryString).toContain('WHERE space_id == "default"');
    expect(queryString).toContain('METADATA');
    expect(queryString).toContain('_source');
    expect(queryString).toContain('type == "alert"');
    expect(queryString).toContain('INLINE STATS');
    expect(queryString).toContain('first_timestamp = MIN(@timestamp)');
    expect(queryString).toContain('last_timestamp = MAX(@timestamp)');
    expect(queryString).toContain('triggered_at = MIN(@timestamp) WHERE');
    expect(queryString).toContain('"active"');
    expect(queryString).toContain('episode_data');
    expect(queryString).toContain('extracted_data = JSON_EXTRACT(_source, "data")');
    expect(queryString).toContain(
      'episode_data = LAST(extracted_data, @timestamp) WHERE extracted_data != "{}"'
    );
    expect(queryString).toContain(
      'severity = LAST(severity, @timestamp) WHERE status == "breached" AND severity IS NOT NULL'
    );
    expect(queryString).toContain('BY episode.id');
    expect(queryString).toContain('EVAL duration = DATE_DIFF');
    expect(queryString).toContain('"ms"');
    expect(queryString).toContain('first_timestamp');
    expect(queryString).toContain('last_timestamp');
    expect(queryString).toContain('WHERE @timestamp == last_timestamp');
  });

  it('computes last_snooze_action and snooze_expiry grouped by group_hash', () => {
    const esql = buildEpisodesBaseQuery(SPACE_ID).print('basic');
    expect(esql).toMatch(
      /last_snooze_action\s*=\s*LAST\(action_type,\s*@timestamp\)\s*WHERE\s*\(action_type\s*IN\s*\("snooze",\s*"unsnooze"\)\)/
    );
    expect(esql).toMatch(
      /snooze_expiry\s*=\s*LAST\(expiry,\s*@timestamp\)\s*WHERE\s*action_type\s*==\s*"snooze"/
    );
  });

  it('applies the ruleId filter on both rule.id and rule_id before the aggregations', () => {
    const esql = buildEpisodesBaseQuery(SPACE_ID, { ruleId: 'rule-123' }).print('basic');

    expect(esql).toContain('WHERE rule.id == "rule-123" OR rule_id == "rule-123"');
    expect(esql.indexOf('WHERE rule.id ==')).toBeLessThan(esql.indexOf('INLINE STATS'));
  });

  it('applies the groupHash filter before the aggregations', () => {
    const esql = buildEpisodesBaseQuery(SPACE_ID, { groupHash: 'abc123' }).print('basic');

    expect(esql).toContain('WHERE group_hash == "abc123"');
    expect(esql.indexOf('WHERE group_hash ==')).toBeLessThan(esql.indexOf('INLINE STATS'));
  });

  it('unifies episode.id and episode_id before computing per-episode action stats', () => {
    const esql = buildEpisodesBaseQuery(SPACE_ID).print('basic');
    expect(esql).toMatch(/EVAL\s+episode_id\s*=\s*COALESCE\(`episode\.id`,\s*episode_id\)/);
    expect(esql).toMatch(
      /last_ack_action\s*=\s*LAST\(action_type,\s*@timestamp\)\s*WHERE\s*\(action_type\s*IN\s*\("ack",\s*"unack"\)\)/
    );
    expect(esql).toMatch(
      /last_assignee_uid\s*=\s*LAST\(assignee_uid,\s*@timestamp\)\s*WHERE\s*action_type\s*==\s*"assign"/
    );
    expect(esql).toMatch(/BY\s*episode_id/);
  });
});

describe('duration lower bound flag', () => {
  it('computes the start event and the first series event in the aggregations', () => {
    const queryString = buildEpisodesBaseQuery(SPACE_ID).print('basic');

    expect(queryString).toContain(
      'start_event_timestamp = MIN(@timestamp) WHERE `episode.status` == "pending" AND `episode.status_count` == 1'
    );
    expect(queryString).toContain(
      'first_series_event_timestamp = MIN(@timestamp) WHERE type == "alert"'
    );
  });

  it('flags episodes whose start was not seen, in the list query only', () => {
    const listQuery = buildEpisodesQuery(SPACE_ID).print('basic');
    const baseQuery = buildEpisodesBaseQuery(SPACE_ID).print('basic');

    expect(listQuery).toContain(
      'EVAL duration_is_lower_bound = ((start_event_timestamp IS NULL OR start_event_timestamp != first_timestamp) AND first_series_event_timestamp >= first_timestamp)'
    );
    expect(listQuery).toMatch(/KEEP .*duration_is_lower_bound/);
    expect(baseQuery).not.toContain('duration_is_lower_bound');
  });
});

describe('buildEpisodesQuery', () => {
  it('should join both data streams', () => {
    const query = buildEpisodesQuery(SPACE_ID);
    const queryString = query.print('basic');

    expect(queryString).toContain(`FROM ${ALERT_EVENTS_DATA_STREAM}`);
    expect(queryString).toContain(ALERT_ACTIONS_DATA_STREAM);
    expect(queryString).toContain('episode_data');
  });

  it('should build query with default sort', () => {
    const query = buildEpisodesQuery(SPACE_ID);
    const queryString = query.print('basic');

    expect(queryString).toContain('SORT @timestamp DESC');
    expect(queryString).toContain(`LIMIT ?${PAGE_SIZE_ESQL_VARIABLE}`);
  });

  it('should correctly sanitize and apply custom sort', () => {
    const query = buildEpisodesQuery(SPACE_ID, {
      sortField: 'episode.id',
      sortDirection: 'asc',
    });
    const queryString = query.print('basic');

    expect(queryString).toContain('episode.id');
    expect(queryString).toContain('SORT `episode.id` ASC');
  });

  it('should sanitize invalid sort fields to @timestamp', () => {
    const query = buildEpisodesQuery(SPACE_ID, {
      sortField: 'invalid.field',
      sortDirection: 'desc',
    });
    const queryString = query.print('basic');

    expect(queryString).toContain('SORT @timestamp DESC');
    expect(queryString).not.toContain('invalid.field');
  });

  it('should handle all allowlisted sort fields', () => {
    const allowlistedFields = ['@timestamp', 'episode.id', 'episode.status', 'rule.id', 'duration'];

    allowlistedFields.forEach((field) => {
      const query = buildEpisodesQuery(SPACE_ID, {
        sortField: field,
        sortDirection: 'asc',
      });
      const queryString = query.print('basic');

      expect(queryString).toMatch(new RegExp(`SORT \`?${field.replace('.', '\\.')}\`? ASC`));
    });
  });

  it('should sort by severity using numeric severity order', () => {
    const query = buildEpisodesQuery(SPACE_ID, {
      sortField: 'severity',
      sortDirection: 'desc',
    });
    const queryString = query.print('basic');

    expect(queryString).toContain('EVAL _severity_sort = CASE(');
    expect(queryString).toContain('severity == "critical", 4');
    expect(queryString).toContain('severity == "info", 0');
    expect(queryString).toContain(', -1)');
    expect(queryString).toContain('SORT _severity_sort DESC');
  });

  it('should filter on episode.status when a single status filter is set', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { status: ['active'] }
    );
    const queryString = query.print('basic');

    expect(queryString).toMatch(/\| WHERE `episode\.status` == "active"/);
  });

  it('should filter on episode.status with IN when multiple statuses are set', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { status: ['active', 'pending'] }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain('WHERE `episode.status` IN ("active", "pending")');
  });

  it('should not filter on episode.status when no status filter is set', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      {}
    );
    const queryString = query.print('basic');

    expect(queryString).not.toMatch(/\| WHERE `episode\.status` ==/);
  });

  it('should not filter on episode.status when the status array is empty', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { status: [] }
    );
    const queryString = query.print('basic');

    expect(queryString).not.toMatch(/\| WHERE `episode\.status` ==/);
    expect(queryString).not.toContain('`episode.status` IN');
  });

  it('should apply ruleId filter on both rule.id and rule_id before the aggregations', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { ruleId: 'rule-123' }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain('WHERE rule.id == "rule-123" OR rule_id == "rule-123"');
    expect(queryString.indexOf('WHERE rule.id ==')).toBeLessThan(
      queryString.indexOf('INLINE STATS')
    );
  });

  it('should apply groupHash filter before the aggregations', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { groupHash: 'abc123' }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain('WHERE group_hash == "abc123"');
    expect(queryString.indexOf('WHERE group_hash ==')).toBeLessThan(
      queryString.indexOf('INLINE STATS')
    );
  });

  it('should not apply groupHash filter when null', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { groupHash: null }
    );
    const queryString = query.print('basic');

    expect(queryString).not.toContain('WHERE group_hash ==');
  });

  it('should treat groupingValues as display-only and not add a clause', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      {
        groupHash: 'abc123',
        groupingValues: { 'host.name': 'web-01', 'service.name': 'checkout' },
      }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain('WHERE group_hash == "abc123"');
    expect(queryString).not.toContain('groupingValues');
    expect(queryString).not.toContain('host.name');
    expect(queryString).not.toContain('web-01');
  });

  it('should apply queryString filter with QSTR', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { queryString: 'alert.name: "test"' }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain('QSTR("alert.name: \\"test\\"")');
  });

  it('should apply multiple filters together', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      {
        queryString: 'alert.name: "test"',
        status: ['active'],
        ruleId: 'rule-123',
      }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain('QSTR("alert.name: \\"test\\"")');
    expect(queryString).toMatch(/\| WHERE `episode\.status` == "active"/);
    expect(queryString).toContain('WHERE rule.id == "rule-123" OR rule_id == "rule-123"');
  });

  it('should apply single tag filter with MV_CONTAINS', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { tags: ['prod'] }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain('MV_CONTAINS(last_tags, "prod")');
  });

  it('should apply multiple tags as OR of MV_CONTAINS', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { tags: ['a', 'b'] }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain('MV_CONTAINS(last_tags, "a")');
    expect(queryString).toContain('OR');
    expect(queryString).toContain('MV_CONTAINS(last_tags, "b")');
  });

  it('should ignore empty tag strings when filtering', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { tags: ['  ', ''] }
    );
    const queryString = query.print('basic');

    expect(queryString).not.toContain('MV_CONTAINS(last_tags');
  });

  it('should apply single severity filter', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { severity: ['high'] }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain('WHERE severity IN ("high")');
  });

  it('should apply multiple severities with IN', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { severity: ['high', 'critical'] }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain('WHERE severity IN ("high", "critical")');
  });

  it('should apply no-severity filter with severity IS NULL', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { severity: ['__no_severity__'] }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain('WHERE severity IS NULL');
  });

  it('should apply mixed severity and no-severity filters as OR', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { severity: ['high', '__no_severity__'] }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain('WHERE (severity IN ("high")) OR severity IS NULL');
  });

  it('should trim queryString before applying', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { queryString: '  alert.name: "test"  ' }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain('QSTR("alert.name: \\"test\\"")');
  });

  it('should not apply filters when they are null or undefined', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      {
        queryString: null,
        status: null,
        ruleId: undefined,
        groupHash: null,
        tags: null,
        severity: null,
      }
    );
    const queryString = query.print('basic');

    expect(queryString).not.toContain('QSTR');
    expect(queryString).not.toMatch(/\| WHERE `episode\.status` ==/);
    expect(queryString).not.toContain('WHERE rule.id ==');
    expect(queryString).not.toContain('WHERE group_hash ==');
    expect(queryString).not.toContain('MV_CONTAINS(last_tags');
  });

  it('should not apply queryString filter when it is empty or whitespace', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { queryString: '   ' }
    );
    const queryString = query.print('basic');

    expect(queryString).not.toContain('QSTR');
  });

  it('should apply assigneeUid filter with per-episode INLINE STATS', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { assigneeUid: 'user-123' }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain(
      'action_type IN ("snooze", "unsnooze", "tag", "ack", "unack", "assign")'
    );

    expect(queryString).toContain('EVAL episode_id = COALESCE(`episode.id`, episode_id)');
    expect(queryString).toContain(
      'last_assignee_uid = LAST(assignee_uid, @timestamp) WHERE action_type == "assign"'
    );
    expect(queryString).toContain('BY episode_id');
    expect(queryString).toContain('WHERE last_assignee_uid == "user-123"');
  });

  it('should always include assign actions and assignee INLINE STATS regardless of filter', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      {}
    );
    const queryString = query.print('basic');

    expect(queryString).toContain(
      'action_type IN ("snooze", "unsnooze", "tag", "ack", "unack", "assign")'
    );
    expect(queryString).toContain('EVAL episode_id = COALESCE(`episode.id`, episode_id)');
    expect(queryString).toContain('last_assignee_uid');
    expect(queryString).not.toContain('WHERE last_assignee_uid');
  });

  it('should combine assigneeUid with other filters', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { assigneeUid: 'user-123', status: ['active'], ruleId: 'rule-456' }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain('WHERE last_assignee_uid == "user-123"');
    expect(queryString).toMatch(/\| WHERE `episode\.status` == "active"/);
    expect(queryString).toContain('WHERE rule.id == "rule-456" OR rule_id == "rule-456"');
  });

  it('should apply queryString with assigneeUid filter', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { assigneeUid: 'user-123', queryString: 'alert.name: "test"' }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain('QSTR("alert.name: \\"test\\"")');
    expect(queryString).toContain('WHERE last_assignee_uid == "user-123"');
  });
});
