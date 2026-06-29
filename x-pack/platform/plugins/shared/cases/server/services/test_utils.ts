/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  SavedObject,
  SavedObjectReference,
  SavedObjectsClientContract,
  SavedObjectsFindResponse,
  SavedObjectsFindResult,
} from '@kbn/core/server';
import { ACTION_SAVED_OBJECT_TYPE } from '@kbn/actions-plugin/server';
import type { ExternalService, CaseAttributes, CaseConnector } from '../../common/types/domain';
import { CaseStatuses, CaseSeverity, ConnectorTypes } from '../../common/types/domain';
import { CONNECTOR_ID_REFERENCE_NAME, PUSH_CONNECTOR_ID_REFERENCE_NAME } from '../common/constants';
import {
  CASE_SAVED_OBJECT,
  NONE_CONNECTOR_ID,
  SECURITY_SOLUTION_OWNER,
} from '../../common/constants';
import { getNoneCaseConnector } from '../common/utils';
import type { ConnectorPersistedFields } from '../common/types/connectors';
import type { CasePersistedAttributes } from '../common/types/case';
import { CasePersistedSeverity, CasePersistedStatus } from '../common/types/case';
import type { ExternalServicePersisted } from '../common/types/external_service';
import type { SOWithErrors } from '../common/types';

/**
 * This is only a utility interface to help with constructing test cases. After the migration, the ES format will no longer
 * have the id field. Instead it will be moved to the references array.
 */
export interface ESCaseConnectorWithId {
  id: string;
  name: string;
  type: ConnectorTypes;
  fields: ConnectorPersistedFields | null;
}

/**
 * This file contains utility functions to aid unit test development
 */

/**
 * Create an Elasticsearch jira connector.
 *
 * @param overrides fields used to override the default jira connector
 * @returns a jira Elasticsearch connector (it has key value pairs for the fields) by default
 */
export const createESJiraConnector = (
  overrides?: Partial<ESCaseConnectorWithId>
): ESCaseConnectorWithId => {
  return {
    id: '1',
    name: ConnectorTypes.jira,
    fields: [
      { key: 'issueType', value: 'bug' },
      { key: 'priority', value: 'high' },
      { key: 'parent', value: '2' },
    ],
    type: ConnectorTypes.jira,
    ...overrides,
  };
};

/**
 * Creates a jira CaseConnector (has the actual fields defined in the object instead of key value paris)
 * @param setFieldsToNull a flag that controls setting the fields property to null
 * @returns a jira connector
 */
export const createJiraConnector = ({
  setFieldsToNull,
}: { setFieldsToNull?: boolean } = {}): CaseConnector => {
  return {
    id: '1',
    name: ConnectorTypes.jira,
    type: ConnectorTypes.jira,
    fields: setFieldsToNull
      ? null
      : {
          issueType: 'bug',
          priority: 'high',
          parent: '2',
        },
  };
};

export const createExternalService = (overrides?: Partial<ExternalService>): ExternalService => ({
  connector_id: '100',
  connector_name: '.jira',
  external_id: '100',
  external_title: 'awesome',
  external_url: 'http://www.google.com',
  pushed_at: '2019-11-25T21:54:48.952Z',
  pushed_by: {
    full_name: 'elastic',
    email: 'testemail@elastic.co',
    username: 'elastic',
  },
  ...overrides,
});

export const basicESCaseFields: CasePersistedAttributes = {
  closed_at: null,
  closed_by: null,
  created_at: '2019-11-25T21:54:48.952Z',
  created_by: {
    full_name: 'elastic',
    email: 'testemail@elastic.co',
    username: 'elastic',
  },
  severity: CasePersistedSeverity.LOW,
  duration: null,
  description: 'This is a brand new case of a bad meanie defacing data',
  title: 'Super Bad Security Issue',
  status: CasePersistedStatus.OPEN,
  tags: ['defacement'],
  updated_at: '2019-11-25T21:54:48.952Z',
  updated_by: {
    full_name: 'elastic',
    email: 'testemail@elastic.co',
    username: 'elastic',
  },
  connector: getNoneCaseConnector(),
  external_service: null,
  settings: {
    syncAlerts: true,
  },
  owner: SECURITY_SOLUTION_OWNER,
  assignees: [],
  total_alerts: -1,
  total_comments: -1,
  total_events: -1,
  category: null,
};

export const basicCaseFields: CaseAttributes = {
  closed_at: null,
  closed_by: null,
  created_at: '2019-11-25T21:54:48.952Z',
  created_by: {
    full_name: 'elastic',
    email: 'testemail@elastic.co',
    username: 'elastic',
  },
  severity: CaseSeverity.LOW,
  duration: null,
  description: 'This is a brand new case of a bad meanie defacing data',
  title: 'Super Bad Security Issue',
  status: CaseStatuses.open,
  tags: ['defacement'],
  updated_at: '2019-11-25T21:54:48.952Z',
  updated_by: {
    full_name: 'elastic',
    email: 'testemail@elastic.co',
    username: 'elastic',
  },
  connector: getNoneCaseConnector(),
  external_service: null,
  settings: {
    syncAlerts: true,
    extractObservables: true,
  },
  owner: SECURITY_SOLUTION_OWNER,
  assignees: [],
  category: null,
  customFields: [],
  observables: [],
  total_observables: 0,
  incremental_id: undefined,
};

export const createCaseSavedObjectResponse = ({
  connector,
  externalService,
  overrides,
  caseId,
}: {
  connector?: ESCaseConnectorWithId;
  externalService?: ExternalService | null;
  overrides?: Partial<CasePersistedAttributes>;
  caseId?: string;
} = {}): SavedObject<CasePersistedAttributes> => {
  const references: SavedObjectReference[] = createSavedObjectReferences({
    connector,
    externalService,
  });

  const formattedConnector = {
    type: connector?.type ?? ConnectorTypes.jira,
    name: connector?.name ?? ConnectorTypes.jira,
    fields: connector?.fields ?? null,
  };

  let restExternalService: ExternalServicePersisted | null = null;
  if (externalService !== null) {
    const { connector_id: ignored, ...rest } = externalService ?? {
      connector_name: '.jira',
      external_id: '100',
      external_title: 'awesome',
      external_url: 'http://www.google.com',
      pushed_at: '2019-11-25T21:54:48.952Z',
      pushed_by: {
        full_name: 'elastic',
        email: 'testemail@elastic.co',
        username: 'elastic',
      },
    };
    restExternalService = rest;
  }

  return {
    type: CASE_SAVED_OBJECT,
    id: caseId ?? '1',
    attributes: {
      ...basicESCaseFields,
      ...overrides,
      // if connector is null we'll default this to an incomplete jira value because the service
      // should switch it to a none connector when the id can't be found in the references array
      connector: formattedConnector,
      external_service: restExternalService,
    },
    references,
  };
};

export const createSavedObjectReferences = ({
  connector,
  externalService,
}: {
  connector?: ESCaseConnectorWithId;
  externalService?: ExternalService | null;
} = {}): SavedObjectReference[] => [
  ...(connector && connector.id !== NONE_CONNECTOR_ID
    ? [
        {
          id: connector.id,
          name: CONNECTOR_ID_REFERENCE_NAME,
          type: ACTION_SAVED_OBJECT_TYPE,
        },
      ]
    : []),
  ...(externalService && externalService.connector_id
    ? [
        {
          id: externalService.connector_id,
          name: PUSH_CONNECTOR_ID_REFERENCE_NAME,
          type: ACTION_SAVED_OBJECT_TYPE,
        },
      ]
    : []),
];

export const createConnectorObject = (overrides?: Partial<CaseConnector>) => ({
  connector: { ...createJiraConnector(), ...overrides },
});

export const createSOFindResponse = <T>(savedObjects: Array<SavedObjectsFindResult<T>>) => ({
  saved_objects: savedObjects,
  total: savedObjects.length,
  per_page: savedObjects.length,
  page: 1,
});

export const mockPointInTimeFinder =
  (unsecuredSavedObjectsClient: jest.Mocked<SavedObjectsClientContract>) =>
  (soFindRes: SavedObjectsFindResponse) => {
    unsecuredSavedObjectsClient.createPointInTimeFinder.mockReturnValue({
      close: jest.fn(),
      // @ts-expect-error
      find: function* asyncGenerator() {
        yield {
          ...soFindRes,
        };
      },
    });
  };

export const createErrorSO = <T = unknown>(
  type: string,
  { statusCode = 404 }: { statusCode?: number } = {}
): SOWithErrors<T> => ({
  id: '1',
  type,
  error: {
    error: statusCode === 404 ? 'Not Found' : 'error',
    message: statusCode === 404 ? 'Saved object not found' : 'message',
    statusCode,
  },
  references: [],
});
