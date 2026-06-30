/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { GLOBAL_SPACE_ID } from '../../../../common/threat_intelligence/hub';
import { fetchUrl } from '../http_client';
import { buildFingerprint } from '../fingerprint';
import { DEFAULT_SEVERITY_LEVEL, DEFAULT_SEVERITY_SCORE } from '../severity';
import { buildReportContent, collapseWhitespace, truncate } from '../text';
import type { AdapterRunContext, FetchAdapter, NormalizedReport, SourceHit } from '../types';
import { composeStixBody, composeStixTitle, splitStixBundle } from '../stix/split_bundle';

const TITLE_MAX_LENGTH = 280;
const BODY_TEXT_MAX_LENGTH = 32_000;
const TAXII_ACCEPT = 'application/taxii+json;version=2.1, application/json';
/**
 * Sub-action name on the `.taxii` ConnectorSpec. If you rename it on
 * the spec side, update this constant — the adapter has no compile-
 * time tie to the spec because the spec lives in a platform package
 * that solution code can't import circularly.
 */
const TAXII_CONNECTOR_POLL_SUB_ACTION = 'pollCollection';

/**
 * TAXII 2.1 collection-objects URLs end with
 * `/collections/<collection_id>/objects/`. We surface the collection id
 * on `provenance.source_doc_ref.index` so cross-collection rows from
 * the same upstream are distinguishable in the dashboard's "View
 * source" affordance.
 *
 * The first matching segment is taken; we don't error on URLs that
 * don't follow the convention because some TAXII servers expose
 * non-spec collection routes.
 */
const deriveCollectionId = (url: string): string => {
  const match = /\/collections\/([^/]+)/.exec(url);
  return match ? match[1] : 'unknown';
};

const readCollectionUrl = (source: SourceHit): string | undefined => {
  const url = source._source.config.url;
  return typeof url === 'string' && url.length > 0 ? url : undefined;
};

/**
 * `config.connector_id` is the operator-managed Stack Connector saved
 * object id of a `.taxii` connector — when present, the adapter routes
 * through the Connectors v2 framework (encrypted credentials, allowed
 * hosts validation, retry policy) instead of issuing an anonymous
 * `fetchUrl` call. The field is opaque to `sourceHitSchema` (which
 * accepts arbitrary `config` keys); operators set it via the manage-
 * sources flow when registering credentialed feeds.
 */
const readConnectorId = (source: SourceHit): string | undefined => {
  const id = source._source.config.connector_id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
};

const safeParseJson = (body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};

/**
 * Invoke the `.taxii` Connectors v2 connector's `pollCollection`
 * sub-action and return the raw STIX envelope (`{ objects, more, next }`)
 * for `splitStixBundle` to chew on.
 *
 * Conversion notes:
 *  - The Connectors framework's `actionsClient.execute` returns
 *    `{ status, actionId, data, message }`; on `status !== 'ok'` the
 *    spec's handler did NOT return cleanly, so we surface the framework
 *    message and let the workflow's per-source `on-failure: continue`
 *    swallow it.
 *  - We don't pass `addedAfter` / `next` here yet — that needs the
 *    follow-up that persists a per-source TAXII cursor on the
 *    `.kibana-threat-intel-sources` document. Until then we re-fetch
 *    the first page on every poll and rely on the workflow's downstream
 *    fingerprint+dedup gate to keep the data stream clean.
 */
const fetchViaConnector = async (
  connectorId: string,
  collectionUrl: string,
  context: AdapterRunContext
): Promise<unknown> => {
  if (!context.getActionsClient) {
    throw new Error(
      `Source has connector_id "${connectorId}" but the actions plugin is not available in the workflow execution context`
    );
  }
  const actionsClient = await context.getActionsClient();
  if (!actionsClient) {
    throw new Error(
      `Source has connector_id "${connectorId}" but no ActionsClient could be resolved (actions plugin not started?)`
    );
  }
  const result = await actionsClient.execute({
    actionId: connectorId,
    params: {
      subAction: TAXII_CONNECTOR_POLL_SUB_ACTION,
      subActionParams: { collectionUrl },
    },
  });
  if (result.status !== 'ok') {
    const reason = result.message ?? result.serviceMessage ?? 'unknown';
    throw new Error(`TAXII connector "${connectorId}" pollCollection failed: ${reason}`);
  }
  return result.data;
};

/**
 * TAXII 2.1 adapter — single-page poll against a configured collection
 * `objects` endpoint.
 *
 * Two transport modes, selected per-source:
 *
 *  1. **Credentialed (`config.connector_id` set).** The source points
 *     at a Stack Connector saved object of type `.taxii` (Connectors v2,
 *     `kbn-connector-specs`). The adapter delegates the HTTP fetch +
 *     auth + retry policy to the connector framework and only owns the
 *     STIX-bundle splitting and threat-report normalization. Operators
 *     manage credentials in the Connectors UI, encrypted at rest as
 *     ESOs; we never see plaintext secrets. `xpack.actions.allowedHosts`
 *     is enforced for free.
 *
 *  2. **Anonymous (no `connector_id`).** The legacy direct-fetch path —
 *     `fetchUrl` against the configured URL with no auth headers. Kept
 *     for community / public TAXII feeds that don't require credentials
 *     and don't justify the operator overhead of registering a
 *     connector instance per feed.
 *
 * Both modes converge on `splitStixBundle` + per-SDO normalization, so
 * the workflow downstream is identical (fingerprint, dedup, write).
 *
 * Limitations explicitly *not* solved here (each is a follow-up):
 *  - **State**: the spec lets clients pass `?added_after=<ISO>` so each
 *    poll only returns items added since the last successful run. We
 *    don't persist a per-source cursor yet (would require a write back
 *    to `.kibana-threat-intel-sources`); the workflow's downstream
 *    fingerprint+dedup gate keeps the data stream clean even when we
 *    re-pull the same window every 4h. Adding the cursor turns the
 *    dedup gate from O(N) per-poll back to "near-zero work".
 *  - **Paging**: the spec's `next` pagination cursor is also out of
 *    scope; the first page (default 100 objects) is what we land. Any
 *    operator who points us at a high-volume collection should size
 *    their feed accordingly until the follow-up adds the loop. The
 *    `.taxii` connector's `pollCollection` action does accept `next`
 *    input — wire that up here when we add the cursor follow-up.
 *  - **mTLS**: requires Phase-2 auth types in the connector framework.
 */
export const taxiiAdapter: FetchAdapter = {
  adapterType: 'taxii',
  async run(source, context: AdapterRunContext) {
    const log = context.logger.get('taxii-adapter');
    const url = readCollectionUrl(source);
    if (!url) {
      log.warn(`Source ${source._id} has no config.url — skipping`);
      return [];
    }

    const connectorId = readConnectorId(source);
    let envelope: unknown;
    if (connectorId) {
      log.debug(
        `Polling TAXII collection ${url} via connector ${connectorId} for source ${source._id}`
      );
      envelope = await fetchViaConnector(connectorId, url, context);
    } else {
      const response = await fetchUrl(url, {
        abortSignal: context.abortSignal,
        headers: { Accept: TAXII_ACCEPT },
        fetchFn: context.fetchFn,
      });
      if (response.status >= 400) {
        throw new Error(`TAXII poll ${url} failed: HTTP ${response.status} ${response.statusText}`);
      }
      envelope = safeParseJson(response.body);
      if (envelope == null) {
        throw new Error(`TAXII response at ${url} was not valid JSON`);
      }
    }

    const sdos = splitStixBundle(envelope);
    if (sdos.length === 0) {
      log.debug(
        `TAXII collection at ${url} returned 0 reportable objects for source ${source._id}`
      );
      return [];
    }

    const ingestedAt = context.now().toISOString();
    const spaceId = source._source.space_id ?? GLOBAL_SPACE_ID;
    const adapterId = `taxii:${source._id}`;
    const collectionId = deriveCollectionId(url);
    const sourceDocRefIndex = `taxii:collection:${collectionId}`;

    const reports: NormalizedReport[] = [];
    for (const { object } of sdos) {
      const title = collapseWhitespace(composeStixTitle(object));
      const bodyText = truncate(composeStixBody(object), BODY_TEXT_MAX_LENGTH);
      const versionStamp = object.modified ?? object.created ?? '';
      const fingerprint = buildFingerprint([url, object.id, versionStamp]);
      reports.push({
        '@timestamp': ingestedAt,
        content_fingerprint: fingerprint,
        space_id: spaceId,
        source: {
          type: 'taxii',
          name: source._source.name,
          url,
          adapter_id: adapterId,
        },
        content: buildReportContent({
          title: truncate(title, TITLE_MAX_LENGTH),
          bodyText,
          language: 'en',
        }),
        severity: {
          level: DEFAULT_SEVERITY_LEVEL,
          score: DEFAULT_SEVERITY_SCORE,
        },
        provenance: {
          ingested_at: ingestedAt,
          extraction_method: 'pending',
          source_doc_ref: {
            index: sourceDocRefIndex,
            id: object.id,
          },
        },
      });
    }
    return reports;
  },
};
