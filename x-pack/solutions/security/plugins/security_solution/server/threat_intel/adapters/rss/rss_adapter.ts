/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { GLOBAL_SPACE_ID, resolveCatalogSourceUrl } from '../../../../common/threat_intel';
import { fetchUrlForContext, redactUrl } from '../http_client';
import { buildFingerprint } from '../fingerprint';
import { DEFAULT_SEVERITY_LEVEL, DEFAULT_SEVERITY_SCORE } from '../../services/severity';
import { buildReportContent, collapseWhitespace, truncate } from '../../services/report_content';
import { normalizeProvenanceUrl } from '../../services/provenance_url';
import type { AdapterRunContext, FetchAdapter, NormalizedReport, SourceHit } from '../types';
import { decodeDataUrl, isDataUrl } from './decode_data_url';
import { htmlFragmentToStructuredText } from './html_fragment_to_structured_text';
import { parseRssFeed } from './parse_rss';

const TITLE_MAX_LENGTH = 280;
const BODY_TEXT_MAX_LENGTH = 32_000;
const SOURCE_DOC_REF_INDEX = 'rss:feed';

const readFeedUrl = (source: SourceHit): string | undefined => {
  const url = resolveCatalogSourceUrl(source._id);
  return typeof url === 'string' && url.length > 0 ? url : undefined;
};

/**
 * Resolves the RSS/Atom body for a source URL. `data:` URLs are decoded in-process (used
 * by the data generator fixtures); network URLs go through `fetchUrl`, which enforces the
 * http/https SSRF guard.
 */
const readFeedBody = async (feedUrl: string, context: AdapterRunContext): Promise<string> => {
  if (isDataUrl(feedUrl)) {
    return decodeDataUrl(feedUrl);
  }

  const response = await fetchUrlForContext(context)(feedUrl, {
    abortSignal: context.abortSignal,
    headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
  });

  if (response.status >= 400) {
    // Surface as a thrown error so the step's `on-failure: continue: true`
    // still records the failure on the step result. Returning `[]`
    // would silently mask broken feeds.
    throw new Error(
      `RSS fetch ${redactUrl(feedUrl)} failed: HTTP ${response.status} ${response.statusText}`
    );
  }

  return response.body;
};

export const rssAdapter: FetchAdapter = {
  adapterType: 'rss',
  async run(source, context: AdapterRunContext) {
    const log = context.logger.get('rss-adapter');
    const feedUrl = readFeedUrl(source);
    if (!feedUrl) {
      log.warn(`Source ${source._id} has no catalog URL — skipping`);
      return [];
    }

    const feedBody = await readFeedBody(feedUrl, context);
    const parsed = await parseRssFeed(feedBody);
    if (parsed.entries.length === 0) {
      log.debug(`RSS feed ${redactUrl(feedUrl)} returned 0 items for source ${source._id}`);
      return [];
    }

    const ingestedAt = context.now().toISOString();
    const spaceId = source._source.space_id ?? GLOBAL_SPACE_ID;
    const language = parsed.language ?? 'en';
    const adapterId = `rss:${source._id}`;

    const reports: NormalizedReport[] = [];
    for (const entry of parsed.entries) {
      const title = collapseWhitespace(entry.title || parsed.feedTitle || source._source.name);
      // `parse_rss.ts` has already decided markup vs text. Markup is the one narrow HTML
      // boundary we accept: it is converted to bounded plain text here and only the text is
      // stored — the raw fragment never leaves this loop. A text-typed Atom construct is
      // genuinely not HTML, so it is used as-is.
      const fullBodyText =
        entry.body?.kind === 'markup'
          ? htmlFragmentToStructuredText(entry.body.html)
          : entry.body?.text ?? '';
      // Untruncated, so a revision differing only past the stored-body cap is still
      // detected as a change.
      const bodyText = truncate(fullBodyText, BODY_TEXT_MAX_LENGTH);
      // Includes the body, not just id/title, since advisories commonly keep their <guid>
      // while revising the text — identity alone would dedup the revision away forever.
      const fingerprint = buildFingerprint([
        feedUrl,
        entry.id,
        title,
        entry.publishedAt,
        fullBodyText,
      ]);
      const sourceUrl = normalizeProvenanceUrl(entry.link) ?? normalizeProvenanceUrl(feedUrl);
      reports.push({
        '@timestamp': ingestedAt,
        content_fingerprint: fingerprint,
        space_id: spaceId,
        revision: 1,
        source: {
          type: 'rss',
          // Provenance only. The adapter fetches the configured feed URL and nothing else;
          // an entry link is recorded so an analyst can open the original item, never fetched.
          ...(sourceUrl ? { url: sourceUrl } : {}),
          name: source._source.name,
          adapter_id: adapterId,
        },
        content: buildReportContent({
          title: truncate(title, TITLE_MAX_LENGTH),
          bodyText,
          language,
        }),
        severity: {
          level: DEFAULT_SEVERITY_LEVEL,
          score: DEFAULT_SEVERITY_SCORE,
        },
        lineage: {
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
