/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  addObservable,
  deleteObservable,
  updateObservable,
  bulkAddObservables,
  applyObservablesToCase,
} from './observables';
import Boom from '@hapi/boom';
import { LICENSING_CASE_OBSERVABLES_FEATURE } from '../../common/constants';
import { createCasesClientMock, createCasesClientMockArgs } from '../mocks';
import { mockCases } from '../../mocks';
import {
  OBSERVABLE_TYPE_IPV4,
  OBSERVABLE_TYPE_IPV6,
  MAX_OBSERVABLES_PER_CASE,
} from '../../../common/constants';
import type { ObservablePost } from '../../../common/types/api';
import { UserActionTypes } from '../../../common/types/domain/user_action/v1';

const caseSO = mockCases[0];

const mockCasesClient = createCasesClientMock();
const mockClientArgs = createCasesClientMockArgs();

const mockLicensingService = mockClientArgs.services.licensingService;
const mockCaseService = mockClientArgs.services.caseService;
const mockUserActionService = mockClientArgs.services.userActionService;

const mockObservablePost = {
  value: '127.0.0.1',
  typeKey: OBSERVABLE_TYPE_IPV4.key,
  description: null,
};
const mockObservable = {
  ...mockObservablePost,
  id: '5c431380-c6ef-459f-b0fe-1699e978517b',
  createdAt: '2024-12-05',
  updatedAt: '2024-12-05',
};
const caseSOWithObservables = {
  ...caseSO,
  attributes: {
    ...caseSO.attributes,
    observables: [mockObservable],
  },
};
describe('addObservable', () => {
  beforeEach(() => {
    mockCaseService.patchCase.mockResolvedValue(caseSO);
    mockCaseService.getCase.mockResolvedValue(caseSO);
    jest.clearAllMocks();
  });

  it('should add an observable successfully', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(true);
    const result = await addObservable(
      'case-id',
      { observable: { typeKey: OBSERVABLE_TYPE_IPV4.key, value: '127.0.0.1', description: '' } },
      mockClientArgs,
      mockCasesClient
    );

    expect(mockLicensingService.notifyUsage).toHaveBeenCalledWith(
      LICENSING_CASE_OBSERVABLES_FEATURE
    );
    expect(result).toBeDefined();
  });

  it('should throw an error if license is not platinum', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(false);

    await expect(
      addObservable(
        'case-id',
        { observable: { typeKey: OBSERVABLE_TYPE_IPV4.key, value: '127.0.0.1', description: '' } },
        mockClientArgs,
        mockCasesClient
      )
    ).rejects.toThrow(
      Boom.forbidden(
        'In order to assign observables to cases, you must be subscribed to an Elastic Platinum license'
      )
    );
  });

  it('should throw an error if the value is not valid', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(true);

    await expect(
      addObservable(
        'case-id',
        { observable: { typeKey: OBSERVABLE_TYPE_IPV4.key, value: 'not an ip', description: '' } },
        mockClientArgs,
        mockCasesClient
      )
    ).rejects.toThrow(
      Boom.forbidden(
        'Failed to add observable: Error: Observable value "not an ip" is not valid for selected observable type observable-type-ipv4.'
      )
    );
  });

  it('should throw an error if observable type is invalid', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(true);

    await expect(
      addObservable(
        'case-id',
        { observable: { typeKey: 'invalid type', value: '127.0.0.1', description: '' } },
        mockClientArgs,
        mockCasesClient
      )
    ).rejects.toThrow(
      Boom.badRequest(
        'Failed to add observable: Error: Invalid observable type, key does not exist: invalid type'
      )
    );
  });

  it('should throw an error if duplicate observable is posted', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(true);

    mockCaseService.getCase.mockResolvedValue(caseSOWithObservables);

    await expect(
      addObservable(
        'case-id',
        { observable: { typeKey: OBSERVABLE_TYPE_IPV4.key, value: '127.0.0.1', description: '' } },
        mockClientArgs,
        mockCasesClient
      )
    ).rejects.toThrow(
      Boom.badRequest('Failed to add observable: Error: Invalid duplicated observables in request.')
    );
  });

  it('should handle errors and throw boom', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(true);
    mockCaseService.getCase.mockRejectedValue(new Error('Case not found'));

    await expect(
      addObservable(
        'case-id',
        { observable: { typeKey: 'typeKey', value: 'test', description: '' } },
        mockClientArgs,
        mockCasesClient
      )
    ).rejects.toThrow();
  });

  it('should create a user action with the correct payload', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(true);
    await addObservable(
      caseSO.id,
      { observable: { typeKey: OBSERVABLE_TYPE_IPV4.key, value: '127.0.0.1', description: '' } },
      mockClientArgs,
      mockCasesClient
    );

    expect(mockUserActionService.creator.createUserAction).toHaveBeenCalledWith({
      userAction: {
        type: UserActionTypes.observables,
        caseId: caseSO.id,
        owner: 'securitySolution',
        user: mockClientArgs.user,
        payload: { observables: { count: 1, actionType: 'add' } },
      },
    });
  });
});

describe('updateObservable', () => {
  beforeEach(() => {
    mockCaseService.patchCase.mockResolvedValue(caseSOWithObservables);
    mockCaseService.getCase.mockResolvedValue(caseSOWithObservables);
    jest.clearAllMocks();
  });

  it('should update an observable successfully', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(true);
    const result = await updateObservable(
      'case-id',
      mockObservable.id,
      {
        observable: {
          value: '192.168.0.1',
          description: 'Updated description',
        },
      },
      mockClientArgs,
      mockCasesClient
    );

    expect(mockLicensingService.notifyUsage).toHaveBeenCalledWith(
      LICENSING_CASE_OBSERVABLES_FEATURE
    );
    expect(result).toBeDefined();
  });

  it('should not update an observable when the provided value is not valid', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(true);
    await expect(
      updateObservable(
        'case-id',
        mockObservable.id,
        {
          observable: {
            value: 'not an ip',
            description: 'Updated description',
          },
        },
        mockClientArgs,
        mockCasesClient
      )
    ).rejects.toThrow(
      Boom.forbidden(
        'Failed to update observable: Error: Observable value "not an ip" is not valid for selected observable type observable-type-ipv4.'
      )
    );
  });

  it('should throw an error if license is not platinum', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(false);

    await expect(
      updateObservable(
        'case-id',
        'observable-id',
        {
          observable: {
            value: '192.168.0.1',
            description: 'Updated description',
          },
        },
        mockClientArgs,
        mockCasesClient
      )
    ).rejects.toThrow(
      Boom.forbidden(
        'In order to update observables in cases, you must be subscribed to an Elastic Platinum license'
      )
    );
  });

  it('should handle errors and throw boom', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(true);
    mockCaseService.getCase.mockRejectedValue(new Error('Case not found'));

    await expect(
      updateObservable(
        'case-id',
        'observable-id',
        { observable: { value: 'test', description: 'Updated description' } },
        mockClientArgs,
        mockCasesClient
      )
    ).rejects.toThrow();
  });

  it('should create a user action with the correct payload', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(true);
    await updateObservable(
      caseSO.id,
      mockObservable.id,
      { observable: { value: '192.168.0.1', description: 'Updated description' } },
      mockClientArgs,
      mockCasesClient
    );

    expect(mockUserActionService.creator.createUserAction).toHaveBeenCalledWith({
      userAction: {
        type: UserActionTypes.observables,
        caseId: caseSO.id,
        owner: 'securitySolution',
        user: mockClientArgs.user,
        payload: { observables: { count: 1, actionType: 'update' } },
      },
    });
  });
});

describe('deleteObservable', () => {
  beforeEach(() => {
    mockCaseService.patchCase.mockResolvedValue(caseSOWithObservables);
    mockCaseService.getCase.mockResolvedValue(caseSOWithObservables);
    jest.clearAllMocks();
  });

  it('should delete an observable successfully', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(true);
    await deleteObservable('case-id', mockObservable.id, mockClientArgs, mockCasesClient);

    expect(mockLicensingService.notifyUsage).toHaveBeenCalledWith(
      LICENSING_CASE_OBSERVABLES_FEATURE
    );
  });

  it('should throw an error if license is not platinum', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(false);

    await expect(
      deleteObservable('case-id', 'observable-id', mockClientArgs, mockCasesClient)
    ).rejects.toThrow(
      Boom.forbidden(
        'In order to delete observables from cases, you must be subscribed to an Elastic Platinum license'
      )
    );
  });

  it('should handle errors and throw boom', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(true);
    mockCaseService.getCase.mockRejectedValue(new Error('Case not found'));

    await expect(
      deleteObservable('case-id', 'observable-id', mockClientArgs, mockCasesClient)
    ).rejects.toThrow();
  });

  it('should create a user action with the correct payload', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(true);
    await deleteObservable(caseSO.id, mockObservable.id, mockClientArgs, mockCasesClient);

    expect(mockUserActionService.creator.createUserAction).toHaveBeenCalledWith({
      userAction: {
        type: UserActionTypes.observables,
        caseId: caseSO.id,
        owner: 'securitySolution',
        user: mockClientArgs.user,
        payload: { observables: { count: 1, actionType: 'delete' } },
      },
    });
  });
});

describe('bulkAddObservables', () => {
  beforeEach(() => {
    mockCaseService.patchCase.mockResolvedValue(caseSOWithObservables);
    mockCaseService.getCase.mockResolvedValue(caseSOWithObservables);
    jest.clearAllMocks();
  });

  const createObservableMatcher = (observable: ObservablePost) =>
    expect.objectContaining({ typeKey: observable.typeKey, value: observable.value });

  it('should bulk add observables successfully', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(true);
    const observables = [
      { typeKey: OBSERVABLE_TYPE_IPV4.key, value: 'ip1', description: '' },
      { typeKey: OBSERVABLE_TYPE_IPV6.key, value: 'ip2', description: '' },
    ];
    const result = await bulkAddObservables(
      {
        caseId: 'case-id',
        observables,
      },
      mockClientArgs,
      mockCasesClient
    );
    expect(result).toBeDefined();

    const expectedObservables = [mockObservable, observables[0], observables[1]];
    expect(mockCaseService.patchCase).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedAttributes: expect.objectContaining({
          observables: expect.arrayContaining(
            expectedObservables.map((observable) =>
              expect.objectContaining({ typeKey: observable.typeKey, value: observable.value })
            )
          ),
        }),
      })
    );
  });

  it('should throw an error if license is not platinum', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(false);
    await expect(
      bulkAddObservables(
        { caseId: 'case-id', observables: [mockObservablePost] },
        mockClientArgs,
        mockCasesClient
      )
    ).rejects.toThrow(
      Boom.forbidden(
        'In order to assign observables to cases, you must be subscribed to an Elastic Platinum license'
      )
    );
  });

  it('should handle errors and throw boom', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(true);
    mockCaseService.getCase.mockRejectedValue(new Error('Case not found'));
    await expect(
      bulkAddObservables(
        { caseId: 'case-id', observables: [mockObservablePost] },
        mockClientArgs,
        mockCasesClient
      )
    ).rejects.toThrow();
  });

  it('should return the max number of observables', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(true);
    const moreThanMaxObservables = [];
    for (let i = 0; i < MAX_OBSERVABLES_PER_CASE; i++) {
      moreThanMaxObservables.push({ ...mockObservablePost, value: `192.168.0.${i}` });
    }
    await bulkAddObservables(
      { caseId: 'case-id', observables: moreThanMaxObservables },
      mockClientArgs,
      mockCasesClient
    );

    const expectedObservables = [
      mockObservable,
      // offset by one to account for the existing observable in the case
      ...moreThanMaxObservables.slice(0, MAX_OBSERVABLES_PER_CASE - 1),
    ];
    const excludedObservable = moreThanMaxObservables[moreThanMaxObservables.length - 1];

    expect(mockCaseService.patchCase).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedAttributes: expect.objectContaining({
          observables: expect.arrayContaining(expectedObservables.map(createObservableMatcher)),
        }),
      })
    );
    expect(mockCaseService.patchCase).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedAttributes: expect.objectContaining({
          observables: expect.not.arrayContaining([createObservableMatcher(excludedObservable)]),
        }),
      })
    );
  });

  it('should create a user action with the correct payload', async () => {
    mockLicensingService.isAtLeastPlatinum.mockResolvedValue(true);
    await bulkAddObservables(
      {
        caseId: caseSO.id,
        observables: [
          { ...mockObservablePost, value: 'ip2' },
          { ...mockObservablePost, value: 'ip3' },
        ],
      },
      mockClientArgs,
      mockCasesClient
    );

    expect(mockUserActionService.creator.createUserAction).toHaveBeenCalledWith({
      userAction: {
        type: UserActionTypes.observables,
        caseId: caseSO.id,
        owner: 'securitySolution',
        user: mockClientArgs.user,
        payload: { observables: { count: 2, actionType: 'add' } },
      },
    });
  });
});

describe('applyObservablesToCase', () => {
  beforeEach(() => {
    mockCaseService.patchCase.mockResolvedValue(caseSO);
    mockCaseService.getCase.mockResolvedValue(caseSO);
    jest.clearAllMocks();
  });

  it('returns early without hitting the database when observables is empty', async () => {
    await applyObservablesToCase(caseSO.id, [], mockClientArgs);

    expect(mockCaseService.getCase).not.toHaveBeenCalled();
    expect(mockCaseService.patchCase).not.toHaveBeenCalled();
    expect(mockUserActionService.creator.createUserAction).not.toHaveBeenCalled();
  });

  it('patches the case with the new observables', async () => {
    mockCaseService.getCase.mockResolvedValue({
      ...caseSO,
      attributes: { ...caseSO.attributes, observables: [] },
    });

    await applyObservablesToCase(caseSO.id, [mockObservablePost], mockClientArgs);

    expect(mockCaseService.patchCase).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: caseSO.id,
        updatedAttributes: expect.objectContaining({
          observables: expect.arrayContaining([
            expect.objectContaining({ value: mockObservablePost.value }),
          ]),
          total_observables: 1,
        }),
      })
    );
  });

  it('deduplicates observables — skips both patchCase and user action when all incoming observables already exist', async () => {
    mockCaseService.getCase.mockResolvedValue({
      ...caseSO,
      attributes: { ...caseSO.attributes, observables: [mockObservable] },
    });

    await applyObservablesToCase(caseSO.id, [mockObservablePost], mockClientArgs);

    // No SO write and no user action because newObservablesCount === 0
    expect(mockCaseService.patchCase).not.toHaveBeenCalled();
    expect(mockUserActionService.creator.createUserAction).not.toHaveBeenCalled();
  });

  it('creates a user action when new observables are added', async () => {
    mockCaseService.getCase.mockResolvedValue({
      ...caseSO,
      attributes: { ...caseSO.attributes, observables: [] },
    });

    await applyObservablesToCase(caseSO.id, [mockObservablePost], mockClientArgs);

    expect(mockUserActionService.creator.createUserAction).toHaveBeenCalledWith({
      userAction: expect.objectContaining({
        type: UserActionTypes.observables,
        caseId: caseSO.id,
        payload: { observables: { count: 1, actionType: 'add' } },
      }),
    });
  });

  it('caps at MAX_OBSERVABLES_PER_CASE', async () => {
    const existingObservables = Array.from({ length: MAX_OBSERVABLES_PER_CASE - 1 }, (_, i) => ({
      ...mockObservable,
      id: `obs-${i}`,
      value: `10.0.0.${i}`,
    }));

    mockCaseService.getCase.mockResolvedValue({
      ...caseSO,
      attributes: { ...caseSO.attributes, observables: existingObservables },
    });

    const extraObservables: ObservablePost[] = [
      { value: '192.168.1.1', typeKey: OBSERVABLE_TYPE_IPV4.key, description: null },
      { value: '192.168.1.2', typeKey: OBSERVABLE_TYPE_IPV4.key, description: null },
    ];

    await applyObservablesToCase(caseSO.id, extraObservables, mockClientArgs);

    expect(mockCaseService.patchCase).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedAttributes: expect.objectContaining({
          total_observables: MAX_OBSERVABLES_PER_CASE,
        }),
      })
    );
  });
});
