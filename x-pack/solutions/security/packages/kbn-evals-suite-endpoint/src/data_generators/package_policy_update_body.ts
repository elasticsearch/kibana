/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PackagePolicy, PackagePolicyInput } from '@kbn/fleet-plugin/common';

export type PackagePolicyUpdateBody = Omit<
  PackagePolicy,
  | 'id'
  | 'agents'
  | 'version'
  | 'revision'
  | 'secret_references'
  | 'created_at'
  | 'created_by'
  | 'updated_at'
  | 'updated_by'
  | 'elasticsearch'
  | 'inputs'
> & {
  inputs: Array<Omit<PackagePolicyInput, 'compiled_input'>>;
};

export const toPackagePolicyUpdateBody = (item: PackagePolicy): PackagePolicyUpdateBody => {
  const {
    id: _id,
    agents: _agents,
    version: _version,
    revision: _revision,
    secret_references: _secretReferences,
    created_at: _createdAt,
    created_by: _createdBy,
    updated_at: _updatedAt,
    updated_by: _updatedBy,
    elasticsearch: _elasticsearch,
    inputs,
    ...updateBody
  } = item;

  return {
    ...updateBody,
    inputs: inputs.map((input) => {
      const { compiled_input: _compiledInput, ...updateInput } = input;
      return updateInput;
    }),
  };
};
