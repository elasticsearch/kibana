/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  buildEpisodesBaseQuery,
  buildEpisodesKpisQuery,
  buildEpisodesHistogramQuery,
  buildEpisodesQuery,
} from './episodes_query';
import {
  PAGE_SIZE_ESQL_VARIABLE,
  ALERT_EVENTS_DATA_STREAM,
  ALERT_ACTIONS_DATA_STREAM,
} from '../constants';

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
});

describe('buildEpisodesQuery', () => {
  it('should join both data streams', () => {
    const query = buildEpisodesQuery(SPACE_ID);
    const queryString = query.print('basic');

    expect(queryString).toContain(`FROM ${ALERT_EVENTS_DATA_STREAM}`);
    expect(queryString).toContain(ALERT_ACTIONS_DATA_STREAM);
    expect(queryString).toContain('episode_data');
  });

  it('should compute effective_status from deactivation actions', () => {
    const query = buildEpisodesQuery(SPACE_ID);
    const queryString = query.print('basic');

    expect(queryString).toContain(
      'last_deactivate_action = LAST(action_type, @timestamp) WHERE (action_type IN ("deactivate", "activate"))'
    );
    expect(queryString).toContain('last_tags = LAST(tags, @timestamp) WHERE action_type == "tag"');
    expect(queryString).toContain('BY group_hash');
    expect(queryString).toContain('EVAL effective_status = CASE');
    expect(queryString).toContain('last_deactivate_action == "deactivate"');
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

  it('should filter on effective_status when status filter is set', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { status: 'active' }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain('WHERE effective_status == "active"');
  });

  it('should not filter on effective_status when no status filter is set', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      {}
    );
    const queryString = query.print('basic');

    expect(queryString).not.toContain('WHERE effective_status ==');
  });

  it('should apply ruleId filter', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { ruleId: 'rule-123' }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain('WHERE rule.id == "rule-123"');
  });

  it('should apply groupHash filter', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { groupHash: 'abc123' }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain('WHERE group_hash == "abc123"');
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
        status: 'active',
        ruleId: 'rule-123',
      }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain('QSTR("alert.name: \\"test\\"")');
    expect(queryString).toContain('WHERE effective_status == "active"');
    expect(queryString).toContain('WHERE rule.id == "rule-123"');
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
      { queryString: null, status: null, ruleId: undefined, groupHash: null, tags: null }
    );
    const queryString = query.print('basic');

    expect(queryString).not.toContain('QSTR');
    expect(queryString).not.toContain('WHERE effective_status ==');
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
      'action_type IN ("deactivate", "activate", "snooze", "unsnooze", "tag", "ack", "unack", "assign")'
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
      'action_type IN ("deactivate", "activate", "snooze", "unsnooze", "tag", "ack", "unack", "assign")'
    );
    expect(queryString).toContain('EVAL episode_id = COALESCE(`episode.id`, episode_id)');
    expect(queryString).toContain('last_assignee_uid');
    expect(queryString).not.toContain('WHERE last_assignee_uid');
  });

  it('should combine assigneeUid with other filters', () => {
    const query = buildEpisodesQuery(
      SPACE_ID,
      { sortField: '@timestamp', sortDirection: 'desc' },
      { assigneeUid: 'user-123', status: 'active', ruleId: 'rule-456' }
    );
    const queryString = query.print('basic');

    expect(queryString).toContain('WHERE last_assignee_uid == "user-123"');
    expect(queryString).toContain('WHERE effective_status == "active"');
    expect(queryString).toContain('WHERE rule.id == "rule-456"');
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

describe('buildEpisodesKpisQuery', () => {
  const SPACE = 'default';
  const UID = 'user-abc-123';

  it('produces a STATS command with all six KPI aggregations', () => {
    const output = buildEpisodesKpisQuery(SPACE, UID);
    expect(output).toContain('STATS');
    expect(output).toContain('alerts_count');
    expect(output).toContain('firing_rules');
    expect(output).toContain('assigned_to_me');
    expect(output).toContain('unassigned');
    expect(output).toContain('acknowledged');
    expect(output).toContain('snoozed');
  });

  it('uses COUNT(*) for alerts_count to capture all matching episodes', () => {
    const output = buildEpisodesKpisQuery(SPACE, UID);
    expect(output).toMatch(/alerts_count\s*=\s*COUNT\(\*\)/);
  });

  it('uses COUNT_DISTINCT over a nullable rule.id column for firing_rules', () => {
    const output = buildEpisodesKpisQuery(SPACE, UID);
    expect(output).toMatch(/COUNT_DISTINCT\(_active_rule_id\)/);
  });

  it('embeds the currentUserUid in the assigned_to_me EVAL', () => {
    const output = buildEpisodesKpisQuery(SPACE, UID);
    expect(output).toContain(UID);
    expect(output).toMatch(/SUM\(_assigned_to_me\)/);
  });

  it('sets assigned_to_me to a constant 0 when no currentUserUid is provided', () => {
    const output = buildEpisodesKpisQuery(SPACE, undefined);
    expect(output).toContain('EVAL _assigned_to_me = 0');
    expect(output).not.toContain('last_assignee_uid ==');
    expect(output).toMatch(/SUM\(_assigned_to_me\)/);
  });

  it('uses IS NULL check for unassigned', () => {
    const output = buildEpisodesKpisQuery(SPACE, UID);
    expect(output).toContain('last_assignee_uid IS NULL');
  });

  it('checks last_ack_action for acknowledged', () => {
    const output = buildEpisodesKpisQuery(SPACE, UID);
    expect(output).toContain('last_ack_action == "ack"');
  });

  it('counts indefinitely snoozed episodes (snooze_expiry IS NULL) as snoozed', () => {
    const output = buildEpisodesKpisQuery(SPACE, UID);
    expect(output).toContain('last_snooze_action == "snooze"');
    expect(output).toContain('snooze_expiry IS NULL');
  });

  it('excludes expired snoozes (snooze_expiry in the past) from the snoozed count', () => {
    const output = buildEpisodesKpisQuery(SPACE, UID);
    expect(output).toContain('TO_DATETIME(snooze_expiry) > NOW()');
  });

  it('applies queryString filter when provided', () => {
    const output = buildEpisodesKpisQuery(SPACE, UID, { queryString: 'alert.name: "cpu"' });
    expect(output).toContain('QSTR(');
  });

  it('does not include SORT or LIMIT', () => {
    const output = buildEpisodesKpisQuery(SPACE, UID);
    expect(output.toUpperCase()).not.toContain('SORT');
    expect(output.toUpperCase()).not.toContain('LIMIT');
  });

  it('applies status filter when provided', () => {
    const output = buildEpisodesKpisQuery(SPACE, UID, { status: 'active' });
    expect(output).toContain('WHERE effective_status == "active"');
  });

  it('applies ruleId filter when provided', () => {
    const output = buildEpisodesKpisQuery(SPACE, UID, { ruleId: 'rule-xyz' });
    expect(output).toContain('WHERE rule.id == "rule-xyz"');
  });
});

describe('buildEpisodesHistogramQuery', () => {
  it('includes first_timestamp, last_timestamp, and episode.status in KEEP', () => {
    const output = buildEpisodesHistogramQuery('default').print('basic');
    expect(output).toMatch(/first_timestamp/);
    expect(output).toMatch(/last_timestamp/);
    expect(output).toMatch(/episode\.status/);
  });

  it('includes LIMIT 10000', () => {
    const output = buildEpisodesHistogramQuery('default').print('basic');
    expect(output).toContain('10000');
  });

  it('does not include a SORT command', () => {
    const output = buildEpisodesHistogramQuery('default').print('basic');
    expect(output.toUpperCase()).not.toContain('SORT');
  });

  it('includes the breakdown field in the output when provided', () => {
    const output = buildEpisodesHistogramQuery('default', undefined, 'rule.id').print('basic');
    expect(output).toMatch(/rule\.id/);
  });

  it('includes the status filter when filterState.status is provided', () => {
    const output = buildEpisodesHistogramQuery('default', { status: 'active' }).print('basic');
    expect(output).toMatch(/effective_status/);
    expect(output).toContain('active');
  });

  it('includes the ruleId filter when filterState.ruleId is provided', () => {
    const output = buildEpisodesHistogramQuery('default', { ruleId: 'rule-abc' }).print('basic');
    expect(output).toContain('rule-abc');
  });

  it('includes the tags filter when filterState.tags is provided', () => {
    const output = buildEpisodesHistogramQuery('default', { tags: ['critical', 'prod'] }).print(
      'basic'
    );
    expect(output).toMatch(/critical/);
    expect(output).toMatch(/prod/);
  });

  it('includes the assigneeUid filter when filterState.assigneeUid is provided', () => {
    const output = buildEpisodesHistogramQuery('default', { assigneeUid: 'user-xyz' }).print(
      'basic'
    );
    expect(output).toContain('user-xyz');
  });
});

describe('buildEpisodesBaseQuery — action state stats', () => {
  it('computes last_snooze_action and snooze_expiry grouped by group_hash', () => {
    const esql = buildEpisodesBaseQuery(SPACE_ID).print('basic');
    expect(esql).toMatch(
      /last_snooze_action\s*=\s*LAST\(action_type,\s*@timestamp\)\s*WHERE\s*\(action_type\s*IN\s*\("snooze",\s*"unsnooze"\)\)/
    );
    expect(esql).toMatch(
      /snooze_expiry\s*=\s*LAST\(expiry,\s*@timestamp\)\s*WHERE\s*action_type\s*==\s*"snooze"/
    );
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
