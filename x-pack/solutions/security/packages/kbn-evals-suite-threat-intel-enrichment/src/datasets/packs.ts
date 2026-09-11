/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Verbatim snapshot of the four BlackHat demo threat-intel packs.
 *
 * Copied (not imported) from
 * `x-pack/solutions/security/plugins/security_solution/scripts/data/lib/threat_intel_fixtures.ts`
 * so this eval suite owns an immutable golden dataset: editing the demo
 * fixtures must not silently move the eval baseline, and this package must not
 * take a subpath dependency on the security_solution plugin.
 *
 * If the demo fixtures change in a way the evals should track, update this
 * snapshot deliberately in the same change.
 */

export interface ThreatIntelPack {
  packId: string;
  title: string;
  /** Article body, verbatim from the fixture `body` field. */
  body: string;
  /**
   * Closed-set taxonomy categories the fixture is labelled with. Consumed by
   * `classify_severity_dataset` as `classify_severity` input. Taxonomy recall
   * ground truth lives in `enrich_taxonomy_dataset`'s curated set, not here.
   */
  categories: string[];
}

export const OKTA_PACK: ThreatIntelPack = {
  packId: 'okta',
  title: 'Okta Super Admin takeover via stolen sessions from Russian IP space',
  body:
    'Operators linked to a LAPSUS$-style identity campaign are actively abusing stolen Okta ' +
    'sessions from Russian IP 192[.]0[.]2[.]50 (192.0.2.50) against production tenants. They are ' +
    'resetting passwords, stripping MFA (user.mfa.factor.deactivate), and granting Super Admin to ' +
    'finance and IT accounts including cfo@corp.example and it-admin@corp.example. Immediate ' +
    'business impact includes system.api_token.create and privileged app group membership while ' +
    'payroll and ERP SSO remain exposed. This is an ongoing breach with ransomware-adjacent ' +
    'extortion risk; revoke sessions and lock down Super Admin immediately. Hunt ATT&CK ' +
    'T1078.004, T1556, T1098, and T1136.003 across okta.system telemetry.',
  categories: ['insider-threat', 'cloud-security'],
};

export const AWS_IAM_PACK: ThreatIntelPack = {
  packId: 'aws-iam',
  title: 'AWS IAM privilege escalation and credential theft in account 123456789012',
  body:
    'Security researchers documented a confirmed privilege-escalation campaign in AWS account ' +
    '123456789012. Compromised user dev-user@corp.example (source IP 192[.]0[.]2[.]30 / 192.0.2.30) ' +
    'attached AdministratorAccess, assumed escalated-role, and staged access toward S3 bucket ' +
    'corp-prod-data. Follow-on activity from 192[.]0[.]2[.]31 (192.0.2.31) included GetSecretValue ' +
    'on prod/db-credentials plus StopLogging and DeleteTrail for defense evasion. The campaign ' +
    'is well evidenced with reusable IOCs and ATT&CK mappings, so defenders should prioritize ' +
    'hunts, but this write-up does not assert that customer production is currently offline. ' +
    'Hunt ATT&CK T1098.001, T1078.004, and T1562.008 in aws.cloudtrail logs.',
  categories: ['cloud-security', 'insider-threat'],
};

export const KUBERNETES_PACK: ThreatIntelPack = {
  packId: 'kubernetes',
  title: 'Kubernetes secret theft advisory for db-credentials in shared namespaces',
  body:
    'Advisory on db-credentials theft via system:serviceaccount:default:compromised-sa ' +
    '(compromised-sa) in prod-us-east-1. Monitor 192[.]0[.]2[.]60 (192.0.2.60), ' +
    'escalation-binding creation, and exec-pod. Map detections to T1552.007, T1078, and T1610.',
  categories: ['cloud-security', 'malware'],
};

export const GITHUB_ACTIONS_PACK: ThreatIntelPack = {
  packId: 'github-actions',
  title: 'Recurring contractor IOCs in GitHub supply-chain reporting',
  body:
    'Background research note for situational awareness. Prior public reporting has mentioned ' +
    'contractor-style accounts such as dev-contractor-42@corp.example (user dev-contractor-42) in ' +
    'GitHub org corp-example, source IP 192[.]0[.]2[.]70 (192.0.2.70), and invitee ' +
    'malicious-actor-x@external.example as illustrative indicators. Historical write-ups also ' +
    'referenced making corp-example/payment-service public, deploy_key.create, secret-scanning ' +
    'alert dismissals, and fine-grained PATs. No immediate incident response is requested; this ' +
    'catalogs previously reported indicators for optional hunting. Related ATT&CK references: ' +
    'T1567, T1098, and T1195 in github.audit telemetry.',
  categories: ['supply-chain', 'insider-threat'],
};

export const ALL_PACKS: ThreatIntelPack[] = [
  OKTA_PACK,
  AWS_IAM_PACK,
  KUBERNETES_PACK,
  GITHUB_ACTIONS_PACK,
];
