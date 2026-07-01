/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock, savedObjectsClientMock } from '@kbn/core/server/mocks';

jest.mock('timers/promises', () => ({ setTimeout: jest.fn() }));
jest.mock('../../packages/install', () => ({
  saveKibanaAssetsRefs: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../packages/remove', () => ({
  deleteKibanaSavedObjectsAssets: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./saved_objects', () => ({
  getSpaceAwareSaveobjectsClients: jest.fn().mockReturnValue({
    savedObjectsImporter: {
      import: jest.fn().mockResolvedValue({ successResults: [], errors: [], warnings: [] }),
    },
    savedObjectTagAssignmentService: { updateTagAssignments: jest.fn() },
    savedObjectTagClient: { create: jest.fn(), get: jest.fn(), find: jest.fn() },
  }),
}));
jest.mock('./tag_assets', () => ({
  tagKibanaAssets: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../..', () => ({
  appContextService: {
    getExperimentalFeatures: jest.fn().mockReturnValue({
      enableAgentStatusAlerting: false,
      enableSloTemplates: false,
    }),
    getSavedObjects: jest.fn().mockReturnValue({
      getUnsafeInternalClient: jest.fn().mockReturnValue({
        find: jest.fn().mockResolvedValue({ total: 0, page: 1, per_page: 100, saved_objects: [] }),
        bulkDelete: jest.fn().mockResolvedValue({}),
      }),
    }),
  },
}));

import type { SavedObject } from '@kbn/core/server';

import { saveKibanaAssetsRefs } from '../../packages/install';
import type { Installation } from '../../../../../common/types';

import { installKibanaAssetsAndReferencesMultispace } from './install';

const mockSaveKibanaAssetsRefs = saveKibanaAssetsRefs as jest.MockedFunction<
  typeof saveKibanaAssetsRefs
>;

const mockLogger = loggingSystemMock.createLogger();

const makeInstalledPkg = (
  installedKibanaSpaceId: string,
  additionalSpaces: string[] = []
): SavedObject<Installation> =>
  ({
    id: 'nginx',
    type: 'epm-packages',
    references: [],
    attributes: {
      installed_kibana_space_id: installedKibanaSpaceId,
      installed_kibana: [],
      additional_spaces_installed_kibana: Object.fromEntries(
        additionalSpaces.map((s) => [s, [{ id: `${s}-dash`, type: 'dashboard' }]])
      ),
    } as unknown as Installation,
  } as SavedObject<Installation>);

const makePackageInstallContext = () => ({
  packageInfo: { name: 'nginx', title: 'Nginx', version: '2.3.2' } as never,
  paths: [],
  archiveIterator: {
    traverseEntries: jest.fn().mockResolvedValue(undefined),
    getPaths: jest.fn().mockReturnValue([]),
  },
});

const baseArgs = () => ({
  savedObjectsClient: savedObjectsClientMock.create(),
  logger: mockLogger,
  pkgName: 'nginx',
  pkgTitle: 'Nginx',
  packageInstallContext: makePackageInstallContext(),
});

describe('installKibanaAssetsAndReferencesMultispace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when the requesting space is the primary (installed_kibana_space_id)', () => {
    it('installs into the primary space with saveAsAdditionalSpace=false', async () => {
      const installedPkg = makeInstalledPkg('default');

      await installKibanaAssetsAndReferencesMultispace({
        ...baseArgs(),
        spaceId: 'default',
        installedPkg,
      });

      const primaryCall = mockSaveKibanaAssetsRefs.mock.calls.find(
        ([, , , spaceId, saveAsAdditional]) => !saveAsAdditional && spaceId === 'default'
      );
      expect(primaryCall).toBeDefined();
    });

    it('installs into each additional space with saveAsAdditionalSpace=true', async () => {
      const installedPkg = makeInstalledPkg('default', ['space-a', 'space-b']);

      await installKibanaAssetsAndReferencesMultispace({
        ...baseArgs(),
        spaceId: 'default',
        installedPkg,
      });

      const additionalCalls = mockSaveKibanaAssetsRefs.mock.calls.filter(
        ([, , , , saveAsAdditional]) => saveAsAdditional === true
      );
      expect(additionalCalls.map(([, , , spaceId]) => spaceId)).toEqual(
        expect.arrayContaining(['space-a', 'space-b'])
      );
    });

    it('does not call saveKibanaAssetsRefs with the primary space as an additional space', async () => {
      const installedPkg = makeInstalledPkg('default', ['space-a']);

      await installKibanaAssetsAndReferencesMultispace({
        ...baseArgs(),
        spaceId: 'default',
        installedPkg,
      });

      const invalidCall = mockSaveKibanaAssetsRefs.mock.calls.find(
        ([, , , spaceId, saveAsAdditional]) => saveAsAdditional === true && spaceId === 'default'
      );
      expect(invalidCall).toBeUndefined();
    });
  });

  describe('when the requesting space is not the primary', () => {
    it('installs only into the requesting space with saveAsAdditionalSpace=true', async () => {
      const installedPkg = makeInstalledPkg('default');

      await installKibanaAssetsAndReferencesMultispace({
        ...baseArgs(),
        spaceId: 'space-b',
        installedPkg,
      });

      expect(mockSaveKibanaAssetsRefs).toHaveBeenCalledTimes(1);
      const [, , , spaceId, saveAsAdditional] = mockSaveKibanaAssetsRefs.mock.calls[0];
      expect(saveAsAdditional).toBe(true);
      expect(spaceId).toBe('space-b');
    });

    it('does not overwrite the primary space (installed_kibana)', async () => {
      const installedPkg = makeInstalledPkg('default');

      await installKibanaAssetsAndReferencesMultispace({
        ...baseArgs(),
        spaceId: 'space-b',
        installedPkg,
      });

      const primaryOverwriteCall = mockSaveKibanaAssetsRefs.mock.calls.find(
        ([, , , , saveAsAdditional]) => saveAsAdditional === false
      );
      expect(primaryOverwriteCall).toBeUndefined();
    });
  });

  describe('when no package is installed yet (fresh install)', () => {
    it('installs with saveAsAdditionalSpace=false using the requesting space', async () => {
      await installKibanaAssetsAndReferencesMultispace({
        ...baseArgs(),
        spaceId: 'default',
        installedPkg: undefined,
      });

      expect(mockSaveKibanaAssetsRefs).toHaveBeenCalledTimes(1);
      const [, , , spaceId, saveAsAdditional] = mockSaveKibanaAssetsRefs.mock.calls[0];
      expect(saveAsAdditional).toBeFalsy();
      expect(spaceId).toBe('default');
    });
  });

  describe('when additional_spaces_installed_kibana contains a misplaced primary-space key', () => {
    it('skips the primary-space key while still iterating legitimate additional spaces', async () => {
      const installedPkg = makeInstalledPkg('default', ['space-b']);
      (installedPkg.attributes as any).additional_spaces_installed_kibana = {
        default: [{ id: 'misplaced-dash', type: 'dashboard' }],
        'space-b': [{ id: 'space-b-dash', type: 'dashboard' }],
      };

      await installKibanaAssetsAndReferencesMultispace({
        ...baseArgs(),
        spaceId: 'default',
        installedPkg,
      });

      const additionalCalls = mockSaveKibanaAssetsRefs.mock.calls.filter(
        ([, , , , saveAsAdditional]) => saveAsAdditional === true
      );
      expect(additionalCalls.map(([, , , sid]) => sid)).toContain('space-b');
      expect(additionalCalls.map(([, , , sid]) => sid)).not.toContain('default');
    });

    it('skips the primary-space key when the request comes from a non-primary space', async () => {
      const installedPkg = makeInstalledPkg('default');
      (installedPkg.attributes as any).additional_spaces_installed_kibana = {
        default: [{ id: 'misplaced-dash', type: 'dashboard' }],
      };

      await installKibanaAssetsAndReferencesMultispace({
        ...baseArgs(),
        spaceId: 'space-b',
        installedPkg,
      });

      expect(mockSaveKibanaAssetsRefs).toHaveBeenCalledTimes(1);
      const [, , , spaceId, saveAsAdditional] = mockSaveKibanaAssetsRefs.mock.calls[0];
      expect(saveAsAdditional).toBe(true);
      expect(spaceId).toBe('space-b');
    });
  });
});
