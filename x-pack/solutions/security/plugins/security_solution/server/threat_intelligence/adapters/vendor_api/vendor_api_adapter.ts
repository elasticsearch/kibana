/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { GLOBAL_SPACE_ID } from '../../../../common/threat_intelligence/hub';
import { fetchUrl } from '../http_client';
import { buildFingerprint } from '../fingerprint';
import { rssAdapter } from '../rss/rss_adapter';
import { DEFAULT_SEVERITY_LEVEL, DEFAULT_SEVERITY_SCORE } from '../severity';
import { buildReportContent, collapseWhitespace, truncate } from '../text';
import type { AdapterRunContext, FetchAdapter, NormalizedReport, SourceHit } from '../types';
import { resolveVendorHandler } from './builtin_vendors';

const TITLE_MAX_LENGTH = 280;
const BODY_TEXT_MAX_LENGTH = 32_000;
const SOURCE_DOC_REF_INDEX = 'vendor_api:item';

const readUrl = (source: SourceHit): string | undefined => {
  const url = source._source.config.url;
  return typeof url === 'string' && url.length > 0 ? url : undefined;
};

const readVendorOverride = (source: SourceHit): string | undefined => {
  const v = source._source.config.vendor;
  return typeof v === 'string' && v.length > 0 ? v : undefined;
};

const safeParseJson = (body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};

const readDotPath = (input: unknown, path: string): unknown => {
  if (!path) return input;
  const parts = path.split('.');
  let cursor: unknown = input;
  for (const part of parts) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
};

const readStringField = (item: unknown, field: string): string => {
  const value = readDotPath(item, field);
  return typeof value === 'string' ? value : '';
};

/**
 * Vendor API adapter. Looks up the source's vendor handler in the
 * built-in registry; if the handler's kind is `'rss'`, delegates to the
 * RSS adapter (only the `source.type` differs in the resulting
 * documents — see the `'vendor_api'` override below). Otherwise reads
 * the JSON list endpoint per the `json_list` handler config.
 *
 * Unknown vendors return `[]` with a `warn` log: a misconfigured
 * source is not a step failure, and the `default` branch of the old
 * YAML `switch` had the same behavior.
 *
 * Credentials from a saved object reference (`config.credentials_ref`)
 * are an explicit follow-up — the hook is documented in
 * `builtin_vendors.ts` but not consumed here yet.
 *
 * Connectors v2 follow-up: the TAXII adapter now routes credentialed
 * feeds through the `.taxii` Stack Connector when a source carries
 * `config.connector_id` (see `taxii/taxii_adapter.ts`). The same
 * pattern applies cleanly to vendor APIs — each real-world vendor
 * (Mandiant, Recorded Future, ThreatConnect, etc.) is a natural fit
 * for a `kbn-connector-specs` ConnectorSpec, since they all use
 * per-tenant credentials, retry policies, and pagination cursors that
 * the connector framework already handles. A future PR should:
 *   1. Land vendor-specific ConnectorSpecs (e.g. `.mandiant`).
 *   2. Replace the `BUILTIN_VENDOR_HANDLERS` registry with a
 *      `connector_id` lookup (mirrors `taxii_adapter.ts`).
 *   3. Drop the `credentials_ref` ESO follow-up entirely — the
 *      connector framework owns credential storage.
 */
export const vendorApiAdapter: FetchAdapter = {
  adapterType: 'vendor_api',
  async run(source, context: AdapterRunContext) {
    const log = context.logger.get('vendor-api-adapter');
    const handler = resolveVendorHandler(source._id, readVendorOverride(source));
    if (!handler) {
      log.warn(
        `Source ${source._id} (vendor_api) has no registered handler — skipping. ` +
          `Add it to BUILTIN_VENDOR_HANDLERS or set config.vendor to an existing id.`
      );
      return [];
    }

    if (handler.kind === 'rss') {
      // Reuse the RSS adapter and rewrite the resulting reports'
      // `source.type` / `adapter_id` so downstream filters (e.g.
      // `search_reports`'s `source_types: ['vendor_api']`) keep working.
      const overriddenSource: SourceHit = handler.url
        ? {
            ...source,
            _source: {
              ...source._source,
              config: { ...source._source.config, url: handler.url },
            },
          }
        : source;
      const rssReports = await rssAdapter.run(overriddenSource, context);
      return rssReports.map((report) => ({
        ...report,
        source: {
          ...report.source,
          type: 'vendor_api',
          adapter_id: `vendor_api:${source._id}`,
        },
      }));
    }

    return runJsonList(source, handler, context);
  },
};

const runJsonList = async (
  source: SourceHit,
  handler: Extract<ReturnType<typeof resolveVendorHandler>, { kind: 'json_list' }>,
  context: AdapterRunContext
): Promise<NormalizedReport[]> => {
  const log = context.logger.get('vendor-api-adapter');
  const url = readUrl(source);
  if (!url) {
    log.warn(`Source ${source._id} has no config.url — skipping`);
    return [];
  }

  const response = await fetchUrl(url, {
    abortSignal: context.abortSignal,
    headers: { Accept: handler.accept ?? 'application/json' },
    fetchFn: context.fetchFn,
  });
  if (response.status >= 400) {
    throw new Error(
      `Vendor API fetch ${url} failed: HTTP ${response.status} ${response.statusText}`
    );
  }

  const parsed = safeParseJson(response.body);
  if (parsed == null) {
    throw new Error(`Vendor API response at ${url} was not valid JSON`);
  }

  const list = readDotPath(parsed, handler.listPath);
  if (!Array.isArray(list)) {
    log.warn(
      `Vendor API list_path '${handler.listPath}' did not resolve to an array on ${url} — skipping (source ${source._id})`
    );
    return [];
  }

  const ingestedAt = context.now().toISOString();
  const spaceId = source._source.space_id ?? GLOBAL_SPACE_ID;
  const adapterId = `vendor_api:${source._id}`;
  const reports: NormalizedReport[] = list.flatMap<NormalizedReport>((item) => {
    const id = readStringField(item, handler.idField);
    const titleRaw = readStringField(item, handler.titleField);
    const body = readStringField(item, handler.bodyField);
    if (!id || (!titleRaw && !body)) return [];
    const title = collapseWhitespace(titleRaw || source._source.name);
    const versionStamp = handler.timestampField
      ? readStringField(item, handler.timestampField)
      : '';
    const fingerprint = buildFingerprint([url, id, versionStamp || title]);
    const report: NormalizedReport = {
      '@timestamp': ingestedAt,
      content_fingerprint: fingerprint,
      space_id: spaceId,
      source: {
        type: 'vendor_api',
        name: source._source.name,
        url,
        adapter_id: adapterId,
      },
      content: buildReportContent({
        title: truncate(title, TITLE_MAX_LENGTH),
        bodyText: truncate(body, BODY_TEXT_MAX_LENGTH),
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
          index: SOURCE_DOC_REF_INDEX,
          id,
        },
      },
    };
    return [report];
  });
  return reports;
};
