/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parseRssFeed } from './parse_rss';

const RSS2 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Acme Threat Research</title>
    <language>en-US</language>
    <item>
      <title>APT-1 campaign</title>
      <link>https://acme.example/posts/apt1</link>
      <guid isPermaLink="false">acme:apt1</guid>
      <pubDate>Mon, 12 May 2025 09:30:00 GMT</pubDate>
      <description><![CDATA[<p>Brief summary of <b>APT-1</b>.</p>]]></description>
    </item>
    <item>
      <title>Ransomware uptick</title>
      <link>https://acme.example/posts/ransom</link>
      <pubDate>Tue, 13 May 2025 10:00:00 GMT</pubDate>
      <description>Plain summary.</description>
    </item>
    <item>
      <!-- intentionally missing every identifier — should be dropped -->
      <description>Orphan item with no id, link, or guid.</description>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">
  <title>Vendor Labs</title>
  <entry>
    <id>tag:vendor.example,2025:post-1</id>
    <title>Post one</title>
    <link rel="alternate" href="https://vendor.example/post-1"/>
    <updated>2025-05-12T09:30:00Z</updated>
    <summary>Short summary.</summary>
    <content type="html">&lt;p&gt;Long body&lt;/p&gt;</content>
  </entry>
  <entry>
    <id>tag:vendor.example,2025:post-2</id>
    <title>Post two</title>
    <link href="https://vendor.example/post-2"/>
    <published>2025-05-11T08:00:00Z</published>
    <summary>Only a summary.</summary>
  </entry>
</feed>`;

const RDF = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://example.com">
    <title>RDF Feed</title>
    <dc:language>en</dc:language>
  </channel>
  <item rdf:about="https://example.com/posts/1">
    <title>RDF Item</title>
    <link>https://example.com/posts/1</link>
    <description>RDF body.</description>
    <dc:date>2025-05-12T09:30:00Z</dc:date>
  </item>
</rdf:RDF>`;

describe('parseRssFeed', () => {
  it('returns an empty result for an empty input', async () => {
    const parsed = await parseRssFeed('');
    expect(parsed).toEqual({ feedTitle: '', entries: [] });
  });

  it('parses an RSS 2.0 feed and drops items without an identifier', async () => {
    const parsed = await parseRssFeed(RSS2);
    expect(parsed.feedTitle).toBe('Acme Threat Research');
    expect(parsed.language).toBe('en');
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0]).toMatchObject({
      id: 'acme:apt1',
      title: 'APT-1 campaign',
      link: 'https://acme.example/posts/apt1',
      publishedAt: new Date('Mon, 12 May 2025 09:30:00 GMT').toISOString(),
    });
    // CDATA contents preserved as-is on bodyHtml.
    expect(parsed.entries[0].bodyHtml).toContain('<b>APT-1</b>');
  });

  it('parses an Atom feed and prefers updated over published', async () => {
    const parsed = await parseRssFeed(ATOM);
    expect(parsed.feedTitle).toBe('Vendor Labs');
    expect(parsed.language).toBe('en');
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0].publishedAt).toBe('2025-05-12T09:30:00.000Z');
    expect(parsed.entries[0].link).toBe('https://vendor.example/post-1');
    expect(parsed.entries[0].bodyHtml).toBe('<p>Long body</p>');
    expect(parsed.entries[1].publishedAt).toBe('2025-05-11T08:00:00.000Z');
  });

  it('parses an RDF / RSS 1.0 feed using rdf:about as the id', async () => {
    const parsed = await parseRssFeed(RDF);
    expect(parsed.feedTitle).toBe('RDF Feed');
    expect(parsed.language).toBe('en');
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toMatchObject({
      id: 'https://example.com/posts/1',
      title: 'RDF Item',
      link: 'https://example.com/posts/1',
      publishedAt: '2025-05-12T09:30:00.000Z',
    });
  });

  it('returns an empty result for an unrecognized root element', async () => {
    const parsed = await parseRssFeed('<?xml version="1.0"?><unknown/>');
    expect(parsed).toEqual({ feedTitle: '', entries: [] });
  });
});
