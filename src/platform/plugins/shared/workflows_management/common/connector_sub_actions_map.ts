/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
// Import SUB_ACTION enums from all stack connectors
import {
  CONNECTOR_ID as BEDROCK_CONNECTOR_ID,
  SUB_ACTION as BEDROCK_SUB_ACTION,
} from '@kbn/connector-schemas/bedrock/constants';
import {
  CONNECTOR_ID as D3_SECURITY_CONNECTOR_ID,
  SUB_ACTION as D3SECURITY_SUB_ACTION,
} from '@kbn/connector-schemas/d3security/constants';
import {
  CONNECTOR_ID as GEMINI_CONNECTOR_ID,
  SUB_ACTION as GEMINI_SUB_ACTION,
} from '@kbn/connector-schemas/gemini/constants';
import {
  CONNECTOR_ID as INFERENCE_CONNECTOR_ID,
  SUB_ACTION as INFERENCE_SUB_ACTION,
} from '@kbn/connector-schemas/inference/constants';
import {
  CONNECTOR_ID as JIRA_SERVICE_MANAGEMENT_CONNECTOR_TYPE_ID,
  SUB_ACTION as JiraServiceManagementSubActions,
} from '@kbn/connector-schemas/jira-service-management/constants';
import {
  CONNECTOR_ID as MCP_CONNECTOR_ID,
  SUB_ACTION as MCP_SUB_ACTION,
} from '@kbn/connector-schemas/mcp/constants';
import {
  CONNECTOR_ID as OPENAI_CONNECTOR_ID,
  SUB_ACTION as OPENAI_SUB_ACTION,
} from '@kbn/connector-schemas/openai/constants';
import {
  CONNECTOR_ID as OpsgenieConnectorTypeId,
  SUB_ACTION as OpsgenieSubActions,
} from '@kbn/connector-schemas/opsgenie/constants';
import {
  CONNECTOR_ID as SLACK_API_CONNECTOR_ID,
  SUB_ACTION as SLACK_API_SUB_ACTION,
} from '@kbn/connector-schemas/slack_api/constants';
import {
  CONNECTOR_ID as THEHIVE_CONNECTOR_ID,
  SUB_ACTION as THEHIVE_SUB_ACTION,
} from '@kbn/connector-schemas/thehive/constants';
import {
  CONNECTOR_ID as TINES_CONNECTOR_ID,
  SUB_ACTION as TINES_SUB_ACTION,
} from '@kbn/connector-schemas/tines/constants';
import {
  CONNECTOR_ID as XSOAR_CONNECTOR_ID,
  SUB_ACTION as XSOAR_SUB_ACTION,
} from '@kbn/connector-schemas/xsoar/constants';

import { connectorsSpecs } from '@kbn/connector-specs';

// Helper function to format sub-action names for display
function formatSubActionName(action: string): string {
  // Handle both snake_case and camelCase
  return (
    action
      // First, split camelCase: insertCamelCaseSpaces
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Then split on underscores and other separators
      .split(/[_\s-]+/)
      // Capitalize each word
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  );
}

// Helper function to create sub-actions mapping
function createSubActionsMapping() {
  const mapping: Record<string, Array<{ name: string; displayName: string }>> = {};

  // Define legacy connector sub-actions (connectors using older ActionType pattern)
  const JIRA_SUB_ACTIONS = {
    GET_FIELDS: 'getFields',
    GET_INCIDENT: 'getIncident',
    PUSH_TO_SERVICE: 'pushToService',
    ISSUE_TYPES: 'issueTypes',
    FIELDS_BY_ISSUE_TYPE: 'fieldsByIssueType',
    ISSUES: 'issues',
    ISSUE: 'issue',
  };

  const SERVICENOW_ITSM_SUB_ACTIONS = {
    GET_FIELDS: 'getFields',
    PUSH_TO_SERVICE: 'pushToService',
    GET_CHOICES: 'getChoices',
    GET_INCIDENT: 'getIncident',
    CLOSE_INCIDENT: 'closeIncident',
  };

  const SERVICENOW_SIR_SUB_ACTIONS = {
    GET_FIELDS: 'getFields',
    PUSH_TO_SERVICE: 'pushToService',
    GET_CHOICES: 'getChoices',
    GET_INCIDENT: 'getIncident',
  };

  const SERVICENOW_ITOM_SUB_ACTIONS = {
    ADD_EVENT: 'addEvent',
    GET_CHOICES: 'getChoices',
  };

  const SWIMLANE_SUB_ACTIONS = {
    PUSH_TO_SERVICE: 'pushToService',
  };

  const CASES_WEBHOOK_SUB_ACTIONS = {
    PUSH_TO_SERVICE: 'pushToService',
  };

  // Define all connector sub-actions
  const connectorSubActions = [
    { id: INFERENCE_CONNECTOR_ID, actions: INFERENCE_SUB_ACTION },
    { id: BEDROCK_CONNECTOR_ID, actions: BEDROCK_SUB_ACTION },
    { id: OPENAI_CONNECTOR_ID, actions: OPENAI_SUB_ACTION },
    { id: GEMINI_CONNECTOR_ID, actions: GEMINI_SUB_ACTION },
    { id: THEHIVE_CONNECTOR_ID, actions: THEHIVE_SUB_ACTION },
    { id: TINES_CONNECTOR_ID, actions: TINES_SUB_ACTION },
    { id: XSOAR_CONNECTOR_ID, actions: XSOAR_SUB_ACTION },
    { id: D3_SECURITY_CONNECTOR_ID, actions: D3SECURITY_SUB_ACTION },
    { id: JIRA_SERVICE_MANAGEMENT_CONNECTOR_TYPE_ID, actions: JiraServiceManagementSubActions },
    { id: OpsgenieConnectorTypeId, actions: OpsgenieSubActions },
    { id: MCP_CONNECTOR_ID, actions: MCP_SUB_ACTION },
    { id: SLACK_API_CONNECTOR_ID, actions: SLACK_API_SUB_ACTION },
    // Legacy connectors (using older ActionType pattern)
    { id: '.jira', actions: JIRA_SUB_ACTIONS },
    { id: '.servicenow-itsm', actions: SERVICENOW_ITSM_SUB_ACTIONS },
    { id: '.servicenow-sir', actions: SERVICENOW_SIR_SUB_ACTIONS },
    { id: '.servicenow-itom', actions: SERVICENOW_ITOM_SUB_ACTIONS },
    { id: '.swimlane', actions: SWIMLANE_SUB_ACTIONS },
    { id: '.cases-webhook', actions: CASES_WEBHOOK_SUB_ACTIONS },
  ];

  connectorSubActions.forEach(({ id, actions }) => {
    mapping[id] = Object.values(actions).map((action) => ({
      name: action,
      displayName: formatSubActionName(action),
    }));
  });

  Object.values(connectorsSpecs).forEach((connectorSpec) => {
    mapping[connectorSpec.metadata.id] = Object.keys(connectorSpec.actions).map((action) => ({
      name: action,
      displayName: formatSubActionName(action),
    }));
  });

  return mapping;
}

// Create the sub-actions mapping
export const CONNECTOR_SUB_ACTIONS_MAP = createSubActionsMapping();
