/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Built-in vendor handlers. Keyed by stable vendor id (matched against
 * the seeded source's `_id` in `setup/seed_default_sources.ts`) so the
 * registry can grow with new vendors without changing the
 * `vendor_api` step shape.
 *
 * Two modes are supported today:
 *
 *  - `kind: 'rss'`: the vendor publishes a feed at a stable URL and the
 *    only vendor-specific concern is the URL (and, in the future,
 *    auth headers from a credentials saved object). Re-uses the RSS
 *    parser end-to-end. Elastic Security Labs falls into this bucket
 *    because the upstream `https://www.elastic.co/security-labs/rss/feed.xml`
 *    is a plain Atom feed.
 *
 *  - `kind: 'json_list'`: the vendor exposes a JSON list endpoint at a
 *    URL with a configurable shape. The handler config tells the
 *    adapter where to find the list (`list_path`), how to extract a
 *    title / body / id from each element, and what to use as the
 *    severity / language. Used for vendor APIs that don't ship a
 *    syndication feed.
 *
 * Anything else is best handled as a follow-up PR that registers a
 * dedicated `kind` here (e.g. `mandiant`, `recorded_future`,
 * `threatconnect`) with its own auth, paging, and parsing. The
 * registry is closed-set on purpose: a config-driven JSON adapter is
 * fine for simple vendors, but real-world vendor APIs vary enough that
 * code-as-config beats config-as-code at our scale.
 */
export type VendorHandler =
  | {
      kind: 'rss';
      /**
       * Optional URL override. When the seeded source already carries the
       * vendor URL (the common case), the registry leaves it on
       * `config.url`; the override is here for vendors whose canonical
       * RSS URL is not visible to the operator (e.g. when the seeded
       * `config.url` points at an HTML landing page).
       */
      url?: string;
    }
  | {
      kind: 'json_list';
      /** Dot-path into the response body where the list lives. e.g. `'data.items'`. */
      listPath: string;
      /** Field on each item that holds the title. */
      titleField: string;
      /** Field on each item that holds the body / description. */
      bodyField: string;
      /** Field on each item that holds the canonical upstream id. */
      idField: string;
      /**
       * Optional ISO-8601 timestamp field. Included in the per-item
       * fingerprint seed so revisions to the same item produce a new
       * row.
       */
      timestampField?: string;
      /** Optional Accept header override. Defaults to `application/json`. */
      accept?: string;
    };

export const BUILTIN_VENDOR_HANDLERS: Readonly<Record<string, VendorHandler>> = Object.freeze({
  /**
   * Elastic Security Labs publishes Atom at the URL the seed catalog
   * already declares; the entry exists so a future Labs-specific
   * customization (e.g. severity tuning, label mapping) has a single
   * obvious place to land without forcing every vendor to learn the
   * generic JSON shape first.
   */
  'vendor_api:elastic-security-labs': { kind: 'rss' },
});

/**
 * Resolve the handler for a given source. Looks at the source's id
 * first, then at an explicit `config.vendor` override (so an operator
 * can register an additional copy of an existing vendor with
 * non-default tags / space / URL by setting `config.vendor` to the
 * built-in id without renaming the document).
 */
export const resolveVendorHandler = (
  sourceId: string,
  configVendor: string | undefined
): VendorHandler | undefined => {
  if (configVendor && BUILTIN_VENDOR_HANDLERS[configVendor]) {
    return BUILTIN_VENDOR_HANDLERS[configVendor];
  }
  return BUILTIN_VENDOR_HANDLERS[sourceId];
};
