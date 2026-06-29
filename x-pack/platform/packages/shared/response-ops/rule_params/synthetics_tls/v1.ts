/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';

export const tlsRuleParamsSchema = schema.object(
  {
    search: schema.maybe(schema.string()),
    certExpirationThreshold: schema.maybe(schema.number()),
    certAgeThreshold: schema.maybe(schema.number()),
    monitorIds: schema.maybe(schema.arrayOf(schema.string())),
    locations: schema.maybe(schema.arrayOf(schema.string())),
    tags: schema.maybe(schema.arrayOf(schema.string())),
    monitorTypes: schema.maybe(schema.arrayOf(schema.string())),
    projects: schema.maybe(schema.arrayOf(schema.string())),
    kqlQuery: schema.maybe(schema.string()),
    // When true, the rule also evaluates TLS certificates captured on browser
    // monitor network events. Defaults to off so existing rules keep their
    // lightweight-only (HTTP/TCP) behavior unchanged. Browser network events do
    // not index a `tls.server.hash.sha256` fingerprint, so the rule falls back
    // to a fingerprint-free certificate identity (subject common name + issuer)
    // for alert grouping and recovery.
    includeBrowserCerts: schema.maybe(schema.boolean()),
    // Browser-only filters. They narrow which browser certificates are
    // evaluated and only take effect when `includeBrowserCerts` is true.
    // `certOrigin` distinguishes first-party (the monitored site) from
    // third-party (CDNs, ads, analytics) resources — surfaced as the "Origin"
    // filter in the UI; `browserResourceTypes` filters by the requested
    // resource's mime category. `issuers` filters by signing CA and applies to
    // both lightweight and browser certificates.
    certOrigin: schema.maybe(schema.arrayOf(schema.string({ maxLength: 256 }), { maxSize: 100 })),
    browserResourceTypes: schema.maybe(
      schema.arrayOf(schema.string({ maxLength: 1024 }), { maxSize: 100 })
    ),
    issuers: schema.maybe(schema.arrayOf(schema.string({ maxLength: 4096 }), { maxSize: 1000 })),
  },
  {
    meta: {
      title: 'Synthetics TLS Rule Params',
      description:
        'The parameters for the synthetics tls rule. These parameters are appropriate when `rule_type_id` is `xpack.synthetics.alerts.tls`.',
    },
  }
);

export type TLSRuleParams = TypeOf<typeof tlsRuleParamsSchema>;
