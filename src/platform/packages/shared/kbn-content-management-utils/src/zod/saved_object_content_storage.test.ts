/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import { loggerMock } from '@kbn/logging-mocks';
import type { MockedLogger } from '@kbn/logging-mocks';

import type {
  ContentManagementServicesDefinition as ServicesDefinition,
  Version,
} from '@kbn/object-versioning';
import { getContentManagementServicesTransforms } from '@kbn/object-versioning';

import { coreMock } from '@kbn/core/server/mocks';
import type { RequestHandlerContext, SavedObject } from '@kbn/core/server';
import { mockRouter } from '@kbn/core-http-router-server-mocks';
import { savedObjectSchema, objectTypeToGetResultSchema, createResultSchema } from './schema';
import type { ContentManagementCrudTypes } from '../types';
import { SOContentStorage } from '../saved_object_content_storage';

interface MockAttributes {
  title: string;
  description: string | null;
}
type MockCrudTypes = ContentManagementCrudTypes<'content-id', MockAttributes, {}, {}, {}>;

const testAttributesSchema = z
  .object({
    title: z.string(),
    description: z.string(),
  })
  .strict();

const testSavedObjectSchema = savedObjectSchema(testAttributesSchema);

export const serviceDefinition: ServicesDefinition = {
  get: {
    out: {
      result: {
        schema: objectTypeToGetResultSchema(testSavedObjectSchema),
      },
    },
  },
  create: {
    out: {
      result: {
        schema: createResultSchema(testSavedObjectSchema),
      },
    },
  },
  update: {
    out: {
      result: {
        schema: createResultSchema(testSavedObjectSchema),
      },
    },
  },
  search: {
    out: {
      result: {
        schema: z.object({ hits: z.array(testSavedObjectSchema) }),
      },
    },
  },
  mSearch: {
    out: {
      result: {
        schema: testSavedObjectSchema,
      },
    },
  },
};

export const cmServicesDefinition: { [version: Version]: ServicesDefinition } = {
  1: serviceDefinition,
};

const transforms = getContentManagementServicesTransforms(cmServicesDefinition, 1);

class TestSOContentStorage extends SOContentStorage<MockCrudTypes> {
  constructor({
    throwOnResultValidationError,
    logger,
  }: { throwOnResultValidationError?: boolean; logger?: MockedLogger } = {}) {
    super({
      savedObjectType: 'test',
      cmServicesDefinition,
      allowedSavedObjectAttributes: ['title', 'description'],
      logger: logger ?? loggerMock.create(),
      throwOnResultValidationError: throwOnResultValidationError ?? false,
      enableMSearch: true,
    });
  }
}

const setup = ({ storage }: { storage?: TestSOContentStorage } = {}) => {
  storage = storage ?? new TestSOContentStorage();
  const requestHandlerCoreContext = coreMock.createRequestHandlerContext();
  const requestHandlerContext = jest.mocked<RequestHandlerContext>({
    core: Promise.resolve(requestHandlerCoreContext),
    loadPluginContract: jest.fn(),
    resolve: jest.fn(),
  });

  return {
    get: (mockSavedObject: SavedObject) => {
      requestHandlerCoreContext.savedObjects.client.resolve.mockResolvedValue({
        saved_object: mockSavedObject,
        outcome: 'exactMatch',
      });

      return storage!.get(
        {
          request: mockRouter.createFakeKibanaRequest({}),
          requestHandlerContext,
          version: {
            request: 1,
            latest: 1,
          },
          utils: {
            getTransforms: () => transforms,
          },
        },
        mockSavedObject.id
      );
    },
    create: (mockSavedObject: SavedObject<MockAttributes>) => {
      requestHandlerCoreContext.savedObjects.client.create.mockResolvedValue(mockSavedObject);

      return storage!.create(
        {
          request: mockRouter.createFakeKibanaRequest({}),
          requestHandlerContext,
          version: {
            request: 1,
            latest: 1,
          },
          utils: {
            getTransforms: () => transforms,
          },
        },
        mockSavedObject.attributes,
        {}
      );
    },
    update: (mockSavedObject: SavedObject<MockAttributes>) => {
      requestHandlerCoreContext.savedObjects.client.update.mockResolvedValue(mockSavedObject);

      return storage!.update(
        {
          request: mockRouter.createFakeKibanaRequest({}),
          requestHandlerContext,
          version: {
            request: 1,
            latest: 1,
          },
          utils: {
            getTransforms: () => transforms,
          },
        },
        mockSavedObject.id,
        mockSavedObject.attributes,
        {}
      );
    },
    search: (mockSavedObject: SavedObject<MockAttributes>) => {
      requestHandlerCoreContext.savedObjects.client.find.mockResolvedValue({
        saved_objects: [{ ...mockSavedObject, score: 100 }],
        total: 1,
        per_page: 10,
        page: 1,
      });

      return storage!.search(
        {
          request: mockRouter.createFakeKibanaRequest({}),
          requestHandlerContext,
          version: {
            request: 1,
            latest: 1,
          },
          utils: {
            getTransforms: () => transforms,
          },
        },
        {},
        {}
      );
    },
    mSearch: async (mockSavedObject: SavedObject<MockAttributes>) => {
      return storage!.mSearch!.toItemResult(
        {
          request: mockRouter.createFakeKibanaRequest({}),
          requestHandlerContext,
          version: {
            request: 1,
            latest: 1,
          },
          utils: {
            getTransforms: () => transforms,
          },
        },
        { ...mockSavedObject, score: 100 }
      );
    },
  };
};

describe('get', () => {
  test('returns the storage get() result', async () => {
    const get = setup().get;

    const testSavedObject = {
      id: 'id',
      type: 'test',
      references: [],
      attributes: {
        title: 'title',
        description: 'description',
      },
    };

    const result = await get(testSavedObject);

    expect(result).toEqual({ item: testSavedObject, meta: { outcome: 'exactMatch' } });
  });

  test('filters out unknown attributes', async () => {
    const get = setup().get;

    const testSavedObject = {
      id: 'id',
      type: 'test',
      references: [],
      attributes: {
        title: 'title',
        description: 'description',
        unknown: 'unknown',
      },
    };

    const result = await get(testSavedObject);
    expect(result.item.attributes).not.toHaveProperty('unknown');
  });

  test('throws response validation error', async () => {
    const get = setup({
      storage: new TestSOContentStorage({ throwOnResultValidationError: true }),
    }).get;

    const testSavedObject = {
      id: 'id',
      type: 'test',
      references: [],
      attributes: {
        title: 'title',
        description: null,
      },
    };

    await expect(get(testSavedObject)).rejects.toThrowErrorMatchingInlineSnapshot(`
      "Invalid response. ✖ Invalid input: expected string, received null
        → at item.attributes.description"
    `);
  });

  test('logs response validation error', async () => {
    const logger = loggerMock.create();
    const get = setup({
      storage: new TestSOContentStorage({ throwOnResultValidationError: false, logger }),
    }).get;

    const testSavedObject = {
      id: 'id',
      type: 'test',
      references: [],
      attributes: {
        title: 'title',
        description: null,
      },
    };

    await expect(get(testSavedObject)).resolves.toBeDefined();
    const message = logger.warn.mock.calls[0][0];
    expect(message).toMatchInlineSnapshot(`
      "Invalid response. ✖ Invalid input: expected string, received null
        → at item.attributes.description"
    `);
  });
});

describe('create', () => {
  test('returns the storage create() result', async () => {
    const create = setup().create;

    const testSavedObject = {
      id: 'id',
      type: 'test',
      references: [],
      attributes: {
        title: 'title',
        description: 'description',
      },
    };

    const result = await create(testSavedObject);

    expect(result).toEqual({ item: testSavedObject });
  });

  test('filters out unknown attributes', async () => {
    const create = setup().create;

    const testSavedObject = {
      id: 'id',
      type: 'test',
      references: [],
      attributes: {
        title: 'title',
        description: 'description',
        unknown: 'unknown',
      },
    };

    const result = await create(testSavedObject);
    expect(result.item.attributes).not.toHaveProperty('unknown');
  });

  test('throws response validation error', async () => {
    const create = setup({
      storage: new TestSOContentStorage({ throwOnResultValidationError: true }),
    }).create;

    const testSavedObject = {
      id: 'id',
      type: 'test',
      references: [],
      attributes: {
        title: 'title',
        description: null,
      },
    };

    await expect(create(testSavedObject)).rejects.toThrowErrorMatchingInlineSnapshot(`
      "Invalid response. ✖ Invalid input: expected string, received null
        → at item.attributes.description"
    `);
  });

  test('logs response validation error', async () => {
    const logger = loggerMock.create();
    const create = setup({
      storage: new TestSOContentStorage({ throwOnResultValidationError: false, logger }),
    }).create;

    const testSavedObject = {
      id: 'id',
      type: 'test',
      references: [],
      attributes: {
        title: 'title',
        description: null,
      },
    };

    await expect(create(testSavedObject)).resolves.toBeDefined();
    const message = logger.warn.mock.calls[0][0];
    expect(message).toMatchInlineSnapshot(`
      "Invalid response. ✖ Invalid input: expected string, received null
        → at item.attributes.description"
    `);
  });
});

describe('update', () => {
  test('returns the storage update() result', async () => {
    const update = setup().update;

    const testSavedObject = {
      id: 'id',
      type: 'test',
      references: [],
      attributes: {
        title: 'title',
        description: 'description',
      },
    };

    const result = await update(testSavedObject);

    expect(result).toEqual({ item: testSavedObject });
  });

  test('filters out unknown attributes', async () => {
    const update = setup().update;

    const testSavedObject = {
      id: 'id',
      type: 'test',
      references: [],
      attributes: {
        title: 'title',
        description: 'description',
        unknown: 'unknown',
      },
    };

    const result = await update(testSavedObject);
    expect(result.item.attributes).not.toHaveProperty('unknown');
  });

  test('throws response validation error', async () => {
    const update = setup({
      storage: new TestSOContentStorage({ throwOnResultValidationError: true }),
    }).update;

    const testSavedObject = {
      id: 'id',
      type: 'test',
      references: [],
      attributes: {
        title: 'title',
        description: null,
      },
    };

    await expect(update(testSavedObject)).rejects.toThrowErrorMatchingInlineSnapshot(`
      "Invalid response. ✖ Invalid input: expected string, received null
        → at item.attributes.description"
    `);
  });

  test('logs response validation error', async () => {
    const logger = loggerMock.create();
    const update = setup({
      storage: new TestSOContentStorage({ throwOnResultValidationError: false, logger }),
    }).update;

    const testSavedObject = {
      id: 'id',
      type: 'test',
      references: [],
      attributes: {
        title: 'title',
        description: null,
      },
    };

    await expect(update(testSavedObject)).resolves.toBeDefined();
    const message = logger.warn.mock.calls[0][0];
    expect(message).toMatchInlineSnapshot(`
      "Invalid response. ✖ Invalid input: expected string, received null
        → at item.attributes.description"
    `);
  });
});

describe('search', () => {
  test('returns the storage search() result', async () => {
    const search = setup().search;

    const testSavedObject = {
      id: 'id',
      type: 'test',
      references: [],
      attributes: {
        title: 'title',
        description: 'description',
      },
    };

    const result = await search(testSavedObject);

    expect(result).toEqual({ hits: [testSavedObject], pagination: { total: 1 } });
  });

  test('filters out unknown attributes', async () => {
    const search = setup().search;

    const testSavedObject = {
      id: 'id',
      type: 'test',
      references: [],
      attributes: {
        title: 'title',
        description: 'description',
        unknown: 'unknown',
      },
    };

    const result = await search(testSavedObject);
    expect(result.hits[0].attributes).not.toHaveProperty('unknown');
  });

  test('throws response validation error', async () => {
    const search = setup({
      storage: new TestSOContentStorage({ throwOnResultValidationError: true }),
    }).search;

    const testSavedObject = {
      id: 'id',
      type: 'test',
      references: [],
      attributes: {
        title: 'title',
        description: null,
      },
    };

    await expect(search(testSavedObject)).rejects.toThrowErrorMatchingInlineSnapshot(`
      "Invalid response. ✖ Invalid input: expected string, received null
        → at hits[0].attributes.description"
    `);
  });

  test('logs response validation error', async () => {
    const logger = loggerMock.create();
    const update = setup({
      storage: new TestSOContentStorage({ throwOnResultValidationError: false, logger }),
    }).search;

    const testSavedObject = {
      id: 'id',
      type: 'test',
      references: [],
      attributes: {
        title: 'title',
        description: null,
      },
    };

    await expect(update(testSavedObject)).resolves.toBeDefined();
    const message = logger.warn.mock.calls[0][0];
    expect(message).toMatchInlineSnapshot(`
      "Invalid response. ✖ Invalid input: expected string, received null
        → at hits[0].attributes.description"
    `);
  });
});

describe('mSearch', () => {
  test('returns the storage mSearch() result', async () => {
    const mSearch = setup().mSearch;

    const testSavedObject = {
      id: 'id',
      type: 'test',
      references: [],
      attributes: {
        title: 'title',
        description: 'description',
      },
    };

    const result = await mSearch(testSavedObject);

    expect(result).toEqual(testSavedObject);
  });

  test('filters out unknown attributes', async () => {
    const mSearch = setup().mSearch;

    const testSavedObject = {
      id: 'id',
      type: 'test',
      references: [],
      attributes: {
        title: 'title',
        description: 'description',
        unknown: 'unknown',
      },
    };

    const result = await mSearch(testSavedObject);
    expect(result.attributes).not.toHaveProperty('unknown');
  });

  test('throws response validation error', async () => {
    const mSearch = setup({
      storage: new TestSOContentStorage({ throwOnResultValidationError: true }),
    }).mSearch;

    const testSavedObject = {
      id: 'id',
      type: 'test',
      references: [],
      attributes: {
        title: 'title',
        description: null,
      },
    };

    await expect(mSearch(testSavedObject)).rejects.toThrowErrorMatchingInlineSnapshot(`
      "Invalid response. ✖ Invalid input: expected string, received null
        → at attributes.description"
    `);
  });

  test('logs response validation error', async () => {
    const logger = loggerMock.create();
    const mSearch = setup({
      storage: new TestSOContentStorage({ throwOnResultValidationError: false, logger }),
    }).mSearch;

    const testSavedObject = {
      id: 'id',
      type: 'test',
      references: [],
      attributes: {
        title: 'title',
        description: null,
      },
    };

    await expect(mSearch(testSavedObject)).resolves.toBeDefined();
    const message = logger.warn.mock.calls[0][0];
    expect(message).toMatchInlineSnapshot(`
      "Invalid response. ✖ Invalid input: expected string, received null
        → at attributes.description"
    `);
  });
});
