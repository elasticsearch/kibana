/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RelationshipIntegrationConfig } from '../engine/types';

const HUMAN_IAM_IDENTITY_TYPES = [
  'IAMUser',
  'AssumedRole',
  'Root',
  'FederatedUser',
  'IdentityCenterUser',
];

const EXCLUDED_USERNAMES = ['SYSTEM', 'LOCAL SERVICE', 'NETWORK SERVICE', 'ANONYMOUS LOGON'];

const SUCCESSFUL_OUTCOME_FILTER = { term: { 'event.outcome': 'success' } } as const;

export const COMMUNICATES_WITH_INTEGRATION_RELATIONSHIP_CONFIGS: RelationshipIntegrationConfig[] = [
  {
    kind: 'standard',
    id: 'elastic_defend',
    name: 'Elastic Defend',
    indexPattern: (ns) => `logs-endpoint.events.security-${ns}`,
    relationshipKey: 'communicates_with',
    targetEntityType: 'host',
    requireTargetEntityIdExists: true,
    esqlWhereClause: `event.action == "log_on"
    AND process.Ext.session_info.logon_type IN ("RemoteInteractive", "Interactive", "Network")
    AND event.outcome == "success"`,
    compositeAggAdditionalFilters: [
      { term: { 'event.action': 'log_on' } },
      SUCCESSFUL_OUTCOME_FILTER,
    ],
  },
  {
    kind: 'standard',
    id: 'system_auth',
    name: 'System Auth',
    indexPattern: (ns) => `logs-system.auth-${ns}`,
    relationshipKey: 'communicates_with',
    targetEntityType: 'host',
    requireTargetEntityIdExists: true,
    esqlWhereClause: `event.category IN ("authentication", "session")
    AND event.action == "ssh_login"
    AND event.outcome == "success"`,
    compositeAggAdditionalFilters: [
      { term: { 'event.action': 'ssh_login' } },
      SUCCESSFUL_OUTCOME_FILTER,
    ],
  },
  {
    kind: 'standard',
    id: 'system_security',
    name: 'System Security',
    indexPattern: (ns) => `logs-system.security-${ns}`,
    relationshipKey: 'communicates_with',
    targetEntityType: 'host',
    requireTargetEntityIdExists: true,
    esqlWhereClause: `event.action IN ("logged-in", "logged-in-explicit")
    AND event.code IN ("4624", "4648")
    AND winlog.logon.type IN ("Interactive", "RemoteInteractive", "CachedInteractive")
    AND event.outcome == "success"
    AND NOT user.name IN (${EXCLUDED_USERNAMES.map((u) => `"${u}"`).join(', ')})`,
    compositeAggAdditionalFilters: [
      { terms: { 'event.action': ['logged-in', 'logged-in-explicit'] } },
      SUCCESSFUL_OUTCOME_FILTER,
    ],
  },
  {
    kind: 'standard',
    id: 'jamf_pro',
    name: 'Jamf Pro',
    indexPattern: (ns) => `logs-jamf_pro.events-${ns}`,
    relationshipKey: 'communicates_with',
    targetEntityType: 'host',
    requireTargetEntityIdExists: true,
    esqlWhereClause: `event.action == "UserLogin"
    AND user.name IS NOT NULL`,
    compositeAggAdditionalFilters: [{ term: { 'event.action': 'UserLogin' } }],
  },
  {
    kind: 'standard',
    id: 'aws_cloudtrail',
    name: 'AWS CloudTrail',
    indexPattern: (ns) => `logs-aws.cloudtrail-${ns}`,
    relationshipKey: 'communicates_with',
    targetEntityType: 'host',
    // Narrow exists-filter, NOT `requireTargetEntityIdExists: true`:
    // targetEvalOverride uses `host.target.entity.id` specifically, which is
    // narrower than the any-host-EUID-source gate the boolean flag enables.
    compositeAggAdditionalFilters: [{ exists: { field: 'host.target.entity.id' } }],
    esqlWhereClause: `aws.cloudtrail.user_identity.type IN (${HUMAN_IAM_IDENTITY_TYPES.map(
      (t) => `"${t}"`
    ).join(', ')})
    AND host.target.entity.id IS NOT NULL`,
    targetEvalOverride: `CONCAT("host:", host.target.entity.id)`,
  },
];
