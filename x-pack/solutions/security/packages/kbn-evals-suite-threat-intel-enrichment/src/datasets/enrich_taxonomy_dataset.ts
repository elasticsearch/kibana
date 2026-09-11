/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EnrichTaxonomyExample, TaxonomyResponse } from '../types';
import { ALL_PACKS, type ThreatIntelPack } from './packs';

/**
 * Curated taxonomy ground truth, keyed by pack id.
 *
 * The pack `categories` in `packs.ts` are a verbatim snapshot of the BlackHat
 * demo fixtures, which were authored for a demo rather than for taxonomy
 * grounding: several carried region and category labels the article prose does
 * not actually support (e.g. `europe`/`global` on packs whose text names no such
 * region, or `insider-threat` on external account-takeover reports). Recall
 * against those labels penalised the model for correctly declining a label the
 * text never supports.
 *
 * These labels are instead grounded strictly in what each article states:
 *  - Regions are listed only when the prose names a place. Packs with no
 *    geographic signal use an empty set (recall is trivially satisfied — there is
 *    nothing to recall — rather than demanding an invented region).
 *  - Categories are the report's clearly-supported classes; debatable labels the
 *    text does not substantiate are dropped.
 *
 * `okta` intentionally keeps `cloud-security`: an Okta identity-provider takeover
 * is a cloud-security report, and the model's tendency to omit it is a real
 * recall signal worth tracking, not a mislabelled example.
 */
const CURATED_TAXONOMY: Record<string, Pick<TaxonomyResponse, 'categories' | 'regions'>> = {
  // Okta cloud identity-provider takeover; financially motivated extortion
  // operators; only geographic signal is the Russian source IP.
  okta: { categories: ['cloud-security', 'cybercrime'], regions: ['europe'] },
  // AWS IAM privilege escalation + credential/secret theft; no geographic signal
  // in the prose (account id and TEST-NET IPs are not regions).
  'aws-iam': { categories: ['cloud-security', 'data-breach'], regions: [] },
  // Kubernetes service-account credential theft; only geographic signal is the
  // `prod-us-east-1` cluster region.
  kubernetes: { categories: ['cloud-security'], regions: ['north-america'] },
  // GitHub supply-chain / contractor-access report; no geographic signal.
  'github-actions': { categories: ['supply-chain', 'insider-threat'], regions: [] },
};

/**
 * Fixture-derived inputs (verbatim article text) paired with curated, text-grounded
 * ground truth. Scored by set recall: a model returning a reasonable superset is
 * not penalised; missing a text-supported label is the failure we care about.
 */
const fixtureDerived: EnrichTaxonomyExample[] = ALL_PACKS.map((pack: ThreatIntelPack) => {
  const curated = CURATED_TAXONOMY[pack.packId];
  if (!curated) {
    throw new Error(`Missing curated taxonomy ground truth for pack "${pack.packId}"`);
  }
  return {
    input: { text: pack.body, title: pack.title, report_id: `pack-${pack.packId}` },
    output: { categories: curated.categories, regions: curated.regions },
    metadata: {
      Title: `enrich_taxonomy: ${pack.packId}`,
      source: 'fixture-derived',
      pack: pack.packId,
    },
  };
});

/**
 * Authored multi-category example to exercise taxonomy breadth (ransomware +
 * data-breach across two regions) not densely represented by the demo packs.
 */
const authored: EnrichTaxonomyExample[] = [
  {
    input: {
      title: 'Ransomware group exfiltrates and encrypts EU and US hospital networks',
      text:
        'A financially motivated ransomware group breached hospital networks across Germany and the ' +
        'United States, exfiltrating patient records before deploying encryptors. The double-extortion ' +
        'campaign leaked stolen data on a dark-web site to pressure victims into paying. Affected ' +
        'organizations reported disrupted clinical systems and confirmed theft of protected health ' +
        'information. Techniques include T1486 for data encryption and T1567 for exfiltration.',
      report_id: 'authored-ransomware-healthcare',
    },
    output: {
      categories: ['ransomware', 'data-breach'],
      regions: ['north-america', 'europe'],
    },
    metadata: {
      Title: 'enrich_taxonomy: multi-category ransomware + data-breach',
      source: 'authored',
    },
  },
];

export const enrichTaxonomyDataset: EnrichTaxonomyExample[] = [...fixtureDerived, ...authored];
