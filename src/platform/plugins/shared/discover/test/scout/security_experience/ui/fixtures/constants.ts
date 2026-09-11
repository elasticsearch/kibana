/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Constants for the Security-in-Discover experience tests.
 *
 * These tests exercise the Security Solution context-awareness profile that enhances Discover's
 * document viewer flyout for security documents (alert / event / attack / IOC). The profile only activates
 * under the `security` space solution view; document type is detected purely from fields
 * (`event.kind === 'signal'` → alert, the Attack Discovery rule type → attack, `event.kind`
 * present & ≠ signal → event, `event.type` includes `indicator` → IOC), so plain synthetic indices
 * are sufficient.
 */

/** Synthetic ES indices created in global setup (see ./generators). */
export const SECURITY_INDICES = {
  ALERTS: '.alerts-security.alerts-discover',
  EVENTS: 'endgame-discover-events',
  ATTACKS: '.alerts-security.attack.discovery.alerts-discover',
  IOCS: '.siem-signals-discover-iocs',
} as const;

/**
 * Data view titles/names imported via the kbn archive. The title doubles as the lookup key for
 * `scoutSpace.uiSettings.setDefaultIndex` and the display name matched by `discover.selectDataView`.
 */
export const SECURITY_DATA_VIEWS = {
  ALERTS: `${SECURITY_INDICES.ALERTS}*`,
  EVENTS: `${SECURITY_INDICES.EVENTS}*`,
  ATTACKS: `${SECURITY_INDICES.ATTACKS}*`,
  IOCS: `${SECURITY_INDICES.IOCS}*`,
} as const;

/** Saved search (Discover session) used by the dashboard-embedded test. */
export const SECURITY_SAVED_SEARCH_TITLE = 'Security Discover alerts saved search';

/**
 * Saved search used by the cell-renderer tests. Its explicit `columns` (rule name, source IP, host,
 * user) keep the rendered grid deterministic.
 */
export const SECURITY_CELL_RENDERER_SAVED_SEARCH = 'Security Discover cell renderers';

/** Wide window covering the fixed synthetic document timestamps. */
export const SECURITY_TIME_RANGE = {
  from: '2025-01-01T00:00:00.000Z',
  to: '2025-12-31T23:59:59.999Z',
} as const;

/**
 * Force a viewport at/above EUI's `xl` breakpoint (1200px). Discover's doc viewer flyout — which the
 * security profile enhances — is a push flyout with `pushMinBreakpoint="xl"`, so it only renders in
 * push mode (taking space beside Discover, as it does for users) on wide screens. Below `xl` it falls
 * back to an overlay. Apply via `spaceTest.use({ viewport: PUSH_FLYOUT_VIEWPORT })`.
 */
export const PUSH_FLYOUT_VIEWPORT = { width: 1920, height: 1080 } as const;

/**
 * Path to the saved-objects (data views + saved searches) archive, relative to the repo root.
 *
 * The Scout loader (`scoutSpace.savedObjects.load` → `parseArchive`) splits this file on BLANK LINES
 * and `JSON.parse`s each chunk, so the objects must stay separated by blank lines (not the strict
 * one-object-per-line `.ndjson` form). The `.ndjson` extension is used so editors don't try to
 * validate the multi-object file as a single JSON document.
 */
export const SECURITY_KBN_ARCHIVE =
  'src/platform/plugins/shared/discover/test/scout/security_experience/ui/fixtures/kbn_archives/security_saved_objects.ndjson';

/**
 * Synthetic-document field values referenced by the specs. Values used only when generating the
 * documents live in ./generators/security_indices.ts.
 */
export const SECURITY_TEST_DATA = {
  HOST_NAME: 'discover-test-host',
  RULE_UUID: '00000000-0000-4000-8000-000000000001',
} as const;

/**
 * Test subjects rendered by the Security flyout content inside Discover's doc viewer. These are the
 * same subjects used by the alerts-table flyout (the Discover overview tab reuses the same
 * `OverviewTab` component), so they are shared with the security_solution flyout_v2 suite.
 */
export const SECURITY_FLYOUT_TEST_SUBJECTS = {
  // Discover doc viewer flyout container + content
  DOC_VIEWER_FLYOUT: 'docViewerFlyout',
  DOC_VIEWER: 'kbnDocViewer',
  // Doc viewer tabs (security overview is injected at order 0; Table/JSON are Discover defaults).
  // Tab buttons carry an `aria-selected` attribute reflecting the active tab.
  OVERVIEW_TAB: 'docViewerTab-doc_view_alerts_overview',
  ATTACK_OVERVIEW_TAB: 'docViewerTab-doc_view_attack_overview',
  IOC_OVERVIEW_TAB: 'docViewerTab-doc_view_ioc_overview',
  TABLE_TAB: 'docViewerTab-doc_view_table',
  JSON_TAB: 'docViewerTab-doc_view_source',
  TABLE_TAB_CONTENT: 'UnifiedDocViewerTableGrid',
  // Alert / event header
  ALERT_TITLE: 'securitySolutionFlyoutAlertTitleText',
  HIGHLIGHTED_FIELDS_TABLE: 'securitySolutionFlyoutHighlightedFieldsDetails',
  // Attack profile content
  ATTACK_HEADER_TITLE: 'attack-flyout-v2-header-titleText',
  ATTACK_OVERVIEW: 'attack-flyout-overview-tab',
  // Discover cell-actions hover popover on a highlighted field value, and its action buttons. In
  // Discover the flyout uses `DiscoverCellActions` (not the alerts-table cell-action providers).
  CELL_ACTIONS_POPOVER: 'securitySolutionOneDiscoverCellActions',
  CELL_ACTION_FILTER_IN: 'securitySolutionOneDiscoverCellAction-filterIn',
  CELL_ACTION_TOGGLE_COLUMN: 'securitySolutionOneDiscoverCellAction-toggleColumn',
  // Footer
  TAKE_ACTION_BUTTON: 'securitySolutionFlyoutFooterDropdownButton',
  // IOC overview tab content (threat-intelligence overview reused in Discover)
  IOC_OVERVIEW_TITLE: 'tiFlyoutOverviewTitle',
} as const;

/**
 * Custom Discover data-grid cell renderers the Security profile registers
 * (see one_discover/cell_renderers/cell_renderers.tsx). The grid columns themselves are pinned by the
 * cell-renderers saved search (see SECURITY_CELL_RENDERER_SAVED_SEARCH); these are the elements the
 * renderers produce in each cell.
 */
export const CELL_RENDERER_TEST_SUBJECTS = {
  /** Link produced by RuleNameCellRenderer for `kibana.alert.rule.name` (opens the rule flyout). */
  RULE_NAME_LINK: 'one-discover-rule-name-link',
  /** Link produced by IpCellRenderer for `source.ip` (opens the network flyout). */
  IP_LINK: 'one-discover-ip-link',
  NETWORK_FLYOUT_TITLE: 'network-details-flyout-headerText',
  /** Links produced by the host and user renderers, plus their system-flyout headers. */
  HOST_LINK: 'one-discover-host-link',
  HOST_FLYOUT_HEADER: 'host-panel-header',
  USER_LINK: 'one-discover-user-link',
  USER_FLYOUT_HEADER: 'user-panel-header',
} as const;

/**
 * Take-action test subjects used by the Discover-specific Explore navigation test.
 */
export const TAKE_ACTION_TEST_SUBJECTS = {
  MENU: 'takeActionPanelMenu',
  // Shown only outside the security app (i.e. in Discover) in place of investigate-in-timeline.
  // Label is "Explore in Alerts" for alerts and "Explore in Timeline" for events; same test subject.
  EXPLORE: 'explore-in-alerts-or-timeline',
} as const;
