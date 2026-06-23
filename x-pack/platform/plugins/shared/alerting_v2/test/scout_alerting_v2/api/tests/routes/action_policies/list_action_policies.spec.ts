/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/api';
import type { RoleApiCredentials } from '@kbn/scout';
import {
  ACTION_POLICY_PER_PAGE_MAX,
  ACTION_POLICY_SEARCH_MAX_LENGTH,
  ACTION_POLICY_TAG_MAX_LENGTH,
  ACTION_POLICY_TAGS_MAX_COUNT,
  ALERTING_V2_ACTION_POLICIES_ALL_ROLE,
  ALERTING_V2_ACTION_POLICIES_READ_ROLE,
  apiTest,
  buildCreateActionPolicyData,
  getListActionPoliciesUrl,
  NO_ACCESS_ROLE,
  testData,
  type AlertingApiServicesFixture,
} from '../../../fixtures';

const createActionPolicies = async (apiServices: AlertingApiServicesFixture) => {
  const alpha = await apiServices.alertingV2.actionPolicies.create(
    buildCreateActionPolicyData({
      name: 'Alpha Policy',
      description: 'Monitors CPU usage',
      destinations: [{ type: 'workflow', id: 'wf-alpha-001' }],
      tags: ['production', 'critical'],
    })
  );
  const beta = await apiServices.alertingV2.actionPolicies.create(
    buildCreateActionPolicyData({
      name: 'Beta Policy',
      description: 'Tracks memory alerts',
      destinations: [{ type: 'workflow', id: 'wf-beta-002' }],
      tags: ['staging'],
    })
  );
  const gamma = await apiServices.alertingV2.actionPolicies.create(
    buildCreateActionPolicyData({
      name: 'Gamma Policy',
      description: 'Monitors disk space',
      destinations: [{ type: 'workflow', id: 'wf-gamma-003' }],
    })
  );
  return { alpha, beta, gamma };
};

apiTest.describe('List action policies API', { tag: '@local-stateful-classic' }, () => {
  let readerHeaders: Record<string, string>;

  apiTest.beforeAll(async ({ requestAuth }) => {
    const readerCredentials: RoleApiCredentials = await requestAuth.getApiKeyForCustomRole(
      ALERTING_V2_ACTION_POLICIES_READ_ROLE
    );
    readerHeaders = { ...readerCredentials.apiKeyHeader };
  });

  apiTest.beforeEach(async ({ apiServices }) => {
    await apiServices.alertingV2.actionPolicies.cleanUp();
  });

  apiTest.afterAll(async ({ apiServices }) => {
    await apiServices.alertingV2.actionPolicies.cleanUp();
  });

  apiTest(
    'list: returns empty list with documented defaults when no policies exist',
    async ({ apiClient }) => {
      const response = await apiClient.get(getListActionPoliciesUrl(), {
        headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body.items).toStrictEqual([]);
      expect(response.body.total).toBe(0);
      expect(response.body.page).toBe(1);
      expect(response.body.perPage).toBe(20);
    }
  );

  apiTest(
    'list: returns created policies with full schema fields per item',
    async ({ apiClient, apiServices }) => {
      await apiServices.alertingV2.actionPolicies.create(
        buildCreateActionPolicyData({ name: 'policy-1' })
      );
      await apiServices.alertingV2.actionPolicies.create(
        buildCreateActionPolicyData({ name: 'policy-2' })
      );

      const response = await apiClient.get(getListActionPoliciesUrl(), {
        headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body.total).toBe(2);
      expect(response.body.items).toHaveLength(2);

      const expectedShape = {
        description: 'Scout action policy',
        destinations: [{ type: 'workflow', id: 'scout-workflow-id' }],
        enabled: true,
        matcher: null,
        groupBy: null,
        tags: null,
        groupingMode: null,
        throttle: null,
        snoozedUntil: null,
      };

      const itemsByName = new Map(
        response.body.items.map((item: { name: string }) => [item.name, item])
      );

      for (const name of ['policy-1', 'policy-2']) {
        const item = itemsByName.get(name);
        expect(item).toMatchObject({ name, ...expectedShape });
      }
    }
  );

  apiTest('pagination: paginates with page+perPage', async ({ apiClient, apiServices }) => {
    await apiServices.alertingV2.actionPolicies.create(
      buildCreateActionPolicyData({ name: 'page-policy-1' })
    );
    await apiServices.alertingV2.actionPolicies.create(
      buildCreateActionPolicyData({ name: 'page-policy-2' })
    );
    await apiServices.alertingV2.actionPolicies.create(
      buildCreateActionPolicyData({ name: 'page-policy-3' })
    );

    const firstPage = await apiClient.get(getListActionPoliciesUrl({ page: 1, perPage: 2 }), {
      headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
    });
    expect(firstPage).toHaveStatusCode(200);
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.total).toBe(3);
    expect(firstPage.body.page).toBe(1);
    expect(firstPage.body.perPage).toBe(2);

    const secondPage = await apiClient.get(getListActionPoliciesUrl({ page: 2, perPage: 2 }), {
      headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
    });
    expect(secondPage).toHaveStatusCode(200);
    expect(secondPage.body.items).toHaveLength(1);
    expect(secondPage.body.total).toBe(3);
    expect(secondPage.body.page).toBe(2);
    expect(secondPage.body.perPage).toBe(2);
  });

  apiTest('search: matches by name', async ({ apiClient, apiServices }) => {
    await createActionPolicies(apiServices);

    const response = await apiClient.get(getListActionPoliciesUrl({ search: 'Alpha' }), {
      headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
    });
    expect(response).toHaveStatusCode(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].name).toBe('Alpha Policy');
  });

  apiTest('search: matches by description', async ({ apiClient, apiServices }) => {
    await createActionPolicies(apiServices);

    const response = await apiClient.get(getListActionPoliciesUrl({ search: 'memory' }), {
      headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
    });
    expect(response).toHaveStatusCode(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].name).toBe('Beta Policy');
  });

  apiTest(
    'search: returns multiple matching items for partial term',
    async ({ apiClient, apiServices }) => {
      await createActionPolicies(apiServices);

      const response = await apiClient.get(getListActionPoliciesUrl({ search: 'Monitors' }), {
        headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
      });
      expect(response).toHaveStatusCode(200);
      expect(response.body.total).toBe(2);
      const names = response.body.items.map((item: { name: string }) => item.name);
      expect(names).toContain('Alpha Policy');
      expect(names).toContain('Gamma Policy');
    }
  );

  apiTest(
    'search: returns empty result for non-matching term',
    async ({ apiClient, apiServices }) => {
      await createActionPolicies(apiServices);

      const response = await apiClient.get(getListActionPoliciesUrl({ search: 'nonexistent' }), {
        headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
      });
      expect(response).toHaveStatusCode(200);
      expect(response.body.total).toBe(0);
      expect(response.body.items).toStrictEqual([]);
    }
  );

  apiTest('filter: by enabled=true and enabled=false', async ({ apiClient, apiServices }) => {
    const { alpha } = await createActionPolicies(apiServices);
    await apiServices.alertingV2.actionPolicies.disable(alpha.id);

    const enabledResponse = await apiClient.get(getListActionPoliciesUrl({ enabled: 'true' }), {
      headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
    });
    expect(enabledResponse).toHaveStatusCode(200);
    expect(enabledResponse.body.total).toBe(2);
    const enabledNames = enabledResponse.body.items.map((item: { name: string }) => item.name);
    expect(enabledNames).not.toContain('Alpha Policy');

    const disabledResponse = await apiClient.get(getListActionPoliciesUrl({ enabled: 'false' }), {
      headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
    });
    expect(disabledResponse).toHaveStatusCode(200);
    expect(disabledResponse.body.total).toBe(1);
    expect(disabledResponse.body.items[0].name).toBe('Alpha Policy');
  });

  apiTest('filter by tags: by a single tag (string)', async ({ apiClient, apiServices }) => {
    await createActionPolicies(apiServices);

    const response = await apiClient.get(getListActionPoliciesUrl({ tags: 'production' }), {
      headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
    });
    expect(response).toHaveStatusCode(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].name).toBe('Alpha Policy');
    expect(response.body.items[0].tags).toStrictEqual(['production', 'critical']);
  });

  apiTest('filter by tags: by multiple tags (array)', async ({ apiClient, apiServices }) => {
    await createActionPolicies(apiServices);

    const response = await apiClient.get(
      getListActionPoliciesUrl({ tags: ['production', 'staging'] }),
      {
        headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
      }
    );
    expect(response).toHaveStatusCode(200);
    expect(response.body.total).toBe(2);
    const names = response.body.items.map((item: { name: string }) => item.name);
    expect(names).toContain('Alpha Policy');
    expect(names).toContain('Beta Policy');
  });

  apiTest(
    'filter by tags: returns empty when no policies match',
    async ({ apiClient, apiServices }) => {
      await createActionPolicies(apiServices);

      const response = await apiClient.get(getListActionPoliciesUrl({ tags: 'nonexistent' }), {
        headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
      });
      expect(response).toHaveStatusCode(200);
      expect(response.body.total).toBe(0);
      expect(response.body.items).toStrictEqual([]);
    }
  );

  apiTest(
    'filter by tags: accepts a single tag wrapped in array',
    async ({ apiClient, apiServices }) => {
      await createActionPolicies(apiServices);

      const response = await apiClient.get(getListActionPoliciesUrl({ tags: ['staging'] }), {
        headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
      });
      expect(response).toHaveStatusCode(200);
      expect(response.body.total).toBe(1);
      expect(response.body.items[0].name).toBe('Beta Policy');
    }
  );

  apiTest('sort: by name ascending', async ({ apiClient, apiServices }) => {
    await createActionPolicies(apiServices);

    const response = await apiClient.get(
      getListActionPoliciesUrl({ sortField: 'name', sortOrder: 'asc' }),
      {
        headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
      }
    );
    expect(response).toHaveStatusCode(200);
    const names = response.body.items.map((item: { name: string }) => item.name);
    expect(names).toStrictEqual(['Alpha Policy', 'Beta Policy', 'Gamma Policy']);
  });

  apiTest('sort: by name descending', async ({ apiClient, apiServices }) => {
    await createActionPolicies(apiServices);

    const response = await apiClient.get(
      getListActionPoliciesUrl({ sortField: 'name', sortOrder: 'desc' }),
      {
        headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
      }
    );
    expect(response).toHaveStatusCode(200);
    const names = response.body.items.map((item: { name: string }) => item.name);
    expect(names).toStrictEqual(['Gamma Policy', 'Beta Policy', 'Alpha Policy']);
  });

  apiTest('sort: by createdAt ascending', async ({ apiClient, apiServices }) => {
    await createActionPolicies(apiServices);

    const response = await apiClient.get(
      getListActionPoliciesUrl({ sortField: 'createdAt', sortOrder: 'asc' }),
      {
        headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
      }
    );
    expect(response).toHaveStatusCode(200);
    expect(response.body.items).toHaveLength(3);
    expect(response.body.items[0].name).toBe('Alpha Policy');
    expect(response.body.items[2].name).toBe('Gamma Policy');
  });

  apiTest('sort: by createdAt descending', async ({ apiClient, apiServices }) => {
    await createActionPolicies(apiServices);

    const response = await apiClient.get(
      getListActionPoliciesUrl({ sortField: 'createdAt', sortOrder: 'desc' }),
      {
        headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
      }
    );
    expect(response).toHaveStatusCode(200);
    expect(response.body.items).toHaveLength(3);
    expect(response.body.items[0].name).toBe('Gamma Policy');
    expect(response.body.items[2].name).toBe('Alpha Policy');
  });

  apiTest('combined: search + sort', async ({ apiClient, apiServices }) => {
    await createActionPolicies(apiServices);

    const response = await apiClient.get(
      getListActionPoliciesUrl({ search: 'Monitors', sortField: 'name', sortOrder: 'asc' }),
      { headers: { ...testData.COMMON_HEADERS, ...readerHeaders } }
    );
    expect(response).toHaveStatusCode(200);
    expect(response.body.total).toBe(2);
    const names = response.body.items.map((item: { name: string }) => item.name);
    expect(names).toStrictEqual(['Alpha Policy', 'Gamma Policy']);
  });

  apiTest('combined: search + pagination', async ({ apiClient, apiServices }) => {
    await createActionPolicies(apiServices);

    const response = await apiClient.get(
      getListActionPoliciesUrl({ search: 'Policy', perPage: 2, page: 1 }),
      {
        headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
      }
    );
    expect(response).toHaveStatusCode(200);
    expect(response.body.total).toBe(3);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.page).toBe(1);
    expect(response.body.perPage).toBe(2);
  });

  apiTest('validation: rejects page=0', async ({ apiClient }) => {
    const response = await apiClient.get(getListActionPoliciesUrl({ page: 0 }), {
      headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
    });
    expect(response).toHaveStatusCode(400);
  });

  apiTest('validation: rejects perPage=0', async ({ apiClient }) => {
    const response = await apiClient.get(getListActionPoliciesUrl({ perPage: 0 }), {
      headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
    });
    expect(response).toHaveStatusCode(400);
  });

  apiTest('validation: rejects perPage over the maximum', async ({ apiClient }) => {
    const response = await apiClient.get(
      getListActionPoliciesUrl({ perPage: ACTION_POLICY_PER_PAGE_MAX + 1 }),
      {
        headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
      }
    );
    expect(response).toHaveStatusCode(400);
  });

  apiTest('validation: rejects empty search', async ({ apiClient }) => {
    const response = await apiClient.get(getListActionPoliciesUrl({ search: '' }), {
      headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
    });
    expect(response).toHaveStatusCode(400);
  });

  apiTest('validation: rejects search over the maximum length', async ({ apiClient }) => {
    const response = await apiClient.get(
      getListActionPoliciesUrl({ search: 'a'.repeat(ACTION_POLICY_SEARCH_MAX_LENGTH + 1) }),
      {
        headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
      }
    );
    expect(response).toHaveStatusCode(400);
  });

  apiTest('validation: rejects unknown enabled value', async ({ apiClient }) => {
    const response = await apiClient.get(getListActionPoliciesUrl({ enabled: 'maybe' }), {
      headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
    });
    expect(response).toHaveStatusCode(400);
  });

  apiTest('validation: rejects unknown sortField', async ({ apiClient }) => {
    const response = await apiClient.get(getListActionPoliciesUrl({ sortField: 'description' }), {
      headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
    });
    expect(response).toHaveStatusCode(400);
  });

  apiTest('validation: rejects unknown sortOrder', async ({ apiClient }) => {
    const response = await apiClient.get(getListActionPoliciesUrl({ sortOrder: 'sideways' }), {
      headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
    });
    expect(response).toHaveStatusCode(400);
  });

  apiTest('validation: rejects more than the maximum number of tags', async ({ apiClient }) => {
    const tooManyTags = Array.from(
      { length: ACTION_POLICY_TAGS_MAX_COUNT + 1 },
      (_, i) => `tag-${i}`
    );
    const response = await apiClient.get(getListActionPoliciesUrl({ tags: tooManyTags }), {
      headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
    });
    expect(response).toHaveStatusCode(400);
  });

  apiTest('validation: rejects tag over the maximum length', async ({ apiClient }) => {
    const response = await apiClient.get(
      getListActionPoliciesUrl({ tags: 'a'.repeat(ACTION_POLICY_TAG_MAX_LENGTH + 1) }),
      {
        headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
      }
    );
    expect(response).toHaveStatusCode(400);
  });

  apiTest('authorization: 200 with read-only alerting_v2 privileges', async ({ apiClient }) => {
    const response = await apiClient.get(getListActionPoliciesUrl(), {
      headers: { ...testData.COMMON_HEADERS, ...readerHeaders },
    });
    expect(response).toHaveStatusCode(200);
  });

  apiTest(
    'authorization: 200 with full alerting_v2 privileges',
    async ({ apiClient, requestAuth }) => {
      const writerCredentials = await requestAuth.getApiKeyForCustomRole(
        ALERTING_V2_ACTION_POLICIES_ALL_ROLE
      );
      const response = await apiClient.get(getListActionPoliciesUrl(), {
        headers: { ...testData.COMMON_HEADERS, ...writerCredentials.apiKeyHeader },
      });
      expect(response).toHaveStatusCode(200);
    }
  );

  apiTest(
    'authorization: 403 without alerting_v2 privileges',
    async ({ apiClient, requestAuth }) => {
      const noAccessCredentials = await requestAuth.getApiKeyForCustomRole(NO_ACCESS_ROLE);
      const response = await apiClient.get(getListActionPoliciesUrl(), {
        headers: { ...testData.COMMON_HEADERS, ...noAccessCredentials.apiKeyHeader },
      });
      expect(response).toHaveStatusCode(403);
    }
  );
});
