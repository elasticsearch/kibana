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
import { buildReportContent } from '../../services/report_content';
import { normalizeProvenanceUrl } from '../../services/provenance_url';
import type {
  AdapterRunContext,
  FetchAdapter,
  IocEntry,
  NormalizedReport,
  SourceHit,
} from '../types';
import { parseIndicatorList } from './parse_indicator_list';
import type { IndicatorBlock } from './parse_indicator_list';

const SOURCE_DOC_REF_INDEX = 'maltrail:trail';

// ES defaults to 10k nested objects per document. Keep a wide margin for future fields.
const MAX_NESTED_PER_DOC = 5000;

const readTrailUrl = (source: SourceHit): string | undefined => {
  const url = resolveCatalogSourceUrl(source._id);
  return typeof url === 'string' && url.length > 0 ? url : undefined;
};

/** Extract the filename stem from a URL path (e.g. `.../malware/cobaltstrike.txt` → `cobaltstrike`). */
const trailLabelFromUrl = (url: string): string => {
  try {
    const { pathname } = new URL(url);
    const filename = pathname.split('/').pop() ?? '';
    return filename.replace(/\.[^.]+$/, '') || 'unknown';
  } catch {
    return 'unknown';
  }
};

/**
 * Keep reference blocks together when possible while bounding nested IOCs per report.
 * Trail-wide dedup happens before this function, and each IOC already carries its
 * nearest reference, so no parallel reference metadata needs to be reconstructed.
 */
const chunkBlocks = (
  blocks: IndicatorBlock[],
  dedupedIocs: Map<string, IocEntry>
): IocEntry[][] => {
  const iocsByBlock = new Map<number, IocEntry[]>();
  for (const ioc of dedupedIocs.values()) {
    const bi = ioc.block_index ?? 0;
    const arr = iocsByBlock.get(bi);
    if (arr) {
      arr.push(ioc);
    } else {
      iocsByBlock.set(bi, [ioc]);
    }
  }

  const chunks: IocEntry[][] = [];
  let currentIocs: IocEntry[] = [];

  const flush = () => {
    if (currentIocs.length > 0) {
      chunks.push(currentIocs);
      currentIocs = [];
    }
  };

  for (const block of blocks) {
    const blockIocs = iocsByBlock.get(block.block_index) ?? [];
    if (blockIocs.length > 0) {
      if (blockIocs.length <= MAX_NESTED_PER_DOC) {
        if (currentIocs.length + blockIocs.length > MAX_NESTED_PER_DOC) flush();
        currentIocs.push(...blockIocs);
      } else {
        flush();
        for (let offset = 0; offset < blockIocs.length; offset += MAX_NESTED_PER_DOC) {
          chunks.push(blockIocs.slice(offset, offset + MAX_NESTED_PER_DOC));
        }
      }
    }
  }

  flush();
  return chunks;
};

export const textIndicatorListAdapter: FetchAdapter = {
  adapterType: 'text_indicator_list',
  async run(source: SourceHit, context: AdapterRunContext): Promise<NormalizedReport[]> {
    const fetchUrl = fetchUrlForContext(context);
    const log = context.logger.get('text-indicator-list-adapter');
    const url = readTrailUrl(source);
    if (!url) {
      log.warn(`Source ${source._id} has no catalog URL — skipping`);
      return [];
    }

    // Source URLs may embed `user:password@`, and this is the only adapter that was
    // interpolating the raw URL into its errors and log lines. The credential also
    // reached the stored `source.url`, which the promote task copies onto the
    // indicator document, so it was leaking well past the logs. Keep the raw URL
    // for the request only.
    const redactedUrl = redactUrl(url);
    const provenanceUrl = normalizeProvenanceUrl(url);

    const response = await fetchUrl(url, {
      abortSignal: context.abortSignal,
      headers: { Accept: 'text/plain, */*' },
    });
    if (response.status >= 400) {
      throw new Error(
        `text_indicator_list fetch ${redactedUrl} failed: HTTP ${response.status} ${response.statusText}`
      );
    }

    const blocks = parseIndicatorList(response.body);
    if (blocks.length === 0) {
      log.warn(`text_indicator_list at ${redactedUrl} produced 0 blocks for source ${source._id}`);
      return [];
    }

    const trailLabel = trailLabelFromUrl(url);

    // Trail-wide IOC dedup by (type, value) before chunking — a value repeated across blocks
    // is emitted once total; first-block attribution wins. Dedup happens here so that an IOC
    // present in block 0 and block 5 doesn't appear in two separate chunks.
    const dedupedIocs = new Map<string, IocEntry>();
    for (const block of blocks) {
      const reference = normalizeProvenanceUrl(block.reference);
      for (const ioc of block.iocs) {
        const key = `${ioc.type}:${ioc.value}`;
        if (!dedupedIocs.has(key)) {
          dedupedIocs.set(key, {
            ...ioc,
            ...(reference ? { reference } : {}),
            block_index: block.block_index,
          });
        }
      }
    }

    if (dedupedIocs.size === 0) {
      log.warn(
        `text_indicator_list at ${redactedUrl} had blocks but 0 parseable IOCs for source ${source._id}`
      );
      return [];
    }

    // Chunk into docs, each ≤ MAX_NESTED_PER_DOC total nested objects.
    const chunks = chunkBlocks(blocks, dedupedIocs);

    const ingestedAt = context.now().toISOString();
    const spaceId = source._source.space_id ?? GLOBAL_SPACE_ID;

    // Change-signal for the content fingerprint: a hash over the whole canonical
    // IOC set. This used to be body length plus the first and last IOC, which
    // collided whenever interior indicators were added, removed, replaced, or
    // reordered while those three values held — the dedup gate then skipped a
    // genuinely updated list and the indicator index went stale. Hashing the set
    // (rather than the raw body) also avoids re-ingesting on cosmetic feed
    // changes such as an updated header comment.
    const allIocs = [...dedupedIocs.values()];
    const changeSignal = buildFingerprint(
      allIocs.map((ioc) => `${ioc.type}=${ioc.value}@${ioc.reference ?? ''}`)
    );

    const reports: NormalizedReport[] = [];

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const iocs = chunks[chunkIdx];

      // Per-chunk fingerprint: fold chunk index so N chunks of one trail don't collide on dedup.
      // Seeded with the redacted URL so rotating the feed credential does not
      // change the identity of every report from that feed.
      const contentFingerprint = buildFingerprint([
        provenanceUrl ?? redactedUrl,
        trailLabel,
        changeSignal,
        String(chunkIdx),
      ]);

      const bodyText = `Maltrail indicator list: ${trailLabel} (chunk ${chunkIdx + 1}/${
        chunks.length
      }, ${iocs.length} indicators)`;
      const baseContent = buildReportContent({
        title: trailLabel,
        bodyText,
        language: 'en',
      });

      const report: NormalizedReport = {
        '@timestamp': ingestedAt,
        content_fingerprint: contentFingerprint,
        space_id: spaceId,
        revision: 1,
        source: {
          type: 'text_indicator_list',
          // The configured source name from the approved catalog entry, not the literal
          // 'maltrail'. The catalog can seed more than one text-list source, so hard-coding
          // this would misattribute every text-list feed's reports and indicators to maltrail.
          name: source._source.name,
          ...(provenanceUrl ? { url: provenanceUrl } : {}),
          adapter_id: `text_indicator_list:${source._id}`,
        },
        content: baseContent,
        severity: {
          level: DEFAULT_SEVERITY_LEVEL,
          score: DEFAULT_SEVERITY_SCORE,
        },
        lineage: {
          ingested_at: ingestedAt,
          extraction_method: 'text_indicator_list',
          extracted_at: ingestedAt,
          source_doc_ref: { index: SOURCE_DOC_REF_INDEX, id: trailLabel },
        },
        extracted: { iocs },
      };

      reports.push(report);
    }

    log.info(
      `text_indicator_list: ${redactedUrl} → ${dedupedIocs.size} deduped IOCs across ${reports.length} chunk(s) for source ${source._id}`
    );

    return reports;
  },
};
