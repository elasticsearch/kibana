/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Shared test fixtures for the `cases_analytics_v2` Jest suites.
 * Lives under `__test_helpers__/` (Jest's default `roots` ignore
 * folder) so it never compiles into production bundles.
 *
 * Add a fixture here only when it's used by more than one test file;
 * per-file fixtures stay local to their `*.test.ts`.
 */

import type {
  SavedObject,
  SavedObjectReference,
  SavedObjectsClientContract,
  SavedObjectsFindResponse,
} from '@kbn/core/server';
import type { savedObjectsClientMock } from '@kbn/core/server/mocks';
import type { DataView, DataViewSpec, RuntimeFieldSpec } from '@kbn/data-views-plugin/common';
import type { DataViewsServerPluginStart } from '@kbn/data-views-plugin/server';
import {
  CASE_SAVED_OBJECT,
  CASE_TEMPLATE_SAVED_OBJECT,
  CASE_USER_ACTION_SAVED_OBJECT,
} from '../../../common/constants';
import {
  CasePersistedSeverity,
  CasePersistedStatus,
  type CasePersistedAttributes,
} from '../../common/types/case';
import type { UserActionPersistedAttributes } from '../../common/types/user_actions';
import type { CasesAnalyticsV2WriterContract } from '../writer';
import type { CasesActivityV2WriterContract } from '../writer/activity';

// ----- Saved-object factories -----

/**
 * Build a `cases` SO with safe defaults. Override timestamps when
 * the test cares about created/updated boundaries (reconciliation);
 * leave them alone otherwise (writer).
 */
export const makeCase = (
  id: string,
  opts: {
    createdAt?: string;
    updatedAt?: string | null;
    owner?: string;
  } = {}
): SavedObject<CasePersistedAttributes> =>
  ({
    type: CASE_SAVED_OBJECT,
    id,
    namespaces: ['default'],
    references: [],
    attributes: {
      owner: opts.owner ?? 'securitySolution',
      title: id,
      description: '',
      tags: [],
      assignees: [],
      severity: CasePersistedSeverity.LOW,
      status: CasePersistedStatus.OPEN,
      created_at: opts.createdAt ?? '2026-05-01T00:00:00.000Z',
      updated_at: opts.updatedAt === undefined ? '2026-05-01T00:00:00.000Z' : opts.updatedAt,
      closed_at: null,
      created_by: { username: 'jane', full_name: 'J', email: 'j@e.com', profile_uid: 'p-1' },
      closed_by: null,
      updated_by: null,
      duration: null,
      total_alerts: 0,
      total_comments: 0,
      connector: { name: 'none', type: '.none', fields: null },
      external_service: null,
      settings: { syncAlerts: false },
    } as unknown as CasePersistedAttributes,
  } as SavedObject<CasePersistedAttributes>);

/**
 * Build a `cases-user-actions` SO with safe defaults, for the activity
 * surface (writer, runner, doc-builder). Mirrors the real persisted
 * shape: the parent case lives in `references` (name `associated-cases`)
 * and, for connector actions, the connector id lives in `references`
 * under `CONNECTOR_ID_REFERENCE_NAME` (not in the payload).
 *
 * Override `namespaces` when a test exercises non-default-space
 * `space_id` resolution; leave it alone otherwise.
 */
export const makeUserAction = (
  id: string,
  opts: {
    type?: string;
    action?: string;
    payload?: Record<string, unknown>;
    owner?: string;
    createdAt?: string;
    namespaces?: string[];
    references?: SavedObjectReference[];
    createdBy?: UserActionPersistedAttributes['created_by'] | null;
  } = {}
): SavedObject<UserActionPersistedAttributes> =>
  ({
    type: CASE_USER_ACTION_SAVED_OBJECT,
    id,
    namespaces: opts.namespaces ?? ['default'],
    references: opts.references ?? [
      { id: 'case-1', type: CASE_SAVED_OBJECT, name: 'associated-cases' },
    ],
    attributes: {
      action: opts.action ?? 'create',
      type: opts.type ?? 'create_case',
      payload: opts.payload ?? {},
      owner: opts.owner ?? 'securitySolution',
      created_at: opts.createdAt ?? '2026-05-01T00:00:00.000Z',
      created_by:
        opts.createdBy === undefined
          ? { username: 'jane', full_name: 'J', email: 'j@e.com', profile_uid: 'p-1' }
          : opts.createdBy,
    } as UserActionPersistedAttributes,
  } as SavedObject<UserActionPersistedAttributes>);

/**
 * Build a `cases-templates` SO with the persisted shape the
 * analytics-v2 data view service reads. Only `attributes.fieldNames`
 * is consumed, so the factory leaves everything else minimal.
 */
export interface TemplateLike {
  fieldNames?: Array<{ name: string; label?: string; type: string; control?: string }>;
}

export const makeTemplate = (
  id: string,
  fieldNames: NonNullable<TemplateLike['fieldNames']>
): SavedObject<TemplateLike> =>
  ({
    type: CASE_TEMPLATE_SAVED_OBJECT,
    id,
    namespaces: ['default'],
    references: [],
    attributes: { fieldNames },
  } as unknown as SavedObject<TemplateLike>);

// ----- SO client `find` stub -----

/**
 * Stub the SO client's `find` to return one populated page, then
 * empty pages thereafter. Mirrors how the production callers
 * (`runner.ts`, `data_view/service.ts`) page until they see a short
 * response.
 *
 * Generic over the SO attributes shape so the same stub works for
 * cases, templates, or any other SO type a suite consumes.
 */
export const stubFindOnePage = <T>(
  client: ReturnType<typeof savedObjectsClientMock.create>,
  results: Array<SavedObject<T>>,
  perPage = 100
): void => {
  stubFindWithPages(client, [results], perPage);
};

/**
 * Stub the SO client's `find` to return a sequence of single-page
 * responses — one page per outer call to `client.find`. Once the
 * sequence is exhausted, every subsequent call returns an empty page.
 *
 * Use this when a test issues multiple `collectSnakeKeysForSpace` /
 * `runReconciliation` cycles and needs each cycle to see a different
 * template or case set (e.g. fingerprint cache-hit vs miss).
 */
export const stubFindWithPages = <T>(
  client: ReturnType<typeof savedObjectsClientMock.create>,
  pages: Array<Array<SavedObject<T>>>,
  perPage = 100
): void => {
  let callIdx = 0;
  client.find.mockImplementation(async () => {
    const page = pages[callIdx] ?? [];
    callIdx++;
    return {
      saved_objects: page.map((so, idx) => ({ ...so, score: 1, sort: [idx] })) as never,
      total: page.length,
      per_page: perPage,
      page: 1,
    } as SavedObjectsFindResponse<T>;
  });
};

// ----- Writer mocks -----

/**
 * Mock implementation of the writer contract for tests that only
 * need to assert the right calls are made (reconciliation runner,
 * anything orchestrating bulk dispatches).
 *
 * Tests that exercise the real writer's retry / failure logic
 * construct it directly — see `writer/writer.test.ts`.
 */
export const makeWriterMock = (): jest.Mocked<CasesAnalyticsV2WriterContract> => ({
  upsertCase: jest.fn(),
  deleteCase: jest.fn(),
  bulkUpsertCases: jest.fn(),
  bulkDeleteCases: jest.fn(),
  bulkUpsertCasesAwait: jest.fn().mockResolvedValue(undefined),
});

/**
 * Mock implementation of the activity writer contract. Same intent as
 * `makeWriterMock` — for tests asserting the right calls are dispatched
 * (activity runner, service-layer cascade/mirror hooks). Tests that
 * exercise the real writer's retry / failure logic construct it directly
 * — see `writer/activity.test.ts`.
 */
export const makeActivityWriterMock = (): jest.Mocked<CasesActivityV2WriterContract> => ({
  upsertAction: jest.fn(),
  bulkUpsertActions: jest.fn(),
  bulkDeleteActionsByCaseIds: jest.fn(),
  bulkUpsertActionsAwait: jest.fn().mockResolvedValue(undefined),
});

// ----- Data-views service mocks -----

export interface MockDvService {
  get: jest.Mock;
  createAndSave: jest.Mock;
  updateSavedObject: jest.Mock;
}

export const makeMockDvService = (): MockDvService => ({
  get: jest.fn(),
  createAndSave: jest.fn(),
  updateSavedObject: jest.fn(),
});

/**
 * Wrap a mock data views service into the plugin-start contract
 * shape the analytics-v2 service consumes. The cast to
 * `DataViewsServerPluginStart` is safe because every test only
 * pulls `dataViewsServiceFactory`.
 */
export const makeDataViewsPluginStart = (dvService: MockDvService): DataViewsServerPluginStart =>
  ({
    dataViewsServiceFactory: jest.fn().mockResolvedValue(dvService),
  } as unknown as DataViewsServerPluginStart);

/**
 * Mock data view that round-trips its runtime field map through
 * `toSpec()` and `replaceAllRuntimeFields()` — the two surfaces the
 * diff branch in `ensureOrRefreshForSpace` touches.
 *
 * `__runtimeFieldMap` is the mutable backing store; tests can read
 * or overwrite it directly to seed equality / drift fixtures.
 */
export interface MockDataView {
  id: string;
  toSpec: jest.Mock<DataViewSpec, []>;
  replaceAllRuntimeFields: jest.Mock<void, [Record<string, unknown>]>;
  __runtimeFieldMap: Record<string, RuntimeFieldSpec>;
}

export const makeDataViewWithRuntime = (
  id: string,
  runtimeFieldMap: Record<string, RuntimeFieldSpec>
): MockDataView => {
  const dv: MockDataView = {
    id,
    __runtimeFieldMap: { ...runtimeFieldMap },
    toSpec: jest.fn(),
    replaceAllRuntimeFields: jest.fn(),
  };
  // `toSpec` returns a fresh shallow copy so the diff in the service
  // uses the recorded state, not whatever happens after a later
  // `replaceAllRuntimeFields` call.
  dv.toSpec.mockImplementation(
    () =>
      ({
        id,
        title: '.cases,.cases-activity',
        runtimeFieldMap: { ...dv.__runtimeFieldMap },
      } as DataViewSpec)
  );
  // Mirror the real method's behavior so any test that later calls
  // `toSpec` sees the updated map.
  dv.replaceAllRuntimeFields.mockImplementation((newMap) => {
    dv.__runtimeFieldMap = newMap as Record<string, RuntimeFieldSpec>;
  });
  return dv;
};

/** Cast helper for places that take a `DataView`-typed parameter. */
export const asDataView = (dv: MockDataView): DataView => dv as unknown as DataView;

/** Convenience for the SO client type used everywhere in this suite. */
export type SoClient = SavedObjectsClientContract;
