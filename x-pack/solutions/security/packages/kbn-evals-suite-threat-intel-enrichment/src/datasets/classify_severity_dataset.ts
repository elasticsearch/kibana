/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ClassifySeverityExample } from '../types';
import { AWS_IAM_PACK, GITHUB_ACTIONS_PACK } from './packs';

/**
 * Severity has no label in the demo fixtures, so the ladder is exercised with
 * authored, deliberately unambiguous prose covering every level. Two
 * fixture-derived packs anchor the mid/low end: the AWS-IAM write-up is a
 * confirmed-but-not-active-outage escalation (high), and the GitHub note is an
 * explicitly optional-hunting rollup with no active incident (low).
 *
 * Scored with a one-step-adjacent tolerance (see the severity evaluators),
 * because a single-level miss on an inherently ordinal judgement is expected.
 */
const authored: ClassifySeverityExample[] = [
  {
    input: {
      title: 'Active ransomware encrypting production domain controllers',
      text:
        'A ransomware operator has active encryption underway across production domain controllers ' +
        'and file servers at a manufacturing enterprise. Backups were deleted, shadow copies wiped, ' +
        'and confirmed exfiltration of sensitive data preceded detonation. Operations are halted ' +
        'plant-wide and the group has posted the victim to its leak site with a 48-hour deadline.',
    },
    output: { level: 'critical' },
    metadata: {
      Title: 'classify_severity: active ransomware outage (critical)',
      source: 'authored',
    },
  },
  {
    input: {
      title: 'Confirmed privilege escalation with admin access in production cloud tenant',
      text:
        'Investigators confirmed an attacker escalated to full administrative access in a production ' +
        'cloud tenant, created persistence, and accessed a secrets store. There is no confirmed data ' +
        'exfiltration or service outage yet, but the blast radius covers production workloads and the ' +
        'attacker retains active access pending containment.',
    },
    output: { level: 'high' },
    metadata: {
      Title: 'classify_severity: confirmed prod privilege escalation (high)',
      source: 'authored',
    },
  },
  {
    input: {
      title: 'Public PoC for an unpatched medium-severity web framework flaw',
      text:
        'A proof-of-concept was published for a medium-severity vulnerability in a popular web ' +
        'framework that requires an authenticated session to exploit. No in-the-wild exploitation has ' +
        'been observed. A vendor patch is available and mitigation is straightforward, but exposed ' +
        'deployments that have not yet updated carry some risk.',
    },
    output: { level: 'medium' },
    metadata: { Title: 'classify_severity: patched PoC, no ITW (medium)', source: 'authored' },
  },
  {
    input: {
      title: 'Informational best-practices reminder for identity hygiene',
      text:
        'A routine informational advisory reminds administrators to review inactive accounts, enable ' +
        'MFA, and rotate long-lived credentials as part of good identity hygiene. There is no specific ' +
        'threat, campaign, vulnerability, or indicator described, only general recommendations.',
    },
    output: { level: 'low' },
    metadata: {
      Title: 'classify_severity: informational hygiene advisory (low)',
      source: 'authored',
    },
  },
];

const fixtureDerived: ClassifySeverityExample[] = [
  {
    input: {
      title: AWS_IAM_PACK.title,
      text: AWS_IAM_PACK.body,
      categories: AWS_IAM_PACK.categories,
      report_id: `pack-${AWS_IAM_PACK.packId}`,
    },
    output: { level: 'high' },
    metadata: {
      Title: 'classify_severity: aws-iam confirmed escalation (high)',
      source: 'fixture-derived',
      pack: AWS_IAM_PACK.packId,
    },
  },
  {
    input: {
      title: GITHUB_ACTIONS_PACK.title,
      text: GITHUB_ACTIONS_PACK.body,
      categories: GITHUB_ACTIONS_PACK.categories,
      report_id: `pack-${GITHUB_ACTIONS_PACK.packId}`,
    },
    output: { level: 'low' },
    metadata: {
      Title: 'classify_severity: github-actions optional-hunting rollup (low)',
      source: 'fixture-derived',
      pack: GITHUB_ACTIONS_PACK.packId,
    },
  },
];

export const classifySeverityDataset: ClassifySeverityExample[] = [...authored, ...fixtureDerived];
