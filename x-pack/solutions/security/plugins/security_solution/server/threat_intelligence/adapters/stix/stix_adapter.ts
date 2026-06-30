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
import { composeStixBody, composeStixTitle, splitStixBundle } from './split_bundle';

const TITLE_MAX_LENGTH = 280;
const BODY_TEXT_MAX_LENGTH = 32_000;
const SOURCE_DOC_REF_INDEX = 'stix:bundle';

const readBundleUrl = (source: SourceHit): string | undefined => {
  const url = source._source.config.url;
  return typeof url === 'string' && url.length > 0 ? url : undefined;
};

const safeParseJson = (body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};

export const stixAdapter: FetchAdapter = {
  adapterType: 'stix',
  async run(source, context: AdapterRunContext) {
    const log = context.logger.get('stix-adapter');
    const url = readBundleUrl(source);
    if (!url) {
      log.warn(`Source ${source._id} has no config.url — skipping`);
      return [];
    }

    const response = await fetchUrl(url, {
      abortSignal: context.abortSignal,
      headers: { Accept: 'application/stix+json;version=2.1, application/json' },
      fetchFn: context.fetchFn,
    });
    if (response.status >= 400) {
      throw new Error(`STIX fetch ${url} failed: HTTP ${response.status} ${response.statusText}`);
    }

    const bundle = safeParseJson(response.body);
    if (bundle == null) {
      throw new Error(`STIX response at ${url} was not valid JSON`);
    }

    const sdos = splitStixBundle(bundle);
    if (sdos.length === 0) {
      log.debug(`STIX bundle at ${url} contained 0 reportable objects for source ${source._id}`);
      return [];
    }

    const ingestedAt = context.now().toISOString();
    const spaceId = source._source.space_id ?? GLOBAL_SPACE_ID;
    const adapterId = `stix:${source._id}`;
    const reports: NormalizedReport[] = [];
    for (const { object } of sdos) {
      const title = collapseWhitespace(composeStixTitle(object));
      const bodyText = truncate(composeStixBody(object), BODY_TEXT_MAX_LENGTH);
      // SDO `modified || created` is the canonical "version" timestamp
      // in STIX. Including it in the fingerprint seed means an updated
      // SDO produces a new row (so `nl_extraction_behavioral` re-runs)
      // while a re-fetch of the unchanged SDO collapses.
      const versionStamp = object.modified ?? object.created ?? '';
      const fingerprint = buildFingerprint([url, object.id, versionStamp]);
      reports.push({
        '@timestamp': ingestedAt,
        content_fingerprint: fingerprint,
        space_id: spaceId,
        source: {
          type: 'stix',
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
            index: SOURCE_DOC_REF_INDEX,
            id: object.id,
          },
        },
      });
    }
    return reports;
  },
};
