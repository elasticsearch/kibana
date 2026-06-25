/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Feature ID for the workflows management feature
 */
export const WORKFLOWS_MANAGEMENT_FEATURE_ID = 'workflowsManagement';

/**
 * UI Setting ID for enabling / disabling the workflows management UI
 */
export const WORKFLOWS_UI_SETTING_ID = 'workflows:ui:enabled';
export const WORKFLOWS_EXPERIMENTAL_FEATURES_SETTING_ID = 'workflows:experimentalFeatures';
export const WORKFLOWS_UI_VISUAL_EDITOR_SETTING_ID = 'workflows:ui:visualEditor:enabled';
export const WORKFLOWS_UI_EXECUTION_GRAPH_SETTING_ID = 'workflows:ui:executionGraph:enabled';
export const WORKFLOWS_UI_SHOW_EXECUTOR_SETTING_ID = 'workflows:ui:showExecutor:enabled';
export const WORKFLOWS_UI_SHOW_MANAGED_WORKFLOWS_SETTING_ID = 'workflows:ui:showManagedWorkflows';

/**
 * Feature flag ID for enabling / disabling the workflow execution stats bar UI
 */
export const WORKFLOW_EXECUTION_STATS_BAR_SETTING_ID = 'workflows:executionStatsBar:enabled';

/**
 * Hidden Advanced Setting gate for workflow versioning (change-history writes and read routes).
 */
export const WORKFLOWS_VERSIONING_SETTING_ID = 'workflows:versioning:enabled';

/**
 * Map of regular (saved object) connector types -> their system connector equivalents.
 * Use this map to make the `connector-id` step config property optional for a given connector step type, allowing it to be executed via its linked system connector.
 * Pre-requisite for this to work:
 * - System connectors have empty config/secrets schemas. Make sure these system connectors are able to execute by receiving params alone.
 */
export const SystemConnectorsMap = new Map<string, string>([['.http', '.http-system']]);

/**
 * Workflow attachment and SML types used by the agent builder integration.
 */
export const WORKFLOW_YAML_ATTACHMENT_TYPE = 'workflow.yaml';
export const WORKFLOW_YAML_DIFF_ATTACHMENT_TYPE = 'workflow.yaml.diff';
export const WORKFLOW_SML_TYPE = 'workflow';

/**
 * UI event broadcast on the agent builder events bus when a workflow YAML
 * attachment is created or modified by an agent tool.
 */
export const WORKFLOW_YAML_CHANGED_EVENT = 'workflow:yaml_changed';
