/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EndpointAppContextService } from '../../../endpoint/endpoint_app_context_services';
import {
  createMockEndpointAppContextService,
  createMockEndpointAppContextServiceSetupContract,
  createMockEndpointAppContextServiceStartContract,
} from '../../../endpoint/mocks';
import {
  BaseValidatorMock,
  createExceptionItemLikeOptionsMock,
  createExceptionListItemMock,
} from './mocks';
import { EndpointArtifactExceptionValidationError } from './errors';
import { httpServerMock } from '@kbn/core/server/mocks';
import type { PackagePolicy } from '@kbn/fleet-plugin/common';
import { createFleetAuthzMock, createPackagePolicyMock } from '@kbn/fleet-plugin/common/mocks';
import type { PackagePolicyClient } from '@kbn/fleet-plugin/server';
import type { ExceptionItemLikeOptions } from '../types';
import {
  BY_POLICY_ARTIFACT_TAG_PREFIX,
  GLOBAL_ARTIFACT_TAG,
} from '../../../../common/endpoint/service/artifacts';
import { securityMock } from '@kbn/security-plugin/server/mocks';
import {
  buildPerPolicyTag,
  buildSpaceOwnerIdTag,
  setArtifactOwnerSpaceId,
} from '../../../../common/endpoint/service/artifacts/utils';
import { asSpaceId, DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { getEndpointAuthzInitialStateMock } from '../../../../common/endpoint/service/authz/mocks';
import type { EndpointAuthz } from '../../../../common/endpoint/types/authz';
import type {
  ExceptionListItemSchema,
  ImportExceptionListItemSchemaDecoded,
} from '@kbn/securitysolution-io-ts-list-types';
import type { PromiseFromStreams } from '@kbn/lists-plugin/server/services/exception_lists/import_exception_list_and_items';
import { cloneDeep } from 'lodash';

describe('When using Artifacts Exceptions BaseValidator', () => {
  let endpointAppContextServices: EndpointAppContextService;
  let kibanaRequest: ReturnType<typeof httpServerMock.createKibanaRequest>;
  let exceptionLikeItem: ExceptionItemLikeOptions;
  let validator: BaseValidatorMock;
  let packagePolicyService: jest.Mocked<PackagePolicyClient>;
  let initValidator: (withNoAuth?: boolean, withBasicLicense?: boolean) => BaseValidatorMock;

  beforeEach(() => {
    kibanaRequest = httpServerMock.createKibanaRequest();
    exceptionLikeItem = createExceptionItemLikeOptionsMock();

    const servicesStart = createMockEndpointAppContextServiceStartContract();

    packagePolicyService = servicesStart.fleetStartServices
      .packagePolicyService as jest.Mocked<PackagePolicyClient>;

    endpointAppContextServices = new EndpointAppContextService();
    endpointAppContextServices.setup(createMockEndpointAppContextServiceSetupContract());
    endpointAppContextServices.start(servicesStart);

    initValidator = (withNoAuth: boolean = false, withBasicLicense = false) => {
      if (withNoAuth) {
        const fleetAuthz = createFleetAuthzMock();
        fleetAuthz.fleet.all = false;
        (servicesStart.fleetStartServices.authz.fromRequest as jest.Mock).mockResolvedValue(
          fleetAuthz
        );
        (servicesStart.security.authc.getCurrentUser as jest.Mock).mockReturnValue(
          securityMock.createMockAuthenticatedUser()
        );
      }

      if (withBasicLicense) {
        (servicesStart.licenseService.isPlatinumPlus as jest.Mock).mockResolvedValue(false);
      }

      validator = new BaseValidatorMock(endpointAppContextServices, kibanaRequest);

      return validator;
    };
  });

  afterEach(() => {
    // @ts-expect-error setting variable to undefined
    validator = undefined;
  });

  it('should use default endpoint authz (no access) when `request` is not provided', async () => {
    const baseValidator = new BaseValidatorMock(endpointAppContextServices);

    await expect(baseValidator._isAllowedToCreateArtifactsByPolicy()).resolves.toBe(false);
    await expect(baseValidator._validateCanManageEndpointArtifacts()).rejects.toBeInstanceOf(
      EndpointArtifactExceptionValidationError
    );
  });

  it('should validate is allowed to manage endpoint artifacts', async () => {
    await expect(initValidator()._validateCanManageEndpointArtifacts()).resolves.toBeUndefined();
  });

  it('should throw if not allowed to manage endpoint artifacts', async () => {
    await expect(initValidator(true)._validateCanManageEndpointArtifacts()).rejects.toBeInstanceOf(
      EndpointArtifactExceptionValidationError
    );
  });

  it('should validate basic artifact data', async () => {
    await expect(initValidator()._validateBasicData(exceptionLikeItem)).resolves.toBeUndefined();
  });

  describe('entry value character validation', () => {
    it('accepts clean values and ignores non-value-bearing entries', () => {
      exceptionLikeItem.entries = [
        {
          field: 'process.executable.caseless',
          type: 'match',
          operator: 'included',
          value: 'C:\\Program Files\\Elastic\\endpoint.exe',
        },
        { field: 'event.category', type: 'exists', operator: 'included' },
      ] as ExceptionItemLikeOptions['entries'];

      expect(() => initValidator()._validateEntryValueCharacters(exceptionLikeItem)).not.toThrow();
    });

    it('trims edge whitespace and rejects remaining control characters', () => {
      exceptionLikeItem.entries = [
        {
          field: 'process.executable.caseless',
          type: 'wildcard',
          operator: 'included',
          value: ' C:\\Elastic\\*.exe',
        },
        {
          field: 'process.Ext.code_signature',
          type: 'nested',
          entries: [
            {
              field: 'subject_name',
              type: 'match_any',
              operator: 'included',
              value: [' Elastic ', 'bad\u0085signer'],
            },
          ],
        },
      ] as ExceptionItemLikeOptions['entries'];

      expect(() => initValidator()._validateEntryValueCharacters(exceptionLikeItem)).toThrow(
        /control characters in fields: subject_name/
      );
      expect(exceptionLikeItem.entries[0]).toEqual(
        expect.objectContaining({ value: 'C:\\Elastic\\*.exe' })
      );
      expect(
        (exceptionLikeItem.entries[1] as { entries: Array<{ value: string[] }> }).entries[0].value
      ).toEqual(['Elastic', 'bad\u0085signer']);
    });

    it('accepts a value after trimming edge whitespace', () => {
      exceptionLikeItem.entries = [
        {
          field: 'process.executable.caseless',
          type: 'match',
          operator: 'included',
          value: ' C:\\Program Files\\Elastic\\endpoint.exe ',
        },
      ] as ExceptionItemLikeOptions['entries'];

      expect(() => initValidator()._validateEntryValueCharacters(exceptionLikeItem)).not.toThrow();
      expect(exceptionLikeItem.entries[0]).toEqual(
        expect.objectContaining({ value: 'C:\\Program Files\\Elastic\\endpoint.exe' })
      );
    });

    it('does not echo a rejected value', () => {
      const rejectedValue = 'private-value\u0000';
      exceptionLikeItem.entries = [
        {
          field: 'user.name',
          type: 'match',
          operator: 'included',
          value: rejectedValue,
        },
      ] as ExceptionItemLikeOptions['entries'];

      expect(() => initValidator()._validateEntryValueCharacters(exceptionLikeItem)).toThrow(
        expect.not.stringContaining(rejectedValue)
      );
    });
  });

  it.each([
    [
      'name is empty',
      () => {
        exceptionLikeItem.name = '';
      },
    ],
    [
      'namespace is not agnostic',
      () => {
        exceptionLikeItem.namespaceType = 'single';
      },
    ],
    [
      'osTypes has more than 1 value',
      () => {
        exceptionLikeItem.osTypes = ['macos', 'linux'];
      },
    ],
    [
      'osType has invalid value',
      () => {
        exceptionLikeItem.osTypes = ['xunil' as 'linux'];
      },
    ],
  ])('should throw if %s', async (_, setupData) => {
    setupData();

    await expect(initValidator()._validateBasicData(exceptionLikeItem)).rejects.toBeInstanceOf(
      EndpointArtifactExceptionValidationError
    );
  });

  it('should validate is allowed to create artifacts by policy', async () => {
    await expect(
      initValidator()._validateCanCreateByPolicyArtifacts(exceptionLikeItem)
    ).resolves.toBeUndefined();
  });

  it('should throw if not allowed to create artifacts by policy', async () => {
    await expect(
      initValidator(false, true)._validateCanCreateByPolicyArtifacts(exceptionLikeItem)
    ).rejects.toBeInstanceOf(EndpointArtifactExceptionValidationError);
  });

  it('should validate policy ids for by policy artifacts', async () => {
    const getActiveSpaceMock = jest.spyOn(endpointAppContextServices, 'getActiveSpace');
    getActiveSpaceMock.mockResolvedValue({
      id: asSpaceId('default'),
      name: 'default',
      disabledFeatures: [],
    });
    packagePolicyService.getByIDs.mockResolvedValue([
      {
        id: '123',
        version: '123',
      } as PackagePolicy,
    ]);

    await expect(initValidator()._validateByPolicyItem(exceptionLikeItem)).resolves.toBeUndefined();
  });

  it('should throw if policy ids for by policy artifacts are not valid', async () => {
    const getActiveSpaceMock = jest.spyOn(endpointAppContextServices, 'getActiveSpace');
    getActiveSpaceMock.mockResolvedValue({
      id: asSpaceId('default'),
      name: 'default',
      disabledFeatures: [],
    });
    packagePolicyService.getByIDs.mockResolvedValue([]);

    await expect(initValidator()._validateByPolicyItem(exceptionLikeItem)).rejects.toBeInstanceOf(
      EndpointArtifactExceptionValidationError
    );
  });

  it.each([
    ['no policies (unassigned)', () => createExceptionItemLikeOptionsMock({ tags: [] })],
    [
      'different policy',
      () => createExceptionItemLikeOptionsMock({ tags: [`${BY_POLICY_ARTIFACT_TAG_PREFIX}:456`] }),
    ],
    [
      'additional policies',
      () =>
        createExceptionItemLikeOptionsMock({
          tags: [`${BY_POLICY_ARTIFACT_TAG_PREFIX}:123`, `${BY_POLICY_ARTIFACT_TAG_PREFIX}:456`],
        }),
    ],
  ])(
    'should return `true` when `wasByPolicyEffectScopeChanged()` is called with: %s',
    (_, getUpdated) => {
      expect(initValidator()._wasByPolicyEffectScopeChanged(getUpdated(), exceptionLikeItem)).toBe(
        true
      );
    }
  );

  it.each([
    ['identical data', () => createExceptionItemLikeOptionsMock()],
    [
      'scope changed to all',
      () => createExceptionItemLikeOptionsMock({ tags: [GLOBAL_ARTIFACT_TAG] }),
    ],
  ])('should return `false` when `wasByPolicyEffectScopeChanged()` with: %s', (_, getUpdated) => {
    expect(initValidator()._wasByPolicyEffectScopeChanged(getUpdated(), exceptionLikeItem)).toBe(
      false
    );
  });

  describe('with space awareness', () => {
    const noAuthzToManageOwnerSpaceIdError =
      'EndpointArtifactError: Endpoint authorization failure. Management of "ownerSpaceId" tag requires global artifact management privilege';
    const noAuthzToManageGlobalArtifactsError =
      'EndpointArtifactError: Endpoint authorization failure. Management of global artifacts requires additional privilege (global artifact management)';
    const itemCanNotBeManagedInActiveSpaceErrorMessage =
      'EndpointArtifactError: Updates to this shared item can only be done from the following space ID: foo (or by someone having global artifact management privilege)';
    let authzMock: EndpointAuthz;

    beforeEach(() => {
      authzMock = getEndpointAuthzInitialStateMock();
      endpointAppContextServices = createMockEndpointAppContextService();
      (endpointAppContextServices.getEndpointAuthz as jest.Mock).mockResolvedValue(authzMock);
      setArtifactOwnerSpaceId(exceptionLikeItem, DEFAULT_SPACE_ID);
      validator = new BaseValidatorMock(endpointAppContextServices, kibanaRequest);
      packagePolicyService = endpointAppContextServices.getInternalFleetServices()
        .packagePolicy as jest.Mocked<PackagePolicyClient>;
      packagePolicyService.listIds.mockResolvedValue({
        items: ['policy-1', 'policy-2'],
        total: 2,
        page: 1,
        perPage: 20,
      });
      packagePolicyService.getByIDs.mockResolvedValue([
        Object.assign(createPackagePolicyMock(), { id: 'policy-1' }),
        Object.assign(createPackagePolicyMock(), { id: 'policy-2' }),
      ]);
    });

    describe('#validateByPolicyItem()', () => {
      let currentItem: ExceptionListItemSchema;

      beforeEach(() => {
        currentItem = createExceptionListItemMock({
          tags: exceptionLikeItem.tags,
        });
      });

      it('should not error if policy is not returned by fleet for active space, but it is already associated with item', async () => {
        packagePolicyService.getByIDs.mockResolvedValue([]);

        await expect(
          initValidator()._validateByPolicyItem(exceptionLikeItem, currentItem)
        ).resolves.toBeUndefined();
      });
    });

    describe('#validateCreateOnwerSpaceIds()', () => {
      it('should error if adding an spaceOwnerId but has no global artifact management authz', async () => {
        setArtifactOwnerSpaceId(exceptionLikeItem, 'foo');
        authzMock.canManageGlobalArtifacts = false;

        await expect(validator._validateCreateOwnerSpaceIds(exceptionLikeItem)).rejects.toThrow(
          noAuthzToManageOwnerSpaceIdError
        );
      });

      it('should allow spaceOwnerId tag matching current space even if no global artifact management authz', async () => {
        authzMock.canManageGlobalArtifacts = false;

        await expect(
          validator._validateCreateOwnerSpaceIds(exceptionLikeItem)
        ).resolves.toBeUndefined();
      });

      it('should allow additional spaceOwnerId tags if user has global artifact management authz', async () => {
        setArtifactOwnerSpaceId(exceptionLikeItem, 'foo');

        await expect(
          validator._validateCreateOwnerSpaceIds(exceptionLikeItem)
        ).resolves.toBeUndefined();
      });
    });

    describe('#validateUpdateOnwerSpaceIds()', () => {
      let savedExceptionLikeItem: ExceptionItemLikeOptions;

      beforeEach(() => {
        savedExceptionLikeItem = createExceptionItemLikeOptionsMock();
        setArtifactOwnerSpaceId(exceptionLikeItem, DEFAULT_SPACE_ID);
      });

      it('should error if changing spaceOwnerId but has no global artifact management authz', async () => {
        authzMock.canManageGlobalArtifacts = false;
        setArtifactOwnerSpaceId(exceptionLikeItem, 'foo');

        await expect(
          validator._validateUpdateOwnerSpaceIds(exceptionLikeItem, savedExceptionLikeItem)
        ).rejects.toThrow(noAuthzToManageOwnerSpaceIdError);
      });

      it('should allow changes to spaceOwnerId tags if user has global artifact management authz', async () => {
        setArtifactOwnerSpaceId(exceptionLikeItem, 'foo');

        await expect(
          validator._validateUpdateOwnerSpaceIds(exceptionLikeItem, savedExceptionLikeItem)
        ).resolves.toBeUndefined();
      });
    });

    describe('#validateCanCreateGlobalArtifacts()', () => {
      beforeEach(() => {
        exceptionLikeItem.tags = [GLOBAL_ARTIFACT_TAG];
      });

      it('should error is user does not have new global artifact management privilege', async () => {
        authzMock.canManageGlobalArtifacts = false;

        await expect(
          validator._validateCanCreateGlobalArtifacts(exceptionLikeItem)
        ).rejects.toThrow(noAuthzToManageGlobalArtifactsError);
      });

      it('should allow creation of global artifacts when user has privilege', async () => {
        await expect(
          validator._validateCanCreateGlobalArtifacts(exceptionLikeItem)
        ).resolves.toBeUndefined();
      });
    });

    describe('#validateCanUpdateItemInActiveSpace()', () => {
      let savedExceptionItem: ExceptionListItemSchema;

      beforeEach(() => {
        savedExceptionItem = createExceptionListItemMock({
          // Saved item is owned by different space id
          tags: [buildPerPolicyTag('123'), buildSpaceOwnerIdTag('foo')],
        });
      });

      it('should error if updating a global item when user does not have global artifact privilege', async () => {
        authzMock.canManageGlobalArtifacts = false;
        savedExceptionItem.tags = [GLOBAL_ARTIFACT_TAG, buildSpaceOwnerIdTag('foo')];

        await expect(
          validator._validateCanUpdateItemInActiveSpace(exceptionLikeItem, savedExceptionItem)
        ).rejects.toThrow(noAuthzToManageGlobalArtifactsError);
      });

      it('should error if updating an item outside of its owner space id when user does not have global artifact privilege', async () => {
        authzMock.canManageGlobalArtifacts = false;

        await expect(
          validator._validateCanUpdateItemInActiveSpace(exceptionLikeItem, savedExceptionItem)
        ).rejects.toThrow(itemCanNotBeManagedInActiveSpaceErrorMessage);
      });

      it('should allow updates to global items when user has global artifact privilege', async () => {
        savedExceptionItem.tags = [GLOBAL_ARTIFACT_TAG, buildSpaceOwnerIdTag('foo')];

        await expect(
          validator._validateCanUpdateItemInActiveSpace(exceptionLikeItem, savedExceptionItem)
        ).resolves.toBeUndefined();
      });

      it('should allow update to item outside of owner space id when user has global artifact privilege', async () => {
        await expect(
          validator._validateCanUpdateItemInActiveSpace(exceptionLikeItem, savedExceptionItem)
        ).resolves.toBeUndefined();
      });

      it('should allow update to item inside of owner space id when user has no global artifact privilege', async () => {
        authzMock.canManageGlobalArtifacts = false;
        savedExceptionItem.tags = [buildPerPolicyTag('123'), buildSpaceOwnerIdTag('default')];

        await expect(
          validator._validateCanUpdateItemInActiveSpace(exceptionLikeItem, savedExceptionItem)
        ).resolves.toBeUndefined();
      });
    });

    describe('#validateCanDeleteItemInActiveSpace()', () => {
      let savedExceptionItem: ExceptionListItemSchema;

      beforeEach(() => {
        savedExceptionItem = createExceptionListItemMock({
          // Saved item is owned by different space id
          tags: [buildPerPolicyTag('123'), buildSpaceOwnerIdTag('foo')],
        });
      });

      it('should error if deleting a global artifact when user does not have global artifact privilege', async () => {
        authzMock.canManageGlobalArtifacts = false;
        savedExceptionItem.tags = [GLOBAL_ARTIFACT_TAG, buildSpaceOwnerIdTag('foo')];

        await expect(
          validator._validateCanDeleteItemInActiveSpace(savedExceptionItem)
        ).rejects.toThrow(noAuthzToManageGlobalArtifactsError);
      });

      it('should error if deleting item outside of its owner space id when user does not have global artifact privilege', async () => {
        authzMock.canManageGlobalArtifacts = false;

        await expect(
          validator._validateCanDeleteItemInActiveSpace(savedExceptionItem)
        ).rejects.toThrow(itemCanNotBeManagedInActiveSpaceErrorMessage);
      });

      it('should allow delete of global item when user has global artifact privilege', async () => {
        savedExceptionItem.tags = [GLOBAL_ARTIFACT_TAG, buildSpaceOwnerIdTag('foo')];

        await expect(
          validator._validateCanDeleteItemInActiveSpace(savedExceptionItem)
        ).resolves.toBeUndefined();
      });

      it('should allow deleting item from outside of its owner space id when user has global artifact privilege', async () => {
        await expect(
          validator._validateCanDeleteItemInActiveSpace(savedExceptionItem)
        ).resolves.toBeUndefined();
      });

      it('should allow deleting of item inside from owner space id when user has no global artifact privilege', async () => {
        authzMock.canManageGlobalArtifacts = false;
        savedExceptionItem.tags = [buildPerPolicyTag('123'), buildSpaceOwnerIdTag('default')];

        await expect(
          validator._validateCanDeleteItemInActiveSpace(savedExceptionItem)
        ).resolves.toBeUndefined();
      });
    });

    describe('#validateCanReadItemInActiveSpace()', () => {
      const itemNotFoundInSpaceErrorMessage =
        'EndpointArtifactError: Item not found in space [default]';
      let savedExceptionItem: ExceptionListItemSchema;

      beforeEach(async () => {
        authzMock.canManageGlobalArtifacts = false;
        savedExceptionItem = createExceptionListItemMock({
          // Saved item is owned by different space id
          tags: [
            buildPerPolicyTag('some-other-policy'),
            buildPerPolicyTag('policy-1'),
            buildSpaceOwnerIdTag('foo'),
          ],
        });
      });

      it('should allow read if item is global', async () => {
        savedExceptionItem.tags = [GLOBAL_ARTIFACT_TAG, buildSpaceOwnerIdTag('foo')];

        await expect(
          validator._validateCanReadItemInActiveSpace(savedExceptionItem)
        ).resolves.toBeUndefined();
      });

      it('should allow read if user has global artifact privilege', async () => {
        authzMock.canManageGlobalArtifacts = true;
        savedExceptionItem.tags = [
          buildPerPolicyTag('policy-999-not-visible-in-space'),
          buildSpaceOwnerIdTag('foo'),
        ];

        await expect(
          validator._validateCanReadItemInActiveSpace(savedExceptionItem)
        ).resolves.toBeUndefined();
      });

      it('should allow read if item is per-policy with no policies assigned and space owner matches active space', async () => {
        savedExceptionItem.tags = [buildSpaceOwnerIdTag('default')];

        await expect(
          validator._validateCanReadItemInActiveSpace(savedExceptionItem)
        ).resolves.toBeUndefined();
      });

      it('should error if item is per-policy with no policies assigned but space owner is NOT the active space', async () => {
        savedExceptionItem.tags = [buildSpaceOwnerIdTag('foo')];

        await expect(
          validator._validateCanReadItemInActiveSpace(savedExceptionItem)
        ).rejects.toThrow(itemNotFoundInSpaceErrorMessage);
      });

      it('should allow read if per-policy item has at least one policy that is visible in active space', async () => {
        await expect(
          validator._validateCanReadItemInActiveSpace(savedExceptionItem)
        ).resolves.toBeUndefined();
      });

      it('should error if per-policy item does not have at least 1 policy id that is visible in active space', async () => {
        savedExceptionItem.tags = [
          buildPerPolicyTag('some-other-policy'),
          buildSpaceOwnerIdTag('default'),
        ];

        await expect(
          validator._validateCanReadItemInActiveSpace(savedExceptionItem)
        ).rejects.toThrow(itemNotFoundInSpaceErrorMessage);
      });
    });

    describe('#validatePreImportItems', () => {
      const item1Mock = (): PromiseFromStreams['items'][number] => ({
        item_id: 'itemId1',
        name: 'name 1',
        description: 'description 1',
        entries: [],
        os_types: ['macos'],
        tags: ['tag1', 'tag2'],
        namespace_type: 'agnostic',
        list_id: 'list id 1',
        type: 'simple',
        comments: [],
        expire_time: 'sometime',
      });

      const item2Mock = (): PromiseFromStreams['items'][number] => ({
        item_id: 'itemId2',
        name: 'name 2',
        description: 'description 2',
        entries: [],
        os_types: ['linux'],
        tags: ['tag3'],
        namespace_type: 'agnostic',
        list_id: 'list id 2',
        type: 'simple',
        comments: [],
        expire_time: 'another time',
      });

      it('should call validator callback on all items with the item type converted to exception item', async () => {
        const validateFn = jest.fn().mockResolvedValue(undefined);
        const importItems: PromiseFromStreams = {
          items: [item1Mock(), item2Mock()],
          lists: [],
        };
        const expectedItems: PromiseFromStreams = {
          items: [item1Mock(), item2Mock()],
          lists: [],
        };

        await expect(
          validator._validatePreImportItems(importItems, validateFn)
        ).resolves.toBeUndefined();

        expect(validateFn).toHaveBeenCalledTimes(2);
        expect(validateFn).toHaveBeenNthCalledWith(1, {
          name: 'name 1',
          description: 'description 1',
          entries: [],
          osTypes: ['macos'],
          tags: ['tag1', 'tag2'],
          namespaceType: 'agnostic',
          listId: 'list id 1',
          comments: [],
        });
        expect(validateFn).toHaveBeenNthCalledWith(2, {
          name: 'name 2',
          description: 'description 2',
          entries: [],
          osTypes: ['linux'],
          tags: ['tag3'],
          namespaceType: 'agnostic',
          listId: 'list id 2',
          comments: [],
        });

        expect(importItems).toEqual(expectedItems);
      });

      it('should modify data in place', async () => {
        const validateFn = jest.fn().mockImplementation(async (item: ExceptionItemLikeOptions) => {
          item.name = `modified ${item.name}`;
          item.tags = [...item.tags, 'cheese'];
        });

        const importItems: PromiseFromStreams = {
          items: [item1Mock(), item2Mock()],
          lists: [],
        };
        const expectedItems: PromiseFromStreams = {
          items: [
            {
              ...item1Mock(),
              name: 'modified name 1',
              tags: [...(item1Mock() as ImportExceptionListItemSchemaDecoded).tags, 'cheese'],
            },
            {
              ...item2Mock(),
              name: 'modified name 2',
              tags: [...(item2Mock() as ImportExceptionListItemSchemaDecoded).tags, 'cheese'],
            },
          ],
          lists: [],
        };

        await expect(
          validator._validatePreImportItems(importItems, validateFn)
        ).resolves.toBeUndefined();

        expect(validateFn).toHaveBeenCalledTimes(2);
        expect(importItems).toEqual(expectedItems);
      });

      it('should put errors in items array when validator throws', async () => {
        const validateFn = jest.fn().mockImplementation(async (item: ExceptionItemLikeOptions) => {
          if (item.name === 'name 2') {
            throw new Error('houston, we have a problem');
          }
        });

        const importItems: PromiseFromStreams = {
          items: [item1Mock(), item2Mock()],
          lists: [],
        };
        const expectedItems: PromiseFromStreams = {
          items: [item1Mock(), new Error('houston, we have a problem')],
          lists: [],
        };

        await expect(
          validator._validatePreImportItems(importItems, validateFn)
        ).resolves.toBeUndefined();

        expect(validateFn).toHaveBeenCalledTimes(2);
        expect(importItems).toEqual(expectedItems);
      });

      it('should pass through decode errors', async () => {
        const importItems: PromiseFromStreams = {
          items: [item1Mock(), new Error('decode error')],
          lists: [],
        };

        const expectedItems = cloneDeep(importItems);

        const validateFn = jest.fn();

        await expect(
          validator._validatePreImportItems(importItems, validateFn)
        ).resolves.toBeUndefined();

        expect(validateFn).toHaveBeenCalledTimes(1);
        expect(importItems).toEqual(expectedItems);
      });
    });

    describe('#validateCanImportGlobalArtifacts()', () => {
      beforeEach(() => {
        exceptionLikeItem.tags = [GLOBAL_ARTIFACT_TAG];
      });

      it('should error is user does not have new global artifact management privilege', async () => {
        authzMock.canManageGlobalArtifacts = false;

        await expect(
          validator._validateCanImportGlobalArtifacts(exceptionLikeItem)
        ).rejects.toThrow(
          /This artifact can't be imported because you don't have permission to manage global artifacts./
        );
      });

      it('should allow import of global artifacts when user has privilege', async () => {
        await expect(
          validator._validateCanImportGlobalArtifacts(exceptionLikeItem)
        ).resolves.toBeUndefined();
      });
    });

    describe('#validateImportOwnerSpaceIds()', () => {
      it('should do nothing when item has no tags', async () => {
        exceptionLikeItem.tags = [];

        await expect(
          validator._validateImportOwnerSpaceIds(exceptionLikeItem)
        ).resolves.toBeUndefined();
      });

      describe('when the user has global artifact management privilege', () => {
        it('should allow import when spaces are accessible and artifact is visible in current space', async () => {
          setArtifactOwnerSpaceId(exceptionLikeItem, DEFAULT_SPACE_ID);

          await expect(
            validator._validateImportOwnerSpaceIds(exceptionLikeItem)
          ).resolves.toBeUndefined();
        });

        it('should error when owner space is not accessible', async () => {
          setArtifactOwnerSpaceId(exceptionLikeItem, 'inaccessible-space');

          await expect(validator._validateImportOwnerSpaceIds(exceptionLikeItem)).rejects.toThrow(
            /This artifact can\'t be imported because it belongs to a space you don\'t have access to/
          );
        });

        it('should error when artifact is not visible in current space', async () => {
          // Artifact owned by another space with no policies assigned (not visible)
          exceptionLikeItem.tags = [buildSpaceOwnerIdTag('other-space')];
          (endpointAppContextServices.getAccessibleSpaces as jest.Mock).mockResolvedValue([
            { id: DEFAULT_SPACE_ID, name: 'default', disabledFeatures: [] },
            { id: 'other-space', name: 'other', disabledFeatures: [] },
          ]);

          await expect(validator._validateImportOwnerSpaceIds(exceptionLikeItem)).rejects.toThrow(
            /This artifact can't be imported because it isn't visible in the current space/
          );
        });
      });

      describe('when the user does NOT have global artifact management privilege', () => {
        it('should allow import when ownerSpaceId matches active space', async () => {
          authzMock.canManageGlobalArtifacts = false;
          setArtifactOwnerSpaceId(exceptionLikeItem, DEFAULT_SPACE_ID);

          await expect(
            validator._validateImportOwnerSpaceIds(exceptionLikeItem)
          ).resolves.toBeUndefined();
        });

        it('should error when ownerSpaceId does not match active space', async () => {
          authzMock.canManageGlobalArtifacts = false;
          setArtifactOwnerSpaceId(exceptionLikeItem, 'other-space');

          await expect(validator._validateImportOwnerSpaceIds(exceptionLikeItem)).rejects.toThrow(
            /This artifact can't be imported because you don't have permission to manage artifacts in other spaces/
          );
        });

        it("should error when there's an additional owner space ID", async () => {
          authzMock.canManageGlobalArtifacts = false;
          setArtifactOwnerSpaceId(exceptionLikeItem, DEFAULT_SPACE_ID);
          setArtifactOwnerSpaceId(exceptionLikeItem, 'other-space');

          await expect(validator._validateImportOwnerSpaceIds(exceptionLikeItem)).rejects.toThrow(
            /This artifact can't be imported because you don't have permission to manage artifacts in other spaces/
          );
        });
      });
    });

    describe('#isArtifactVisibleInCurrentSpace()', () => {
      it('should return true when ownerSpaceIds includes the active space', async () => {
        await expect(
          validator._isArtifactVisibleInCurrentSpace(
            [DEFAULT_SPACE_ID, 'other-space'],
            DEFAULT_SPACE_ID,
            exceptionLikeItem
          )
        ).resolves.toBe(true);
      });

      it('should return true when item is a global artifact', async () => {
        exceptionLikeItem.tags = [GLOBAL_ARTIFACT_TAG];

        await expect(
          validator._isArtifactVisibleInCurrentSpace(
            ['other-space'],
            DEFAULT_SPACE_ID,
            exceptionLikeItem
          )
        ).resolves.toBe(true);
      });

      it('should return true when at least one assigned policy is visible in the current space', async () => {
        exceptionLikeItem.tags = [
          buildPerPolicyTag('policy-1'),
          buildSpaceOwnerIdTag('other-space'),
        ];

        await expect(
          validator._isArtifactVisibleInCurrentSpace(
            ['other-space'],
            DEFAULT_SPACE_ID,
            exceptionLikeItem
          )
        ).resolves.toBe(true);
      });

      it('should return false when item has no assigned policies and owner is a different space', async () => {
        exceptionLikeItem.tags = [buildSpaceOwnerIdTag('other-space')];

        await expect(
          validator._isArtifactVisibleInCurrentSpace(
            ['other-space'],
            DEFAULT_SPACE_ID,
            exceptionLikeItem
          )
        ).resolves.toBe(false);
      });

      it('should return false when no assigned policies are visible in the current space', async () => {
        exceptionLikeItem.tags = [
          buildPerPolicyTag('invisible-policy'),
          buildSpaceOwnerIdTag('other-space'),
        ];
        packagePolicyService.getByIDs.mockResolvedValue([]);

        await expect(
          validator._isArtifactVisibleInCurrentSpace(
            ['other-space'],
            DEFAULT_SPACE_ID,
            exceptionLikeItem
          )
        ).resolves.toBe(false);
      });
    });

    describe('#removeInvalidPolicyIds()', () => {
      it('should do nothing when item is not by-policy', async () => {
        exceptionLikeItem.tags = [GLOBAL_ARTIFACT_TAG];
        const originalTags = [...exceptionLikeItem.tags];

        await validator._removeInvalidPolicyIds(exceptionLikeItem);

        expect(exceptionLikeItem.tags).toEqual(originalTags);
      });

      it('should do nothing when item has no policy IDs', async () => {
        exceptionLikeItem.tags = [buildPerPolicyTag('some-id')];
        // Clear the per-policy tags but keep it "by policy" by having the prefix
        exceptionLikeItem.tags = [`${BY_POLICY_ARTIFACT_TAG_PREFIX}`];

        await validator._removeInvalidPolicyIds(exceptionLikeItem);
      });

      it('should not modify tags when all policy IDs are valid', async () => {
        exceptionLikeItem.tags = [buildPerPolicyTag('policy-1'), buildPerPolicyTag('policy-2')];

        await validator._removeInvalidPolicyIds(exceptionLikeItem);

        expect(exceptionLikeItem.tags).toEqual([
          buildPerPolicyTag('policy-1'),
          buildPerPolicyTag('policy-2'),
        ]);
      });

      it('should remove invalid policy ID tags and add a comment', async () => {
        exceptionLikeItem.tags = [
          buildPerPolicyTag('policy-1'),
          buildPerPolicyTag('invalid-policy'),
        ];
        exceptionLikeItem.comments = [];

        await validator._removeInvalidPolicyIds(exceptionLikeItem);

        expect(exceptionLikeItem.tags).toEqual([buildPerPolicyTag('policy-1')]);
        expect(exceptionLikeItem.comments).toHaveLength(1);
        expect(exceptionLikeItem.comments[0]).toEqual({
          comment: expect.stringContaining('invalid-policy'),
        });
      });

      it('should remove all invalid policy ID tags when multiple are invalid', async () => {
        exceptionLikeItem.tags = [
          buildPerPolicyTag('policy-1'),
          buildPerPolicyTag('bad-1'),
          buildPerPolicyTag('bad-2'),
        ];
        exceptionLikeItem.comments = [];

        await validator._removeInvalidPolicyIds(exceptionLikeItem);

        expect(exceptionLikeItem.tags).toEqual([buildPerPolicyTag('policy-1')]);
        expect(exceptionLikeItem.comments).toHaveLength(1);
        expect(exceptionLikeItem.comments[0]).toEqual({
          comment: expect.stringContaining('bad-1'),
        });
        expect(exceptionLikeItem.comments[0]).toEqual({
          comment: expect.stringContaining('bad-2'),
        });
      });
    });
  });
});
