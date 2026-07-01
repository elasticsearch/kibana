/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { SavedObject } from '@kbn/core/server';

jest.mock('timers/promises', () => ({ setTimeout: jest.fn() }));

// appContextService.getSavedObjects() is configured per-test in beforeEach via jest.mocked().
jest.mock('../../..', () => ({
  appContextService: {
    getExperimentalFeatures: jest.fn().mockReturnValue({
      enableAgentStatusAlerting: true,
      enableSloTemplates: false,
    }),
    getSavedObjects: jest.fn(),
  },
}));

import { appContextService } from '../../..';
import { KibanaSavedObjectType } from '../../../../../common/types/models/epm';
import { KibanaAssetType } from '../../../../types';

import type { Installation } from '../../../../../common/types';
import type { ArchiveAsset } from './install';
import { deleteOrphanedMultipleIsolatedAssets } from './install';

const mockLogger = loggingSystemMock.createLogger();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a mock kibanaAssetsArchiveIterator that calls onEntry for each asset. */
const makeArchiveIterator =
  (assets: ArchiveAsset[]) =>
  async (
    onEntry: (entry: {
      asset: ArchiveAsset;
      assetType: KibanaAssetType;
      path: string;
    }) => Promise<void>
  ) => {
    const typeToAssetType: Partial<Record<KibanaSavedObjectType, KibanaAssetType>> = {
      [KibanaSavedObjectType.tag]: KibanaAssetType.tag,
      [KibanaSavedObjectType.alertingRuleTemplate]: KibanaAssetType.alertingRuleTemplate,
      [KibanaSavedObjectType.dashboard]: KibanaAssetType.dashboard,
    };
    for (const asset of assets) {
      const assetType = typeToAssetType[asset.type] ?? KibanaAssetType.dashboard;
      await onEntry({ asset, assetType, path: `kibana/${assetType}/${asset.id}.json` });
    }
  };

const makeTagAsset = (id: string): ArchiveAsset => ({
  id,
  type: KibanaSavedObjectType.tag,
  attributes: { name: id, color: '#000', description: '' },
  references: [],
});

const makeAlertingRuleTemplateAsset = (id: string): ArchiveAsset => ({
  id,
  type: KibanaSavedObjectType.alertingRuleTemplate,
  attributes: { name: id },
  references: [],
});

const makeDashboardAsset = (id: string): ArchiveAsset => ({
  id,
  type: KibanaSavedObjectType.dashboard,
  attributes: {},
  references: [],
});

const makeInstalledPkg = (
  spaceId: string,
  refs: Array<{ id: string; originId?: string; type: KibanaSavedObjectType }> = []
): SavedObject<Installation> =>
  ({
    id: 'test-pkg',
    type: 'epm-packages',
    references: [],
    attributes: {
      installed_kibana_space_id: spaceId,
      installed_kibana: refs,
      additional_spaces_installed_kibana: {},
    } as unknown as Installation,
  } as SavedObject<Installation>);

const makeFindResult = (
  objects: Array<{ id: string; type: string; originId?: string }>,
  total?: number
) => ({
  total: total ?? objects.length,
  page: 1,
  per_page: 100,
  saved_objects: objects.map((o) => ({
    id: o.id,
    type: o.type,
    ...(o.originId !== undefined && { originId: o.originId }),
    attributes: {},
    references: [],
    score: 1,
  })),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deleteOrphanedMultipleIsolatedAssets', () => {
  let mockFind: jest.Mock;
  let mockBulkDelete: jest.Mock;

  beforeEach(() => {
    mockFind = jest.fn().mockResolvedValue(makeFindResult([]));
    mockBulkDelete = jest.fn().mockResolvedValue({});

    jest.mocked(appContextService.getSavedObjects).mockReturnValue({
      getUnsafeInternalClient: jest.fn().mockReturnValue({
        find: mockFind,
        bulkDelete: mockBulkDelete,
      }),
    } as any);
  });

  it('does not call find() when the archive contains no multiple-isolated assets', async () => {
    const iterator = makeArchiveIterator([makeDashboardAsset('my-dashboard')]);

    await deleteOrphanedMultipleIsolatedAssets({
      kibanaAssetsArchiveIterator: iterator,
      installedPkg: undefined,
      spaceId: 'default',
      logger: mockLogger,
    });

    expect(mockFind).not.toHaveBeenCalled();
    expect(mockBulkDelete).not.toHaveBeenCalled();
  });

  it('calls find() for tag and alertingRuleTemplate assets but not other types', async () => {
    const iterator = makeArchiveIterator([
      makeTagAsset('my-tag'),
      makeDashboardAsset('my-dashboard'),
      makeAlertingRuleTemplateAsset('my-rule-template'),
    ]);

    await deleteOrphanedMultipleIsolatedAssets({
      kibanaAssetsArchiveIterator: iterator,
      installedPkg: undefined,
      spaceId: 'default',
      logger: mockLogger,
    });

    expect(mockFind).toHaveBeenCalledTimes(2);
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ type: KibanaSavedObjectType.tag })
    );
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ type: KibanaSavedObjectType.alertingRuleTemplate })
    );
  });

  it('deletes untracked objects found for a tag asset on a fresh install', async () => {
    const orphanId = 'uuid-orphan-from-failed-install';
    mockFind.mockResolvedValueOnce(
      makeFindResult([{ id: orphanId, type: KibanaSavedObjectType.tag, originId: 'my-tag' }])
    );

    const iterator = makeArchiveIterator([makeTagAsset('my-tag')]);
    await deleteOrphanedMultipleIsolatedAssets({
      kibanaAssetsArchiveIterator: iterator,
      installedPkg: undefined,
      spaceId: 'default',
      logger: mockLogger,
    });

    expect(mockBulkDelete).toHaveBeenCalledWith(
      [{ id: orphanId, type: KibanaSavedObjectType.tag }],
      expect.anything()
    );
  });

  it('does not delete an object whose id is tracked in installed_kibana', async () => {
    const trackedId = 'uuid-tracked';
    mockFind.mockResolvedValueOnce(
      makeFindResult([{ id: trackedId, type: KibanaSavedObjectType.tag, originId: 'my-tag' }])
    );

    const iterator = makeArchiveIterator([makeTagAsset('my-tag')]);
    await deleteOrphanedMultipleIsolatedAssets({
      kibanaAssetsArchiveIterator: iterator,
      installedPkg: makeInstalledPkg('default', [
        { id: trackedId, type: KibanaSavedObjectType.tag },
      ]),
      spaceId: 'default',
      logger: mockLogger,
    });

    expect(mockBulkDelete).not.toHaveBeenCalled();
  });

  it('does not delete an object whose originId is tracked in installed_kibana', async () => {
    const uuid = 'uuid-for-my-tag';
    const archiveId = 'my-tag';
    // find() returns the object by its UUID id; the tracked ref stores that UUID with originId
    mockFind.mockResolvedValueOnce(
      makeFindResult([{ id: uuid, type: KibanaSavedObjectType.tag, originId: archiveId }])
    );

    const iterator = makeArchiveIterator([makeTagAsset(archiveId)]);
    await deleteOrphanedMultipleIsolatedAssets({
      kibanaAssetsArchiveIterator: iterator,
      installedPkg: makeInstalledPkg('default', [
        { id: uuid, originId: archiveId, type: KibanaSavedObjectType.tag },
      ]),
      spaceId: 'default',
      logger: mockLogger,
    });

    expect(mockBulkDelete).not.toHaveBeenCalled();
  });

  it('deletes only the orphan when both a tracked and an orphaned object are found', async () => {
    const trackedId = 'uuid-tracked';
    const orphanId = 'uuid-orphan';
    mockFind.mockResolvedValueOnce(
      makeFindResult([
        { id: trackedId, type: KibanaSavedObjectType.tag, originId: 'my-tag' },
        { id: orphanId, type: KibanaSavedObjectType.tag, originId: 'my-tag' },
      ])
    );

    const iterator = makeArchiveIterator([makeTagAsset('my-tag')]);
    await deleteOrphanedMultipleIsolatedAssets({
      kibanaAssetsArchiveIterator: iterator,
      installedPkg: makeInstalledPkg('default', [
        { id: trackedId, type: KibanaSavedObjectType.tag },
      ]),
      spaceId: 'default',
      logger: mockLogger,
    });

    const [deletedObjects] = mockBulkDelete.mock.calls[0];
    expect(deletedObjects).toEqual([{ id: orphanId, type: KibanaSavedObjectType.tag }]);
  });

  it('passes namespaces: [spaceId] to find() to scope the search to the target space', async () => {
    const iterator = makeArchiveIterator([makeTagAsset('my-tag')]);
    await deleteOrphanedMultipleIsolatedAssets({
      kibanaAssetsArchiveIterator: iterator,
      installedPkg: undefined,
      spaceId: 'my-custom-space',
      logger: mockLogger,
    });

    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ namespaces: ['my-custom-space'] })
    );
  });

  it('uses rootSearchFields to match objects by raw _id and originId', async () => {
    const iterator = makeArchiveIterator([makeTagAsset('my-tag')]);
    await deleteOrphanedMultipleIsolatedAssets({
      kibanaAssetsArchiveIterator: iterator,
      installedPkg: undefined,
      spaceId: 'default',
      logger: mockLogger,
    });

    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ rootSearchFields: ['_id', 'originId'] })
    );
  });

  it('does not call bulkDelete() when no orphaned objects are found', async () => {
    mockFind.mockResolvedValue(makeFindResult([]));

    const iterator = makeArchiveIterator([makeTagAsset('my-tag')]);
    await deleteOrphanedMultipleIsolatedAssets({
      kibanaAssetsArchiveIterator: iterator,
      installedPkg: makeInstalledPkg('default'),
      spaceId: 'default',
      logger: mockLogger,
    });

    expect(mockBulkDelete).not.toHaveBeenCalled();
  });

  it('collects orphans across multiple assets and deletes them in a single batch', async () => {
    const orphan1 = 'uuid-orphan-tag';
    const orphan2 = 'uuid-orphan-rule-template';
    mockFind
      .mockResolvedValueOnce(
        makeFindResult([{ id: orphan1, type: KibanaSavedObjectType.tag, originId: 'my-tag' }])
      )
      .mockResolvedValueOnce(
        makeFindResult([
          {
            id: orphan2,
            type: KibanaSavedObjectType.alertingRuleTemplate,
            originId: 'my-rule-template',
          },
        ])
      );

    const iterator = makeArchiveIterator([
      makeTagAsset('my-tag'),
      makeAlertingRuleTemplateAsset('my-rule-template'),
    ]);
    await deleteOrphanedMultipleIsolatedAssets({
      kibanaAssetsArchiveIterator: iterator,
      installedPkg: undefined,
      spaceId: 'default',
      logger: mockLogger,
    });

    expect(mockBulkDelete).toHaveBeenCalledTimes(1);
    const [deletedObjects] = mockBulkDelete.mock.calls[0];
    expect(deletedObjects).toEqual(
      expect.arrayContaining([
        { id: orphan1, type: KibanaSavedObjectType.tag },
        { id: orphan2, type: KibanaSavedObjectType.alertingRuleTemplate },
      ])
    );
  });

  it('uses additional_spaces_installed_kibana refs when spaceId differs from the primary space', async () => {
    const trackedId = 'uuid-tracked-in-space-b';
    const orphanId = 'uuid-orphan-in-space-b';
    mockFind.mockResolvedValueOnce(
      makeFindResult([
        { id: trackedId, type: KibanaSavedObjectType.tag, originId: 'my-tag' },
        { id: orphanId, type: KibanaSavedObjectType.tag, originId: 'my-tag' },
      ])
    );

    const installedPkg: SavedObject<Installation> = {
      id: 'test-pkg',
      type: 'epm-packages',
      references: [],
      attributes: {
        installed_kibana_space_id: 'default',
        installed_kibana: [],
        additional_spaces_installed_kibana: {
          'space-b': [{ id: trackedId, type: KibanaSavedObjectType.tag }],
        },
      } as unknown as Installation,
    } as SavedObject<Installation>;

    const iterator = makeArchiveIterator([makeTagAsset('my-tag')]);
    await deleteOrphanedMultipleIsolatedAssets({
      kibanaAssetsArchiveIterator: iterator,
      installedPkg,
      spaceId: 'space-b',
      logger: mockLogger,
    });

    const [deletedObjects] = mockBulkDelete.mock.calls[0];
    expect(deletedObjects).toEqual([{ id: orphanId, type: KibanaSavedObjectType.tag }]);
  });

  it('does not delete an object that has no originId (matched only by raw _id, not a genuine orphan)', async () => {
    // An object whose raw _id equals the archive asset id but has no originId is a
    // legitimately shared object from another package or a user-created one — it must
    // not be deleted.
    const sharedObjectId = 'my-tag'; // raw _id matches the archive asset id
    mockFind.mockResolvedValueOnce(
      makeFindResult([{ id: sharedObjectId, type: KibanaSavedObjectType.tag }]) // no originId
    );

    const iterator = makeArchiveIterator([makeTagAsset('my-tag')]);
    await deleteOrphanedMultipleIsolatedAssets({
      kibanaAssetsArchiveIterator: iterator,
      installedPkg: undefined,
      spaceId: 'default',
      logger: mockLogger,
    });

    expect(mockBulkDelete).not.toHaveBeenCalled();
  });

  it('fetches all pages when find() returns more than perPage results', async () => {
    // Build 150 orphans spread across two pages (100 + 50).
    const makeOrphans = (count: number, prefix: string) =>
      Array.from({ length: count }, (_, i) => ({
        id: `${prefix}-${i}`,
        type: KibanaSavedObjectType.tag,
        originId: 'my-tag',
      }));
    const page1Orphans = makeOrphans(100, 'orphan-p1');
    const page2Orphans = makeOrphans(50, 'orphan-p2');
    const totalOrphans = page1Orphans.length + page2Orphans.length;

    mockFind
      .mockResolvedValueOnce(makeFindResult(page1Orphans, totalOrphans))
      .mockResolvedValueOnce(makeFindResult(page2Orphans, totalOrphans));

    const iterator = makeArchiveIterator([makeTagAsset('my-tag')]);
    await deleteOrphanedMultipleIsolatedAssets({
      kibanaAssetsArchiveIterator: iterator,
      installedPkg: undefined,
      spaceId: 'default',
      logger: mockLogger,
    });

    // Two pages fetched for the single tag asset.
    expect(mockFind).toHaveBeenCalledTimes(2);
    expect(mockFind).toHaveBeenNthCalledWith(1, expect.objectContaining({ page: 1 }));
    expect(mockFind).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 2 }));

    // All 150 orphans collected and deleted in one bulkDelete call.
    expect(mockBulkDelete).toHaveBeenCalledTimes(1);
    const [deletedObjects] = mockBulkDelete.mock.calls[0];
    expect(deletedObjects).toHaveLength(totalOrphans);
  });
});
