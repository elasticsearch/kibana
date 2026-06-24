/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  PostBlockkitSubActionParamsSchema as SlackApiPostBlockkitParamsSchema,
  PostMessageSubActionParamsSchema as SlackApiPostMessageParamsSchema,
  ValidChannelIdSubActionParamsSchema as SlackApiValidChannelIdParamsSchema,
} from '@kbn/connector-schemas/slack_api';
import {
  XSOARPlaybooksActionResponseSchema,
  XSOARRunActionParamsSchema,
  XSOARRunActionResponseSchema,
} from '@kbn/connector-schemas/xsoar';
import { connectorsSpecs } from '@kbn/connector-specs';
import { i18n } from '@kbn/i18n';
import type { BaseConnectorContract } from '@kbn/workflows';
import { FetcherConfigSchema, KibanaHttpMethodSchema, KibanaStepMetaSchema } from '@kbn/workflows';
import { z } from '@kbn/zod/v4';

import {
  BedrockParamsSchema,
  BedrockResponseSchema,
  CasesWebhookCreateCaseParamsSchema,
  CasesWebhookResponseSchema,
  D3SecurityResponseSchema,
  D3SecurityRunParamsSchema,
  D3SecurityTestParamsSchema,
  EmailParamsSchema,
  EmailResponseSchema,
  EsIndexParamsSchema,
  EsIndexResponseSchema,
  GeminiParamsSchema,
  GeminiResponseSchema,
  GenAIDashboardParamsSchema,
  GenAIDashboardResponseSchema,
  GenAIInvokeAIParamsSchema,
  GenAIInvokeAIResponseSchema,
  GenAIRunParamsSchema,
  GenAIRunResponseSchema,
  GenAIStreamParamsSchema,
  GenAIStreamResponseSchema,
  GenAITestParamsSchema,
  GenAITestResponseSchema,
  HttpParamsSchema,
  HttpResponseSchema,
  InferenceCompletionParamsSchema,
  InferenceCompletionResponseSchema,
  InferenceRerankParamsSchema,
  InferenceRerankResponseSchema,
  InferenceSparseEmbeddingParamsSchema,
  InferenceSparseEmbeddingResponseSchema,
  InferenceTextEmbeddingParamsSchema,
  InferenceTextEmbeddingResponseSchema,
  InferenceUnifiedCompletionParamsSchema,
  InferenceUnifiedCompletionResponseSchema,
  JiraFieldsResponseSchema,
  JiraGetFieldsByIssueTypeParamsSchema,
  JiraGetFieldsParamsSchema,
  JiraGetIncidentParamsSchema,
  JiraGetIssueParamsSchema,
  JiraGetIssuesParamsSchema,
  JiraGetIssueTypesParamsSchema,
  JiraIssueResponseSchema,
  JiraIssuesResponseSchema,
  JiraIssueTypesResponseSchema,
  JiraPushToServiceParamsSchema,
  JiraPushToServiceResponseSchema,
  JiraServiceManagementCloseAlertParamsSchema,
  JiraServiceManagementCreateAlertParamsSchema,
  JiraServiceManagementResponseSchema,
  McpCallToolParamsSchema,
  McpCallToolResponseSchema,
  McpListToolsParamsSchema,
  McpListToolsResponseSchema,
  McpTestParamsSchema,
  McpTestResponseSchema,
  OpenAIParamsSchema,
  OpenAIResponseSchema,
  OpsgenieCloseAlertParamsSchema,
  OpsgenieCreateAlertParamsSchema,
  OpsgenieResponseSchema,
  PagerDutyParamsSchema,
  PagerDutyResponseSchema,
  ResilientAddCommentParamsSchema,
  ResilientCreateIncidentParamsSchema,
  ResilientIncidentResponseSchema,
  ResilientUpdateIncidentParamsSchema,
  ServerLogParamsSchema,
  ServerLogResponseSchema,
  ServiceNowAddEventParamsSchema,
  ServiceNowChoicesResponseSchema,
  ServiceNowCloseIncidentParamsSchema,
  ServiceNowCreateIncidentParamsSchema,
  ServiceNowCreateSecurityIncidentParamsSchema,
  ServiceNowEventResponseSchema,
  ServiceNowFieldsResponseSchema,
  ServiceNowGetChoicesParamsSchema,
  ServiceNowGetFieldsParamsSchema,
  ServiceNowGetIncidentParamsSchema,
  ServiceNowIncidentResponseSchema,
  ServiceNowUpdateIncidentParamsSchema,
  SlackApiResponseSchema,
  SlackParamsSchema,
  SlackResponseSchema,
  SwimlaneCreateRecordParamsSchema,
  SwimlaneResponseSchema,
  TeamsParamsSchema,
  TeamsResponseSchema,
  TheHiveCreateAlertParamsSchema,
  TheHiveCreateAlertResponseSchema,
  TheHiveGetIncidentParamsSchema,
  TheHiveIncidentResponseSchema,
  TheHivePushToServiceParamsSchema,
  TinesResponseSchema,
  TinesRunParamsSchema,
  TinesStoriesParamsSchema,
  TinesTestParamsSchema,
  TinesWebhooksParamsSchema,
  TorqParamsSchema,
  TorqResponseSchema,
} from './stack_connectors_schema';

/**
 * Connector input schemas
 */
export const ConnectorSpecsInputSchemas = new Map<string, Record<string, z.ZodSchema>>(
  Object.values(connectorsSpecs).map((connectorSpec) => [
    connectorSpec.metadata.id,
    Object.fromEntries(
      Object.entries(connectorSpec.actions).map(([actionName, action]) => [
        actionName,
        action.input,
      ])
    ),
  ])
);

export const ConnectorInputSchemas = new Map<string, z.ZodSchema>([
  ['.slack', SlackParamsSchema],
  ['.email', EmailParamsSchema],
  ['.http', HttpParamsSchema],
  ['.teams', TeamsParamsSchema],
  ['.bedrock', BedrockParamsSchema],
  ['.openai', OpenAIParamsSchema],
  ['.gemini', GeminiParamsSchema],
  ['.index', EsIndexParamsSchema],
  ['.server-log', ServerLogParamsSchema],
  ['.pagerduty', PagerDutyParamsSchema],
  ['.torq', TorqParamsSchema],
]);

export const ConnectorActionInputSchemas = new Map<string, Record<string, z.ZodSchema>>([
  [
    '.inference',
    {
      unified_completion: InferenceUnifiedCompletionParamsSchema,
      unified_completion_stream: InferenceUnifiedCompletionParamsSchema,
      unified_completion_async_iterator: InferenceUnifiedCompletionParamsSchema,
      completion: InferenceCompletionParamsSchema,
      rerank: InferenceRerankParamsSchema,
      text_embedding: InferenceTextEmbeddingParamsSchema,
      sparse_embedding: InferenceSparseEmbeddingParamsSchema,
    },
  ],
  [
    '.jira',
    {
      pushToService: JiraPushToServiceParamsSchema,
      getIncident: JiraGetIncidentParamsSchema,
      getFields: JiraGetFieldsParamsSchema,
      issueTypes: JiraGetIssueTypesParamsSchema,
      fieldsByIssueType: JiraGetFieldsByIssueTypeParamsSchema,
      issues: JiraGetIssuesParamsSchema,
      issue: JiraGetIssueParamsSchema,
    },
  ],
  [
    '.servicenow-itsm',
    {
      pushToService: ServiceNowCreateIncidentParamsSchema,
      updateIncident: ServiceNowUpdateIncidentParamsSchema,
      getIncident: ServiceNowGetIncidentParamsSchema,
      getFields: ServiceNowGetFieldsParamsSchema,
      getChoices: ServiceNowGetChoicesParamsSchema,
      closeIncident: ServiceNowCloseIncidentParamsSchema,
    },
  ],
  [
    '.servicenow-sir',
    {
      pushToService: ServiceNowCreateSecurityIncidentParamsSchema,
      getIncident: ServiceNowGetIncidentParamsSchema,
      getFields: ServiceNowGetFieldsParamsSchema,
      getChoices: ServiceNowGetChoicesParamsSchema,
    },
  ],
  [
    '.servicenow-itom',
    {
      addEvent: ServiceNowAddEventParamsSchema,
      getChoices: ServiceNowGetChoicesParamsSchema,
    },
  ],
  [
    '.opsgenie',
    {
      createAlert: OpsgenieCreateAlertParamsSchema,
      closeAlert: OpsgenieCloseAlertParamsSchema,
    },
  ],
  // Resilient connector with sub-actions
  [
    '.resilient',
    {
      pushToService: ResilientCreateIncidentParamsSchema,
      updateIncident: ResilientUpdateIncidentParamsSchema,
      addComment: ResilientAddCommentParamsSchema,
    },
  ],
  [
    '.swimlane',
    {
      pushToService: SwimlaneCreateRecordParamsSchema,
    },
  ],
  [
    '.cases-webhook',
    {
      pushToService: CasesWebhookCreateCaseParamsSchema,
    },
  ],
  [
    '.slack_api',
    {
      validChannelId: SlackApiValidChannelIdParamsSchema,
      postMessage: SlackApiPostMessageParamsSchema,
      postBlockkit: SlackApiPostBlockkitParamsSchema,
    },
  ],
  [
    '.tines',
    {
      stories: TinesStoriesParamsSchema,
      webhooks: TinesWebhooksParamsSchema,
      run: TinesRunParamsSchema,
      test: TinesTestParamsSchema,
    },
  ],
  [
    '.xsoar',
    {
      getPlaybooks: z.object({}),
      run: XSOARRunActionParamsSchema,
    },
  ],
  [
    '.jira-service-management',
    {
      createAlert: JiraServiceManagementCreateAlertParamsSchema,
      closeAlert: JiraServiceManagementCloseAlertParamsSchema,
    },
  ],
  [
    '.thehive',
    {
      pushToService: TheHivePushToServiceParamsSchema,
      createAlert: TheHiveCreateAlertParamsSchema,
      getIncident: TheHiveGetIncidentParamsSchema,
    },
  ],
  [
    '.d3security',
    {
      run: D3SecurityRunParamsSchema,
      test: D3SecurityTestParamsSchema,
    },
  ],
  [
    '.gen-ai',
    {
      run: GenAIRunParamsSchema,
      invokeAI: GenAIInvokeAIParamsSchema,
      invokeStream: GenAIStreamParamsSchema,
      invokeAsyncIterator: GenAIStreamParamsSchema,
      stream: GenAIStreamParamsSchema,
      getDashboard: GenAIDashboardParamsSchema,
      test: GenAITestParamsSchema,
    },
  ],
  [
    '.mcp',
    {
      listTools: McpListToolsParamsSchema,
      callTool: McpCallToolParamsSchema,
      test: McpTestParamsSchema,
    },
  ],
]);

/**
 * Connector output schemas
 */

export const ConnectorOutputSchemas = new Map<string, z.ZodSchema>([
  ['.slack', SlackResponseSchema],
  ['.email', EmailResponseSchema],
  ['.http', HttpResponseSchema],
  ['.teams', TeamsResponseSchema],
  ['.bedrock', BedrockResponseSchema],
  ['.openai', OpenAIResponseSchema],
  ['.gemini', GeminiResponseSchema],
  ['.index', EsIndexResponseSchema],
  ['.server-log', ServerLogResponseSchema],
  ['.pagerduty', PagerDutyResponseSchema],
  ['.torq', TorqResponseSchema],
]);

export const ConnectorActionOutputSchemas = new Map<string, Record<string, z.ZodSchema>>([
  [
    '.inference',
    {
      unified_completion: InferenceUnifiedCompletionResponseSchema,
      unified_completion_stream: InferenceUnifiedCompletionResponseSchema,
      unified_completion_async_iterator: InferenceUnifiedCompletionResponseSchema,
      completion: InferenceCompletionResponseSchema,
      rerank: InferenceRerankResponseSchema,
      text_embedding: InferenceTextEmbeddingResponseSchema,
      sparse_embedding: InferenceSparseEmbeddingResponseSchema,
    },
  ],
  [
    '.jira',
    {
      pushToService: JiraPushToServiceResponseSchema,
      getIncident: JiraIssueResponseSchema,
      getFields: JiraFieldsResponseSchema,
      issueTypes: JiraIssueTypesResponseSchema,
      fieldsByIssueType: JiraFieldsResponseSchema,
      issues: JiraIssuesResponseSchema,
      issue: JiraIssueResponseSchema,
    },
  ],
  [
    '.servicenow-itsm',
    {
      pushToService: ServiceNowIncidentResponseSchema,
      updateIncident: ServiceNowIncidentResponseSchema,
      getIncident: ServiceNowIncidentResponseSchema,
      closeIncident: ServiceNowIncidentResponseSchema,
      getFields: ServiceNowFieldsResponseSchema,
      getChoices: ServiceNowChoicesResponseSchema,
    },
  ],
  [
    '.servicenow-sir',
    {
      pushToService: ServiceNowIncidentResponseSchema,
      getIncident: ServiceNowIncidentResponseSchema,
      getFields: ServiceNowFieldsResponseSchema,
      getChoices: ServiceNowChoicesResponseSchema,
    },
  ],
  [
    '.servicenow-itom',
    {
      addEvent: ServiceNowEventResponseSchema,
      getChoices: ServiceNowChoicesResponseSchema,
    },
  ],
  [
    '.opsgenie',
    {
      createAlert: OpsgenieResponseSchema,
      closeAlert: OpsgenieResponseSchema,
    },
  ],
  [
    '.resilient',
    {
      pushToService: ResilientIncidentResponseSchema,
      updateIncident: ResilientIncidentResponseSchema,
      addComment: ResilientIncidentResponseSchema,
    },
  ],
  [
    '.swimlane',
    {
      pushToService: SwimlaneResponseSchema,
    },
  ],
  [
    '.cases-webhook',
    {
      pushToService: CasesWebhookResponseSchema,
    },
  ],
  [
    '.slack_api',
    {
      validChannelId: SlackApiResponseSchema,
      postMessage: SlackApiResponseSchema,
      postBlockkit: SlackApiResponseSchema,
    },
  ],
  [
    '.tines',
    {
      stories: TinesResponseSchema,
      webhooks: TinesResponseSchema,
      run: TinesResponseSchema,
      test: TinesResponseSchema,
    },
  ],
  [
    '.xsoar',
    {
      getPlaybooks: XSOARPlaybooksActionResponseSchema,
      run: XSOARRunActionResponseSchema,
    },
  ],
  [
    '.jira-service-management',
    {
      createAlert: JiraServiceManagementResponseSchema,
      closeAlert: JiraServiceManagementResponseSchema,
    },
  ],
  [
    '.thehive',
    {
      pushToService: TheHiveIncidentResponseSchema,
      createAlert: TheHiveCreateAlertResponseSchema,
      getIncident: TheHiveIncidentResponseSchema,
    },
  ],
  [
    '.d3security',
    {
      run: D3SecurityResponseSchema,
      test: D3SecurityResponseSchema,
    },
  ],
  [
    '.gen-ai',
    {
      run: GenAIRunResponseSchema,
      invokeAI: GenAIInvokeAIResponseSchema,
      invokeStream: GenAIStreamResponseSchema,
      invokeAsyncIterator: GenAIStreamResponseSchema,
      stream: GenAIStreamResponseSchema,
      getDashboard: GenAIDashboardResponseSchema,
      test: GenAITestResponseSchema,
    },
  ],
  [
    '.mcp',
    {
      listTools: McpListToolsResponseSchema,
      callTool: McpCallToolResponseSchema,
      test: McpTestResponseSchema,
    },
  ],
]);

/**
 * Static connectors used for schema generation
 */

export const staticConnectors: BaseConnectorContract[] = [
  {
    type: 'console',
    summary: 'Console',
    paramsSchema: z
      .object({
        message: z.string(),
      })
      .required(),
    outputSchema: z.string(),
    description: i18n.translate('workflows.connectors.console.description', {
      defaultMessage: 'Log a message to the workflow logs',
    }),
  },
  // Note: inference sub-actions are now generated dynamically
  // Generic request types for raw API calls
  {
    type: 'elasticsearch.request',
    summary: 'Elasticsearch Request',
    paramsSchema: z.object({
      method: z.string(),
      path: z.string(),
      body: z.any().optional(),
      params: z.any().optional(),
      headers: z.any().optional(),
    }),
    outputSchema: z.any(),
    description: i18n.translate('workflows.connectors.elasticsearch.request.description', {
      defaultMessage: 'Make a generic request to an Elasticsearch API',
    }),
  },
  {
    type: 'kibana.request',
    summary: 'Kibana Request',
    paramsSchema: z.object({
      method: KibanaHttpMethodSchema.optional().describe('The HTTP method to use for the request.'),
      path: z.string(),
      body: z.any().optional(),
      headers: z.any().optional(),
      query: z.record(z.string(), z.any()).optional(),
      form_data: z
        .record(
          z.string(),
          z.object({
            content: z.string().describe('File content or field value'),
            filename: z.string().optional().describe('Filename hint (e.g. "export.ndjson")'),
            content_type: z
              .string()
              .optional()
              .describe('MIME type of the content (e.g. "application/ndjson")'),
          })
        )
        .optional()
        .describe(
          'Multipart form-data fields. Use instead of body for APIs that require file uploads (e.g. /api/saved_objects/_import). Mutually exclusive with body.'
        ),
      fetcher: FetcherConfigSchema,
      ...KibanaStepMetaSchema,
    }),
    outputSchema: z
      .any()
      .describe(
        'JSON-parsed response body, or an empty object ({}) for 204 No Content / 304 Not Modified responses'
      ),
    description: i18n.translate('workflows.connectors.kibana.request.description', {
      defaultMessage:
        "Make a generic request to a Kibana API. APIs that return 204 No Content or 304 Not Modified produce an empty output ('{}').",
    }),
  },
];
