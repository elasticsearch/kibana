/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { CHARTS_SUMMARY_PANELS } from '../proposal_charts_summary/constants';

/**
 * The queue sections, derived from `CHARTS_SUMMARY_PANELS` so the section
 * labels and order match the sparkline cards above them — the design shows the
 * same three numbers on both (5 / 2 / 4). One source means a design change to
 * the cards and the queue cannot silently desync.
 *
 * `escalate` is deliberately omitted here (it is omitted in `CHARTS_SUMMARY_PANELS`
 * too). Any proposal arriving in `escalate` or another unrecognised category is
 * still rendered via the dynamic-append path in `buildProposalQueueSections`.
 */
export const PROPOSAL_QUEUE_SECTIONS = CHARTS_SUMMARY_PANELS.map(({ id, category, label }) => ({
  id,
  category,
  label,
}));

/** Fast lookup: is a category key one of the three named sections? */
export const PROPOSAL_QUEUE_CATEGORIES: ReadonlySet<string> = new Set(
  PROPOSAL_QUEUE_SECTIONS.map((s) => s.category)
);

/** How many closed rows to show before the "Show more" affordance. */
export const CLOSED_VISIBLE_LIMIT = 10;
