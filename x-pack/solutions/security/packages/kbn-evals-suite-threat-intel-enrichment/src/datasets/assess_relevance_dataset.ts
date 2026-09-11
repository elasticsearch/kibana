/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AssessRelevanceExample } from '../types';
import { ALL_PACKS } from './packs';

/**
 * All four demo packs are genuine threat-intel (advisories / incident reports
 * with technical substance and ATT&CK mappings), so `is_intelligence` is true.
 */
const fixtureDerived: AssessRelevanceExample[] = ALL_PACKS.map((pack) => ({
  input: { text: pack.body, title: pack.title },
  output: { is_intelligence: true },
  metadata: {
    Title: `assess_relevance: ${pack.packId} (is_intelligence)`,
    source: 'fixture-derived',
    pack: pack.packId,
  },
}));

/**
 * Authored non-intelligence distractors. These exercise the `false` branch that
 * no demo pack covers: vendor marketing and opinion pieces with no technical
 * substance must not be classified as intelligence.
 */
const authored: AssessRelevanceExample[] = [
  {
    input: {
      title: 'Why our next-gen XDR platform is the smart choice for 2026',
      text:
        'Cyber threats have never been more challenging. That is why leading enterprises trust ' +
        'our award-winning, AI-powered XDR platform to stay ahead. Book a demo today and discover ' +
        'how our unified console, 24/7 managed service, and industry-best ROI can transform your ' +
        'security posture. Contact our sales team for special launch pricing before the quarter ends.',
    },
    output: { is_intelligence: false },
    metadata: {
      Title: 'assess_relevance: vendor marketing (not intelligence)',
      source: 'authored',
    },
  },
  {
    input: {
      title: 'The future of Zero Trust: a CISO reflection',
      text:
        'As we look ahead, Zero Trust is more a journey than a destination. In this reflection I ' +
        'share my personal philosophy on culture, leadership, and why trust must be earned across ' +
        'the organization. There are no specific indicators, techniques, or incidents here, just ' +
        'high-level musings on where our industry is heading and how leaders should think about risk.',
    },
    output: { is_intelligence: false },
    metadata: {
      Title: 'assess_relevance: thought-leadership opinion (not intelligence)',
      source: 'authored',
    },
  },
];

export const assessRelevanceDataset: AssessRelevanceExample[] = [...fixtureDerived, ...authored];
