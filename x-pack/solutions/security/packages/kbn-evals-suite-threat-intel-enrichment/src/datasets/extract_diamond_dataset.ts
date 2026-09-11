/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ExtractDiamondExample } from '../types';
import { AWS_IAM_PACK, KUBERNETES_PACK, OKTA_PACK } from './packs';

/**
 * Diamond extraction is exercised on the three packs richest in adversary,
 * capability, infrastructure, and victim signal. `min_signal_count` is a floor
 * on how many of the four vertices should come back non-NONE; the prose-quality
 * and IOC-leak constraints are checked by the LLM-judge criteria in the spec.
 *
 * The GitHub pack is intentionally excluded: it is an optional-hunting rollup
 * that `enrich_taxonomy` gates as not `diamond_suitable`, so the pipeline would
 * not send it to extraction.
 *
 * The three demo packs are dense in all four vertices, so `DiamondSignalCount`
 * clears their 3/3/2 floors unconditionally and cannot go red on them. The
 * authored `sparse-rmm-technique` example is the boundary case: a technique-only
 * note that genuinely supports a single vertex (capability) and nothing else, at
 * `min_signal_count: 1` — the true anti-collapse floor. It scores 0 only if the
 * model returns an all-NONE Diamond, which is the exact under-extraction failure
 * this evaluator guards against, so the check can actually fail on live data
 * rather than only in the unit test.
 */
export const extractDiamondDataset: ExtractDiamondExample[] = [
  {
    input: { text: OKTA_PACK.body, report_id: `pack-${OKTA_PACK.packId}` },
    output: { min_signal_count: 3 },
    metadata: {
      Title: 'extract_diamond: okta identity campaign',
      source: 'fixture-derived',
      pack: OKTA_PACK.packId,
    },
  },
  {
    input: { text: AWS_IAM_PACK.body, report_id: `pack-${AWS_IAM_PACK.packId}` },
    output: { min_signal_count: 3 },
    metadata: {
      Title: 'extract_diamond: aws-iam privilege escalation',
      source: 'fixture-derived',
      pack: AWS_IAM_PACK.packId,
    },
  },
  {
    input: { text: KUBERNETES_PACK.body, report_id: `pack-${KUBERNETES_PACK.packId}` },
    output: { min_signal_count: 2 },
    metadata: {
      Title: 'extract_diamond: kubernetes secret theft',
      source: 'fixture-derived',
      pack: KUBERNETES_PACK.packId,
    },
  },
  // Deliberately sparse: a technique-only advisory that supports the capability
  // vertex and nothing else (no attribution, no named victim, no indicators).
  // A correct extraction is a single non-NONE vertex, so `min_signal_count: 1`
  // sits right at the anti-collapse floor and drives DiamondSignalCount to 0 iff
  // the model collapses to an all-NONE Diamond on extraction-worthy input.
  {
    input: {
      text:
        'A defender-focused advisory describes a living-off-the-land technique in which ' +
        'operators abuse a legitimate remote-monitoring-and-management (RMM) agent already ' +
        'present in the environment to keep interactive access after an intrusion. The write-up ' +
        'characterises the tradecraft: enabling the agent unattended-access mode, suppressing its ' +
        'uninstall protection, and routing operator sessions through the agent so the activity ' +
        'blends in with sanctioned IT administration. The note is deliberately generic. It does ' +
        'not attribute the technique to any named group or campaign, names no victim organisation, ' +
        'sector, or geography, and lists no indicators — no IP addresses, domains, URLs, file ' +
        'hashes, or account names. It exists only to help defenders build behavioural detections ' +
        'for RMM abuse.',
      report_id: 'authored-sparse-rmm-technique',
    },
    output: { min_signal_count: 1 },
    metadata: {
      Title: 'extract_diamond: sparse technique-only note (floor guard)',
      source: 'authored',
    },
  },
];
