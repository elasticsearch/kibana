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
import { buildReportContent, collapseWhitespace, stripHtml, truncate } from '../text';
import type { AdapterRunContext, FetchAdapter, NormalizedReport, SourceHit } from '../types';
import { parseRssFeed } from './parse_rss';

const TITLE_MAX_LENGTH = 280;
const BODY_TEXT_MAX_LENGTH = 32_000;
const SOURCE_DOC_REF_INDEX = 'rss:feed';

const readFeedUrl = (source: SourceHit): string | undefined => {
  const url = source._source.config.url;
  return typeof url === 'string' && url.length > 0 ? url : undefined;
};

export const rssAdapter: FetchAdapter = {
  adapterType: 'rss',
  async run(source, context: AdapterRunContext) {
    const log = context.logger.get('rss-adapter');
    const feedUrl = readFeedUrl(source);
    if (!feedUrl) {
      log.warn(`Source ${source._id} has no config.url — skipping`);
      return [];
    }

    const response = await fetchUrl(feedUrl, {
      abortSignal: context.abortSignal,
      headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
      fetchFn: context.fetchFn,
    });

    if (response.status >= 400) {
      // Surface as a thrown error so the step's `on-failure: continue: true`
      // still records the failure on the step result. Returning `[]`
      // would silently mask broken feeds.
      throw new Error(
        `RSS fetch ${feedUrl} failed: HTTP ${response.status} ${response.statusText}`
      );
    }

    const parsed = await parseRssFeed(response.body);
    if (parsed.entries.length === 0) {
      log.debug(`RSS feed ${feedUrl} returned 0 items for source ${source._id}`);
      return [];
    }

    const ingestedAt = context.now().toISOString();
    const spaceId = source._source.space_id ?? GLOBAL_SPACE_ID;
    const language = parsed.language ?? 'en';
    const adapterId = `rss:${source._id}`;

    const reports: NormalizedReport[] = [];
    for (const entry of parsed.entries) {
      const title = collapseWhitespace(entry.title || parsed.feedTitle || source._source.name);
      const bodyText = truncate(stripHtml(entry.bodyHtml ?? ''), BODY_TEXT_MAX_LENGTH);
      // Per-item fingerprint seed: feed URL + stable item id + canonical
      // title. Including the title means an upstream feed that re-uses
      // the same `<guid>` for an updated advisory still produces a fresh
      // row when the title changes (the `nl_extraction_behavioral`
      // workflow can then re-extract over the new revision). Re-fetches
      // of the unchanged item collapse to one fingerprint.
      const fingerprint = buildFingerprint([feedUrl, entry.id, title]);
      reports.push({
        '@timestamp': ingestedAt,
        content_fingerprint: fingerprint,
        space_id: spaceId,
        source: {
          type: 'rss',
          name: source._source.name,
          url: entry.link ?? feedUrl,
          adapter_id: adapterId,
        },
        content: buildReportContent({
          title: truncate(title, TITLE_MAX_LENGTH),
          bodyText,
          bodyHtml: entry.bodyHtml,
          language,
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
            id: entry.id,
          },
        },
      });
    }

    return reports;
  },
};
