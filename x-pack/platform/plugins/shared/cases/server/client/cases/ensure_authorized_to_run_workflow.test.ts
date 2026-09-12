/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { WriteOperations } from '../../authorization';
import { CASE_SAVED_OBJECT } from '../../../common/constants';
import { mockCases } from '../../mocks';
import { createCasesClientMockArgs } from '../mocks';
import { ensureAuthorizedToRunWorkflow } from './ensure_authorized_to_run_workflow';

describe('ensureAuthorizedToRunWorkflow', () => {
  const clientArgs = createCasesClientMockArgs();
  const caseA = mockCases[0];
  const caseB = mockCases[1];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('authorizes using the updateCase privilege (cases:<owner>/updateCase) with a workflow-run audit action', async () => {
    clientArgs.services.caseService.getCases.mockResolvedValue({
      saved_objects: [caseA],
    });

    await ensureAuthorizedToRunWorkflow({ ids: [caseA.id] }, clientArgs);

    expect(clientArgs.authorization.ensureAuthorized).toHaveBeenCalledWith({
      // The operation reuses WriteOperations.UpdateCase as the privilege name so the
      // cases:<owner>/updateCase privilege string controls access, but overrides the audit
      // action to `case_workflow_run_authz` (access, not change) to avoid writing a
      // misleading "case updated" audit record when no mutation occurs.
      operation: expect.objectContaining({
        name: WriteOperations.UpdateCase,
        action: 'case_workflow_run_authz',
        ecsType: 'access',
        savedObjectType: CASE_SAVED_OBJECT,
      }),
      entities: [{ id: caseA.id, owner: caseA.attributes.owner }],
    });
  });

  it('returns the authorized entities so callers can skip a redundant getCases fetch', async () => {
    clientArgs.services.caseService.getCases.mockResolvedValue({
      saved_objects: [caseA],
    });

    const entities = await ensureAuthorizedToRunWorkflow({ ids: [caseA.id] }, clientArgs);

    expect(entities).toEqual([{ id: caseA.id, owner: caseA.attributes.owner }]);
  });

  it('issues a single authorization call carrying all entities for multi-case requests', async () => {
    clientArgs.services.caseService.getCases.mockResolvedValue({
      saved_objects: [caseA, caseB],
    });

    const entities = await ensureAuthorizedToRunWorkflow({ ids: [caseA.id, caseB.id] }, clientArgs);

    expect(clientArgs.services.caseService.getCases).toHaveBeenCalledTimes(1);
    expect(clientArgs.authorization.ensureAuthorized).toHaveBeenCalledTimes(1);
    expect(clientArgs.authorization.ensureAuthorized).toHaveBeenCalledWith(
      expect.objectContaining({
        entities: expect.arrayContaining([
          { id: caseA.id, owner: caseA.attributes.owner },
          { id: caseB.id, owner: caseB.attributes.owner },
        ]),
      })
    );
    expect(entities).toEqual(
      expect.arrayContaining([
        { id: caseA.id, owner: caseA.attributes.owner },
        { id: caseB.id, owner: caseB.attributes.owner },
      ])
    );
  });

  it('propagates authorization failures', async () => {
    clientArgs.services.caseService.getCases.mockResolvedValue({
      saved_objects: [caseA],
    });
    clientArgs.authorization.ensureAuthorized.mockRejectedValue(new Error('not authorized'));

    await expect(ensureAuthorizedToRunWorkflow({ ids: [caseA.id] }, clientArgs)).rejects.toThrow(
      'not authorized'
    );
  });

  it('rejects with forbidden (not not-found) when all requested cases fail to load', async () => {
    // Simulates all ids producing SO errors — e.g., the caller supplied bogus ids or ids from
    // another space. We must reject with 403, not 404, so an unauthorized caller cannot learn
    // which ids exist.
    const soError = {
      id: 'missing-case',
      type: 'cases',
      error: { statusCode: 404, error: 'Not Found', message: 'Saved object not found' },
    };
    clientArgs.services.caseService.getCases.mockResolvedValue({
      saved_objects: [soError],
    } as unknown as Awaited<ReturnType<typeof clientArgs.services.caseService.getCases>>);

    // ensureAuthorized({ entities: [] }) passes vacuously — the explicit guard rejects
    // with 403 before calling ensureAuthorized, so the authorization mock is never called.
    await expect(
      ensureAuthorizedToRunWorkflow({ ids: ['missing-case'] }, clientArgs)
    ).rejects.toThrow('Unauthorized to run workflow on case');
    expect(clientArgs.authorization.ensureAuthorized).not.toHaveBeenCalled();
  });

  it('rejects with forbidden (not not-found) when the batch is mixed (some found, some missing)', async () => {
    // A mix of one valid + one missing case: surfacing a 404 for the missing id would let an
    // unauthorized caller enumerate which case ids exist across owners they cannot read.
    // We therefore reject the whole batch with 403 so the caller learns nothing about existence.
    const soError = {
      id: 'missing-case',
      type: 'cases',
      error: { statusCode: 404, error: 'Not Found', message: 'Saved object not found' },
    };
    clientArgs.services.caseService.getCases.mockResolvedValue({
      saved_objects: [caseA, soError],
    } as unknown as Awaited<ReturnType<typeof clientArgs.services.caseService.getCases>>);

    await expect(
      ensureAuthorizedToRunWorkflow({ ids: [caseA.id, 'missing-case'] }, clientArgs)
    ).rejects.toThrow('Unauthorized to run workflow on case');
    // ensureAuthorized must NOT be called — the forbidden must fire before privilege check.
    expect(clientArgs.authorization.ensureAuthorized).not.toHaveBeenCalled();
  });
});
