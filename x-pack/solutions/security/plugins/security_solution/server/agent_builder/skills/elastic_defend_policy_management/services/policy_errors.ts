/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable max-classes-per-file */

const MAX_AMBIGUOUS_NAME_CANDIDATES = 10;

export const POLICY_ERROR_MESSAGES = {
  not_authorized: 'Not authorized for policy management',
  not_found: 'Endpoint policy not found',
  ambiguous_name: 'Multiple endpoint policies match the given name',
  invalid_policy: 'Selected policy is not a valid endpoint policy',
  conflict: 'Endpoint policy was modified concurrently',
} as const;

export class PolicyNotFoundError extends Error {
  constructor() {
    super(POLICY_ERROR_MESSAGES.not_found);
    this.name = 'PolicyNotFoundError';
  }
}

export class PolicyAmbiguousNameError extends Error {
  public readonly candidates: ReadonlyArray<Readonly<{ id: string; name: string }>>;
  public readonly candidatesTruncated: boolean;
  public readonly candidatesTotal: number;

  constructor(
    candidates: ReadonlyArray<Readonly<{ id: string; name: string }>>,
    candidatesTotal: number = candidates.length
  ) {
    const bounded = candidates.slice(0, MAX_AMBIGUOUS_NAME_CANDIDATES).map(({ id, name }) => ({
      id,
      name,
    }));
    super(POLICY_ERROR_MESSAGES.ambiguous_name);
    this.name = 'PolicyAmbiguousNameError';
    this.candidates = bounded;
    this.candidatesTotal = candidatesTotal;
    this.candidatesTruncated = candidatesTotal > bounded.length;
  }
}

export class InvalidEndpointPolicyError extends Error {
  constructor() {
    super(POLICY_ERROR_MESSAGES.invalid_policy);
    this.name = 'InvalidEndpointPolicyError';
  }
}
