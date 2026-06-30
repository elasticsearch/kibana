/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import xml2js from 'xml2js';

/**
 * Format-agnostic representation of a single feed entry. The RSS
 * adapter emits one `NormalizedReport` per `RssEntry` regardless of
 * whether the upstream feed is RSS 2.0, Atom, or RDF — keeping the
 * normalization step format-agnostic means the adapter doesn't have
 * to branch on the feed family at every step.
 *
 * `id` is the most stable identifier the feed exposes (Atom `<id>`,
 * RSS `<guid>`, falling back to `<link>` when neither is present).
 * It's used by the adapter to seed the per-item `content_fingerprint`
 * and to populate `provenance.source_doc_ref.id`. If we end up with
 * two items that share the same `id` *and* the same title, the
 * fingerprint will collapse them — which is what we want for
 * RSS-syndicated copies of the same advisory.
 */
export interface RssEntry {
  id: string;
  title: string;
  link?: string;
  /** ISO-8601 string when the feed exposes a publish/update timestamp. */
  publishedAt?: string;
  /**
   * Best-effort plaintext body. The adapter strips HTML before writing
   * to `content.body_text`; the original markup is preserved on
   * `content.body_html` (mapped `index: false`) for the dashboard's
   * "View source" affordance.
   */
  body: string;
  /** Original markup preserved verbatim. */
  bodyHtml?: string;
}

export interface ParsedFeed {
  /** Normalized feed-level title. Empty string when the feed declares no title. */
  feedTitle: string;
  /** Lowercased ISO-639-1 if the feed declares one (`<language>` / `xml:lang`). */
  language?: string;
  entries: RssEntry[];
}

/**
 * Parse an RSS 2.0, Atom, or RDF feed.
 *
 * Tolerant by design — feeds in the wild violate every spec at least
 * sometimes, so we treat the structure as advisory and collect what
 * we can. Items missing every identifying field (no `id`, `guid`, or
 * `link`) are dropped because there's no stable seed for the
 * fingerprint and including them would just create one new row per
 * run forever.
 */
export const parseRssFeed = async (xml: string): Promise<ParsedFeed> => {
  const trimmed = xml.trim();
  if (!trimmed) return { feedTitle: '', entries: [] };

  // `explicitArray: true` matches the existing siem_migrations XmlParser
  // convention so all child accessors are arrays — which simplifies the
  // walk below (no `Array.isArray` branches per field).
  const parsed = await xml2js.parseStringPromise(trimmed, {
    explicitArray: true,
    explicitCharkey: true,
    charkey: '_',
    attrkey: '$',
    trim: false,
    normalizeTags: false,
  });

  // Atom: <feed xmlns="http://www.w3.org/2005/Atom">
  if (parsed.feed) return parseAtom(parsed.feed);
  // RSS 2.0: <rss><channel>...</channel></rss>
  if (parsed.rss?.channel?.[0]) return parseRss2(parsed.rss.channel[0]);
  // RDF / RSS 1.0: <rdf:RDF><channel/><item/>...</rdf:RDF>
  const rdfRoot = parsed['rdf:RDF'] ?? parsed.RDF ?? parsed['rss:RDF'] ?? parsed.feed ?? undefined;
  if (rdfRoot) return parseRdf(rdfRoot);

  return { feedTitle: '', entries: [] };
};

interface XmlNode {
  $?: Record<string, string>;
  _?: string;
  [key: string]: unknown;
}

/** Best-effort string extraction from xml2js's nested array+object shape. */
const text = (node: unknown): string => {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === 'object') {
    const obj = node as XmlNode;
    if (typeof obj._ === 'string') return obj._;
    // Atom <link href="…"/> uses an attribute-only shape.
    if (obj.$ && typeof obj.$.href === 'string') return obj.$.href;
  }
  return '';
};

const firstAttr = (node: unknown, attr: string): string | undefined => {
  if (Array.isArray(node)) return firstAttr(node[0], attr);
  if (node && typeof node === 'object') {
    const obj = node as XmlNode;
    return obj.$?.[attr];
  }
  return undefined;
};

const toIsoDate = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
};

const pickLanguage = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  // `en-US` / `en_us` → `en`. Lowercasing matches ECS' `language`
  // field convention, which mappers downstream (digest, dashboard)
  // expect.
  const head = raw.split(/[-_]/)[0];
  return head ? head.toLowerCase() : undefined;
};

const dropEmpty = (entries: RssEntry[]): RssEntry[] =>
  // Items without any identifier would generate a fresh fingerprint on
  // every run, defeating the dedup gate. Better to drop them than to
  // pollute the data stream.
  entries.filter((entry) => entry.id && (entry.title || entry.body));

const parseRss2 = (channel: XmlNode): ParsedFeed => {
  const items = (channel.item as XmlNode[] | undefined) ?? [];
  const entries: RssEntry[] = items.map((item) => {
    const guid = text(item.guid);
    const link = text(item.link);
    const id = guid || link || text(item.id);
    const title = text(item.title);
    const description = text(item.description);
    // <content:encoded> ships the full HTML article body when the
    // feed wants to provide more than the summary. Some feeds use it,
    // some don't — fall back to the description.
    const contentEncoded = text((item as XmlNode)['content:encoded']);
    const bodyHtml = contentEncoded || description || undefined;
    const publishedAt =
      toIsoDate(text(item.pubDate)) ?? toIsoDate(text((item as XmlNode)['dc:date']));
    return {
      id,
      title,
      link: link || undefined,
      publishedAt,
      body: '',
      bodyHtml,
    };
  });
  return {
    feedTitle: text(channel.title),
    language: pickLanguage(text(channel.language)),
    entries: dropEmpty(entries),
  };
};

const parseAtom = (feed: XmlNode): ParsedFeed => {
  const entriesRaw = (feed.entry as XmlNode[] | undefined) ?? [];
  const entries: RssEntry[] = entriesRaw.map((entry) => {
    const id = text(entry.id);
    const title = text(entry.title);
    // Atom links can be one or many; we want the first `rel="alternate"`
    // (or the one without a rel attribute, which is how most feeds ship
    // a single canonical link).
    const linkArr = (entry.link as XmlNode[] | undefined) ?? [];
    const link =
      linkArr.find((l) => {
        const rel = firstAttr(l, 'rel');
        return rel === undefined || rel === 'alternate';
      }) ?? linkArr[0];
    const linkHref = firstAttr(link, 'href') ?? text(link);
    const summary = text(entry.summary);
    const content = text(entry.content);
    const bodyHtml = content || summary || undefined;
    const publishedAt = toIsoDate(text(entry.updated)) ?? toIsoDate(text(entry.published));
    return {
      id: id || linkHref,
      title,
      link: linkHref || undefined,
      publishedAt,
      body: '',
      bodyHtml,
    };
  });
  return {
    feedTitle: text(feed.title),
    language: pickLanguage(firstAttr(feed, 'xml:lang')),
    entries: dropEmpty(entries),
  };
};

const parseRdf = (rdf: XmlNode): ParsedFeed => {
  // RSS 1.0 puts items as siblings of <channel> at the RDF root rather
  // than nested under it; the channel's `<items><rdf:Seq>` only references
  // them by `rdf:about`. We don't need the order — we just walk the
  // siblings.
  const channel = ((rdf.channel as XmlNode[] | undefined) ?? [])[0] ?? {};
  const items = (rdf.item as XmlNode[] | undefined) ?? [];
  const entries: RssEntry[] = items.map((item) => {
    const about = firstAttr(item, 'rdf:about') ?? firstAttr(item, 'about');
    const link = text(item.link);
    const id = about || link || text(item.guid);
    const title = text(item.title);
    const description = text(item.description);
    const publishedAt =
      toIsoDate(text((item as XmlNode)['dc:date'])) ?? toIsoDate(text(item.pubDate));
    return {
      id,
      title,
      link: link || undefined,
      publishedAt,
      body: '',
      bodyHtml: description || undefined,
    };
  });
  return {
    feedTitle: text(channel.title),
    language: pickLanguage(text((channel as XmlNode)['dc:language']) || text(channel.language)),
    entries: dropEmpty(entries),
  };
};
