/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EcsEvent } from '@kbn/core/server';
import type { CasesSupportedOperations } from '@kbn/security-plugin/server';
import type { ArrayElement } from '@kbn/utility-types';
import {
  CASE_COMMENT_SAVED_OBJECT,
  CASE_CONFIGURE_SAVED_OBJECT,
  CASE_FIELD_DEFINITION_SAVED_OBJECT,
  CASE_SAVED_OBJECT,
  CASE_TEMPLATE_SAVED_OBJECT,
  CASE_USER_ACTION_SAVED_OBJECT,
} from '../../common/constants';
import type { Verbs, OperationDetails } from './types';
import { ReadOperations, WriteOperations } from './types';

export * from './authorization';
export * from './audit_logger';
export * from './types';

const createVerbs: Verbs = {
  present: 'create',
  progressive: 'creating',
  past: 'created',
};

const accessVerbs: Verbs = {
  present: 'access',
  progressive: 'accessing',
  past: 'accessed',
};

const updateVerbs: Verbs = {
  present: 'update',
  progressive: 'updating',
  past: 'updated',
};

const pushVerbs: Verbs = {
  present: 'push',
  progressive: 'pushing',
  past: 'pushed',
};

const deleteVerbs: Verbs = {
  present: 'delete',
  progressive: 'deleting',
  past: 'deleted',
};

const EVENT_TYPES: Record<string, ArrayElement<EcsEvent['type']>> = {
  creation: 'creation',
  deletion: 'deletion',
  change: 'change',
  access: 'access',
};

/**
 * These values need to match the respective values in this file: x-pack/platform/packages/private/security/authorization_core/src/privileges/feature_privilege_builder/cases.ts
 * These are shared between find, get, get all, and delete/delete all
 * There currently isn't a use case for a user to delete one comment but not all or differentiating between get, get all,
 * and find operations from a privilege stand point.
 */
const DELETE_COMMENT_OPERATION: CasesSupportedOperations = 'deleteComment';
const ACCESS_COMMENT_OPERATION: CasesSupportedOperations = 'getComment';
const ACCESS_CASE_OPERATION: CasesSupportedOperations = 'getCase';
const ACCESS_USER_ACTION_OPERATION: CasesSupportedOperations = 'getUserActions';

/**
 * Database constant for ECS category for use for audit logging.
 */
export const DATABASE_CATEGORY: EcsEvent['category'] = ['database'];

/**
 * ECS Outcomes for audit logging.
 */
export const ECS_OUTCOMES: Record<string, EcsEvent['outcome']> = {
  failure: 'failure',
  success: 'success',
  unknown: 'unknown',
};

/**
 * Determines if the passed in operation was a write operation.
 *
 * @param operation an OperationDetails object describing the operation that occurred
 * @returns true if the passed in operation was a write operation
 */
export function isWriteOperation(operation: OperationDetails): boolean {
  return Object.values(WriteOperations).includes(operation.name as WriteOperations);
}

const CaseOperations = {
  [ReadOperations.GetCase]: {
    ecsType: EVENT_TYPES.access,
    name: ACCESS_CASE_OPERATION,
    action: 'case_get',
    verbs: accessVerbs,
    docType: 'case',
    savedObjectType: CASE_SAVED_OBJECT,
  },
  [ReadOperations.ResolveCase]: {
    ecsType: EVENT_TYPES.access,
    name: ACCESS_CASE_OPERATION,
    action: 'case_resolve',
    verbs: accessVerbs,
    docType: 'case',
    savedObjectType: CASE_SAVED_OBJECT,
  },
  [ReadOperations.FindCases]: {
    ecsType: EVENT_TYPES.access,
    name: ACCESS_CASE_OPERATION,
    action: 'case_find',
    verbs: accessVerbs,
    docType: 'cases',
    savedObjectType: CASE_SAVED_OBJECT,
  },
  [ReadOperations.GetCaseIDsByAlertID]: {
    ecsType: EVENT_TYPES.access,
    name: ACCESS_CASE_OPERATION,
    action: 'case_ids_by_alert_id_get',
    verbs: accessVerbs,
    docType: 'cases',
    savedObjectType: CASE_COMMENT_SAVED_OBJECT,
  },
  [ReadOperations.GetCaseMetrics]: {
    ecsType: EVENT_TYPES.access,
    name: ACCESS_CASE_OPERATION,
    action: 'case_get_metrics',
    verbs: accessVerbs,
    docType: 'case',
    savedObjectType: CASE_SAVED_OBJECT,
  },
  [ReadOperations.GetCasesMetrics]: {
    ecsType: EVENT_TYPES.access,
    name: ACCESS_CASE_OPERATION,
    action: 'cases_get_metrics',
    verbs: accessVerbs,
    docType: 'cases',
    savedObjectType: CASE_SAVED_OBJECT,
  },
  [WriteOperations.CreateCase]: {
    ecsType: EVENT_TYPES.creation,
    name: WriteOperations.CreateCase as const,
    action: 'case_create',
    verbs: createVerbs,
    docType: 'case',
    savedObjectType: CASE_SAVED_OBJECT,
  },
  [WriteOperations.DeleteCase]: {
    ecsType: EVENT_TYPES.deletion,
    name: WriteOperations.DeleteCase as const,
    action: 'case_delete',
    verbs: deleteVerbs,
    docType: 'case',
    savedObjectType: CASE_SAVED_OBJECT,
  },
  [WriteOperations.UpdateCase]: {
    ecsType: EVENT_TYPES.change,
    name: WriteOperations.UpdateCase as const,
    action: 'case_update',
    verbs: updateVerbs,
    docType: 'case',
    savedObjectType: CASE_SAVED_OBJECT,
  },
  [WriteOperations.PushCase]: {
    ecsType: EVENT_TYPES.change,
    name: WriteOperations.PushCase as const,
    action: 'case_push',
    verbs: pushVerbs,
    docType: 'case',
    savedObjectType: CASE_SAVED_OBJECT,
  },
  [ReadOperations.BulkGetCases]: {
    ecsType: EVENT_TYPES.access,
    name: ACCESS_CASE_OPERATION,
    action: 'case_bulk_get',
    verbs: accessVerbs,
    docType: 'cases',
    savedObjectType: CASE_SAVED_OBJECT,
  },
  [WriteOperations.ReopenCase]: {
    ecsType: EVENT_TYPES.change,
    name: WriteOperations.ReopenCase as const,
    action: 'case_reopen',
    verbs: updateVerbs,
    docType: 'case',
    savedObjectType: CASE_SAVED_OBJECT,
  },
  [WriteOperations.AssignCase]: {
    ecsType: EVENT_TYPES.change,
    name: WriteOperations.AssignCase as const,
    action: 'cases_assign',
    verbs: updateVerbs,
    docType: 'case',
    savedObjectType: CASE_SAVED_OBJECT,
  },
};

const TemplateOperations = {
  [WriteOperations.ManageTemplate]: {
    ecsType: EVENT_TYPES.change,
    name: WriteOperations.ManageTemplate as const,
    action: 'case_template_manage',
    verbs: updateVerbs,
    docType: 'case templates',
    savedObjectType: CASE_TEMPLATE_SAVED_OBJECT,
  },
};

const ConfigurationOperations = {
  [ReadOperations.FindConfigurations]: {
    ecsType: EVENT_TYPES.access,
    name: ReadOperations.FindConfigurations as const,
    action: 'case_configuration_find',
    verbs: accessVerbs,
    docType: 'case configurations',
    savedObjectType: CASE_CONFIGURE_SAVED_OBJECT,
  },
  [WriteOperations.CreateConfiguration]: {
    ecsType: EVENT_TYPES.creation,
    name: WriteOperations.CreateConfiguration as const,
    action: 'case_configuration_create',
    verbs: createVerbs,
    docType: 'case configuration',
    savedObjectType: CASE_CONFIGURE_SAVED_OBJECT,
  },
  [WriteOperations.UpdateConfiguration]: {
    ecsType: EVENT_TYPES.change,
    name: WriteOperations.UpdateConfiguration as const,
    action: 'case_configuration_update',
    verbs: updateVerbs,
    docType: 'case configuration',
    savedObjectType: CASE_CONFIGURE_SAVED_OBJECT,
  },
};

const AttachmentOperations = {
  [ReadOperations.GetAttachmentMetrics]: {
    ecsType: EVENT_TYPES.access,
    name: ACCESS_COMMENT_OPERATION,
    action: 'case_comment_get_metrics',
    verbs: accessVerbs,
    docType: 'comments',
    savedObjectType: CASE_COMMENT_SAVED_OBJECT,
  },
  [ReadOperations.GetAlertsAttachedToCase]: {
    ecsType: EVENT_TYPES.access,
    name: ACCESS_COMMENT_OPERATION,
    action: 'case_comment_alerts_attach_to_case',
    verbs: accessVerbs,
    docType: 'comments',
    savedObjectType: CASE_COMMENT_SAVED_OBJECT,
  },
  [ReadOperations.GetComment]: {
    ecsType: EVENT_TYPES.access,
    name: ACCESS_COMMENT_OPERATION,
    action: 'case_comment_get',
    verbs: accessVerbs,
    docType: 'comments',
    savedObjectType: CASE_COMMENT_SAVED_OBJECT,
  },
  [ReadOperations.BulkGetAttachments]: {
    ecsType: EVENT_TYPES.access,
    name: ACCESS_COMMENT_OPERATION,
    action: 'case_comment_bulk_get',
    verbs: accessVerbs,
    docType: 'comments',
    savedObjectType: CASE_COMMENT_SAVED_OBJECT,
  },
  [ReadOperations.GetAllComments]: {
    ecsType: EVENT_TYPES.access,
    name: ACCESS_COMMENT_OPERATION,
    action: 'case_comment_get_all',
    verbs: accessVerbs,
    docType: 'comments',
    savedObjectType: CASE_COMMENT_SAVED_OBJECT,
  },
  [ReadOperations.FindComments]: {
    ecsType: EVENT_TYPES.access,
    name: ACCESS_COMMENT_OPERATION,
    action: 'case_comment_find',
    verbs: accessVerbs,
    docType: 'comments',
    savedObjectType: CASE_COMMENT_SAVED_OBJECT,
  },
  [WriteOperations.CreateComment]: {
    ecsType: EVENT_TYPES.creation,
    name: WriteOperations.CreateComment as const,
    action: 'case_comment_create',
    verbs: createVerbs,
    docType: 'comments',
    savedObjectType: CASE_COMMENT_SAVED_OBJECT,
  },
  [WriteOperations.BulkCreateAttachments]: {
    ecsType: EVENT_TYPES.creation,
    name: WriteOperations.CreateComment as const,
    action: 'case_comment_bulk_create',
    verbs: createVerbs,
    docType: 'comments',
    savedObjectType: CASE_COMMENT_SAVED_OBJECT,
  },
  [WriteOperations.DeleteAllComments]: {
    ecsType: EVENT_TYPES.deletion,
    name: DELETE_COMMENT_OPERATION,
    action: 'case_comment_delete_all',
    verbs: deleteVerbs,
    docType: 'comments',
    savedObjectType: CASE_COMMENT_SAVED_OBJECT,
  },
  [WriteOperations.DeleteComment]: {
    ecsType: EVENT_TYPES.deletion,
    name: DELETE_COMMENT_OPERATION,
    action: 'case_comment_delete',
    verbs: deleteVerbs,
    docType: 'comments',
    savedObjectType: CASE_COMMENT_SAVED_OBJECT,
  },
  [WriteOperations.UpdateComment]: {
    ecsType: EVENT_TYPES.change,
    name: WriteOperations.UpdateComment as const,
    action: 'case_comment_update',
    verbs: updateVerbs,
    docType: 'comments',
    savedObjectType: CASE_COMMENT_SAVED_OBJECT,
  },
};

/**
 * Definition of all APIs within the cases backend.
 */
export const Operations: Record<ReadOperations | WriteOperations, OperationDetails> = {
  ...CaseOperations,
  ...TemplateOperations,
  ...ConfigurationOperations,
  ...AttachmentOperations,
  [ReadOperations.GetTags]: {
    ecsType: EVENT_TYPES.access,
    name: ReadOperations.GetTags as const,
    action: 'case_tags_get',
    verbs: accessVerbs,
    docType: 'case',
    savedObjectType: CASE_SAVED_OBJECT,
  },
  [ReadOperations.GetReporters]: {
    ecsType: EVENT_TYPES.access,
    name: ReadOperations.GetReporters as const,
    action: 'case_reporters_get',
    verbs: accessVerbs,
    docType: 'case',
    savedObjectType: CASE_SAVED_OBJECT,
  },
  [ReadOperations.GetCaseStatuses]: {
    ecsType: EVENT_TYPES.access,
    name: ACCESS_CASE_OPERATION,
    action: 'case_find_statuses',
    verbs: accessVerbs,
    docType: 'cases',
    savedObjectType: CASE_SAVED_OBJECT,
  },
  [ReadOperations.FindUserActions]: {
    ecsType: EVENT_TYPES.access,
    name: ACCESS_USER_ACTION_OPERATION,
    action: 'case_user_actions_find',
    verbs: accessVerbs,
    docType: 'user actions',
    savedObjectType: CASE_USER_ACTION_SAVED_OBJECT,
  },
  [ReadOperations.GetUserActions]: {
    ecsType: EVENT_TYPES.access,
    name: ACCESS_USER_ACTION_OPERATION,
    action: 'case_user_actions_get',
    verbs: accessVerbs,
    docType: 'user actions',
    savedObjectType: CASE_USER_ACTION_SAVED_OBJECT,
  },
  [ReadOperations.GetConnectors]: {
    ecsType: EVENT_TYPES.access,
    name: ACCESS_USER_ACTION_OPERATION,
    action: 'case_connectors_get',
    verbs: accessVerbs,
    docType: 'user actions',
    savedObjectType: CASE_USER_ACTION_SAVED_OBJECT,
  },
  [ReadOperations.GetUserActionMetrics]: {
    ecsType: EVENT_TYPES.access,
    name: ACCESS_USER_ACTION_OPERATION,
    action: 'case_user_action_get_metrics',
    verbs: accessVerbs,
    docType: 'user actions',
    savedObjectType: CASE_USER_ACTION_SAVED_OBJECT,
  },
  [ReadOperations.GetUserActionUsers]: {
    ecsType: EVENT_TYPES.access,
    name: ACCESS_USER_ACTION_OPERATION,
    action: 'case_user_action_get_users',
    verbs: accessVerbs,
    docType: 'user actions',
    savedObjectType: CASE_USER_ACTION_SAVED_OBJECT,
  },
  [ReadOperations.GetCategories]: {
    ecsType: EVENT_TYPES.access,
    name: ACCESS_CASE_OPERATION,
    action: 'case_categories_get',
    verbs: accessVerbs,
    docType: 'cases',
    savedObjectType: CASE_SAVED_OBJECT,
  },
  [ReadOperations.GetFieldDefinitions]: {
    ecsType: EVENT_TYPES.access,
    name: ReadOperations.GetFieldDefinitions as const,
    action: 'case_field_definitions_get',
    verbs: accessVerbs,
    docType: 'case field definitions',
    savedObjectType: CASE_FIELD_DEFINITION_SAVED_OBJECT,
  },
};
