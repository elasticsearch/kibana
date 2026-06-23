/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PublicMethodsOf } from '@kbn/utility-types';
import { v4 } from 'uuid';
import Boom from '@hapi/boom';

import { MAX_OBSERVABLES_PER_CASE } from '../../../common/constants';
import type { Observable } from '../../../common/types/domain';
import { CaseRt, UserActionTypes } from '../../../common/types/domain';
import {
  AddObservableRequestRt,
  type AddObservableRequest,
  type UpdateObservableRequest,
  UpdateObservableRequestRt,
  type BulkAddObservablesRequest,
  BulkAddObservablesRequestRt,
  type ObservablePost,
} from '../../../common/types/api';
import type { CasesClient } from '../client';
import type { CasesClientArgs } from '../types';
import { decodeOrThrow, decodeWithExcessOrThrow } from '../../common/runtime_types';
import type { Authorization } from '../../authorization';
import { Operations } from '../../authorization';
import type { CaseSavedObjectTransformed } from '../../common/types/case';
import { flattenCaseSavedObject } from '../../common/utils';
import { LICENSING_CASE_OBSERVABLES_FEATURE } from '../../common/constants';
import {
  validateDuplicatedObservablesInRequest,
  validateObservableTypeKeyExists,
  validateObservableValue,
} from '../validators';
import { processObservables } from './utils';

const ensureUpdateAuthorized = async (
  authorization: PublicMethodsOf<Authorization>,
  theCase: CaseSavedObjectTransformed
) => {
  return authorization.ensureAuthorized({
    operation: Operations.updateCase,
    entities: [
      {
        id: theCase.id,
        owner: theCase.attributes.owner,
      },
    ],
  });
};

/**
 * License-agnostic core that dedupes, caps, persists, and records a user action
 * for a set of observables on a case. Callers MUST enforce the Platinum license
 * gate and call notifyUsage themselves.
 *
 * Skips both the patchCase write and the user action write when no new
 * observables were added (idempotency — avoids a no-op SO write on every
 * re-extraction of the same alert).
 *
 * @param prefetchedCase - Optional already-fetched SO to avoid an extra getCase
 *   round-trip. When provided, `caseId` is ignored for the initial fetch.
 */
export const applyObservablesToCase = async (
  caseId: string,
  observables: ObservablePost[],
  clientArgs: CasesClientArgs,
  prefetchedCase?: CaseSavedObjectTransformed
) => {
  const {
    services: { caseService, userActionService },
    user,
  } = clientArgs;

  if (observables.length === 0) {
    return;
  }

  const retrievedCase = prefetchedCase ?? (await caseService.getCase({ id: caseId }));

  const currentObservables = retrievedCase.attributes.observables ?? [];
  const updatedObservablesMap = new Map<string, Observable>();
  currentObservables.forEach((observable) => {
    processObservables(updatedObservablesMap, observable);
  });

  observables.forEach((observable) => processObservables(updatedObservablesMap, observable));

  const finalObservables = Array.from(updatedObservablesMap.values()).slice(
    0,
    MAX_OBSERVABLES_PER_CASE
  );

  const newObservablesCount = finalObservables.length - currentObservables.length;

  // Nothing new was added — skip both the patch write and the user action to
  // avoid a no-op SO write on every idempotent re-extraction (e.g. the same
  // alert being attached multiple times).
  if (newObservablesCount <= 0) {
    return;
  }

  const patchedCase = await caseService.patchCase({
    caseId: retrievedCase.id,
    originalCase: retrievedCase,
    updatedAttributes: {
      observables: finalObservables,
      total_observables: finalObservables.length,
    },
  });

  await userActionService.creator.createUserAction({
    userAction: {
      type: UserActionTypes.observables,
      caseId: retrievedCase.id,
      owner: retrievedCase.attributes.owner,
      user,
      payload: {
        observables: { count: newObservablesCount, actionType: 'add' },
      },
    },
  });

  return {
    ...retrievedCase,
    ...patchedCase,
    attributes: { ...retrievedCase.attributes, ...patchedCase?.attributes },
    references: retrievedCase.references,
  };
};

export const addObservable = async (
  caseId: string,
  params: AddObservableRequest,
  clientArgs: CasesClientArgs,
  casesClient: CasesClient
) => {
  const {
    services: { caseService, licensingService, userActionService },
    authorization,
    user,
  } = clientArgs;

  const hasPlatinumLicenseOrGreater = await licensingService.isAtLeastPlatinum();

  if (!hasPlatinumLicenseOrGreater) {
    throw Boom.forbidden(
      'In order to assign observables to cases, you must be subscribed to an Elastic Platinum license'
    );
  }

  licensingService.notifyUsage(LICENSING_CASE_OBSERVABLES_FEATURE);

  try {
    const paramArgs = decodeWithExcessOrThrow(AddObservableRequestRt)(params);
    const retrievedCase = await caseService.getCase({ id: caseId });
    await ensureUpdateAuthorized(authorization, retrievedCase);

    await validateObservableTypeKeyExists(casesClient, {
      caseOwner: retrievedCase.attributes.owner,
      observableTypeKey: params.observable.typeKey,
    });

    validateObservableValue(paramArgs.observable.typeKey, paramArgs.observable.value);

    const currentObservables = retrievedCase.attributes.observables ?? [];

    if (currentObservables.length === MAX_OBSERVABLES_PER_CASE) {
      throw Boom.forbidden(`Max ${MAX_OBSERVABLES_PER_CASE} observables per case is allowed.`);
    }

    const updatedObservables = [
      ...currentObservables,
      {
        ...paramArgs.observable,
        id: v4(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    validateDuplicatedObservablesInRequest({
      requestFields: updatedObservables,
    });

    const updatedCase = await caseService.patchCase({
      caseId: retrievedCase.id,
      originalCase: retrievedCase,
      updatedAttributes: {
        observables: updatedObservables,
        total_observables: updatedObservables.length,
      },
    });

    await userActionService.creator.createUserAction({
      userAction: {
        type: UserActionTypes.observables,
        caseId: retrievedCase.id,
        owner: retrievedCase.attributes.owner,
        user,
        payload: {
          observables: { count: 1, actionType: 'add' },
        },
      },
    });

    const res = flattenCaseSavedObject({
      savedObject: {
        ...retrievedCase,
        ...updatedCase,
        attributes: { ...retrievedCase.attributes, ...updatedCase?.attributes },
        references: retrievedCase.references,
      },
    });

    return decodeOrThrow(CaseRt)(res);
  } catch (error) {
    throw Boom.badRequest(`Failed to add observable: ${error}`);
  }
};

export const updateObservable = async (
  caseId: string,
  observableId: string,
  params: UpdateObservableRequest,
  clientArgs: CasesClientArgs,
  casesClient: CasesClient
) => {
  const {
    services: { caseService, licensingService, userActionService },
    authorization,
    user,
  } = clientArgs;

  const hasPlatinumLicenseOrGreater = await licensingService.isAtLeastPlatinum();

  if (!hasPlatinumLicenseOrGreater) {
    throw Boom.forbidden(
      'In order to update observables in cases, you must be subscribed to an Elastic Platinum license'
    );
  }

  licensingService.notifyUsage(LICENSING_CASE_OBSERVABLES_FEATURE);

  try {
    const paramArgs = decodeWithExcessOrThrow(UpdateObservableRequestRt)(params);
    const retrievedCase = await caseService.getCase({ id: caseId });
    await ensureUpdateAuthorized(authorization, retrievedCase);

    const currentObservables = retrievedCase.attributes.observables ?? [];

    const observableIndex = currentObservables.findIndex(
      (observable) => observable.id === observableId
    );

    if (observableIndex === -1) {
      throw Boom.notFound(`Failed to update observable: observable id ${observableId} not found`);
    }

    validateObservableValue(
      currentObservables[observableIndex].typeKey,
      paramArgs.observable.value
    );

    const updatedObservables = [...currentObservables];
    updatedObservables[observableIndex] = {
      ...updatedObservables[observableIndex],
      ...paramArgs.observable,
      updatedAt: new Date().toISOString(),
    };

    validateDuplicatedObservablesInRequest({
      requestFields: updatedObservables,
    });

    const updatedCase = await caseService.patchCase({
      caseId: retrievedCase.id,
      originalCase: retrievedCase,
      updatedAttributes: {
        observables: updatedObservables,
        total_observables: updatedObservables.length,
      },
    });

    await userActionService.creator.createUserAction({
      userAction: {
        type: UserActionTypes.observables,
        caseId: retrievedCase.id,
        owner: retrievedCase.attributes.owner,
        user,
        payload: {
          observables: { count: 1, actionType: 'update' },
        },
      },
    });

    const res = flattenCaseSavedObject({
      savedObject: {
        ...retrievedCase,
        ...updatedCase,
        attributes: { ...retrievedCase.attributes, ...updatedCase?.attributes },
        references: retrievedCase.references,
      },
    });

    return decodeOrThrow(CaseRt)(res);
  } catch (error) {
    throw Boom.badRequest(`Failed to update observable: ${error}`);
  }
};

export const deleteObservable = async (
  caseId: string,
  observableId: string,
  clientArgs: CasesClientArgs,
  casesClient: CasesClient
) => {
  const {
    services: { caseService, licensingService, userActionService },
    authorization,
    user,
  } = clientArgs;

  const hasPlatinumLicenseOrGreater = await licensingService.isAtLeastPlatinum();

  if (!hasPlatinumLicenseOrGreater) {
    throw Boom.forbidden(
      'In order to delete observables from cases, you must be subscribed to an Elastic Platinum license'
    );
  }

  licensingService.notifyUsage(LICENSING_CASE_OBSERVABLES_FEATURE);

  try {
    const retrievedCase = await caseService.getCase({ id: caseId });
    await ensureUpdateAuthorized(authorization, retrievedCase);

    const updatedObservables = retrievedCase.attributes.observables.filter(
      (observable) => observable.id !== observableId
    );

    // NOTE: same length of observables pre and post filter means that the observable id has not been found
    if (updatedObservables.length === retrievedCase.attributes.observables.length) {
      throw Boom.notFound(`Failed to delete observable: observable id ${observableId} not found`);
    }

    await caseService.patchCase({
      caseId: retrievedCase.id,
      originalCase: retrievedCase,
      updatedAttributes: {
        observables: updatedObservables,
        total_observables: updatedObservables.length,
      },
    });
    await userActionService.creator.createUserAction({
      userAction: {
        type: UserActionTypes.observables,
        caseId: retrievedCase.id,
        owner: retrievedCase.attributes.owner,
        user,
        payload: {
          observables: { count: 1, actionType: 'delete' },
        },
      },
    });
  } catch (error) {
    throw Boom.badRequest(`Failed to delete observable id: ${observableId}: ${error}`);
  }
};

export const bulkAddObservables = async (
  params: BulkAddObservablesRequest,
  clientArgs: CasesClientArgs,
  casesClient: CasesClient
) => {
  const {
    services: { caseService, licensingService },
    authorization,
  } = clientArgs;

  const hasPlatinumLicenseOrGreater = await licensingService.isAtLeastPlatinum();

  if (!hasPlatinumLicenseOrGreater) {
    throw Boom.forbidden(
      'In order to assign observables to cases, you must be subscribed to an Elastic Platinum license'
    );
  }

  licensingService.notifyUsage(LICENSING_CASE_OBSERVABLES_FEATURE);

  try {
    const paramArgs = decodeWithExcessOrThrow(BulkAddObservablesRequestRt)(params);
    const retrievedCase = await caseService.getCase({ id: paramArgs.caseId });
    await ensureUpdateAuthorized(authorization, retrievedCase);

    await Promise.all(
      params.observables.map((observable: ObservablePost) =>
        validateObservableTypeKeyExists(casesClient, {
          caseOwner: retrievedCase.attributes.owner,
          observableTypeKey: observable.typeKey,
        })
      )
    );

    const theCase = await applyObservablesToCase(
      paramArgs.caseId,
      paramArgs.observables,
      clientArgs,
      retrievedCase
    );
    if (theCase) {
      const res = flattenCaseSavedObject({ savedObject: theCase });
      return decodeOrThrow(CaseRt)(res);
    } else {
      throw Boom.badRequest(`Failed to add observable`);
    }
  } catch (error) {
    throw Boom.badRequest(`Failed to add observable: ${error}`);
  }
};
