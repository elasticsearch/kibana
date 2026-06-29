/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface IamPolicyDocument {
  Version: string;
  Statement: Array<{
    Sid: string;
    Effect: 'Allow';
    Resource: string;
    Action: string[];
  }>;
}

/** Sid used when the policy aggregates permissions across all selected integrations. */
export const ALL_INTEGRATIONS_SID = 'ElasticAWSIntegration';

/**
 * Derives an IAM statement Sid from a pre-sanitized identifier segment.
 * Sids must be alphanumeric, so any remaining non-alphanumeric characters are stripped
 * and the result is prefixed with "Elastic" (e.g. "Ec2Metrics" -> "ElasticEc2Metrics").
 * Falls back to the aggregated Sid when no identifier is provided.
 */
export const getIntegrationSid = (integrationId?: string): string => {
  if (!integrationId) {
    return ALL_INTEGRATIONS_SID;
  }

  const sanitized = integrationId.replace(/[^a-zA-Z0-9]/g, '');
  return sanitized ? `Elastic${sanitized}` : ALL_INTEGRATIONS_SID;
};

/**
 * Builds a minimal IAM policy document for display or attachment to an IAM user.
 * Resource is scoped to "*" in V1 — ARNs are not known at the Connect step.
 */
export const buildIamPolicyDocument = (
  actions: string[],
  sid: string = ALL_INTEGRATIONS_SID
): IamPolicyDocument => ({
  Version: '2012-10-17',
  Statement: [
    {
      Sid: sid,
      Effect: 'Allow',
      Resource: '*',
      Action: Array.from(new Set(actions)).sort(),
    },
  ],
});

export const formatIamPolicyDocument = (
  actions: string[],
  sid: string = ALL_INTEGRATIONS_SID
): string => JSON.stringify(buildIamPolicyDocument(actions, sid), null, 2);
