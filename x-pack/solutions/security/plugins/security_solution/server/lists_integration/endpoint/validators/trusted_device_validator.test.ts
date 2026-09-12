/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core-http-server-mocks';
import type {
  CreateExceptionListItemOptions,
  UpdateExceptionListItemOptions,
} from '@kbn/lists-plugin/server';
import { ENDPOINT_ARTIFACT_LISTS } from '@kbn/securitysolution-list-constants';
import { createMockEndpointAppContextService } from '../../../endpoint/mocks';
import { TrustedDeviceValidator } from './trusted_device_validator';
import { ExceptionsListItemGenerator } from '../../../../common/endpoint/data_generators/exceptions_list_item_generator';
import { GLOBAL_ARTIFACT_TAG } from '../../../../common/endpoint/service/artifacts/constants';
import { EndpointArtifactExceptionValidationError } from './errors';

describe('Endpoint Trusted Device API validations', () => {
  let mockEndpointAppContextService: ReturnType<typeof createMockEndpointAppContextService>;
  let trustedDeviceValidator: TrustedDeviceValidator;
  let exceptionsGenerator: ExceptionsListItemGenerator;

  beforeEach(() => {
    mockEndpointAppContextService = createMockEndpointAppContextService();
    trustedDeviceValidator = new TrustedDeviceValidator(
      mockEndpointAppContextService,
      httpServerMock.createKibanaRequest()
    );
    exceptionsGenerator = new ExceptionsListItemGenerator();
  });

  describe('Feature flag validation', () => {
    describe('when trusted devices feature is disabled', () => {
      beforeEach(() => {
        (
          mockEndpointAppContextService.experimentalFeatures as unknown as {
            trustedDevices: boolean;
          }
        ).trustedDevices = false;
      });

      it('should throw error on validatePreCreateItem', async () => {
        const item = exceptionsGenerator.generateTrustedDeviceForCreate();

        await expect(
          trustedDeviceValidator.validatePreCreateItem(
            item as unknown as CreateExceptionListItemOptions
          )
        ).rejects.toThrow(EndpointArtifactExceptionValidationError);
        await expect(
          trustedDeviceValidator.validatePreCreateItem(
            item as unknown as CreateExceptionListItemOptions
          )
        ).rejects.toThrow('Trusted devices feature is not enabled');
      });

      it('should throw error on validatePreUpdateItem', async () => {
        const currentItem = exceptionsGenerator.generateTrustedDevice();
        const updatedItem = exceptionsGenerator.generateTrustedDeviceForUpdate();

        await expect(
          trustedDeviceValidator.validatePreUpdateItem(
            updatedItem as unknown as UpdateExceptionListItemOptions,
            currentItem
          )
        ).rejects.toThrow(EndpointArtifactExceptionValidationError);
        await expect(
          trustedDeviceValidator.validatePreUpdateItem(
            updatedItem as unknown as UpdateExceptionListItemOptions,
            currentItem
          )
        ).rejects.toThrow('Trusted devices feature is not enabled');
      });

      it('should throw error on validatePreDeleteItem', async () => {
        const item = exceptionsGenerator.generateTrustedDevice();

        await expect(trustedDeviceValidator.validatePreDeleteItem(item)).rejects.toThrow(
          EndpointArtifactExceptionValidationError
        );
        await expect(trustedDeviceValidator.validatePreDeleteItem(item)).rejects.toThrow(
          'Trusted devices feature is not enabled'
        );
      });

      it('should throw error on validatePreGetOneItem', async () => {
        const item = exceptionsGenerator.generateTrustedDevice();

        await expect(trustedDeviceValidator.validatePreGetOneItem(item)).rejects.toThrow(
          EndpointArtifactExceptionValidationError
        );
        await expect(trustedDeviceValidator.validatePreGetOneItem(item)).rejects.toThrow(
          'Trusted devices feature is not enabled'
        );
      });

      it('should throw error on validatePreMultiListFind', async () => {
        await expect(trustedDeviceValidator.validatePreMultiListFind()).rejects.toThrow(
          EndpointArtifactExceptionValidationError
        );
        await expect(trustedDeviceValidator.validatePreMultiListFind()).rejects.toThrow(
          'Trusted devices feature is not enabled'
        );
      });

      it('should throw error on validatePreSingleListFind', async () => {
        await expect(trustedDeviceValidator.validatePreSingleListFind()).rejects.toThrow(
          EndpointArtifactExceptionValidationError
        );
        await expect(trustedDeviceValidator.validatePreSingleListFind()).rejects.toThrow(
          'Trusted devices feature is not enabled'
        );
      });

      it('should throw error on validatePreExport', async () => {
        await expect(trustedDeviceValidator.validatePreExport()).rejects.toThrow(
          EndpointArtifactExceptionValidationError
        );
        await expect(trustedDeviceValidator.validatePreExport()).rejects.toThrow(
          'Trusted devices feature is not enabled'
        );
      });

      it('should throw error on validatePreGetListSummary', async () => {
        await expect(trustedDeviceValidator.validatePreGetListSummary()).rejects.toThrow(
          EndpointArtifactExceptionValidationError
        );
        await expect(trustedDeviceValidator.validatePreGetListSummary()).rejects.toThrow(
          'Trusted devices feature is not enabled'
        );
      });
    });

    describe('when trusted devices feature is enabled', () => {
      beforeEach(() => {
        // Cast to overcome readonly property limitation in tests
        (
          mockEndpointAppContextService.experimentalFeatures as unknown as {
            trustedDevices: boolean;
          }
        ).trustedDevices = true;
      });

      it('should not throw feature flag error on validatePreMultiListFind', async () => {
        // This should pass the feature flag check (may fail on other validations like permissions)
        try {
          await trustedDeviceValidator.validatePreMultiListFind();
        } catch (error) {
          // If it throws, it should not be the feature flag error
          expect(error.message).not.toContain('Trusted devices feature is not enabled');
        }
      });

      it('should not throw feature flag error on validatePreSingleListFind', async () => {
        // This should pass the feature flag check (may fail on other validations like permissions)
        try {
          await trustedDeviceValidator.validatePreSingleListFind();
        } catch (error) {
          // If it throws, it should not be the feature flag error
          expect(error.message).not.toContain('Trusted devices feature is not enabled');
        }
      });

      it('should not throw feature flag error on validatePreExport', async () => {
        // This should pass the feature flag check (may fail on other validations like permissions)
        try {
          await trustedDeviceValidator.validatePreExport();
        } catch (error) {
          // If it throws, it should not be the feature flag error
          expect(error.message).not.toContain('Trusted devices feature is not enabled');
        }
      });

      it('should not throw feature flag error on validatePreGetListSummary', async () => {
        // This should pass the feature flag check (may fail on other validations like permissions)
        try {
          await trustedDeviceValidator.validatePreGetListSummary();
        } catch (error) {
          // If it throws, it should not be the feature flag error
          expect(error.message).not.toContain('Trusted devices feature is not enabled');
        }
      });
    });
  });

  describe('entry value length bounds', () => {
    beforeEach(() => {
      (
        mockEndpointAppContextService.experimentalFeatures as unknown as {
          trustedDevices: boolean;
        }
      ).trustedDevices = true;
    });

    const buildItem = (value: string | string[]): CreateExceptionListItemOptions =>
      ({
        listId: ENDPOINT_ARTIFACT_LISTS.trustedDevices.id,
        name: 'Test trusted device',
        description: '',
        namespaceType: 'agnostic',
        osTypes: ['windows'],
        tags: [GLOBAL_ARTIFACT_TAG],
        entries: [{ field: 'host.name', type: 'match', operator: 'included', value }],
      } as unknown as CreateExceptionListItemOptions);

    it('accepts a scalar value at the 4096 character limit', async () => {
      await expect(
        trustedDeviceValidator.validatePreCreateItem(buildItem('a'.repeat(4096)))
      ).resolves.toBeDefined();
    });

    it('accepts an array value within the 4096 character limit', async () => {
      await expect(
        trustedDeviceValidator.validatePreCreateItem(buildItem(['host-a', 'host-b']))
      ).resolves.toBeDefined();
    });

    it('accepts an array value element at the 4096 character limit', async () => {
      await expect(
        trustedDeviceValidator.validatePreCreateItem(buildItem(['a'.repeat(4096)]))
      ).resolves.toBeDefined();
    });

    it('rejects a string value over the 4096 character limit', async () => {
      await expect(
        trustedDeviceValidator.validatePreCreateItem(buildItem('a'.repeat(4097)))
      ).rejects.toThrow(EndpointArtifactExceptionValidationError);
      await expect(
        trustedDeviceValidator.validatePreCreateItem(buildItem('a'.repeat(4097)))
      ).rejects.toThrow(/maximum length of \[4096\]/);
    });

    it('rejects an array value element over the 4096 character limit', async () => {
      await expect(
        trustedDeviceValidator.validatePreCreateItem(buildItem(['a'.repeat(4097)]))
      ).rejects.toThrow(EndpointArtifactExceptionValidationError);
      await expect(
        trustedDeviceValidator.validatePreCreateItem(buildItem(['a'.repeat(4097)]))
      ).rejects.toThrow(/maximum length of \[4096\]/);
    });

    it('trims edge whitespace on create', async () => {
      const item = buildItem(' DESKTOP-1 ');

      await expect(trustedDeviceValidator.validatePreCreateItem(item)).resolves.toBeDefined();
      expect(item.entries[0]).toEqual(expect.objectContaining({ value: 'DESKTOP-1' }));
    });

    it('rejects a control character on create', async () => {
      await expect(
        trustedDeviceValidator.validatePreCreateItem(buildItem('DESKTOP\u0000-1'))
      ).rejects.toThrow(/control characters in fields: host\.name/);
    });
  });

  it('should initialize', () => {
    expect(trustedDeviceValidator).not.toBeUndefined();
  });

  // -----------------------------------------------------------------------------
  //
  //  API TESTS FOR THIS ARTIFACT TYPE SHOULD BE COVERED WITH INTEGRATION TESTS.
  //  ADD THEM HERE:
  //
  //  `x-pack/solutions/security/test/security_solution_api_integration/test_suites/edr_workflows`
  //
  // -----------------------------------------------------------------------------
});
