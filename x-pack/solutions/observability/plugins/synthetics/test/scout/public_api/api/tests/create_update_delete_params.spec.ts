/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { pick } from 'lodash';
import { expect } from '@kbn/scout-oblt/api';
import type { KbnClient, KibanaRole } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { apiTest, mergeSyntheticsApiHeaders } from '../../../common/fixtures';
import {
  bulkDeleteParams,
  createParam,
  deleteParam,
  getParam,
  getParams,
  updateParam,
} from '../../../common/fixtures/params';

const SYNTHETICS_PARAM_SO_TYPE = 'synthetics-param';

/**
 * Custom role descriptors ported from the FTR
 * `apis/synthetics/create_update_delete_params.ts` `ROLE_CONFIGS`. Scout's
 * `KibanaRole` requires `elasticsearch.cluster`, so an empty `cluster: []` is
 * added to each (the FTR descriptors omitted it).
 */
const ROLE_CONFIGS = {
  SYNTHETICS_ALL: {
    elasticsearch: {
      cluster: [],
      indices: [{ names: ['synthetics-*'], privileges: ['all'] }],
    },
    kibana: [{ base: [], spaces: ['*'], feature: { uptime: ['all'] } }],
  },
  SYNTHETICS_READ_ONLY: {
    elasticsearch: {
      cluster: [],
      indices: [{ names: ['synthetics-*'], privileges: ['read'] }],
    },
    kibana: [{ base: [], spaces: ['*'], feature: { uptime: ['read'] } }],
  },
  SYNTHETICS_ALL_WITH_READ_PARAMS: {
    elasticsearch: {
      cluster: [],
      indices: [{ names: ['synthetics-*'], privileges: ['all'] }],
    },
    kibana: [{ base: [], spaces: ['*'], feature: { uptime: ['all', 'can_read_param_values'] } }],
  },
  SYNTHETICS_MINIMAL_ALL_WITH_READ_PARAMS: {
    elasticsearch: {
      cluster: [],
      indices: [{ names: ['synthetics-*'], privileges: ['all'] }],
    },
    kibana: [
      { base: [], spaces: ['*'], feature: { uptime: ['minimal_all', 'can_read_param_values'] } },
    ],
  },
  SYNTHETICS_READ_WITH_READ_PARAMS: {
    elasticsearch: {
      cluster: [],
      indices: [{ names: ['synthetics-*'], privileges: ['read'] }],
    },
    kibana: [{ base: [], spaces: ['*'], feature: { uptime: ['read', 'can_read_param_values'] } }],
  },
  NO_SYNTHETICS: {
    elasticsearch: {
      cluster: [],
      indices: [{ names: ['log-*'], privileges: ['read'] }],
    },
    kibana: [{ base: [], spaces: ['*'], feature: { dashboard: ['read'] } }],
  },
} satisfies Record<string, KibanaRole>;

const testParam = { key: 'test', value: 'test' };

/** kbn-expect `pick(actual, keys).eql(expected)` equivalent. */
const assertHas = (actual: unknown, expected: Record<string, unknown>) => {
  expect(pick(actual as object, Object.keys(expected))).toStrictEqual(expected);
};

/** kbn-expect `.to.not.empty()` equivalent for params values/keys. */
const expectNotEmpty = (value: unknown) => {
  if (typeof value === 'string') {
    expect(value.length).toBeGreaterThan(0);
  } else {
    expect(value != null).toBe(true);
  }
};

interface ParamBody {
  id: string;
  key: string;
  value?: string;
  tags?: string[];
  description?: string;
  namespaces?: string[];
}

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/create_update_delete_params.ts`.
 *
 * The FTR suite let params accumulate and asserted on `body[0]`; to stay
 * parallel-safe and order-independent each Scout test wipes the
 * `synthetics-param` saved objects in `beforeEach`. Custom-role auth is resolved
 * up-front via `requestAuth.getApiKeyForCustomRole`, and `admin`/`editor` keys
 * via `requestAuth.getApiKey`.
 *
 * The FTR `skipCloud` cases only skipped on real Cloud (MKI); the migrated-from
 * deployment-agnostic config exercised them against local serverless, so they
 * keep both local tags here.
 */
apiTest.describe(
  'AddEditParams',
  { tag: [...tags.local.stateful.classic, ...tags.local.serverless.observability.complete] },
  () => {
    let adminHeaders: Record<string, string>;
    let editorHeaders: Record<string, string>;
    let allHeaders: Record<string, string>;
    let readOnlyHeaders: Record<string, string>;
    let noSyntheticsHeaders: Record<string, string>;
    let allWithReadParamsHeaders: Record<string, string>;
    let minimalAllWithReadParamsHeaders: Record<string, string>;
    let readWithReadParamsHeaders: Record<string, string>;
    const spacesToCleanUp: string[] = [];

    apiTest.beforeAll(async ({ requestAuth, kbnClient }) => {
      const resolveCustomRole = async (role: KibanaRole) => {
        const { apiKeyHeader } = await requestAuth.getApiKeyForCustomRole(role);
        return mergeSyntheticsApiHeaders(apiKeyHeader);
      };

      const { apiKeyHeader: adminKey } = await requestAuth.getApiKey('admin');
      adminHeaders = mergeSyntheticsApiHeaders(adminKey);
      const { apiKeyHeader: editorKey } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(editorKey);
      allHeaders = await resolveCustomRole(ROLE_CONFIGS.SYNTHETICS_ALL);
      readOnlyHeaders = await resolveCustomRole(ROLE_CONFIGS.SYNTHETICS_READ_ONLY);
      noSyntheticsHeaders = await resolveCustomRole(ROLE_CONFIGS.NO_SYNTHETICS);
      allWithReadParamsHeaders = await resolveCustomRole(
        ROLE_CONFIGS.SYNTHETICS_ALL_WITH_READ_PARAMS
      );
      minimalAllWithReadParamsHeaders = await resolveCustomRole(
        ROLE_CONFIGS.SYNTHETICS_MINIMAL_ALL_WITH_READ_PARAMS
      );
      readWithReadParamsHeaders = await resolveCustomRole(
        ROLE_CONFIGS.SYNTHETICS_READ_WITH_READ_PARAMS
      );

      await kbnClient.savedObjects.clean({ types: [SYNTHETICS_PARAM_SO_TYPE] });
    });

    apiTest.beforeEach(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: [SYNTHETICS_PARAM_SO_TYPE] });
      // Share-across-spaces uniqueness is cluster-wide; leftover keys in other
      // spaces (this suite only cleans the default space above) would 409.
      for (const spaceId of spacesToCleanUp) {
        await kbnClient.savedObjects
          .clean({ types: [SYNTHETICS_PARAM_SO_TYPE], space: spaceId })
          .catch(() => {});
      }
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: [SYNTHETICS_PARAM_SO_TYPE] });
      for (const spaceId of spacesToCleanUp) {
        await kbnClient.spaces.delete(spaceId).catch(() => {});
      }
      spacesToCleanUp.length = 0;
    });

    const createSpace = async (kbnClient: KbnClient) => {
      const id = `test-space-${uuidv4()}`;
      await kbnClient.spaces.create({ id, name: `test-space-name ${uuidv4()}` });
      spacesToCleanUp.push(id);
      return id;
    };

    apiTest('adds a test param', async ({ apiClient }) => {
      await createParam(apiClient, allHeaders, testParam);
      const getResponse = await getParams(apiClient, allHeaders);
      const params = getResponse.body as ParamBody[];
      expect(params[0].key).toBe(testParam.key);
      expect(params[0].value).toBeUndefined();
    });

    apiTest('handles tags and description', async ({ apiClient }) => {
      const tagsAndDescription = { tags: ['a tag'], description: 'test description' };
      await createParam(apiClient, allHeaders, { ...testParam, ...tagsAndDescription });
      const getResponse = await getParams(apiClient, allHeaders);
      const params = getResponse.body as ParamBody[];
      assertHas(params[0], { key: testParam.key, ...tagsAndDescription });
      expect(params[0].value).toBeUndefined();
    });

    apiTest('handles editing a param', async ({ apiClient }) => {
      const expectedUpdatedParam = {
        key: 'testUpdated',
        tags: ['a tag'],
        description: 'test description',
      };
      await createParam(apiClient, allHeaders, testParam);
      const getResponse = await getParams(apiClient, allHeaders);
      const param = (getResponse.body as ParamBody[])[0];
      expect(param.key).toBe(testParam.key);
      expect(param.value).toBeUndefined();

      await updateParam(apiClient, allHeaders, param.id, {}, { statusCode: 400 });
      await updateParam(apiClient, allHeaders, param.id, {
        ...expectedUpdatedParam,
        value: 'testUpdated',
      });

      const updatedGetResponse = await getParams(apiClient, allHeaders);
      const actualUpdatedParam = (updatedGetResponse.body as ParamBody[])[0];
      assertHas(actualUpdatedParam, expectedUpdatedParam);
      expect(actualUpdatedParam.value).toBeUndefined();
    });

    apiTest('handles partial editing a param', async ({ apiClient }) => {
      const newParam = {
        key: 'testUpdated',
        value: 'testUpdated',
        tags: ['a tag'],
        description: 'test description',
      };
      const response = await createParam(apiClient, allHeaders, newParam);
      const paramId = (response.body as ParamBody).id;

      const getResponse = await getParam(apiClient, allHeaders, paramId);
      assertHas(getResponse.body, {
        key: newParam.key,
        tags: newParam.tags,
        description: newParam.description,
      });
      expect((getResponse.body as ParamBody).value).toBeUndefined();

      await updateParam(apiClient, allHeaders, paramId, { key: 'testUpdated' });
      await updateParam(apiClient, allHeaders, paramId, {
        key: 'testUpdatedAgain',
        value: 'testUpdatedAgain',
      });

      const updatedGetResponse = await getParam(apiClient, allHeaders, paramId);
      assertHas(updatedGetResponse.body, {
        key: 'testUpdatedAgain',
        tags: newParam.tags,
        description: newParam.description,
      });
      expect((updatedGetResponse.body as ParamBody).value).toBeUndefined();
    });

    apiTest('handles spaces', async ({ apiClient, kbnClient }) => {
      const spaceId = await createSpace(kbnClient);
      await createParam(apiClient, allHeaders, testParam, { spaceId });
      const getResponse = await getParams(apiClient, allHeaders, { spaceId });
      const param = (getResponse.body as ParamBody[])[0];
      expect(param.namespaces).toStrictEqual([spaceId]);
      expect(param.key).toBe(testParam.key);
      expect(param.value).toBeUndefined();
    });

    apiTest('handles editing a param in spaces', async ({ apiClient, kbnClient }) => {
      const spaceId = await createSpace(kbnClient);
      const expectedUpdatedParam = {
        key: 'testUpdated',
        tags: ['a tag'],
        description: 'test description',
      };
      await createParam(apiClient, allHeaders, testParam, { spaceId });
      const getResponse = await getParams(apiClient, allHeaders, { spaceId });
      const param = (getResponse.body as ParamBody[])[0];
      expect(param.key).toBe(testParam.key);
      expect(param.value).toBeUndefined();

      await updateParam(
        apiClient,
        allHeaders,
        param.id,
        { ...expectedUpdatedParam, value: 'testUpdated' },
        { spaceId }
      );

      const updatedGetResponse = await getParams(apiClient, allHeaders, { spaceId });
      const actualUpdatedParam = (updatedGetResponse.body as ParamBody[])[0];
      assertHas(actualUpdatedParam, expectedUpdatedParam);
      expect(actualUpdatedParam.value).toBeUndefined();
    });

    apiTest(
      'does not allow editing a param in created in one space in a different space',
      async ({ apiClient, kbnClient }) => {
        const spaceId = await createSpace(kbnClient);
        const spaceIdTwo = await createSpace(kbnClient);
        const updatedParam = {
          key: 'testUpdated',
          value: 'testUpdated',
          tags: ['a tag'],
          description: 'test description',
        };
        await createParam(apiClient, allHeaders, testParam, { spaceId });
        const getResponse = await getParams(apiClient, allHeaders, { spaceId });
        const param = (getResponse.body as ParamBody[])[0];
        expect(param.key).toBe(testParam.key);
        expect(param.value).toBeUndefined();

        // space exists so the get request should be 200
        await getParams(apiClient, allHeaders, { spaceId: spaceIdTwo });

        await updateParam(apiClient, allHeaders, param.id, updatedParam, {
          spaceId: spaceIdTwo,
          statusCode: 404,
        });

        const updatedGetResponse = await getParams(apiClient, allHeaders, { spaceId });
        const actualUpdatedParam = (updatedGetResponse.body as ParamBody[])[0];
        expect(actualUpdatedParam.key).toBe(testParam.key);
        expect(actualUpdatedParam.value).toBeUndefined();
      }
    );

    apiTest('handles invalid spaces', async ({ apiClient }) => {
      await createParam(apiClient, allHeaders, testParam, {
        spaceId: 'doesnotexist',
        statusCode: 404,
      });
    });

    apiTest('handles editing with invalid spaces', async ({ apiClient }) => {
      const updatedParam = {
        key: 'testUpdated',
        value: 'testUpdated',
        tags: ['a tag'],
        description: 'test description',
      };
      await createParam(apiClient, allHeaders, testParam);
      const getResponse = await getParams(apiClient, allHeaders);
      const param = (getResponse.body as ParamBody[])[0];
      expect(param.key).toBe(testParam.key);
      expect(param.value).toBeUndefined();

      await updateParam(apiClient, allHeaders, param.id, updatedParam, {
        spaceId: 'doesnotexist',
        statusCode: 404,
      });
    });

    apiTest('handles share across spaces', async ({ apiClient, kbnClient }) => {
      const spaceId = await createSpace(kbnClient);
      // Share-across-spaces keys are globally unique; leftover `test` params in
      // other spaces from earlier tests would 409 if we reused `testParam`.
      const sharedParam = { key: `shared-${uuidv4()}`, value: 'test' };
      await createParam(
        apiClient,
        allHeaders,
        { ...sharedParam, share_across_spaces: true },
        { spaceId }
      );
      const getResponse = await getParams(apiClient, allHeaders, { spaceId });
      const param = (getResponse.body as ParamBody[])[0];
      expect(param.namespaces).toStrictEqual(['*']);
      expect(param.key).toBe(sharedParam.key);
      expect(param.value).toBeUndefined();
    });

    apiTest(
      'returns 409 when sharing a key that exists in another space',
      async ({ apiClient, kbnClient }) => {
        const spaceA = await createSpace(kbnClient);
        const spaceB = await createSpace(kbnClient);
        const key = `collide-${uuidv4()}`;
        await createParam(apiClient, allHeaders, { key, value: 'a' }, { spaceId: spaceA });
        await createParam(
          apiClient,
          allHeaders,
          { key, value: 'b', share_across_spaces: true },
          { spaceId: spaceB, statusCode: 409 }
        );
      }
    );

    apiTest('should NOT return values for editor user', async ({ apiClient }) => {
      const editorTestParam = { key: 'editorTestParam', value: 'editorTestParamValue' };
      const postResp = await createParam(apiClient, editorHeaders, editorTestParam);
      const getAllResp = await getParams(apiClient, editorHeaders);
      const getResp = await getParam(apiClient, editorHeaders, (postResp.body as ParamBody).id);

      expect((getResp.body as ParamBody).value).toBeUndefined();
      (getAllResp.body as ParamBody[]).forEach((param) => {
        expect(param.value).toBeUndefined();
        expectNotEmpty(param.key);
      });
    });

    apiTest(
      'should NOT return values for read-only synthetics custom role',
      async ({ apiClient }) => {
        const readOnlyTestParam = {
          key: 'syntheticsReadOnlyTestParam',
          value: 'syntheticsReadOnlyTestParamValue',
        };
        // create as a user that can write (ALL), then read as read-only
        const postRes = await createParam(apiClient, allHeaders, readOnlyTestParam);
        const getAllResp = await getParams(apiClient, readOnlyHeaders);
        const getResp = await getParam(apiClient, readOnlyHeaders, (postRes.body as ParamBody).id);

        (getAllResp.body as ParamBody[]).forEach((param) => {
          expect(param.value).toBeUndefined();
          expectNotEmpty(param.key);
        });
        expect((getResp.body as ParamBody).value).toBeUndefined();
        expect((getResp.body as ParamBody).key).toBe(readOnlyTestParam.key);
      }
    );

    apiTest('SHOULD RETURN values for admin user', async ({ apiClient }) => {
      const adminTestParam = { key: 'adminTestParam', value: 'adminTestParamValue' };
      const postResp = await createParam(apiClient, adminHeaders, adminTestParam);
      const getAllResp = await getParams(apiClient, adminHeaders);
      const getResp = await getParam(apiClient, adminHeaders, (postResp.body as ParamBody).id);

      expect((getResp.body as ParamBody).key).toBe(adminTestParam.key);
      expect((getResp.body as ParamBody).value).toBe(adminTestParam.value);
      (getAllResp.body as ParamBody[]).forEach((param) => {
        expectNotEmpty(param.value);
        expectNotEmpty(param.key);
      });
    });

    apiTest(
      'should NOT return values with custom role with ALL permissions',
      async ({ apiClient }) => {
        const allRoleParam = {
          key: 'syntheticsAllRoleParam',
          value: 'syntheticsAllRoleParamValue',
        };
        const postRes = await createParam(apiClient, allHeaders, allRoleParam);
        const getAllResp = await getParams(apiClient, allHeaders);
        const getResp = await getParam(apiClient, allHeaders, (postRes.body as ParamBody).id);

        (getAllResp.body as ParamBody[]).forEach((param) => {
          expect(param.value).toBeUndefined();
          expectNotEmpty(param.key);
        });
        expect((getResp.body as ParamBody).key).toBe(allRoleParam.key);
        expect((getResp.body as ParamBody).value).toBeUndefined();
      }
    );

    apiTest(
      'SHOULD RETURN values for custom role with ALL and read params subfeature privilege',
      async ({ apiClient }) => {
        const readParamsTestParam = {
          key: 'syntheticsReadParamsTestParam',
          value: 'syntheticsReadParamsTestParamValue',
        };
        const postRes = await createParam(apiClient, allWithReadParamsHeaders, readParamsTestParam);
        const getAllResp = await getParams(apiClient, allWithReadParamsHeaders);
        const getResp = await getParam(
          apiClient,
          allWithReadParamsHeaders,
          (postRes.body as ParamBody).id
        );

        (getAllResp.body as ParamBody[]).forEach((param) => {
          expectNotEmpty(param.value);
          expectNotEmpty(param.key);
        });
        expect((getResp.body as ParamBody).key).toBe(readParamsTestParam.key);
        expect((getResp.body as ParamBody).value).toBe(readParamsTestParam.value);
      }
    );

    apiTest(
      'SHOULD RETURN values for custom role with MINIMAL_ALL and read params subfeature privilege',
      async ({ apiClient }) => {
        const readParamsTestParam = {
          key: 'syntheticsReadParamsTestParam',
          value: 'syntheticsReadParamsTestParamValue',
        };
        const postRes = await createParam(
          apiClient,
          minimalAllWithReadParamsHeaders,
          readParamsTestParam
        );
        const getAllResp = await getParams(apiClient, minimalAllWithReadParamsHeaders);
        const getResp = await getParam(
          apiClient,
          minimalAllWithReadParamsHeaders,
          (postRes.body as ParamBody).id
        );

        (getAllResp.body as ParamBody[]).forEach((param) => {
          expectNotEmpty(param.value);
          expectNotEmpty(param.key);
        });
        expect((getResp.body as ParamBody).key).toBe(readParamsTestParam.key);
        expect((getResp.body as ParamBody).value).toBe(readParamsTestParam.value);
      }
    );

    apiTest(
      'SHOULD RETURN values for custom role with READ and read params subfeature privilege',
      async ({ apiClient }) => {
        const readParamsTestParam = {
          key: 'syntheticsReadParamsTestParam',
          value: 'syntheticsReadParamsTestParamValue',
        };
        // created by admin, read back by the read+read-params custom role
        const postRes = await createParam(apiClient, adminHeaders, readParamsTestParam);
        const getAllResp = await getParams(apiClient, readWithReadParamsHeaders);
        const getResp = await getParam(
          apiClient,
          readWithReadParamsHeaders,
          (postRes.body as ParamBody).id
        );

        (getAllResp.body as ParamBody[]).forEach((param) => {
          expectNotEmpty(param.value);
          expectNotEmpty(param.key);
        });
        expect((getResp.body as ParamBody).key).toBe(readParamsTestParam.key);
        expect((getResp.body as ParamBody).value).toBe(readParamsTestParam.value);
      }
    );

    apiTest('should handle bulk deleting params', async ({ apiClient }) => {
      const params = [
        { key: 'param1', value: 'value1' },
        { key: 'param2', value: 'value2' },
        { key: 'param3', value: 'value3' },
      ];
      for (const param of params) {
        await createParam(apiClient, allHeaders, param);
      }
      const getResponse = await getParams(apiClient, allHeaders);
      expect(getResponse.body as ParamBody[]).toHaveLength(3);

      const ids = (getResponse.body as ParamBody[]).map((param) => param.id);
      await bulkDeleteParams(apiClient, allHeaders, ids);

      const getResponseAfterDelete = await getParams(apiClient, allHeaders);
      expect(getResponseAfterDelete.body as ParamBody[]).toHaveLength(0);
    });

    apiTest('handles single parameter deletion', async ({ apiClient }) => {
      const postResp = await createParam(apiClient, allHeaders, {
        key: 'to-be-deleted',
        value: 'value',
      });
      const paramId = (postResp.body as ParamBody).id;

      const getResp = await getParam(apiClient, allHeaders, paramId);
      expect((getResp.body as ParamBody).key).toBe('to-be-deleted');

      await deleteParam(apiClient, allHeaders, paramId);
      await getParam(apiClient, allHeaders, paramId, { statusCode: 404 });
    });

    apiTest('returns a 409 conflict when creating a duplicate key', async ({ apiClient }) => {
      const param = { key: `duplicate-key-${uuidv4()}`, value: 'value1' };
      await createParam(apiClient, allHeaders, param);
      await createParam(apiClient, allHeaders, { ...param, value: 'value2' }, { statusCode: 409 });

      const getAllResp = await getParams(apiClient, allHeaders);
      const noDuplicates = (getAllResp.body as ParamBody[]).filter((p) => p.key === param.key);
      expect(noDuplicates).toHaveLength(1);
    });

    apiTest('returns 403 for a user with no synthetics privileges', async ({ apiClient }) => {
      await getParams(apiClient, noSyntheticsHeaders, { statusCode: 403 });
      await createParam(
        apiClient,
        noSyntheticsHeaders,
        { key: 'foo', value: 'bar' },
        { statusCode: 403 }
      );
      await updateParam(
        apiClient,
        noSyntheticsHeaders,
        'some-id',
        { key: 'foo', value: 'bar' },
        { statusCode: 403 }
      );
      await deleteParam(apiClient, noSyntheticsHeaders, 'some-id', { statusCode: 403 });
    });
  }
);
