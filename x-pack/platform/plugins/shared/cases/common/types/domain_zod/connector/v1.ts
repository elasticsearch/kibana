/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ConnectorTypes, SwimlaneConnectorType } from '../../domain/connector/v1';

export { ConnectorTypes, SwimlaneConnectorType };
export type { ActionConnector, ActionTypeConnector } from '../../domain/connector/v1';

const ConnectorCasesWebhookTypeFieldsSchema = z.object({
  type: z.literal(ConnectorTypes.casesWebhook),
  fields: z.null(),
});

/**
 * Jira
 */
export const JiraFieldsSchema = z.object({
  issueType: z.string().nullable(),
  priority: z.string().nullable(),
  parent: z.string().nullable(),
  otherFields: z.string().nullable().optional(),
});

const ConnectorJiraTypeFieldsSchema = z.object({
  type: z.literal(ConnectorTypes.jira),
  fields: JiraFieldsSchema.nullable(),
});

/**
 * Resilient
 */
export const ResilientFieldsSchema = z.object({
  incidentTypes: z.array(z.string()).nullable(),
  severityCode: z.string().nullable(),
  additionalFields: z.string().nullable().optional(),
});

const ConnectorResilientTypeFieldsSchema = z.object({
  type: z.literal(ConnectorTypes.resilient),
  fields: ResilientFieldsSchema.nullable(),
});

/**
 * ServiceNow ITSM
 */
export const ServiceNowITSMFieldsSchema = z.object({
  impact: z.string().nullable(),
  severity: z.string().nullable(),
  urgency: z.string().nullable(),
  category: z.string().nullable(),
  subcategory: z.string().nullable(),
  additionalFields: z.string().nullable().optional(),
});

const ConnectorServiceNowITSMTypeFieldsSchema = z.object({
  type: z.literal(ConnectorTypes.serviceNowITSM),
  fields: ServiceNowITSMFieldsSchema.nullable(),
});

/**
 * ServiceNow SIR
 */
export const ServiceNowSIRFieldsSchema = z.object({
  category: z.string().nullable(),
  destIp: z.boolean().nullable(),
  malwareHash: z.boolean().nullable(),
  malwareUrl: z.boolean().nullable(),
  priority: z.string().nullable(),
  sourceIp: z.boolean().nullable(),
  subcategory: z.string().nullable(),
  additionalFields: z.string().nullable().optional(),
});

const ConnectorServiceNowSIRTypeFieldsSchema = z.object({
  type: z.literal(ConnectorTypes.serviceNowSIR),
  fields: ServiceNowSIRFieldsSchema.nullable(),
});

/**
 * Swimlane
 */
export const SwimlaneFieldsSchema = z.object({
  caseId: z.string().nullable(),
});

const ConnectorSwimlaneTypeFieldsSchema = z.object({
  type: z.literal(ConnectorTypes.swimlane),
  fields: SwimlaneFieldsSchema.nullable(),
});

/**
 * TheHive
 */
export const TheHiveFieldsSchema = z.object({
  tlp: z.number().nullable(),
});

const ConnectorTheHiveTypeFieldsSchema = z.object({
  type: z.literal(ConnectorTypes.theHive),
  fields: TheHiveFieldsSchema.nullable(),
});

/**
 * None connector
 */
const ConnectorNoneTypeFieldsSchema = z.object({
  type: z.literal(ConnectorTypes.none),
  fields: z.null(),
});

export const ConnectorTypeFieldsSchema = z.discriminatedUnion('type', [
  ConnectorCasesWebhookTypeFieldsSchema,
  ConnectorJiraTypeFieldsSchema,
  ConnectorNoneTypeFieldsSchema,
  ConnectorResilientTypeFieldsSchema,
  ConnectorServiceNowITSMTypeFieldsSchema,
  ConnectorServiceNowSIRTypeFieldsSchema,
  ConnectorSwimlaneTypeFieldsSchema,
  ConnectorTheHiveTypeFieldsSchema,
]);

const NameSchema = z.object({ name: z.string() });

export const CaseUserActionConnectorSchema = z.discriminatedUnion('type', [
  ConnectorCasesWebhookTypeFieldsSchema.merge(NameSchema),
  ConnectorJiraTypeFieldsSchema.merge(NameSchema),
  ConnectorNoneTypeFieldsSchema.merge(NameSchema),
  ConnectorResilientTypeFieldsSchema.merge(NameSchema),
  ConnectorServiceNowITSMTypeFieldsSchema.merge(NameSchema),
  ConnectorServiceNowSIRTypeFieldsSchema.merge(NameSchema),
  ConnectorSwimlaneTypeFieldsSchema.merge(NameSchema),
  ConnectorTheHiveTypeFieldsSchema.merge(NameSchema),
]);

const IdSchema = z.object({ id: z.string() });

/**
 * Connector shape for template definitions: `type` + `id` + per-type `fields`, without `name`.
 *
 * `name` is intentionally omitted — in a template it is redundant because it can be resolved
 * from the connector `id` at case-creation time. This reuses the same per-type field building
 * blocks as `CaseConnectorSchema` so there is a single source of truth for connector shape.
 */
export const CaseConnectorWithoutNameSchema = z.discriminatedUnion('type', [
  ConnectorCasesWebhookTypeFieldsSchema.merge(IdSchema),
  ConnectorJiraTypeFieldsSchema.merge(IdSchema),
  ConnectorNoneTypeFieldsSchema.merge(IdSchema),
  ConnectorResilientTypeFieldsSchema.merge(IdSchema),
  ConnectorServiceNowITSMTypeFieldsSchema.merge(IdSchema),
  ConnectorServiceNowSIRTypeFieldsSchema.merge(IdSchema),
  ConnectorSwimlaneTypeFieldsSchema.merge(IdSchema),
  ConnectorTheHiveTypeFieldsSchema.merge(IdSchema),
]);

export const CaseConnectorSchema = z.discriminatedUnion('type', [
  ConnectorCasesWebhookTypeFieldsSchema.merge(NameSchema).merge(IdSchema),
  ConnectorJiraTypeFieldsSchema.merge(NameSchema).merge(IdSchema),
  ConnectorNoneTypeFieldsSchema.merge(NameSchema).merge(IdSchema),
  ConnectorResilientTypeFieldsSchema.merge(NameSchema).merge(IdSchema),
  ConnectorServiceNowITSMTypeFieldsSchema.merge(NameSchema).merge(IdSchema),
  ConnectorServiceNowSIRTypeFieldsSchema.merge(NameSchema).merge(IdSchema),
  ConnectorSwimlaneTypeFieldsSchema.merge(NameSchema).merge(IdSchema),
  ConnectorTheHiveTypeFieldsSchema.merge(NameSchema).merge(IdSchema),
]);

/**
 * Mappings
 */
const ConnectorMappingActionTypeSchema = z.union([
  z.literal('append'),
  z.literal('nothing'),
  z.literal('overwrite'),
]);

const ConnectorMappingSourceSchema = z.union([
  z.literal('title'),
  z.literal('description'),
  z.literal('comments'),
  z.literal('tags'),
]);

const ConnectorMappingTargetSchema = z.union([z.string(), z.literal('not_mapped')]);

const ConnectorMappingSchema = z.object({
  action_type: ConnectorMappingActionTypeSchema,
  source: ConnectorMappingSourceSchema,
  target: ConnectorMappingTargetSchema,
});

export const ConnectorMappingsSchema = z.array(ConnectorMappingSchema);

export const ConnectorMappingsAttributesSchema = z.object({
  mappings: ConnectorMappingsSchema,
  owner: z.string(),
});

export type ConnectorMappingsAttributes = z.infer<typeof ConnectorMappingsAttributesSchema>;
export type ConnectorMappings = z.infer<typeof ConnectorMappingsSchema>;
export type ConnectorMappingActionType = z.infer<typeof ConnectorMappingActionTypeSchema>;
export type ConnectorMappingSource = z.infer<typeof ConnectorMappingSourceSchema>;
export type ConnectorMappingTarget = z.infer<typeof ConnectorMappingTargetSchema>;
export type CaseUserActionConnector = z.infer<typeof CaseUserActionConnectorSchema>;
export type CaseConnector = z.infer<typeof CaseConnectorSchema>;
export type CaseConnectorWithoutName = z.infer<typeof CaseConnectorWithoutNameSchema>;
export type ConnectorTypeFields = z.infer<typeof ConnectorTypeFieldsSchema>;
export type JiraFieldsType = z.infer<typeof JiraFieldsSchema>;
export type ResilientFieldsType = z.infer<typeof ResilientFieldsSchema>;
export type SwimlaneFieldsType = z.infer<typeof SwimlaneFieldsSchema>;
export type ServiceNowITSMFieldsType = z.infer<typeof ServiceNowITSMFieldsSchema>;
export type ServiceNowSIRFieldsType = z.infer<typeof ServiceNowSIRFieldsSchema>;
export type TheHiveFieldsType = z.infer<typeof TheHiveFieldsSchema>;
