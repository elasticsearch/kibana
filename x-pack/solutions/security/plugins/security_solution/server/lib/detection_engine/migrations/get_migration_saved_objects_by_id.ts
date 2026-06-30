/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fold } from 'fp-ts/Either';
import { pipe } from 'fp-ts/pipeable';

import type { SavedObjectsClientContract } from '@kbn/core/server';
import { isSavedObjectErrorResult } from '@kbn/core-saved-objects-server';
import { validateEither } from '@kbn/securitysolution-io-ts-utils';
import { signalsMigrationSOClient } from './saved_objects_client';
import type { SignalsMigrationSO } from './saved_objects_schema';
import { signalsMigrationSOs } from './saved_objects_schema';

class MigrationResponseError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Retrieves a list of migrations SOs by their ID
 *
 * @param soClient An {@link SavedObjectsClientContract}
 * @param ids IDs of the migration SOs
 *
 * @returns a list of {@link SignalsMigrationSO[]}
 *
 * @throws if client returns an error
 */
export const getMigrationSavedObjectsById = async ({
  ids,
  soClient,
}: {
  ids: string[];
  soClient: SavedObjectsClientContract;
}): Promise<SignalsMigrationSO[]> => {
  const client = signalsMigrationSOClient(soClient);
  const objects = ids.map((id) => ({ id }));
  const { saved_objects: migrations } = await client.bulkGet(objects);
  const error = migrations.find(isSavedObjectErrorResult)?.error;

  if (error) {
    throw new MigrationResponseError(error.message, error.statusCode);
  }

  return pipe(
    migrations,
    (ms) => validateEither(signalsMigrationSOs, ms),
    fold(
      (e) => Promise.reject(e),
      (a) => Promise.resolve(a)
    )
  );
};
