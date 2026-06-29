/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const INBOX_FEATURE_ID = 'inbox' as const;
export const INBOX_PLUGIN_NAME = 'Inbox' as const;

export const INBOX_INTERNAL_URL = '/internal/inbox' as const;
export const INBOX_ACTIONS_URL = `${INBOX_INTERNAL_URL}/actions` as const;
export const INBOX_ACTIONS_HISTORY_URL = `${INBOX_ACTIONS_URL}/history` as const;
export const INBOX_ACTIONS_HISTORY_FACETS_URL = `${INBOX_ACTIONS_HISTORY_URL}/facets` as const;

/**
 * Parameterized template for the respond-to-action route. Use
 * `buildRespondToActionUrl(sourceApp, sourceId)` to construct a concrete URL.
 */
export const INBOX_ACTION_RESPOND_URL_TEMPLATE =
  `${INBOX_ACTIONS_URL}/{source_app}/{source_id}/respond` as const;

export const buildRespondToActionUrl = (sourceApp: string, sourceId: string) =>
  `${INBOX_ACTIONS_URL}/${encodeURIComponent(sourceApp)}/${encodeURIComponent(sourceId)}/respond`;

/**
 * Well-known surfaces through which a response can be submitted. Aligns
 * with the HITL GA epic's channel tracking
 * ([security-team#16709](https://github.com/elastic/security-team/issues/16709))
 * and the channel extensibility plan
 * ([security-team#16712](https://github.com/elastic/security-team/issues/16712)).
 *
 * The respond route accepts any slug-shaped string for `channel`
 * (lowercase + digits + `_-`, max 64 chars) — these are just the
 * core-surface identifiers Kibana itself ships first-class UI/audit
 * affordances for. Other clients (MCP apps, external bots, custom
 * automations) should pass their own stable identifier (e.g.
 * `example-mcp-app-security`) so the audit feed can attribute them
 * accurately without needing a Kibana code change per integration.
 */
export const INBOX_CHANNELS = {
  inbox: 'inbox',
  kibanaExecutionView: 'kibana_execution_view',
  agentBuilder: 'agent_builder',
  slack: 'slack',
} as const;

/**
 * Channel field on inbox actions. The well-known core values from
 * {@link INBOX_CHANNELS} are kept as a literal-union for autocomplete
 * and exhaustiveness checks at call sites that only deal with those
 * surfaces, and unioned with `string & {}` so external clients can
 * still supply their own slug (e.g. `'example-mcp-app-security'`)
 * without TypeScript widening the literal away.
 */
export type InboxChannel = (typeof INBOX_CHANNELS)[keyof typeof INBOX_CHANNELS] | (string & {});

export const INBOX_RESPONSE_MODES = ['pending', 'responded', 'timed_out'] as const;
export type InboxResponseMode = (typeof INBOX_RESPONSE_MODES)[number];

export const API_VERSIONS = {
  internal: {
    v1: '1',
  },
} as const;

export const INTERNAL_API_ACCESS = 'internal' as const;

export const INBOX_ACTION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type InboxActionStatus = (typeof INBOX_ACTION_STATUSES)[number];

export const MAX_INBOX_ACTIONS_PER_PAGE = 100;
export const DEFAULT_INBOX_ACTIONS_PER_PAGE = 25;
