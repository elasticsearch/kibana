/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Strict expectations for `user.ts` identity + extraction rules, aligned with
 * `test/scout/api/es_archives/updates/data.json` documents (unless `ingestSource` is set).
 *
 * Used by Scout `dsl_translation` / `painless_translation` and by
 * `common/domain/euid/user_ts_extraction_cases.test.ts` to guard against drift.
 */

import {
  ENTITY_CONFIDENCE,
  type EntityConfidence,
  USER_ENTITY_NAMESPACE,
} from '../../../../common/domain/definitions/user_entity_constants';

export interface UserTsExpectedMeta {
  namespace: string;
  confidence: EntityConfidence;
  entityName?: string;
}

export interface UserTsExtractionCase {
  /** Stable id for test titles / debugging */
  readonly id: string;
  /** Elasticsearch query that must match exactly one document in the updates archive */
  readonly query: object;
  /**
   * Document shape passed to `getEuidDslFilterBasedOnDocument('user', doc)` (subset of `_source`
   * sufficient to build the same filter as the archived doc).
   */
  readonly dslFilterSource: Record<string, unknown>;
  readonly expectedEuid: string | undefined;
  readonly expectedMeta?: UserTsExpectedMeta;
  /**
   * When set, the Scout test indexes this body first (then queries by `query`), e.g. for docs
   * not present in the static archive.
   */
  readonly ingestSource?: Record<string, unknown>;
  /**
   * When true, `getEuidDslFilterBasedOnDocument` / `getEuidEsqlFilterBasedOnDocument` return
   * undefined (document fails `documentsFilter` or `postAggFilter` gate vs log extraction).
   */
  readonly expectNoPerDocumentDsl?: boolean;
}

/** Cases backed by `es_archives/updates/data.json` (plus optional ingested-only rows). */
export const USER_TS_EXTRACTION_CASES: readonly UserTsExtractionCase[] = [
  // --- IDP: event.kind asset + event.module namespace mapping (user.ts fieldEvaluations) ---
  {
    id: 'idp-asset-okta-user-name',
    query: {
      bool: { must: [{ term: { 'user.name': 'john.doe' } }, { term: { 'event.module': 'okta' } }] },
    },
    dslFilterSource: {
      user: { name: 'john.doe' },
      event: { kind: 'asset', module: 'okta' },
    },
    expectedEuid: 'user:john.doe@okta',
    expectedMeta: { namespace: 'okta', confidence: ENTITY_CONFIDENCE.High, entityName: 'john.doe' },
  },
  {
    id: 'non-idp-asset-azure-user-name',
    query: {
      bool: {
        must: [{ term: { 'user.name': 'jane.smith' } }, { term: { 'host.id': 'host-456' } }],
      },
    },
    dslFilterSource: {
      user: { name: 'jane.smith' },
      event: { kind: 'asset', module: 'azure' },
      host: { id: 'host-456' },
    },
    expectedEuid: 'user:jane.smith@host-456@local',
    expectedMeta: {
      namespace: 'local',
      confidence: ENTITY_CONFIDENCE.Medium,
      entityName: 'jane.smith',
    },
  },
  {
    id: 'idp-asset-entra-id-module-user-name',
    query: { term: { 'user.name': 'bob.jones' } },
    dslFilterSource: {
      user: { name: 'bob.jones' },
      event: { kind: 'asset', module: 'entityanalytics_entra_id' },
      host: { name: 'server-01' },
    },
    expectedEuid: 'user:bob.jones@entra_id',
    expectedMeta: {
      namespace: 'entra_id',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: 'bob.jones',
    },
  },
  {
    id: 'idp-asset-o365-user-id-priority',
    query: {
      bool: {
        must: [{ term: { 'user.id': 'user-789' } }, { term: { 'user.name': 'alice.brown' } }],
      },
    },
    dslFilterSource: {
      user: { id: 'user-789', name: 'alice.brown' },
      event: { kind: 'asset', module: 'o365' },
    },
    expectedEuid: 'user:user-789@microsoft_365',
    expectedMeta: {
      namespace: 'microsoft_365',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: 'alice.brown',
    },
  },
  {
    id: 'idp-asset-o365-metrics-user-id-only',
    query: { term: { 'user.id': 'user-101' } },
    dslFilterSource: {
      user: { id: 'user-101' },
      event: { kind: 'asset', module: 'o365_metrics' },
    },
    expectedEuid: 'user:user-101@microsoft_365',
    expectedMeta: {
      namespace: 'microsoft_365',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: undefined,
    },
  },
  {
    id: 'idp-asset-ad-user-name-domain',
    query: {
      bool: {
        must: [
          { term: { 'user.name': 'arnlod.schmidt' } },
          { term: { 'user.domain': 'elastic.co' } },
        ],
      },
    },
    dslFilterSource: {
      user: { name: 'arnlod.schmidt', domain: 'elastic.co', entity: { id: 'arnlod.schmidt' } },
      event: { kind: 'asset', module: 'entityanalytics_ad' },
    },
    expectedEuid: 'user:arnlod.schmidt@elastic.co@active_directory',
    expectedMeta: {
      namespace: 'active_directory',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: 'arnlod.schmidt',
    },
  },
  {
    id: 'idp-asset-okta-user-email',
    query: { term: { 'user.email': 'test@example.com' } },
    dslFilterSource: {
      user: { email: 'test@example.com' },
      event: { kind: 'asset', module: 'entityanalytics_okta' },
    },
    expectedEuid: 'user:test@example.com@okta',
    expectedMeta: { namespace: 'okta', confidence: ENTITY_CONFIDENCE.High, entityName: undefined },
  },
  {
    id: 'idp-asset-aws-user-name-domain',
    query: {
      bool: {
        must: [{ term: { 'user.name': 'charlie.wilson' } }, { term: { 'user.domain': 'corp' } }],
      },
    },
    dslFilterSource: {
      user: { name: 'charlie.wilson', domain: 'corp' },
      event: { kind: 'asset', module: 'aws' },
    },
    expectedEuid: 'user:charlie.wilson@corp@aws',
    expectedMeta: {
      namespace: 'aws',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: 'charlie.wilson',
    },
  },
  {
    id: 'idp-asset-gcp-user-name',
    query: { term: { 'user.name': 'david.lee' } },
    dslFilterSource: {
      user: { name: 'david.lee' },
      event: { kind: 'asset', module: 'gcp' },
    },
    expectedEuid: 'user:david.lee@gcp',
    expectedMeta: { namespace: 'gcp', confidence: ENTITY_CONFIDENCE.High, entityName: 'david.lee' },
  },
  {
    id: 'idp-asset-okta-user-id-empty-name',
    query: { term: { 'user.id': 'user-202' } },
    dslFilterSource: {
      user: { id: 'user-202', name: '' },
      event: { kind: 'asset', module: 'okta' },
    },
    expectedEuid: 'user:user-202@okta',
    expectedMeta: { namespace: 'okta', confidence: ENTITY_CONFIDENCE.High, entityName: undefined },
  },
  {
    id: 'idp-asset-azure-user-id-null-name',
    query: { term: { 'user.id': 'user-303' } },
    dslFilterSource: {
      user: { id: 'user-303', name: null },
      event: { kind: 'asset', module: 'azure' },
    },
    expectedEuid: 'user:user-303@entra_id',
    expectedMeta: {
      namespace: 'entra_id',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: undefined,
    },
  },
  {
    id: 'idp-asset-o365-user-name-only',
    query: { term: { 'user.name': 'eve.martin' } },
    dslFilterSource: {
      user: { name: 'eve.martin' },
      event: { kind: 'asset', module: 'o365' },
      host: { entity: { id: '' }, id: 'host-404' },
    },
    expectedEuid: 'user:eve.martin@host-404@local',
    expectedMeta: {
      namespace: 'local',
      confidence: ENTITY_CONFIDENCE.Medium,
      entityName: 'eve.martin',
    },
  },
  {
    id: 'idp-asset-ad-user-name-only',
    query: { term: { 'user.name': 'frank.taylor' } },
    dslFilterSource: {
      user: { name: 'frank.taylor' },
      event: { kind: 'asset', module: 'entityanalytics_ad' },
      host: { entity: { id: null }, id: '', name: 'workstation-05' },
    },
    expectedEuid: 'user:frank.taylor@active_directory',
    expectedMeta: {
      namespace: 'active_directory',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: 'frank.taylor',
    },
  },
  {
    id: 'idp-asset-okta-email-over-name',
    query: {
      bool: {
        must: [
          { term: { 'user.email': 'grace@example.com' } },
          { term: { 'user.name': 'grace.anderson' } },
        ],
      },
    },
    dslFilterSource: {
      user: { email: 'grace@example.com', name: 'grace.anderson' },
      event: { kind: 'asset', module: 'okta' },
      host: { entity: { id: null }, id: null, name: null },
    },
    expectedEuid: 'user:grace@example.com@okta',
    expectedMeta: {
      namespace: 'okta',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: 'grace.anderson',
    },
  },
  {
    id: 'idp-asset-entra-user-name',
    query: { term: { 'user.name': 'henry.clark' } },
    dslFilterSource: {
      user: { name: 'henry.clark' },
      event: { kind: 'asset', module: 'entityanalytics_entra_id' },
    },
    expectedEuid: 'user:henry.clark@entra_id',
    expectedMeta: {
      namespace: 'entra_id',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: 'henry.clark',
    },
  },
  {
    id: 'idp-asset-aws-empty-domain',
    query: { term: { 'user.name': 'iris.davis' } },
    dslFilterSource: {
      user: { name: 'iris.davis', domain: '' },
      event: { kind: 'asset', module: 'aws' },
    },
    expectedEuid: 'user:iris.davis@aws',
    expectedMeta: {
      namespace: 'aws',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: 'iris.davis',
    },
  },
  {
    id: 'idp-asset-gcp-null-domain',
    query: { term: { 'user.name': 'jack.white' } },
    dslFilterSource: {
      user: { name: 'jack.white', domain: null },
      event: { kind: 'asset', module: 'gcp' },
    },
    expectedEuid: 'user:jack.white@gcp',
    expectedMeta: {
      namespace: 'gcp',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: 'jack.white',
    },
  },
  // --- Asset + cloud.provider (user.ts fieldEvaluations): namespace from cloud, not event.module ---
  {
    id: 'asset-cloud-provider-aws-no-host',
    query: { term: { 'user.name': 'scout.asset.cloud.aws.user' } },
    dslFilterSource: {
      user: { name: 'scout.asset.cloud.aws.user' },
      event: { kind: 'asset', module: 'inventory.generic', outcome: 'success' },
      cloud: { provider: 'aws' },
    },
    expectedEuid: 'user:scout.asset.cloud.aws.user@aws',
    expectedMeta: {
      namespace: 'aws',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: 'scout.asset.cloud.aws.user',
    },
    ingestSource: {
      '@timestamp': '2026-01-21T10:00:00.000Z',
      user: { name: 'scout.asset.cloud.aws.user' },
      event: { kind: 'asset', module: 'inventory.generic', outcome: 'success' },
      cloud: { provider: 'aws' },
    },
  },
  {
    id: 'asset-cloud-provider-gcp-no-host',
    query: { term: { 'user.name': 'scout.asset.cloud.gcp.user' } },
    dslFilterSource: {
      user: { name: 'scout.asset.cloud.gcp.user' },
      event: { kind: 'asset', module: 'inventory.generic', outcome: 'success' },
      cloud: { provider: 'gcp' },
    },
    expectedEuid: 'user:scout.asset.cloud.gcp.user@gcp',
    expectedMeta: {
      namespace: 'gcp',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: 'scout.asset.cloud.gcp.user',
    },
    ingestSource: {
      '@timestamp': '2026-01-21T10:01:00.000Z',
      user: { name: 'scout.asset.cloud.gcp.user' },
      event: { kind: 'asset', module: 'inventory.generic', outcome: 'success' },
      cloud: { provider: 'gcp' },
    },
  },
  {
    id: 'asset-cloud-provider-azure-no-host',
    query: { term: { 'user.name': 'scout.asset.cloud.azure.user' } },
    dslFilterSource: {
      user: { name: 'scout.asset.cloud.azure.user' },
      event: { kind: 'asset', module: 'inventory.generic', outcome: 'success' },
      cloud: { provider: 'azure' },
    },
    expectedEuid: 'user:scout.asset.cloud.azure.user@entra_id',
    expectedMeta: {
      namespace: 'entra_id',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: 'scout.asset.cloud.azure.user',
    },
    ingestSource: {
      '@timestamp': '2026-01-21T10:02:00.000Z',
      user: { name: 'scout.asset.cloud.azure.user' },
      event: { kind: 'asset', module: 'inventory.generic', outcome: 'success' },
      cloud: { provider: 'azure' },
    },
  },
  {
    id: 'asset-cloud-provider-aws-with-host-local',
    query: {
      bool: {
        must: [
          { term: { 'user.name': 'scout.asset.cloud.aws.local.user' } },
          { term: { 'host.id': 'scout-host-cloud-aws-local' } },
        ],
      },
    },
    dslFilterSource: {
      user: { name: 'scout.asset.cloud.aws.local.user' },
      host: { id: 'scout-host-cloud-aws-local' },
      event: { kind: 'asset', module: 'inventory.generic', outcome: 'success' },
      cloud: { provider: 'aws' },
    },
    expectedEuid: 'user:scout.asset.cloud.aws.local.user@scout-host-cloud-aws-local@local',
    expectedMeta: {
      namespace: 'local',
      confidence: ENTITY_CONFIDENCE.Medium,
      entityName: 'scout.asset.cloud.aws.local.user',
    },
    ingestSource: {
      '@timestamp': '2026-01-21T10:03:00.000Z',
      user: { name: 'scout.asset.cloud.aws.local.user' },
      host: { id: 'scout-host-cloud-aws-local' },
      event: { kind: 'asset', module: 'inventory.generic', outcome: 'success' },
      cloud: { provider: 'aws' },
    },
  },
  // --- IDP: IAM event types (idpEventTypeCondition), not asset kind ---
  {
    id: 'idp-iam-okta-user-id',
    query: {
      bool: {
        must: [{ term: { 'user.name': 'karen.green' } }, { term: { 'user.id': 'user-505' } }],
      },
    },
    dslFilterSource: {
      user: { id: 'user-505', name: 'karen.green' },
      event: { kind: 'any-random', category: 'iam', type: 'user', module: 'okta' },
      host: { entity: { id: 'host-505' } },
    },
    expectedEuid: 'user:user-505@okta',
    expectedMeta: {
      namespace: 'okta',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: 'karen.green',
    },
  },
  {
    id: 'idp-iam-azure-null-kind-email',
    query: {
      bool: {
        must: [
          { term: { 'user.email': 'larry@example.com' } },
          { term: { 'user.name': 'larry.black' } },
        ],
      },
    },
    dslFilterSource: {
      user: { email: 'larry@example.com', name: 'larry.black' },
      event: { kind: null, category: 'iam', type: 'creation', module: 'azure' },
      host: { id: 'host-606' },
    },
    expectedEuid: 'user:larry@example.com@entra_id',
    expectedMeta: {
      namespace: 'entra_id',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: 'larry.black',
    },
  },
  {
    id: 'idp-iam-ad-user-name-domain',
    query: {
      bool: { must: [{ term: { 'user.name': 'mary.blue' } }, { term: { 'user.domain': 'corp' } }] },
    },
    dslFilterSource: {
      user: { name: 'mary.blue', domain: 'corp' },
      event: { category: 'iam', type: 'group', module: 'entityanalytics_ad' },
      host: { name: 'server-07' },
    },
    expectedEuid: 'user:mary.blue@corp@active_directory',
    expectedMeta: {
      namespace: 'active_directory',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: 'mary.blue',
    },
  },
  // --- Namespace from data_stream.dataset (first segment) ---
  {
    id: 'idp-iam-okta-from-dataset',
    query: { term: { 'user.name': 'okta.from.dataset' } },
    dslFilterSource: {
      user: { name: 'okta.from.dataset' },
      event: { category: 'iam', type: 'deletion' },
      data_stream: { dataset: 'entityanalytics_okta.users' },
    },
    expectedEuid: 'user:okta.from.dataset@okta',
    expectedMeta: {
      namespace: 'okta',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: 'okta.from.dataset',
    },
  },
  {
    id: 'idp-asset-aws-from-dataset',
    query: { term: { 'user.name': 'cloudtrail.user' } },
    dslFilterSource: {
      user: { name: 'cloudtrail.user' },
      event: { kind: 'asset' },
      data_stream: { dataset: 'aws.cloudtrail' },
    },
    expectedEuid: 'user:cloudtrail.user@aws',
    expectedMeta: {
      namespace: 'aws',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: 'cloudtrail.user',
    },
  },
  // --- Unknown namespace fallback (no module / dataset mapping) ---
  {
    id: 'idp-asset-no-module-user-name',
    query: { term: { 'user.name': 'not-captured-no-module' } },
    dslFilterSource: {
      user: { name: 'not-captured-no-module' },
      event: { kind: 'asset' },
    },
    expectedEuid: 'user:not-captured-no-module@unknown',
    expectedMeta: {
      namespace: 'unknown',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: 'not-captured-no-module',
    },
  },
  {
    id: 'idp-asset-no-module-second-unknown',
    query: { term: { 'user.name': 'no.module.user' } },
    dslFilterSource: {
      user: { name: 'no.module.user' },
      event: { kind: 'asset' },
    },
    expectedEuid: 'user:no.module.user@unknown',
    expectedMeta: {
      namespace: 'unknown',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: 'no.module.user',
    },
  },
  // --- Non-IDP local namespace (fieldEvaluations local + after-stats confidence) ---
  {
    id: 'non-idp-local-user-host',
    query: {
      bool: {
        must: [
          { term: { 'user.name': 'alice.local' } },
          { term: { 'host.id': 'host-nonidp-001' } },
        ],
      },
    },
    dslFilterSource: {
      user: { name: 'alice.local' },
      host: { id: 'host-nonidp-001' },
    },
    expectedEuid: 'user:alice.local@host-nonidp-001@local',
    expectedMeta: {
      namespace: USER_ENTITY_NAMESPACE.Local,
      confidence: ENTITY_CONFIDENCE.Medium,
      entityName: 'alice.local',
    },
  },
  // --- documentsFilter failures ---
  {
    id: 'documents-filter-outcome-failure',
    query: { term: { 'user.name': 'ignored-outcome-failure' } },
    dslFilterSource: {
      user: { name: 'ignored-outcome-failure' },
      event: { category: 'iam', type: 'deletion', outcome: 'failure' },
      data_stream: { dataset: 'entityanalytics_okta.users' },
    },
    expectedEuid: undefined,
    expectNoPerDocumentDsl: true,
  },
  // --- postAggFilter failures (passes documentsFilter, fails postAgg) ---
  {
    id: 'postagg-fail-no-idp-signal-non-idp',
    query: { term: { 'user.name': 'not-captured-no-event' } },
    dslFilterSource: {
      user: { name: 'not-captured-no-event' },
    },
    expectedEuid: undefined,
    expectNoPerDocumentDsl: true,
  },
  {
    id: 'postagg-fail-illegal-idp-shape',
    query: { term: { 'user.email': 'invalid-idp-illegal@test.com' } },
    dslFilterSource: {
      user: { email: 'invalid-idp-illegal@test.com' },
      event: { module: 'azure' },
    },
    expectedEuid: undefined,
    expectNoPerDocumentDsl: true,
  },
  // --- postAggFilter: entity.id exists (shared) even when IDP signals are weak ---
  {
    id: 'postagg-pass-entity-id-only',
    query: { term: { 'user.name': 'entity-id-postagg-only' } },
    dslFilterSource: {
      user: { name: 'entity-id-postagg-only' },
      entity: { id: 'stored-user-entity-001' },
    },
    expectedEuid: 'user:entity-id-postagg-only@unknown',
    expectedMeta: {
      namespace: 'unknown',
      confidence: ENTITY_CONFIDENCE.High,
      entityName: 'entity-id-postagg-only',
    },
    ingestSource: {
      '@timestamp': '2026-01-20T12:05:30Z',
      user: { name: 'entity-id-postagg-only' },
      entity: { id: 'stored-user-entity-001' },
    },
  },
];

/**
 * Synthetic user documents (not in the archive) that must not produce
 * `getEuidDslFilterBasedOnDocument` / `getEuidEsqlFilterBasedOnDocument`: they fail the same
 * `documentsFilter` ∧ `postAggFilter` gate as log extraction.
 */
export interface UserScoutInvalidPerDocumentFilterExample {
  readonly id: string;
  readonly doc: Record<string, unknown>;
}

export const USER_SCOUT_INVALID_PER_DOCUMENT_FILTER_EXAMPLES: readonly UserScoutInvalidPerDocumentFilterExample[] =
  [
    {
      id: 'postAgg-user-id-and-o365-module-without-asset-or-iam',
      doc: {
        user: { id: 'scout-synthetic-postagg-miss-user-id' },
        event: { module: 'o365' },
      },
    },
    {
      id: 'postAgg-user-email-and-okta-module-without-asset-or-iam',
      doc: {
        user: { email: 'scout-synthetic-postagg-miss@example.com' },
        event: { module: 'okta' },
      },
    },
    {
      id: 'postAgg-user-name-only-no-asset-iam-or-nonIdp-host',
      doc: {
        user: { name: 'scout-synthetic-name-only-postagg-miss' },
      },
    },
    {
      id: 'documentsFilter-event-kind-enrichment',
      doc: {
        user: { name: 'scout-synthetic-enrichment-kind' },
        event: { kind: 'enrichment' },
      },
    },
    {
      id: 'documentsFilter-event-outcome-failure-with-asset',
      doc: {
        user: { name: 'scout-synthetic-outcome-failure' },
        event: { kind: 'asset', module: 'okta', outcome: 'failure' },
      },
    },
  ];

/**
 * Expected number of user documents in `es_archives/updates` that pass
 * `getEuidDslDocumentsContainsIdFilter('user')` (documentsFilter ∧ postAggFilter).
 * Keep in sync: archive user docs with defined EUID; this table lists archive-backed cases with EUID + cases without; ingested-only
 * case is excluded here.
 */
export const USER_TS_ARCHIVE_EXPECTED_CONTAINS_ID_COUNT = 29;
