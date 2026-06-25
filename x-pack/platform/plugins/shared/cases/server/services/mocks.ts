/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PublicMethodsOf } from '@kbn/utility-types';
import { lazyObject } from '@kbn/lazy-object';
import type {
  AlertService,
  CaseConfigureService,
  CasesService,
  CaseUserActionService,
  ConnectorMappingsService,
  AttachmentService,
  TemplatesService,
  FieldDefinitionsService,
} from '.';
import type { AttachmentGetter } from './attachments/operations/get';
import type { LicensingService } from './licensing';
import type { EmailNotificationService } from './notifications/email_notification_service';
import type { UserActionPersister } from './user_actions/operations/create';
import type { UserActionFinder } from './user_actions/operations/find';

interface UserActionServiceOperations {
  creator: CaseUserActionPersisterServiceMock;
  finder: CaseUserActionFinderServiceMock;
}

interface AttachmentServiceOperations {
  getter: AttachmentGetterServiceMock;
}

export type AttachmentGetterServiceMock = jest.Mocked<AttachmentGetter>;

export type CaseServiceMock = jest.Mocked<CasesService>;
export type CaseConfigureServiceMock = jest.Mocked<CaseConfigureService>;
export type ConnectorMappingsServiceMock = jest.Mocked<ConnectorMappingsService>;
export type CaseUserActionServiceMock = jest.Mocked<
  CaseUserActionService & UserActionServiceOperations
>;
export type CaseUserActionPersisterServiceMock = jest.Mocked<UserActionPersister>;
export type CaseUserActionFinderServiceMock = jest.Mocked<UserActionFinder>;
export type AlertServiceMock = jest.Mocked<AlertService>;
export type AttachmentServiceMock = jest.Mocked<AttachmentService & AttachmentServiceOperations>;
export type LicensingServiceMock = jest.Mocked<LicensingService>;
export type NotificationServiceMock = jest.Mocked<EmailNotificationService>;
export type TemplatesServiceMock = jest.Mocked<TemplatesService>;
export type FieldDefinitionsServiceMock = jest.Mocked<FieldDefinitionsService>;

export const createCaseServiceMock = (): CaseServiceMock => {
  const service: PublicMethodsOf<CaseServiceMock> = lazyObject({
    deleteCase: jest.fn(),
    findCases: jest.fn(),
    getAllCaseComments: jest.fn(),
    getCase: jest.fn(),
    getCases: jest.fn(),
    getCaseIdsByAlertId: jest.fn(),
    getResolveCase: jest.fn(),
    getTags: jest.fn(),
    getReporters: jest.fn(),
    createCase: jest.fn(),
    bulkCreateCases: jest.fn(),
    patchCase: jest.fn(),
    patchCases: jest.fn(),
    findCasesGroupedByID: jest.fn(),
    searchCasesGroupedByID: jest.fn(),
    getCaseStatusStats: jest.fn(),
    executeAggregations: jest.fn(),
    bulkDeleteCaseEntities: jest.fn(),
    getCategories: jest.fn(),
    getCaseIdsByAttachmentSearch: jest.fn(),
    searchCases: jest.fn(),
  });

  // the cast here is required because jest.Mocked tries to include private members and would throw an error
  return service as unknown as CaseServiceMock;
};

export const createConfigureServiceMock = (): CaseConfigureServiceMock => {
  const service: PublicMethodsOf<CaseConfigureService> = lazyObject({
    delete: jest.fn(),
    get: jest.fn(),
    find: jest.fn(),
    patch: jest.fn(),
    post: jest.fn(),
  });

  // the cast here is required because jest.Mocked tries to include private members and would throw an error
  return service as unknown as CaseConfigureServiceMock;
};

export const connectorMappingsServiceMock = (): ConnectorMappingsServiceMock => {
  const service: PublicMethodsOf<ConnectorMappingsService> = lazyObject({
    find: jest.fn(),
    post: jest.fn(),
    update: jest.fn(),
  });

  // the cast here is required because jest.Mocked tries to include private members and would throw an error
  return service as unknown as ConnectorMappingsServiceMock;
};

const createUserActionPersisterServiceMock = (): CaseUserActionPersisterServiceMock => {
  const service: PublicMethodsOf<UserActionPersister> = lazyObject({
    bulkAuditLogCaseDeletion: jest.fn(),
    bulkCreateUpdateCase: jest.fn(),
    buildUserActions: jest.fn(),
    addSyncedAlertsCountToUserActions: jest.fn(),
    bulkCreateAttachmentDeletion: jest.fn(),
    bulkCreateAttachmentCreation: jest.fn(),
    createUserAction: jest.fn(),
    bulkCreateUserAction: jest.fn(),
  });

  return service as unknown as CaseUserActionPersisterServiceMock;
};

const createUserActionFinderServiceMock = (): CaseUserActionFinderServiceMock => {
  const service: PublicMethodsOf<UserActionFinder> = {
    find: jest.fn(),
    findStatusChanges: jest.fn(),
  };

  return service as unknown as CaseUserActionFinderServiceMock;
};

type FakeUserActionService = PublicMethodsOf<CaseUserActionService> & UserActionServiceOperations;

export const createUserActionServiceMock = (): CaseUserActionServiceMock => {
  const service: FakeUserActionService = lazyObject({
    creator: createUserActionPersisterServiceMock(),
    finder: createUserActionFinderServiceMock(),
    getConnectorFieldsBeforeLatestPush: jest.fn(),
    getMostRecentUserAction: jest.fn(),
    getCaseConnectorInformation: jest.fn(),
    getAll: jest.fn(),
    getUniqueConnectors: jest.fn(),
    getUserActionIdsForCases: jest.fn(),
    getMultipleCasesUserActionsTotal: jest.fn(),
    getCaseUserActionStats: jest.fn(),
    getUsers: jest.fn(),
  });

  // the cast here is required because jest.Mocked tries to include private members and would throw an error
  return service as unknown as CaseUserActionServiceMock;
};

export const createAlertServiceMock = (): AlertServiceMock => {
  const service: PublicMethodsOf<AlertService> = lazyObject({
    updateAlertsStatus: jest.fn(),
    getAlerts: jest.fn(),
    executeAggregations: jest.fn(),
    bulkUpdateCases: jest.fn(),
    ensureAlertsAuthorized: jest.fn(),
    removeCaseIdFromAlerts: jest.fn(),
    removeCaseIdsFromAllAlerts: jest.fn(),
  });

  // the cast here is required because jest.Mocked tries to include private members and would throw an error
  return service as unknown as AlertServiceMock;
};

const createAttachmentGetterServiceMock = (): AttachmentGetterServiceMock => {
  const service: PublicMethodsOf<AttachmentGetter> = lazyObject({
    get: jest.fn(),
    bulkGet: jest.fn(),
    getAllDocumentsAttachedToCase: jest.fn(),
    getCaseAttatchmentStats: jest.fn(),
    getAttachmentIdsForCases: jest.fn(),
    getFileAttachments: jest.fn(),
    getAllAlertIds: jest.fn(),
    getAllEventIds: jest.fn(),
  });

  return service as unknown as AttachmentGetterServiceMock;
};

type FakeAttachmentService = PublicMethodsOf<AttachmentService> & AttachmentServiceOperations;

export const createAttachmentServiceMock = (): AttachmentServiceMock => {
  const service: FakeAttachmentService = lazyObject({
    getter: createAttachmentGetterServiceMock(),
    bulkDelete: jest.fn(),
    create: jest.fn(),
    bulkCreate: jest.fn(),
    update: jest.fn(),
    bulkUpdate: jest.fn(),
    find: jest.fn(),
    countAlertsAttachedToCase: jest.fn(),
    countAlertsWithinCase: jest.fn(),
    executeCaseAggregations: jest.fn(),
    countPersistableStateAndExternalReferenceAttachments: jest.fn(),
  });

  // the cast here is required because jest.Mocked tries to include private members and would throw an error
  return service as unknown as AttachmentServiceMock;
};

export const createLicensingServiceMock = (): LicensingServiceMock => {
  const service: PublicMethodsOf<LicensingService> = lazyObject({
    notifyUsage: jest.fn(),
    getLicenseInformation: jest.fn(),
    isAtLeast: jest.fn(),
    isAtLeastPlatinum: jest.fn().mockReturnValue(true),
    isAtLeastGold: jest.fn(),
    isAtLeastEnterprise: jest.fn(),
  });

  // the cast here is required because jest.Mocked tries to include private members and would throw an error
  return service as unknown as LicensingServiceMock;
};

export const createNotificationServiceMock = (): NotificationServiceMock => {
  const service: PublicMethodsOf<EmailNotificationService> = lazyObject({
    notifyAssignees: jest.fn(),
    bulkNotifyAssignees: jest.fn(),
  });

  // the cast here is required because jest.Mocked tries to include private members and would throw an error
  return service as unknown as NotificationServiceMock;
};

export const createTemplatesServiceMock = (): TemplatesServiceMock => {
  const service: PublicMethodsOf<TemplatesService> = lazyObject({
    getAllTemplates: jest.fn(),
    getTemplate: jest.fn(),
    createTemplate: jest.fn(),
    updateTemplate: jest.fn(),
    incrementUsageStats: jest.fn(),
    deleteTemplate: jest.fn(),
    getTags: jest.fn(),
    getAuthors: jest.fn(),
    getTemplateVersionsForExtendedFieldSearch: jest.fn().mockResolvedValue([]),
  });

  // the cast here is required because jest.Mocked tries to include private members and would throw an error
  return service as unknown as TemplatesServiceMock;
};

export const createFieldDefinitionsServiceMock = (): FieldDefinitionsServiceMock => {
  const service: PublicMethodsOf<FieldDefinitionsService> = lazyObject({
    getFieldDefinitions: jest.fn().mockResolvedValue({ fieldDefinitions: [], total: 0 }),
    getFieldDefinition: jest.fn(),
    createFieldDefinition: jest.fn(),
    updateFieldDefinition: jest.fn(),
    deleteFieldDefinition: jest.fn(),
  });

  return service as unknown as FieldDefinitionsServiceMock;
};
