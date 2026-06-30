/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

export const INDEX_PATTERN_REGEX = /^[^A-Z^\\/?"<>|\s#,]+$/;

// ---------------------------------------------------------------------------
// Array size ceilings (`maxSize`) for `schema.arrayOf` — DoS protection.
// Every value is derived from the ES|QL execution limits of the graph queries so
// validation never rejects an input/output the queries can legitimately produce,
// while still rejecting abusive payloads (flagged by GitHub Advanced Security as
// `js/kibana/unbounded-array-in-schema`).
// ---------------------------------------------------------------------------

// ES|QL caps a single query result at 10,000 rows by default
// (`esql.query.result_truncation_max_size`). This is the hard upper bound for any
// collection assembled from one query result.
const ESQL_MAX_RESULT_ROWS = 10_000;

// The events graph query applies an explicit `LIMIT 1000`, and queries without an
// explicit LIMIT (e.g. relationships) fall back to the ES|QL default of 1,000
// rows. This bounds how many event/alert rows — and the IPs/country codes
// aggregated from them — can feed a single graph.
const ESQL_DEFAULT_ROW_LIMIT = 1_000;

// Entity IDs accepted for relationship/enrichment lookups. Enrichment is chunked
// at 1,000 IDs per ES|QL query (`fetch_entity_enrichment.ts`); 5,000 caps the
// request at five chunks.
const ENTITY_IDS_MAX_SIZE = 5_000;

// Origin event IDs that seed graph traversal — bounded by the number of events a
// single graph can display (the events query `LIMIT 1000`).
const ORIGIN_EVENT_IDS_MAX_SIZE = ESQL_DEFAULT_ROW_LIMIT;

// Pinned node IDs preserved across graph refreshes.
const PINNED_IDS_MAX_SIZE = 1024;

// Index patterns fanned into a single `FROM idx1,idx2,...` ES|QL source.
export const INDEX_PATTERNS_MAX_SIZE = 100;

// Boolean clauses per section (filter/must/should/must_not) of the user ES query.
const ES_QUERY_CLAUSES_MAX_SIZE = 100;

// IPs aggregated onto a single node/entity/event via `VALUES()`, bounded by the
// default ES|QL row limit of contributing event rows.
export const IPS_MAX_SIZE = ESQL_DEFAULT_ROW_LIMIT;

// ISO 3166-1 alpha-2 country codes (~249 currently assigned); 250 covers the set.
export const COUNTRY_CODES_MAX_SIZE = 250;

// Documents aggregated onto a single graph node, bounded by the events query limit.
const DOCUMENTS_DATA_MAX_SIZE = ESQL_DEFAULT_ROW_LIMIT;

// Nodes/edges in a graph response. The events (`LIMIT 1000`) and relationship
// (default 1,000) queries each emit at most `ESQL_DEFAULT_ROW_LIMIT` rows, each
// contributing a bounded number of node/edge references; the ES|QL hard cap of
// 10,000 rows is a safe ceiling for the deduplicated result.
const GRAPH_NODES_MAX_SIZE = ESQL_MAX_RESULT_ROWS;
const GRAPH_EDGES_MAX_SIZE = ESQL_MAX_RESULT_ROWS;

// Informational status messages (currently only `REACHED_NODES_LIMIT`).
const GRAPH_MESSAGES_MAX_SIZE = 100;

// Detail endpoints (events/entities) are server-paginated; a response page holds
// at most this many records (matches the `page.size` ceiling).
export const DETAIL_PAGE_SIZE_MAX = 100;

/**
 * CPS project routing expressions accepted by the Graph API.
 * Values mirror `@kbn/cps-server-utils` (server-only package); declared here so the
 * shared-common schema can validate without depending on a server-side module.
 */
export const PROJECT_ROUTING_ORIGIN = '_alias:_origin' as const;
export const PROJECT_ROUTING_ALL = '_alias:*' as const;

export type ProjectRouting = typeof PROJECT_ROUTING_ORIGIN | typeof PROJECT_ROUTING_ALL;

/**
 * Entity ID for relationship queries.
 * isOrigin indicates whether this entity is the center/origin of the graph
 * (relevant when opening graph from entity flyout).
 */
export const entityIdSchema = schema.object({
  id: schema.string(),
  isOrigin: schema.boolean(),
});

export const graphRequestSchema = schema.object({
  nodesLimit: schema.maybe(schema.number()),
  showUnknownTarget: schema.maybe(schema.boolean()),
  query: schema.object({
    pinnedIds: schema.maybe(schema.arrayOf(schema.string(), { maxSize: PINNED_IDS_MAX_SIZE })),
    // Origin event IDs - optional, may be empty when opening from entity flyout
    originEventIds: schema.maybe(
      schema.arrayOf(schema.object({ id: schema.string(), isAlert: schema.boolean() }), {
        maxSize: ORIGIN_EVENT_IDS_MAX_SIZE,
      })
    ),
    // TODO: use zod for range validation instead of config schema
    start: schema.oneOf([schema.number(), schema.string()]),
    end: schema.oneOf([schema.number(), schema.string()]),
    indexPatterns: schema.maybe(
      schema.arrayOf(
        schema.string({
          minLength: 1,
          validate: (value) => {
            if (!INDEX_PATTERN_REGEX.test(value)) {
              return `Invalid index pattern: ${value}. Contains illegal characters.`;
            }
          },
        }),
        { minSize: 1, maxSize: INDEX_PATTERNS_MAX_SIZE }
      )
    ),
    esQuery: schema.maybe(
      schema.object({
        bool: schema.object({
          filter: schema.maybe(
            schema.arrayOf(schema.object({}, { unknowns: 'allow' }), {
              maxSize: ES_QUERY_CLAUSES_MAX_SIZE,
            })
          ),
          must: schema.maybe(
            schema.arrayOf(schema.object({}, { unknowns: 'allow' }), {
              maxSize: ES_QUERY_CLAUSES_MAX_SIZE,
            })
          ),
          should: schema.maybe(
            schema.arrayOf(schema.object({}, { unknowns: 'allow' }), {
              maxSize: ES_QUERY_CLAUSES_MAX_SIZE,
            })
          ),
          must_not: schema.maybe(
            schema.arrayOf(schema.object({}, { unknowns: 'allow' }), {
              maxSize: ES_QUERY_CLAUSES_MAX_SIZE,
            })
          ),
        }),
      })
    ),
    // Entity IDs for fetching relationships from entity store (optional, may be empty when opening from events flyout)
    entityIds: schema.maybe(schema.arrayOf(entityIdSchema, { maxSize: ENTITY_IDS_MAX_SIZE })),
    // CPS project routing applied only to logs/events queries.
    // Alerts and entity-store enrichment are always pinned to the origin project.
    projectRouting: schema.maybe(
      schema.oneOf([schema.literal(PROJECT_ROUTING_ALL), schema.literal(PROJECT_ROUTING_ORIGIN)])
    ),
  }),
});

export const DOCUMENT_TYPE_EVENT = 'event' as const;
export const DOCUMENT_TYPE_ALERT = 'alert' as const;
export const DOCUMENT_TYPE_ENTITY = 'entity' as const;

export const entitySchema = schema.object({
  name: schema.maybe(schema.string()),
  type: schema.maybe(schema.string()),
  sub_type: schema.maybe(schema.string()),
  engine_type: schema.maybe(
    schema.oneOf([
      schema.literal('host'),
      schema.literal('user'),
      schema.literal('service'),
      schema.literal('generic'),
    ])
  ),
  host: schema.maybe(
    schema.object({
      ip: schema.maybe(schema.arrayOf(schema.string(), { maxSize: IPS_MAX_SIZE })),
    })
  ),
  availableInEntityStore: schema.maybe(schema.boolean()),
  sourceFields: schema.maybe(schema.object({}, { unknowns: 'allow' })),
});

export const nodeDocumentDataSchema = schema.object({
  id: schema.string(),
  type: schema.oneOf([
    schema.literal(DOCUMENT_TYPE_EVENT),
    schema.literal(DOCUMENT_TYPE_ALERT),
    schema.literal(DOCUMENT_TYPE_ENTITY),
  ]),
  index: schema.maybe(schema.string()),
  event: schema.maybe(
    schema.object({
      id: schema.string(),
    })
  ),
  alert: schema.maybe(
    schema.object({
      ruleName: schema.maybe(schema.string()),
    })
  ),
  entity: schema.maybe(entitySchema),
});

export const REACHED_NODES_LIMIT = 'REACHED_NODES_LIMIT';

export const graphResponseSchema = () =>
  schema.object({
    nodes: schema.arrayOf(
      schema.oneOf([
        entityNodeDataSchema,
        groupNodeDataSchema,
        labelNodeDataSchema,
        relationshipNodeDataSchema,
      ]),
      { maxSize: GRAPH_NODES_MAX_SIZE }
    ),
    edges: schema.arrayOf(edgeDataSchema, { maxSize: GRAPH_EDGES_MAX_SIZE }),
    messages: schema.maybe(
      schema.arrayOf(schema.oneOf([schema.literal(REACHED_NODES_LIMIT)]), {
        maxSize: GRAPH_MESSAGES_MAX_SIZE,
      })
    ),
  });

export const nodeColorSchema = schema.oneOf([
  schema.literal('primary'),
  schema.literal('danger'),
  schema.literal('warning'),
]);

export const edgeColorSchema = schema.oneOf([
  schema.literal('primary'),
  schema.literal('danger'),
  schema.literal('warning'),
  schema.literal('subdued'),
]);

export const nodeShapeSchema = schema.oneOf([
  schema.literal('hexagon'),
  schema.literal('pentagon'),
  schema.literal('ellipse'),
  schema.literal('rectangle'),
  schema.literal('diamond'),
  schema.literal('label'),
  schema.literal('group'),
  schema.literal('relationship'),
]);

export const nodeBaseDataSchema = schema.object({
  id: schema.string(),
  label: schema.maybe(schema.string()),
  icon: schema.maybe(schema.string()),
});

export const entityNodeDataSchema = schema.allOf([
  nodeBaseDataSchema,
  schema.object({
    color: nodeColorSchema,
    shape: schema.oneOf([
      schema.literal('hexagon'),
      schema.literal('pentagon'),
      schema.literal('ellipse'),
      schema.literal('rectangle'),
      schema.literal('diamond'),
    ]),
    tag: schema.maybe(schema.string()),
    count: schema.maybe(schema.number()),
    ips: schema.maybe(schema.arrayOf(schema.string(), { maxSize: IPS_MAX_SIZE })),
    countryCodes: schema.maybe(
      schema.arrayOf(schema.string(), { maxSize: COUNTRY_CODES_MAX_SIZE })
    ),
    documentsData: schema.maybe(
      schema.arrayOf(nodeDocumentDataSchema, { maxSize: DOCUMENTS_DATA_MAX_SIZE })
    ),
  }),
]);

export const groupNodeDataSchema = schema.allOf([
  nodeBaseDataSchema,
  schema.object({
    shape: schema.literal('group'),
  }),
]);

export const labelNodeDataSchema = schema.allOf([
  nodeBaseDataSchema,
  schema.object({
    shape: schema.literal('label'),
    parentId: schema.maybe(schema.string()),
    color: nodeColorSchema,
    ips: schema.maybe(schema.arrayOf(schema.string(), { maxSize: IPS_MAX_SIZE })),
    count: schema.maybe(schema.number()),
    uniqueEventsCount: schema.maybe(schema.number()),
    uniqueAlertsCount: schema.maybe(schema.number()),
    countryCodes: schema.maybe(
      schema.arrayOf(schema.string(), { maxSize: COUNTRY_CODES_MAX_SIZE })
    ),
    documentsData: schema.maybe(
      schema.arrayOf(nodeDocumentDataSchema, { maxSize: DOCUMENTS_DATA_MAX_SIZE })
    ),
  }),
]);

export const relationshipNodeDataSchema = schema.allOf([
  nodeBaseDataSchema,
  schema.object({
    shape: schema.literal('relationship'),
    parentId: schema.maybe(schema.string()),
  }),
]);

export const edgeDataSchema = schema.object({
  id: schema.string(),
  source: schema.string(),
  target: schema.string(),
  color: edgeColorSchema,
  type: schema.maybe(schema.oneOf([schema.literal('solid'), schema.literal('dashed')])),
});
