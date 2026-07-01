/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PublicContract, PublicMethodsOf } from '@kbn/utility-types';
import {
  httpServerMock,
  loggingSystemMock,
  savedObjectsClientMock,
  securityServiceMock,
} from '@kbn/core/server/mocks';
import type { ISavedObjectsSerializer } from '@kbn/core-saved-objects-server';

import {
  createFileServiceFactoryMock,
  createFileServiceMock,
} from '@kbn/files-plugin/server/mocks';
import { securityMock } from '@kbn/security-plugin/server/mocks';
import { actionsClientMock } from '@kbn/actions-plugin/server/actions_client/actions_client.mock';
import { makeLensEmbeddableFactory } from '@kbn/lens-plugin/server/embeddable/make_lens_embeddable_factory';
import { serializerMock } from '@kbn/core-saved-objects-base-server-mocks';
import { spacesMock } from '@kbn/spaces-plugin/server/mocks';
import { featuresPluginMock } from '@kbn/features-plugin/server/mocks';
import { actionsMock } from '@kbn/actions-plugin/server/mocks';
import { notificationsMock } from '@kbn/notifications-plugin/server/mocks';
import { licensingMock } from '@kbn/licensing-plugin/server/mocks';
import { alertsMock } from '@kbn/alerting-plugin/server/mocks';
import { lazyObject } from '@kbn/lazy-object';
import type { CasesFindRequestWithCustomFields, CasesSearchRequest } from '../../common/types/api';
import type { CasesClient, CasesClientInternal } from '.';
import type { AttachmentsSubClient } from './attachments/client';
import type { CasesSubClient } from './cases/client';
import type { ConfigureSubClient, InternalConfigureSubClient } from './configure/client';
import type { CasesClientFactory } from './factory';
import type { MetricsSubClient } from './metrics/client';
import type { TemplatesSubClient } from './templates/client';
import type { FieldDefinitionsSubClient } from './field_definitions/client';
import type { UserActionsSubClient } from './user_actions/client';

import { CaseSeverity, CaseStatuses } from '../../common/types/domain';
import { SortFieldCase } from '../../public/containers/types';
import {
  createExternalReferenceAttachmentTypeRegistryMock,
  createPersistableStateAttachmentTypeRegistryMock,
  createUnifiedAttachmentTypeRegistryMock,
} from '../attachment_framework/mocks';
import { createAuthorizationMock } from '../authorization/mock';
import {
  connectorMappingsServiceMock,
  createAlertServiceMock,
  createAttachmentServiceMock,
  createCaseServiceMock,
  createConfigureServiceMock,
  createLicensingServiceMock,
  createUserActionServiceMock,
  createNotificationServiceMock,
  createTemplatesServiceMock,
  createFieldDefinitionsServiceMock,
} from '../services/mocks';
import { ConfigSchema } from '../config';
import {
  V2_NOOP_ACTIVITY_WRITER,
  V2_NOOP_DATA_VIEW_REFRESHER,
  V2_NOOP_WRITER,
} from '../cases_analytics_v2';
import { CasesEventBus } from '../events/event_bus';

const createCasesEventBusMock = (): CasesEventBus => {
  return {
    ...new CasesEventBus(),
    emitCaseCreated: jest.fn(),
    emitCaseUpdated: jest.fn(),
    emitAttachmentsAdded: jest.fn(),
    onCaseCreated: jest.fn(),
    onCaseUpdated: jest.fn(),
    onAttachmentsAdded: jest.fn(),
  };
};

type CasesSubClientMock = jest.Mocked<CasesSubClient>;

const createCasesSubClientMock = (): CasesSubClientMock => {
  return lazyObject({
    create: jest.fn(),
    bulkCreate: jest.fn(),
    search: jest.fn(),
    find: jest.fn(),
    resolve: jest.fn(),
    get: jest.fn(),
    bulkGet: jest.fn(),
    push: jest.fn(),
    bulkUpdate: jest.fn(),
    delete: jest.fn(),
    getTags: jest.fn(),
    getReporters: jest.fn(),
    getCasesByAlertID: jest.fn(),
    getCategories: jest.fn(),
    replaceCustomField: jest.fn(),
    similar: jest.fn(),
    addObservable: jest.fn(),
    updateObservable: jest.fn(),
    deleteObservable: jest.fn(),
    bulkAddObservables: jest.fn(),
  });
};

type MetricsSubClientMock = jest.Mocked<MetricsSubClient>;

const createMetricsSubClientMock = (): MetricsSubClientMock => {
  return lazyObject({
    getCaseMetrics: jest.fn(),
    getCasesMetrics: jest.fn(),
    getStatusTotalsByType: jest.fn(),
  });
};

type AttachmentsSubClientMock = jest.Mocked<AttachmentsSubClient>;

const createAttachmentsSubClientMock = (): AttachmentsSubClientMock => {
  return lazyObject({
    bulkGet: jest.fn(),
    add: jest.fn(),
    addFile: jest.fn(),
    bulkCreate: jest.fn(),
    delete: jest.fn(),
    deleteAll: jest.fn(),
    bulkDeleteFileAttachments: jest.fn(),
    find: jest.fn(),
    getAll: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    getAllDocumentsAttachedToCase: jest.fn(),
  });
};

type UserActionsSubClientMock = jest.Mocked<UserActionsSubClient>;

const createUserActionsSubClientMock = (): UserActionsSubClientMock => {
  return lazyObject({
    find: jest.fn(),
    getAll: jest.fn(),
    getConnectors: jest.fn(),
    stats: jest.fn(),
    getUsers: jest.fn(),
  });
};

type ConfigureSubClientMock = jest.Mocked<ConfigureSubClient>;

const createConfigureSubClientMock = (): ConfigureSubClientMock => {
  return lazyObject({
    get: jest.fn(),
    getConnectors: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  });
};

type TemplatesSubClientMock = jest.Mocked<TemplatesSubClient>;

const createTemplatesSubClientMock = (): TemplatesSubClientMock => {
  return lazyObject({
    getAllTemplates: jest.fn(),
    getTemplate: jest.fn(),
    createTemplate: jest.fn(),
    updateTemplate: jest.fn(),
    deleteTemplate: jest.fn(),
    getTags: jest.fn(),
    getAuthors: jest.fn(),
  });
};

type FieldDefinitionsSubClientMock = jest.Mocked<FieldDefinitionsSubClient>;

const createFieldDefinitionsSubClientMock = (): FieldDefinitionsSubClientMock => {
  return lazyObject({
    getFieldDefinitions: jest.fn(),
    getFieldDefinition: jest.fn(),
    createFieldDefinition: jest.fn(),
    updateFieldDefinition: jest.fn(),
    deleteFieldDefinition: jest.fn(),
  });
};

type InternalConfigureSubClientMock = jest.Mocked<InternalConfigureSubClient>;

const createInternalConfigureSubClientMock = (): InternalConfigureSubClientMock => {
  return lazyObject({
    getMappings: jest.fn(),
    createMappings: jest.fn(),
    updateMappings: jest.fn(),
  });
};

export interface CasesClientMock extends CasesClient {
  cases: CasesSubClientMock;
  attachments: AttachmentsSubClientMock;
  userActions: UserActionsSubClientMock;
  templates: TemplatesSubClientMock;
  fieldDefinitions: FieldDefinitionsSubClientMock;
}

export const createCasesClientMock = (): CasesClientMock => {
  const client: PublicContract<CasesClient> = lazyObject({
    cases: createCasesSubClientMock(),
    attachments: createAttachmentsSubClientMock(),
    userActions: createUserActionsSubClientMock(),
    configure: createConfigureSubClientMock(),
    metrics: createMetricsSubClientMock(),
    templates: createTemplatesSubClientMock(),
    fieldDefinitions: createFieldDefinitionsSubClientMock(),
  });
  return client as unknown as CasesClientMock;
};

type CasesClientInternalMock = jest.Mocked<CasesClientInternal>;

export const createCasesClientInternalMock = (): CasesClientInternalMock => {
  const client: PublicContract<CasesClientInternal> = lazyObject({
    configuration: createInternalConfigureSubClientMock(),
  });

  return client as unknown as CasesClientInternalMock;
};

export type CasesClientFactoryMock = jest.Mocked<CasesClientFactory>;

export const createCasesClientFactory = (): CasesClientFactoryMock => {
  const factory: PublicMethodsOf<CasesClientFactory> = {
    initialize: jest.fn(),
    create: jest.fn(),
  };

  return factory as unknown as CasesClientFactoryMock;
};

type SavedObjectsSerializerMock = jest.Mocked<ISavedObjectsSerializer>;

export const createSavedObjectsSerializerMock = (): SavedObjectsSerializerMock => {
  const serializer = serializerMock.create();
  serializer.generateRawId.mockImplementation(
    (namespace: string | undefined, type: string, id: string) => {
      const namespacePrefix = namespace ? `${namespace}:` : '';
      return `${namespacePrefix}${type}:${id}`;
    }
  );

  return serializer;
};

export const createCasesClientMockArgs = () => {
  return {
    services: {
      alertsService: createAlertServiceMock(),
      attachmentService: createAttachmentServiceMock(),
      caseService: createCaseServiceMock(),
      caseConfigureService: createConfigureServiceMock(),
      connectorMappingsService: connectorMappingsServiceMock(),
      userActionService: createUserActionServiceMock(),
      licensingService: createLicensingServiceMock(),
      notificationService: createNotificationServiceMock(),
      templatesService: createTemplatesServiceMock(),
      fieldDefinitionsService: createFieldDefinitionsServiceMock(),
    },
    authorization: createAuthorizationMock(),
    logger: loggingSystemMock.createLogger(),
    unsecuredSavedObjectsClient: savedObjectsClientMock.create(),
    actionsClient: actionsClientMock.create(),
    user: {
      username: 'damaged_raccoon',
      email: 'damaged_raccoon@elastic.co',
      full_name: 'Damaged Raccoon',
      profile_uid: 'u_J41Oh6L9ki-Vo2tOogS8WRTENzhHurGtRc87NgEAlkc_0',
    },
    spaceId: 'default',
    externalReferenceAttachmentTypeRegistry: createExternalReferenceAttachmentTypeRegistryMock(),
    persistableStateAttachmentTypeRegistry: createPersistableStateAttachmentTypeRegistryMock(),
    unifiedAttachmentTypeRegistry: createUnifiedAttachmentTypeRegistryMock(),
    securityStartPlugin: securityMock.createStart(),
    lensEmbeddableFactory: jest.fn().mockReturnValue(
      makeLensEmbeddableFactory(
        () => ({}),
        () => ({}),
        {}
      )
    ),
    savedObjectsSerializer: createSavedObjectsSerializerMock(),
    fileService: createFileServiceMock(),
    config: ConfigSchema.validate({}),
    casesEventBus: createCasesEventBusMock(),
    request: httpServerMock.createKibanaRequest(),
  };
};

export const createCasesClientFactoryMockArgs = () => {
  return {
    securityPluginSetup: securityMock.createSetup(),
    securityPluginStart: securityMock.createStart(),
    securityServiceStart: securityServiceMock.createStart(),
    spacesPluginStart: spacesMock.createStart(),
    featuresPluginStart: featuresPluginMock.createSetup(),
    actionsPluginStart: actionsMock.createStart(),
    licensingPluginStart: licensingMock.createStart(),
    notifications: notificationsMock.createStart(),
    ruleRegistry: { getRacClientWithRequest: jest.fn(), alerting: alertsMock.createStart() },
    filesPluginStart: { fileServiceFactory: createFileServiceFactoryMock() },
    publicBaseUrl: 'https//example.com',
    lensEmbeddableFactory: jest.fn().mockReturnValue(
      makeLensEmbeddableFactory(
        () => ({}),
        () => ({}),
        {}
      )
    ),
    externalReferenceAttachmentTypeRegistry: createExternalReferenceAttachmentTypeRegistryMock(),
    persistableStateAttachmentTypeRegistry: createPersistableStateAttachmentTypeRegistryMock(),
    config: ConfigSchema.validate({}),
    unifiedAttachmentTypeRegistry: createUnifiedAttachmentTypeRegistryMock(),
    casesEventBus: createCasesEventBusMock(),
    // Tests don't drive analytics v2; the no-op writers keep every hook
    // invoked through the factory a tight no-op. The data view refresher
    // gets the same treatment so the templates service is happy without
    // any wiring.
    analyticsV2Writer: V2_NOOP_WRITER,
    analyticsV2ActivityWriter: V2_NOOP_ACTIVITY_WRITER,
    analyticsV2DataViewRefresher: V2_NOOP_DATA_VIEW_REFRESHER,
  };
};

export const createCasesClientMockFindRequest = (
  overwrites?: CasesFindRequestWithCustomFields
): CasesFindRequestWithCustomFields => ({
  search: '',
  searchFields: ['title', 'description', 'incremental_id.text'],
  severity: CaseSeverity.LOW,
  assignees: [],
  reporters: [],
  status: CaseStatuses.open,
  tags: [],
  owner: [],
  sortField: SortFieldCase.createdAt,
  sortOrder: 'desc',
  customFields: {},
  ...overwrites,
});

export const createCasesClientMockSearchRequest = (
  overwrites?: CasesSearchRequest
): CasesSearchRequest => ({
  search: '',
  searchFields: [
    'cases.title',
    'cases.description',
    'cases.incremental_id.text',
    'cases-comments.comment',
  ],
  severity: CaseSeverity.LOW,
  assignees: [],
  reporters: [],
  status: CaseStatuses.open,
  tags: [],
  owner: [],
  sortField: SortFieldCase.createdAt,
  sortOrder: 'desc',
  customFields: {},
  ...overwrites,
});
