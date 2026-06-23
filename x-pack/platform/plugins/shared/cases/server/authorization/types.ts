/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EcsEvent } from '@kbn/core/server';
import type { KueryNode } from '@kbn/es-query';
import type { CasesSupportedOperations } from '@kbn/security-plugin/server';
import type { ArrayElement } from '@kbn/utility-types';

/**
 * The tenses for describing the action performed by a API route
 */
export interface Verbs {
  present: string;
  progressive: string;
  past: string;
}

/**
 * Read operations for the cases APIs.
 */
export enum ReadOperations {
  GetCase = 'getCase',
  ResolveCase = 'resolveCase',
  FindCases = 'findCases',
  BulkGetCases = 'bulkGetCases',
  GetCaseIDsByAlertID = 'getCaseIDsByAlertID',
  GetCaseStatuses = 'getCaseStatuses',
  GetComment = 'getComment',
  BulkGetAttachments = 'bulkGetAttachments',
  GetAllComments = 'getAllComments',
  FindComments = 'findComments',
  GetTags = 'getTags',
  GetCategories = 'getCategories',
  GetReporters = 'getReporters',
  FindConfigurations = 'findConfigurations',
  FindUserActions = 'findUserActions',
  GetUserActions = 'getUserActions',
  GetConnectors = 'getConnectors',
  GetAlertsAttachedToCase = 'getAlertsAttachedToCase',
  GetAttachmentMetrics = 'getAttachmentMetrics',
  GetCaseMetrics = 'getCaseMetrics',
  GetCasesMetrics = 'getCasesMetrics',
  GetUserActionMetrics = 'getUserActionMetrics',
  GetUserActionUsers = 'getUserActionUsers',
  GetFieldDefinitions = 'getFieldDefinitions',
}

/**
 * Write operations for the cases APIs.
 */
export enum WriteOperations {
  CreateCase = 'createCase',
  DeleteCase = 'deleteCase',
  UpdateCase = 'updateCase',
  PushCase = 'pushCase',
  CreateComment = 'createComment',
  BulkCreateAttachments = 'bulkCreateAttachments',
  DeleteAllComments = 'deleteAllComments',
  DeleteComment = 'deleteComment',
  UpdateComment = 'updateComment',
  CreateConfiguration = 'createConfiguration',
  UpdateConfiguration = 'updateConfiguration',
  ReopenCase = 'reopenCase',
  AssignCase = 'assignCase',
  ManageTemplate = 'manageTemplate',
}

/**
 * Defines the structure for a case API route.
 */
export interface OperationDetails {
  /**
   * The ECS event type that this operation should be audit logged as (creation, deletion, access, etc)
   */
  ecsType: ArrayElement<EcsEvent['type']>;
  /**
   * The name of the operation to authorize against for the privilege check.
   * These values need to match one of the operation strings defined here: x-pack/platform/packages/private/security/authorization_core/src/privileges/feature_privilege_builder/cases.ts
   *
   * To avoid the authorization strings getting too large, new operations should generally fit within one of the
   * CasesSupportedOperations. In the situation where a new one is needed we'll have to add it to the security plugin.
   */
  name: CasesSupportedOperations;
  /**
   * The ECS `event.action` field, should be in the form of <entity>_<operation> e.g comment_get, case_find
   */
  action: string;
  /**
   * The verbs that are associated with this type of operation, these should line up with the event type e.g. creating, created, create etc
   */
  verbs: Verbs;
  /**
   * The readable name of the entity being operated on e.g. case, comment, configurations (make it plural if it reads better that way etc)
   */
  docType: string;
  /**
   * The actual saved object type of the entity e.g. cases, cases-comments
   */
  savedObjectType: string;
}

/**
 * Describes an entity with the necessary fields to identify if the user is authorized to interact with the saved object
 * returned from some find query.
 */
export interface OwnerEntity {
  owner: string;
  id: string;
}

/**
 * Function callback for making sure the found saved objects are of the authorized owner
 */
export type EnsureSOAuthCallback = (entities: OwnerEntity[]) => void;

/**
 * Defines the helper methods and necessary information for authorizing the find API's request.
 */
export interface AuthFilterHelpers {
  /**
   * The owner filter to pass to the saved object client's find operation that is scoped to the authorized owners
   */
  filter?: KueryNode;
  /**
   * Utility function for checking that the returned entities are in fact authorized for the user making the request
   */
  ensureSavedObjectsAreAuthorized: EnsureSOAuthCallback;
  /**
   * The list of owner strings the current user is authorized for.
   * Undefined when security is disabled (all owners are implicitly authorized).
   */
  authorizedOwners?: string[];
}
