/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { Client, estypes, TransportResult } from '@elastic/elasticsearch';
import type { GetResponse } from '@elastic/elasticsearch/lib/api/types';
import { ALERTING_CASES_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server/src/saved_objects_index_pattern';

import type SuperTest from 'supertest';
import {
  CASE_COMMENT_SAVED_OBJECT,
  CASE_CONFIGURE_SAVED_OBJECT,
  CASE_REPORTERS_URL,
  CASE_SAVED_OBJECT,
  CASE_TAGS_URL,
  CASE_USER_ACTION_SAVED_OBJECT,
  CASES_INTERNAL_URL,
  CASES_URL,
  INTERNAL_CASE_METRICS_URL,
  INTERNAL_CASE_SIMILAR_CASES_URL,
  INTERNAL_GET_CASE_CATEGORIES_URL,
} from '@kbn/cases-plugin/common/constants';
import type {
  CaseMetricsFeature,
  CasesMetricsResponse,
  SingleCaseMetricsResponse,
} from '@kbn/cases-plugin/common';
import type { CasePersistedAttributes } from '@kbn/cases-plugin/server/common/types/case';
import type { SavedObjectsRawDocSource } from '@kbn/core/server';
import type { ConfigurationPersistedAttributes } from '@kbn/cases-plugin/server/common/types/configure';
import type {
  Case,
  CaseCustomField,
  Cases,
  CaseStatuses,
  ConnectorMappingsAttributes,
} from '@kbn/cases-plugin/common/types/domain';
import type {
  AddObservableRequest,
  CaseResolveResponse,
  CasesBulkGetResponse,
  CasesFindResponse,
  CasesPatchRequest,
  CasesSimilarResponse,
  CaseWithUpdateSummary,
  CustomFieldPutRequest,
  DocumentResponse,
  GetRelatedCasesByAlertResponse,
  SimilarCasesSearchRequest,
  UpdateObservableRequest,
  UserActionFindRequest,
  UserActionInternalFindResponse,
} from '@kbn/cases-plugin/common/types/api';
import {
  getCaseCreateObservableUrl,
  getCaseDeleteObservableUrl,
  getCaseFindUserActionsUrl,
  getCaseUpdateObservableUrl,
} from '@kbn/cases-plugin/common/api';
import type { User } from '../authentication/types';
import { superUser } from '../authentication/users';
import { getSpaceUrlPrefix, setupAuth } from './helpers';

export * from './attachments';
export * from './case';
export * from './connectors';
export * from './user_actions';
export * from './user_profiles';
export * from './omit';
export * from './configuration';
export * from './files';
export * from './telemetry';

export { getSpaceUrlPrefix } from './helpers';

interface SetStatusCasesParams {
  id: string;
  version: string;
  status: CaseStatuses;
}

/**
 * Sets the status of some cases.
 */
export const setStatus = async ({
  supertest,
  cases,
}: {
  supertest: SuperTest.Agent;
  cases: SetStatusCasesParams[];
}): Promise<Cases> => {
  const { body }: { body: Cases } = await supertest
    .patch(CASES_URL)
    .set('kbn-xsrf', 'true')
    .send({ cases })
    .expect(200);
  return body;
};

/**
 * Add case as a connector
 */
export const createCaseAction = async (supertest: SuperTest.Agent) => {
  const { body: createdAction } = await supertest
    .post('/api/actions/connector')
    .set('kbn-xsrf', 'foo')
    .send({
      name: 'A case connector',
      connector_type_id: '.case',
      config: {},
    })
    .expect(200);
  return createdAction.id;
};

/**
 * Remove a connector
 */
export const deleteCaseAction = async (supertest: SuperTest.Agent, id: string) => {
  await supertest.delete(`/api/actions/connector/${id}`).set('kbn-xsrf', 'foo');
};

export const getMappings = () => [
  {
    source: 'title',
    target: 'name',
    actionType: 'overwrite',
  },
  {
    source: 'description',
    target: 'description',
    actionType: 'overwrite',
  },
  {
    source: 'comments',
    target: 'comments',
    actionType: 'append',
  },
];

export const deleteAllCaseItems = async (es: Client) => {
  await Promise.all([
    deleteCasesByESQuery(es),
    deleteCasesUserActions(es),
    deleteComments(es),
    deleteUnifiedAttachments(es),
    deleteConfiguration(es),
    deleteMappings(es),
    deleteTemplates(es),
    deleteFieldDefinitions(es),
  ]);
};

export const deleteCasesUserActions = async (es: Client): Promise<void> => {
  await es.deleteByQuery({
    index: ALERTING_CASES_SAVED_OBJECT_INDEX,
    q: 'type:cases-user-actions',
    wait_for_completion: true,
    refresh: true,
    body: {},
    conflicts: 'proceed',
  });
};

export const deleteCasesByESQuery = async (es: Client): Promise<void> => {
  await es.deleteByQuery({
    index: ALERTING_CASES_SAVED_OBJECT_INDEX,
    q: 'type:cases',
    wait_for_completion: true,
    refresh: true,
    body: {},
    conflicts: 'proceed',
  });
};

export const deleteComments = async (es: Client): Promise<void> => {
  await es.deleteByQuery({
    index: ALERTING_CASES_SAVED_OBJECT_INDEX,
    q: 'type:cases-comments',
    wait_for_completion: true,
    refresh: true,
    body: {},
    conflicts: 'proceed',
  });
};

export const deleteUnifiedAttachments = async (es: Client): Promise<void> => {
  await es.deleteByQuery({
    index: ALERTING_CASES_SAVED_OBJECT_INDEX,
    q: 'type:cases-attachments',
    wait_for_completion: true,
    refresh: true,
    body: {},
    conflicts: 'proceed',
  });
};

export const deleteConfiguration = async (es: Client): Promise<void> => {
  await es.deleteByQuery({
    index: ALERTING_CASES_SAVED_OBJECT_INDEX,
    q: 'type:cases-configure',
    wait_for_completion: true,
    refresh: true,
    body: {},
    conflicts: 'proceed',
  });
};

export const deleteMappings = async (es: Client): Promise<void> => {
  await es.deleteByQuery({
    index: ALERTING_CASES_SAVED_OBJECT_INDEX,
    q: 'type:cases-connector-mappings',
    wait_for_completion: true,
    refresh: true,
    body: {},
    conflicts: 'proceed',
  });
};

export const deleteTemplates = async (es: Client): Promise<void> => {
  await es.deleteByQuery({
    index: ALERTING_CASES_SAVED_OBJECT_INDEX,
    q: 'type:cases-templates',
    wait_for_completion: true,
    refresh: true,
    body: {},
    conflicts: 'proceed',
  });
};

export const deleteFieldDefinitions = async (es: Client): Promise<void> => {
  await es.deleteByQuery({
    index: ALERTING_CASES_SAVED_OBJECT_INDEX,
    q: 'type:cases-field-definition',
    wait_for_completion: true,
    refresh: true,
    body: {},
    conflicts: 'proceed',
  });
};

export const superUserSpace1Auth = getAuthWithSuperUser();

/**
 * Returns an auth object with the specified space and user set as super user. The result can be passed to other utility
 * functions.
 */
export function getAuthWithSuperUser(space: string | null = 'space1'): {
  user: User;
  space: string | null;
} {
  return { user: superUser, space };
}

/**
 * Converts the space into the appropriate string for use by the actions remover utility object.
 */
export function getActionsSpace(space: string | null) {
  return space ?? 'default';
}

interface OwnerEntity {
  owner: string;
}

export const ensureSavedObjectIsAuthorized = (
  entities: OwnerEntity[],
  numberOfExpectedCases: number,
  owners: string[]
) => {
  expect(entities.length).to.eql(numberOfExpectedCases);
  entities.forEach((entity) => expect(owners.includes(entity.owner)).to.be(true));
};

interface ConnectorMappingsSavedObject {
  'cases-connector-mappings': ConnectorMappingsAttributes;
}

/**
 * Returns connector mappings saved objects from Elasticsearch directly.
 */
export const getConnectorMappingsFromES = async ({ es }: { es: Client }) => {
  const mappings: TransportResult<
    estypes.SearchResponse<ConnectorMappingsSavedObject>,
    unknown
  > = await es.search(
    {
      index: ALERTING_CASES_SAVED_OBJECT_INDEX,
      query: {
        term: {
          type: {
            value: 'cases-connector-mappings',
          },
        },
      },
    },
    { meta: true }
  );

  return mappings;
};

interface ConfigureSavedObject {
  'cases-configure': ConfigurationPersistedAttributes;
}

/**
 * Returns configure saved objects from Elasticsearch directly.
 */
export const getConfigureSavedObjectsFromES = async ({ es }: { es: Client }) => {
  const configure: TransportResult<
    estypes.SearchResponse<ConfigureSavedObject>,
    unknown
  > = await es.search(
    {
      index: ALERTING_CASES_SAVED_OBJECT_INDEX,
      query: {
        term: {
          type: {
            value: CASE_CONFIGURE_SAVED_OBJECT,
          },
        },
      },
    },
    { meta: true }
  );

  return configure;
};

export const getCaseSavedObjectsFromES = async ({ es }: { es: Client }) => {
  const cases: TransportResult<
    estypes.SearchResponse<{ cases: CasePersistedAttributes }>,
    unknown
  > = await es.search(
    {
      index: ALERTING_CASES_SAVED_OBJECT_INDEX,
      query: {
        term: {
          type: {
            value: CASE_SAVED_OBJECT,
          },
        },
      },
    },
    { meta: true }
  );

  return cases;
};

export const getCaseCommentSavedObjectsFromES = async ({ es }: { es: Client }) => {
  const comments: TransportResult<
    estypes.SearchResponse<{ ['cases-comments']: CasePersistedAttributes }>,
    unknown
  > = await es.search(
    {
      index: ALERTING_CASES_SAVED_OBJECT_INDEX,
      query: {
        term: {
          type: {
            value: CASE_COMMENT_SAVED_OBJECT,
          },
        },
      },
    },
    { meta: true }
  );

  return comments;
};

export const getCaseUserActionsSavedObjectsFromES = async ({ es }: { es: Client }) => {
  const userActions: TransportResult<
    estypes.SearchResponse<{ ['cases-user-actions']: CasePersistedAttributes }>,
    unknown
  > = await es.search(
    {
      index: ALERTING_CASES_SAVED_OBJECT_INDEX,
      query: {
        term: {
          type: {
            value: CASE_USER_ACTION_SAVED_OBJECT,
          },
        },
      },
    },
    { meta: true }
  );

  return userActions;
};

export const updateCase = async ({
  supertest,
  params,
  expectedHttpCode = 200,
  auth = { user: superUser, space: null },
  headers = {},
}: {
  supertest: SuperTest.Agent;
  params: CasesPatchRequest;
  expectedHttpCode?: number;
  auth?: { user: User; space: string | null } | null;
  headers?: Record<string, string | string[]>;
}): Promise<Case[]> => {
  const apiCall = supertest.patch(`${getSpaceUrlPrefix(auth?.space)}${CASES_URL}`);

  void setupAuth({ apiCall, headers, auth });

  const { body: cases } = await apiCall
    .set('kbn-xsrf', 'true')
    .set('x-elastic-internal-origin', 'foo')
    .set(headers)
    .send(params)
    .expect(expectedHttpCode);

  if (expectedHttpCode !== 200) {
    return cases;
  }
  // Remove stats from the patch case response
  return cases.map(({ updateSummary, ...rest }: CaseWithUpdateSummary) => rest);
};

export const getCase = async ({
  supertest,
  caseId,
  expectedHttpCode = 200,
  auth = { user: superUser, space: null },
}: {
  supertest: SuperTest.Agent;
  caseId: string;
  expectedHttpCode?: number;
  auth?: { user: User; space: string | null };
}): Promise<Case> => {
  const path = `${getSpaceUrlPrefix(auth?.space)}${CASES_URL}/${caseId}`;

  const { body: theCase } = await supertest
    .get(path)
    .set('kbn-xsrf', 'true')
    .set('x-elastic-internal-origin', 'foo')
    .auth(auth.user.username, auth.user.password)
    .expect(expectedHttpCode);

  return theCase;
};

export const getCaseMetrics = async ({
  supertest,
  caseId,
  features,
  expectedHttpCode = 200,
  auth = { user: superUser, space: null },
}: {
  supertest: SuperTest.Agent;
  caseId: string;
  features: CaseMetricsFeature[] | CaseMetricsFeature;
  expectedHttpCode?: number;
  auth?: { user: User; space: string | null };
}): Promise<SingleCaseMetricsResponse> => {
  const { body: metricsResponse } = await supertest
    .get(`${getSpaceUrlPrefix(auth?.space)}${INTERNAL_CASE_METRICS_URL}/${caseId}`)
    .query({ features })
    .auth(auth.user.username, auth.user.password)
    .expect(expectedHttpCode);

  return metricsResponse;
};

export const resolveCase = async ({
  supertest,
  caseId,
  expectedHttpCode = 200,
  auth = { user: superUser, space: null },
}: {
  supertest: SuperTest.Agent;
  caseId: string;
  expectedHttpCode?: number;
  auth?: { user: User; space: string | null };
}): Promise<CaseResolveResponse> => {
  const { body: theResolvedCase } = await supertest
    .get(`${getSpaceUrlPrefix(auth?.space)}${CASES_URL}/${caseId}/resolve`)
    .set('kbn-xsrf', 'true')
    .auth(auth.user.username, auth.user.password)
    .expect(expectedHttpCode);

  return theResolvedCase;
};

export const findCases = async ({
  supertest,
  query = {},
  expectedHttpCode = 200,
  auth = { user: superUser, space: null },
}: {
  supertest: SuperTest.Agent;
  query?: Record<string, unknown>;
  expectedHttpCode?: number;
  auth?: { user: User; space: string | null };
}): Promise<CasesFindResponse> => {
  const { body: res } = await supertest
    .get(`${getSpaceUrlPrefix(auth.space)}${CASES_URL}/_find`)
    .auth(auth.user.username, auth.user.password)
    .query({ sortOrder: 'asc', ...query })
    .set('kbn-xsrf', 'true')
    .send()
    .expect(expectedHttpCode);

  return res;
};

export const getCasesByAlert = async ({
  supertest,
  alertID,
  query = {},
  expectedHttpCode = 200,
  auth = { user: superUser, space: null },
}: {
  supertest: SuperTest.Agent;
  alertID: string;
  query?: Record<string, unknown>;
  expectedHttpCode?: number;
  auth?: { user: User; space: string | null };
}): Promise<GetRelatedCasesByAlertResponse> => {
  const { body: res } = await supertest
    .get(`${getSpaceUrlPrefix(auth.space)}${CASES_URL}/alerts/${alertID}`)
    .auth(auth.user.username, auth.user.password)
    .query(query)
    .expect(expectedHttpCode);

  return res;
};

export const getTags = async ({
  supertest,
  query = {},
  expectedHttpCode = 200,
  auth = { user: superUser, space: null },
}: {
  supertest: SuperTest.Agent;
  query?: Record<string, unknown>;
  expectedHttpCode?: number;
  auth?: { user: User; space: string | null };
}): Promise<CasesFindResponse> => {
  const { body: res } = await supertest
    .get(`${getSpaceUrlPrefix(auth.space)}${CASE_TAGS_URL}`)
    .auth(auth.user.username, auth.user.password)
    .set('kbn-xsrf', 'true')
    .query({ ...query })
    .expect(expectedHttpCode);

  return res;
};

export const getReporters = async ({
  supertest,
  query = {},
  expectedHttpCode = 200,
  auth = { user: superUser, space: null },
}: {
  supertest: SuperTest.Agent;
  query?: Record<string, unknown>;
  expectedHttpCode?: number;
  auth?: { user: User; space: string | null };
}): Promise<CasesFindResponse> => {
  const { body: res } = await supertest
    .get(`${getSpaceUrlPrefix(auth.space)}${CASE_REPORTERS_URL}`)
    .auth(auth.user.username, auth.user.password)
    .set('kbn-xsrf', 'true')
    .query({ ...query })
    .expect(expectedHttpCode);

  return res;
};

export const getCategories = async ({
  supertest,
  query = {},
  expectedHttpCode = 200,
  auth = { user: superUser, space: null },
}: {
  supertest: SuperTest.Agent;
  query?: Record<string, unknown>;
  expectedHttpCode?: number;
  auth?: { user: User; space: string | null };
}): Promise<CasesFindResponse> => {
  const { body: res } = await supertest
    .get(`${getSpaceUrlPrefix(auth.space)}${INTERNAL_GET_CASE_CATEGORIES_URL}`)
    .auth(auth.user.username, auth.user.password)
    .set('kbn-xsrf', 'true')
    .query({ ...query })
    .expect(expectedHttpCode);

  return res;
};

export const pushCase = async ({
  supertest,
  caseId,
  connectorId,
  expectedHttpCode = 200,
  auth = { user: superUser, space: null },
  headers = {},
}: {
  supertest: SuperTest.Agent;
  caseId: string;
  connectorId: string;
  expectedHttpCode?: number;
  auth?: { user: User; space: string | null } | null;
  headers?: Record<string, string | string[]>;
}): Promise<Case> => {
  const apiCall = supertest.post(
    `${getSpaceUrlPrefix(auth?.space)}${CASES_URL}/${caseId}/connector/${connectorId}/_push`
  );

  void setupAuth({ apiCall, headers, auth });

  const { body: res } = await apiCall
    .set('kbn-xsrf', 'true')
    .set(headers)
    .send({})
    .expect(expectedHttpCode);

  return res;
};

export const getAlertsAttachedToCase = async ({
  supertest,
  caseId,
  expectedHttpCode = 200,
  auth = { user: superUser, space: null },
}: {
  supertest: SuperTest.Agent;
  caseId: string;
  expectedHttpCode?: number;
  auth?: { user: User; space: string | null };
}): Promise<DocumentResponse> => {
  const { body: theCase } = await supertest
    .get(`${getSpaceUrlPrefix(auth?.space)}${CASES_URL}/${caseId}/alerts`)
    .auth(auth.user.username, auth.user.password)
    .expect(expectedHttpCode);

  return theCase;
};

/**
 * Extracts the warning value a warning header that is formatted according to RFC 7234.
 * For example for the string 299 Kibana-8.1.0 "Deprecation endpoint", the return value is Deprecation endpoint.
 *
 */
export const extractWarningValueFromWarningHeader = (warningHeader: string) => {
  const firstQuote = warningHeader.indexOf('"');
  const lastQuote = warningHeader.length - 1;
  const warningValue = warningHeader.substring(firstQuote + 1, lastQuote);
  return warningValue;
};

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const calculateDuration = (closedAt: string | null, createdAt: string | null): number => {
  if (closedAt == null || createdAt == null) {
    throw new Error('Dates are null');
  }

  const createdAtMillis = new Date(createdAt).getTime();
  const closedAtMillis = new Date(closedAt).getTime();

  if (isNaN(createdAtMillis) || isNaN(closedAtMillis)) {
    throw new Error('Dates are invalid');
  }

  if (closedAtMillis < createdAtMillis) {
    throw new Error('Closed date is earlier than created date');
  }

  return Math.floor(Math.abs((closedAtMillis - createdAtMillis) / 1000));
};

export const getCasesMetrics = async ({
  supertest,
  features,
  query = {},
  expectedHttpCode = 200,
  auth = { user: superUser, space: null },
}: {
  supertest: SuperTest.Agent;
  features: string[] | string;
  query?: Record<string, unknown>;
  expectedHttpCode?: number;
  auth?: { user: User; space: string | null };
}): Promise<CasesMetricsResponse> => {
  const { body: metricsResponse } = await supertest
    .get(`${getSpaceUrlPrefix(auth?.space)}${INTERNAL_CASE_METRICS_URL}`)
    .query({ features, ...query })
    .auth(auth.user.username, auth.user.password)
    .expect(expectedHttpCode);

  return metricsResponse;
};

export const getSOFromKibanaIndex = async ({
  es,
  soType,
  soId,
}: {
  es: Client;
  soType: string;
  soId: string;
}) => {
  const esResponse = await es.get<SavedObjectsRawDocSource>(
    {
      index: ALERTING_CASES_SAVED_OBJECT_INDEX,
      id: `${soType}:${soId}`,
    },
    { meta: true }
  );

  return esResponse;
};

export const getReferenceFromEsResponse = (
  esResponse: TransportResult<GetResponse<SavedObjectsRawDocSource>, unknown>,
  id: string
) => esResponse.body._source?.references?.find((r) => r.id === id);

export const bulkGetCases = async ({
  supertest,
  ids,
  fields,
  expectedHttpCode = 200,
  auth = { user: superUser, space: null },
}: {
  supertest: SuperTest.Agent;
  ids: string[];
  fields?: string[];
  expectedHttpCode?: number;
  auth?: { user: User; space: string | null };
}): Promise<CasesBulkGetResponse> => {
  const { body: res } = await supertest
    .post(`${getSpaceUrlPrefix(auth.space)}${CASES_INTERNAL_URL}/_bulk_get`)
    .auth(auth.user.username, auth.user.password)
    .set('kbn-xsrf', 'true')
    .send({ ids, fields })
    .expect(expectedHttpCode);

  return res;
};

export const searchCases = async ({
  supertest,
  body = {},
  expectedHttpCode = 200,
  auth = { user: superUser, space: null },
}: {
  supertest: SuperTest.Agent;
  body?: Record<string, unknown>;
  expectedHttpCode?: number;
  auth?: { user: User; space: string | null };
}): Promise<CasesFindResponse> => {
  const { body: res } = await supertest
    .post(`${getSpaceUrlPrefix(auth.space)}${CASES_INTERNAL_URL}/_search`)
    .auth(auth.user.username, auth.user.password)
    .set('kbn-xsrf', 'true')
    .send({ ...body })
    .expect(expectedHttpCode);

  return res;
};

export const replaceCustomField = async ({
  supertest,
  caseId,
  customFieldId,
  params,
  expectedHttpCode = 200,
  auth = { user: superUser, space: null },
  headers = {},
}: {
  supertest: SuperTest.Agent;
  caseId: string;
  customFieldId: string;
  params: CustomFieldPutRequest;
  expectedHttpCode?: number;
  auth?: { user: User; space: string | null } | null;
  headers?: Record<string, string | string[]>;
}): Promise<CaseCustomField> => {
  const apiCall = supertest.put(
    `${getSpaceUrlPrefix(
      auth?.space
    )}${CASES_INTERNAL_URL}/${caseId}/custom_fields/${customFieldId}`
  );

  void setupAuth({ apiCall, headers, auth });

  const { body: theCustomField } = await apiCall
    .set('kbn-xsrf', 'true')
    .set('x-elastic-internal-origin', 'foo')
    .set(headers)
    .send(params)
    .expect(expectedHttpCode);

  return theCustomField;
};

export const addObservable = async ({
  supertest,
  params,
  expectedHttpCode = 200,
  auth = { user: superUser, space: null },
  headers = {},
  caseId,
}: {
  supertest: SuperTest.Agent;
  params: AddObservableRequest;
  expectedHttpCode?: number;
  auth?: { user: User; space: string | null } | null;
  headers?: Record<string, string | string[]>;
  caseId: string;
}): Promise<Case> => {
  const apiCall = supertest.post(
    `${getSpaceUrlPrefix(auth?.space)}${getCaseCreateObservableUrl(caseId)}`
  );

  void setupAuth({ apiCall, headers, auth });

  const { body: updatedCase } = await apiCall
    .set('kbn-xsrf', 'true')
    .set('x-elastic-internal-origin', 'foo')
    .set(headers)
    .send(params)
    .expect(expectedHttpCode);

  return updatedCase;
};

export const updateObservable = async ({
  supertest,
  params,
  expectedHttpCode = 200,
  auth = { user: superUser, space: null },
  headers = {},
  caseId,
  observableId,
}: {
  supertest: SuperTest.Agent;
  params: UpdateObservableRequest;
  expectedHttpCode?: number;
  auth?: { user: User; space: string | null } | null;
  headers?: Record<string, string | string[]>;
  caseId: string;
  observableId: string;
}): Promise<Case> => {
  const apiCall = supertest.patch(
    `${getSpaceUrlPrefix(auth?.space)}${getCaseUpdateObservableUrl(caseId, observableId)}`
  );
  void setupAuth({ apiCall, headers, auth });

  const { body: updatedCase } = await apiCall
    .set('kbn-xsrf', 'true')
    .set('x-elastic-internal-origin', 'foo')
    .set(headers)
    .send(params)
    .expect(expectedHttpCode);

  return updatedCase;
};

export const deleteObservable = async ({
  supertest,
  expectedHttpCode = 200,
  auth = { user: superUser, space: null },
  headers = {},
  caseId,
  observableId,
}: {
  supertest: SuperTest.Agent;
  expectedHttpCode?: number;
  auth?: { user: User; space: string | null } | null;
  headers?: Record<string, string | string[]>;
  caseId: string;
  observableId: string;
}): Promise<void> => {
  const apiCall = supertest.delete(
    `${getSpaceUrlPrefix(auth?.space)}${getCaseDeleteObservableUrl(caseId, observableId)}`
  );
  void setupAuth({ apiCall, headers, auth });

  await apiCall
    .set('kbn-xsrf', 'true')
    .set('x-elastic-internal-origin', 'foo')
    .set(headers)
    .send()
    .expect(expectedHttpCode);
};

export const similarCases = async ({
  supertest,
  body,
  expectedHttpCode = 200,
  auth = { user: superUser, space: null },
  caseId,
}: {
  supertest: SuperTest.Agent;
  body: SimilarCasesSearchRequest;
  expectedHttpCode?: number;
  auth?: { user: User; space: string | null };
  caseId: string;
}): Promise<CasesSimilarResponse> => {
  const { body: res } = await supertest
    .post(
      `${getSpaceUrlPrefix(auth.space)}${INTERNAL_CASE_SIMILAR_CASES_URL.replace(
        '{case_id}',
        caseId
      )}`
    )
    .auth(auth.user.username, auth.user.password)
    .set('kbn-xsrf', 'true')
    .send({ ...body })
    .expect(expectedHttpCode);

  return res;
};

export const findInternalCaseUserActions = async ({
  supertest,
  caseID,
  options = {},
  expectedHttpCode = 200,
  auth = { user: superUser, space: null },
}: {
  supertest: SuperTest.Agent;
  caseID: string;
  options?: UserActionFindRequest;
  expectedHttpCode?: number;
  auth?: { user: User; space: string | null };
}): Promise<UserActionInternalFindResponse> => {
  const { body: userActions } = await supertest
    .get(`${getSpaceUrlPrefix(auth.space)}${getCaseFindUserActionsUrl(caseID)}`)
    .query(options)
    .auth(auth.user.username, auth.user.password)
    .expect(expectedHttpCode);

  return userActions;
};

export const deleteAllCaseAnalyticsItems = async (es: Client) => {
  try {
    await Promise.all([
      deleteCasesAnalytics(es),
      deleteAttachmentsAnalytics(es),
      deleteCommentsAnalytics(es),
      deleteActivityAnalytics(es),
    ]);
  } catch (_) {
    // ignore errors, indexes might not exist yet
  }
};

export const deleteCasesAnalytics = async (es: Client): Promise<void> => {
  await es.deleteByQuery({
    index: ['.internal.cases.securitysolution-default', '.internal.cases.securitysolution-space1'],
    query: { match_all: {} },
    wait_for_completion: true,
    refresh: true,
    conflicts: 'proceed',
  });
};

export const deleteAttachmentsAnalytics = async (es: Client): Promise<void> => {
  await es.deleteByQuery({
    index: [
      '.internal.cases-attachments.securitysolution-default',
      '.internal.cases-attachments.securitysolution-space1',
    ],
    query: { match_all: {} },
    wait_for_completion: true,
    refresh: true,
    conflicts: 'proceed',
  });
};

export const deleteCommentsAnalytics = async (es: Client): Promise<void> => {
  await es.deleteByQuery({
    index: [
      '.internal.cases-comments.securitysolution-default',
      '.internal.cases-comments.securitysolution-space1',
    ],
    query: { match_all: {} },
    wait_for_completion: true,
    refresh: true,
    conflicts: 'proceed',
  });
};

export const deleteActivityAnalytics = async (es: Client): Promise<void> => {
  await es.deleteByQuery({
    index: [
      '.internal.cases-activity.securitysolution-default',
      '.internal.cases-activity.securitysolution-space1',
    ],
    query: { match_all: {} },
    wait_for_completion: true,
    refresh: true,
    conflicts: 'proceed',
  });
};
