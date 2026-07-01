/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { screen, waitFor, fireEvent } from '@testing-library/react';
import { licensingMock } from '@kbn/licensing-plugin/public/mocks';
import type { HttpFetchOptionsWithPath } from '@kbn/core/public';
import { setupEnvironment } from '../../helpers/setup_environment';
import { API_BASE_PATH } from '../../../common/constants';
import {
  getDefaultHotPhasePolicy,
  POLICY_WITH_INCLUDE_EXCLUDE,
  POLICY_WITH_KNOWN_AND_UNKNOWN_FIELDS,
  SNAPSHOT_POLICY_NAME,
} from '../constants';
import {
  createColdPhaseActions,
  createDeletePhaseActions,
  createFrozenPhaseActions,
  createHotPhaseActions,
  createWarmPhaseActions,
} from '../../helpers/actions/phases';
import { createFormSetValueAction } from '../../helpers/actions/form_set_value_action';
import { createRolloverActions } from '../../helpers/actions/rollover_actions';
import { createTogglePhaseAction } from '../../helpers/actions/toggle_phase_action';
import { renderEditPolicy } from '../../helpers/render_edit_policy';

describe('<EditPolicy /> serialization', () => {
  let httpSetup: ReturnType<typeof setupEnvironment>['httpSetup'];
  let httpRequestsMockHelpers: ReturnType<typeof setupEnvironment>['httpRequestsMockHelpers'];

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    ({ httpSetup, httpRequestsMockHelpers } = setupEnvironment());
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  const setupTest = async (options?: { isNewPolicy?: boolean; appServicesContext?: any }) => {
    renderEditPolicy(httpSetup, {
      appServicesContext: options?.appServicesContext,
      initialEntries: options?.isNewPolicy ? ['/policies/edit'] : undefined,
    });

    await screen.findByTestId('savePolicyButton');

    return {
      togglePhase: createTogglePhaseAction(),
      savePolicy: () => fireEvent.click(screen.getByTestId('savePolicyButton')),
      setPolicyName: createFormSetValueAction('policyNameField'),
      ...createRolloverActions(),
      ...createHotPhaseActions(),
      ...createWarmPhaseActions(),
      ...createColdPhaseActions(),
      ...createFrozenPhaseActions(),
      ...createDeletePhaseActions(),
      screen,
    };
  };

  describe('top level form', () => {
    /**
     * We assume that policies that populate this form are loaded directly from ES and so
     * are valid according to ES. There may be settings in the policy created through the ILM
     * API that the UI does not cater for, like the unfollow action. We do not want to overwrite
     * the configuration for these actions in the UI.
     */
    it('preserves policy settings it did not configure', async () => {
      httpRequestsMockHelpers.setLoadPolicies([POLICY_WITH_KNOWN_AND_UNKNOWN_FIELDS]);
      httpRequestsMockHelpers.setLoadSnapshotPolicies([]);
      httpRequestsMockHelpers.setListSnapshotRepos({ repositories: ['abc'] });
      httpRequestsMockHelpers.setListNodes({
        nodesByRoles: {},
        nodesByAttributes: { 'test:123': ['node-1'] },
        isUsingDeprecatedDataRoleConfig: false,
      });

      const actions = await setupTest();
      await actions.hot.setIndexPriority('99');

      await actions.savePolicy();
      await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

      expect(httpSetup.post).toHaveBeenLastCalledWith(
        `${API_BASE_PATH}/policies`,
        expect.objectContaining({
          body: JSON.stringify({
            foo: 'bar', // Made up value
            phases: {
              hot: {
                min_age: '0ms',
                actions: {
                  rollover: {
                    unknown_setting: 123, // Made up setting that should stay preserved
                    max_size: '50gb',
                  },
                  set_priority: {
                    priority: 99,
                  },
                },
              },
              warm: {
                min_age: '10d',
                actions: {
                  my_unfollow_action: {}, // Made up action
                  set_priority: {
                    priority: 22,
                    unknown_setting: true,
                  },
                },
              },
              delete: {
                min_age: '15d',
                actions: {
                  wait_for_snapshot: {
                    policy: SNAPSHOT_POLICY_NAME,
                  },
                  delete: {
                    delete_searchable_snapshot: true,
                  },
                },
              },
            },
            name: 'my_policy',
          }),
        })
      );
    }, 10000);

    it('default policy (only policy name input) on enterprise license', async () => {
      httpRequestsMockHelpers.setLoadPolicies([]);
      httpRequestsMockHelpers.setLoadSnapshotPolicies([]);
      httpRequestsMockHelpers.setListSnapshotRepos({ repositories: ['abc'] });
      httpRequestsMockHelpers.setListNodes({
        nodesByRoles: {},
        nodesByAttributes: { 'test:123': ['node-1'] },
        isUsingDeprecatedDataRoleConfig: false,
      });

      const actions = await setupTest({ isNewPolicy: true });
      await actions.setPolicyName('test_policy');
      await actions.savePolicy();
      await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

      expect(httpSetup.post).toHaveBeenLastCalledWith(
        `${API_BASE_PATH}/policies`,
        expect.objectContaining({
          body: JSON.stringify({
            name: 'test_policy',
            phases: {
              hot: {
                actions: {
                  rollover: {
                    max_age: '30d',
                    max_primary_shard_size: '50gb',
                  },
                  set_priority: {
                    priority: 100,
                  },
                },
                min_age: '0ms',
              },
            },
          }),
        })
      );
    });

    it('default policy (only policy name input) on basic license', async () => {
      httpRequestsMockHelpers.setLoadPolicies([]);
      httpRequestsMockHelpers.setLoadSnapshotPolicies([]);
      httpRequestsMockHelpers.setListSnapshotRepos({ repositories: ['abc'] });
      httpRequestsMockHelpers.setListNodes({
        nodesByRoles: {},
        nodesByAttributes: { 'test:123': ['node-1'] },
        isUsingDeprecatedDataRoleConfig: false,
      });

      const actions = await setupTest({
        isNewPolicy: true,
        appServicesContext: {
          license: licensingMock.createLicense({ license: { type: 'basic' } }),
        },
      });
      await actions.setPolicyName('test_policy');
      await actions.savePolicy();
      await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

      expect(httpSetup.post).toHaveBeenLastCalledWith(
        `${API_BASE_PATH}/policies`,
        expect.objectContaining({
          body: JSON.stringify({
            name: 'test_policy',
            phases: {
              hot: {
                actions: {
                  rollover: {
                    max_age: '30d',
                    max_primary_shard_size: '50gb',
                  },
                  set_priority: {
                    priority: 100,
                  },
                },
                min_age: '0ms',
              },
            },
          }),
        })
      );
    });
  });

  describe('hot phase', () => {
    let actions: Awaited<ReturnType<typeof setupTest>>;

    beforeEach(async () => {
      httpRequestsMockHelpers.setDefaultResponses();

      actions = await setupTest();
    });

    test('setting all values', async () => {
      await actions.rollover.setMaxSize('123', 'mb');
      await actions.rollover.setMaxDocs('123');
      await actions.rollover.setMaxAge('123', 'h');
      await actions.rollover.setMaxPrimaryShardDocs('123');
      await actions.rollover.setMinSize('12', 'mb');
      await actions.rollover.setMinDocs('12');
      await actions.rollover.setMinAge('12', 'h');
      await actions.rollover.setMinPrimaryShardDocs('12');
      await actions.rollover.setMinPrimaryShardSize('12', 'mb');
      actions.hot.toggleForceMerge();
      await actions.hot.setForcemergeSegmentsCount('123');
      actions.hot.setBestCompression(true);
      await actions.hot.setShrinkCount('2');
      await actions.hot.toggleAllowWriteAfterShrink();
      actions.hot.toggleReadonly();
      await actions.hot.setIndexPriority('123');

      await actions.savePolicy();
      await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

      expect(httpSetup.post).toHaveBeenLastCalledWith(
        `${API_BASE_PATH}/policies`,
        expect.objectContaining({
          body: JSON.stringify({
            name: 'my_policy',
            phases: {
              hot: {
                min_age: '0ms',
                actions: {
                  rollover: {
                    max_age: '123h',
                    max_primary_shard_size: '50gb',
                    max_size: '123mb',
                    max_docs: 123,
                    max_primary_shard_docs: 123,
                    min_size: '12mb',
                    min_docs: 12,
                    min_age: '12h',
                    min_primary_shard_docs: 12,
                    min_primary_shard_size: '12mb',
                  },
                  forcemerge: {
                    max_num_segments: 123,
                    index_codec: 'best_compression',
                  },
                  shrink: {
                    number_of_shards: 2,
                    allow_write_after_shrink: true,
                  },
                  set_priority: {
                    priority: 123,
                  },
                  readonly: {},
                },
              },
            },
          }),
        })
      );
    }, 15000);

    test('restoring recommended rollover defaults removes min values', async () => {
      await actions.rollover.setMinSize('12', 'mb');
      await actions.rollover.setMinDocs('12');
      await actions.rollover.setMinAge('12', 'h');
      await actions.rollover.setMinPrimaryShardDocs('12');
      await actions.rollover.setMinPrimaryShardSize('12', 'mb');

      actions.rollover.restoreRecommendedDefaults();

      await actions.savePolicy();
      await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

      const lastReq: HttpFetchOptionsWithPath[] = httpSetup.post.mock.calls.pop() || [];
      const [requestUrl, requestBody] = lastReq;
      const parsedReqBody = JSON.parse((requestBody as Record<string, any>).body);

      expect(requestUrl).toBe(`${API_BASE_PATH}/policies`);
      expect(parsedReqBody.phases.hot.actions.rollover).toEqual({
        max_age: '30d',
        max_primary_shard_size: '50gb',
      });
    });

    test('setting searchable snapshot', async () => {
      await actions.hot.setSearchableSnapshot('abc');

      await actions.savePolicy();
      await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

      const lastReq: HttpFetchOptionsWithPath[] = httpSetup.post.mock.calls.pop() || [];
      const [requestUrl, requestBody] = lastReq;
      const parsedReqBody = JSON.parse((requestBody as Record<string, any>).body);

      expect(requestUrl).toBe(`${API_BASE_PATH}/policies`);
      expect(parsedReqBody.phases.hot.actions.searchable_snapshot.snapshot_repository).toBe('abc');
    });

    // Setting downsample disables setting readonly so we test this separately
    test('setting downsample', async () => {
      actions.hot.downsample.toggle();
      await actions.hot.downsample.setDownsampleInterval('2', 'h');

      await actions.savePolicy();
      await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

      const lastReq: HttpFetchOptionsWithPath[] = httpSetup.post.mock.calls.pop() || [];
      const [requestUrl, requestBody] = lastReq;
      const parsedReqBody = JSON.parse((requestBody as Record<string, any>).body);

      expect(requestUrl).toBe(`${API_BASE_PATH}/policies`);
      expect(parsedReqBody.phases.hot.actions.downsample).toEqual({ fixed_interval: '2h' });
    });

    test('disabling rollover', async () => {
      actions.rollover.toggle();

      await actions.savePolicy();
      await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

      const lastReq: HttpFetchOptionsWithPath[] = httpSetup.post.mock.calls.pop() || [];
      const [requestUrl, requestBody] = lastReq;
      const parsedReqBody = JSON.parse((requestBody as Record<string, any>).body);

      const hotActions = parsedReqBody.phases.hot.actions;
      const rolloverAction = hotActions.rollover;

      expect(requestUrl).toBe(`${API_BASE_PATH}/policies`);
      expect(rolloverAction).toBe(undefined);
      expect(hotActions).toMatchInlineSnapshot(`Object {}`);
    });
  });

  describe('warm phase', () => {
    test('default values', async () => {
      httpRequestsMockHelpers.setDefaultResponses();

      const actions = await setupTest();
      await actions.togglePhase('warm');
      await actions.warm.setMinAgeValue('11');
      await actions.savePolicy();
      await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

      const lastReq: HttpFetchOptionsWithPath[] = httpSetup.post.mock.calls.pop() || [];
      const [requestUrl, requestBody] = lastReq;
      const parsedReqBody = JSON.parse((requestBody as Record<string, any>).body);

      expect(requestUrl).toBe(`${API_BASE_PATH}/policies`);
      expect(parsedReqBody.phases.warm).toMatchInlineSnapshot(`
          Object {
            "actions": Object {
              "set_priority": Object {
                "priority": 50,
              },
            },
            "min_age": "11d",
          }
        `);
    });

    test('setting all values', async () => {
      httpRequestsMockHelpers.setDefaultResponses();
      // Override with correct node attributes format (server returns 'key:value' as keys)
      httpRequestsMockHelpers.setListNodes({
        nodesByRoles: {},
        nodesByAttributes: { 'test:123': ['node-1'] },
        isUsingDeprecatedDataRoleConfig: false,
      });

      const actions = await setupTest();
      await actions.togglePhase('warm');
      await actions.warm.setMinAgeValue('11');
      await actions.warm.setDataAllocation('node_attrs');
      await actions.warm.setSelectedNodeAttribute('test:123');
      await actions.warm.setReplicas('123');
      await actions.warm.setShrinkCount('123');
      await actions.warm.toggleAllowWriteAfterShrink();
      actions.warm.toggleForceMerge();
      await actions.warm.setForcemergeSegmentsCount('123');
      actions.warm.setBestCompression(true);
      actions.warm.toggleReadonly();
      await actions.warm.setIndexPriority('123');
      await actions.savePolicy();
      await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

      expect(httpSetup.post).toHaveBeenLastCalledWith(
        `${API_BASE_PATH}/policies`,
        expect.objectContaining({
          body: JSON.stringify({
            name: 'my_policy',
            phases: {
              hot: {
                min_age: '0ms',
                actions: {
                  rollover: {
                    max_age: '30d',
                    max_primary_shard_size: '50gb',
                  },
                },
              },
              warm: {
                min_age: '11d',
                actions: {
                  set_priority: {
                    priority: 123,
                  },
                  shrink: {
                    number_of_shards: 123,
                    allow_write_after_shrink: true,
                  },
                  forcemerge: {
                    max_num_segments: 123,
                    index_codec: 'best_compression',
                  },
                  allocate: {
                    require: {
                      test: '123',
                    },
                    number_of_replicas: 123,
                  },
                  readonly: {},
                },
              },
            },
          }),
        })
      );
    }, 15000);

    // Setting downsample disables setting readonly so we test this separately
    test('setting downsample', async () => {
      httpRequestsMockHelpers.setDefaultResponses();

      const actions = await setupTest();
      await actions.togglePhase('warm');
      await actions.warm.setMinAgeValue('11');
      actions.warm.downsample.toggle();
      await actions.warm.downsample.setDownsampleInterval('20', 'm');

      await actions.savePolicy();
      await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

      const lastReq: HttpFetchOptionsWithPath[] = httpSetup.post.mock.calls.pop() || [];
      const [requestUrl, requestBody] = lastReq;
      const parsedReqBody = JSON.parse((requestBody as Record<string, any>).body);

      expect(requestUrl).toBe(`${API_BASE_PATH}/policies`);
      expect(parsedReqBody.phases.warm.actions.downsample).toEqual({ fixed_interval: '20m' });
    }, 10000);

    describe('policy with include and exclude', () => {
      test('preserves include, exclude allocation settings', async () => {
        httpRequestsMockHelpers.setLoadPolicies([POLICY_WITH_INCLUDE_EXCLUDE]);
        httpRequestsMockHelpers.setLoadSnapshotPolicies([]);
        httpRequestsMockHelpers.setListSnapshotRepos({ repositories: ['abc'] });
        httpRequestsMockHelpers.setListNodes({
          nodesByRoles: {},
          nodesByAttributes: { 'test:123': ['node-1'] },
          isUsingDeprecatedDataRoleConfig: false,
        });

        const actions = await setupTest();
        await actions.warm.setDataAllocation('node_attrs');
        await actions.warm.setSelectedNodeAttribute('test:123');
        await actions.savePolicy();
        await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

        const lastReq: HttpFetchOptionsWithPath[] = httpSetup.post.mock.calls.pop() || [];
        const [requestUrl, requestBody] = lastReq;
        const parsedReqBody = JSON.parse((requestBody as Record<string, any>).body);

        const warmPhaseAllocate = parsedReqBody.phases.warm.actions.allocate;

        expect(requestUrl).toBe(`${API_BASE_PATH}/policies`);
        expect(warmPhaseAllocate).toMatchInlineSnapshot(`
          Object {
            "exclude": Object {
              "def": "456",
            },
            "include": Object {
              "abc": "123",
            },
            "require": Object {
              "test": "123",
            },
          }
        `);
      });
    });
  });

  describe('cold phase', () => {
    test('default values', async () => {
      httpRequestsMockHelpers.setDefaultResponses();

      const actions = await setupTest();
      await actions.togglePhase('cold');
      await actions.cold.setMinAgeValue('11');
      await actions.savePolicy();
      await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

      const lastReq: HttpFetchOptionsWithPath[] = httpSetup.post.mock.calls.pop() || [];
      const [requestUrl, requestBody] = lastReq;
      const parsedReqBody = JSON.parse((requestBody as Record<string, any>).body);

      expect(requestUrl).toBe(`${API_BASE_PATH}/policies`);
      expect(parsedReqBody.phases.cold).toMatchInlineSnapshot(`
          Object {
            "actions": Object {
              "set_priority": Object {
                "priority": 0,
              },
            },
            "min_age": "11d",
          }
        `);
    });

    test('setting all values, excluding searchable snapshot', async () => {
      httpRequestsMockHelpers.setDefaultResponses();
      // Override with correct node attributes format (server returns 'key:value' as keys)
      httpRequestsMockHelpers.setListNodes({
        nodesByRoles: {},
        nodesByAttributes: { 'test:123': ['node-1'] },
        isUsingDeprecatedDataRoleConfig: false,
      });

      const actions = await setupTest();
      await actions.togglePhase('cold');
      await actions.cold.setMinAgeValue('123');
      await actions.cold.setMinAgeUnits('h');
      await actions.cold.setDataAllocation('node_attrs');
      await actions.cold.setSelectedNodeAttribute('test:123');
      await actions.cold.setReplicas('123');
      actions.cold.toggleReadonly();
      await actions.cold.setIndexPriority('123');

      await actions.savePolicy();
      await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

      expect(httpSetup.post).toHaveBeenLastCalledWith(
        `${API_BASE_PATH}/policies`,
        expect.objectContaining({
          body: JSON.stringify({
            name: 'my_policy',
            phases: {
              hot: {
                min_age: '0ms',
                actions: {
                  rollover: {
                    max_age: '30d',
                    max_primary_shard_size: '50gb',
                  },
                },
              },
              cold: {
                min_age: '123h',
                actions: {
                  set_priority: {
                    priority: 123,
                  },
                  allocate: {
                    require: {
                      test: '123',
                    },
                    number_of_replicas: 123,
                  },
                  readonly: {},
                },
              },
            },
          }),
        })
      );
    }, 15000);

    // Setting downsample disables setting readonly so we test this separately
    test('setting downsample', async () => {
      httpRequestsMockHelpers.setDefaultResponses();

      const actions = await setupTest();
      await actions.togglePhase('cold');
      await actions.cold.setMinAgeValue('11');
      actions.cold.downsample.toggle();
      await actions.cold.downsample.setDownsampleInterval('2');

      await actions.savePolicy();
      await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

      const lastReq: HttpFetchOptionsWithPath[] = httpSetup.post.mock.calls.pop() || [];
      const [requestUrl, requestBody] = lastReq;
      const parsedReqBody = JSON.parse((requestBody as Record<string, any>).body);

      expect(requestUrl).toBe(`${API_BASE_PATH}/policies`);
      expect(parsedReqBody.phases.cold.actions.downsample).toEqual({ fixed_interval: '2d' });
    });

    // Setting searchable snapshot field disables setting replicas so we test this separately
    test('setting searchable snapshot', async () => {
      httpRequestsMockHelpers.setDefaultResponses();

      const actions = await setupTest();

      await actions.togglePhase('cold');
      await screen.findByTestId('cold-phase');
      await actions.cold.setMinAgeValue('10');
      await actions.cold.setSearchableSnapshot('my-repo');
      await actions.savePolicy();
      await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

      const lastReq: HttpFetchOptionsWithPath[] = httpSetup.post.mock.calls.pop() || [];
      const [requestUrl, requestBody] = lastReq;
      const parsedReqBody = JSON.parse((requestBody as Record<string, any>).body);

      expect(requestUrl).toBe(`${API_BASE_PATH}/policies`);
      expect(parsedReqBody.phases.cold.actions.searchable_snapshot.snapshot_repository).toEqual(
        'my-repo'
      );
    }, 15000);
  });

  describe('frozen phase', () => {
    test('default value', async () => {
      httpRequestsMockHelpers.setDefaultResponses();

      const actions = await setupTest({
        appServicesContext: {
          license: licensingMock.createLicense({ license: { type: 'enterprise' } }),
        },
      });
      await actions.togglePhase('frozen');

      await screen.findByTestId('frozen-phase');

      await actions.frozen.setMinAgeValue('13');
      await actions.frozen.setSearchableSnapshot('myRepo');

      await actions.savePolicy();
      await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

      const lastReq: HttpFetchOptionsWithPath[] = httpSetup.post.mock.calls.pop() || [];
      const [requestUrl, requestBody] = lastReq;
      const parsedReqBody = JSON.parse((requestBody as Record<string, any>).body);

      expect(requestUrl).toBe(`${API_BASE_PATH}/policies`);
      expect(parsedReqBody.phases.frozen).toEqual({
        min_age: '13d',
        actions: {
          searchable_snapshot: { snapshot_repository: 'myRepo' },
        },
      });
    }, 10000);

    describe('deserialization', () => {
      test('default value', async () => {
        const policyToEdit = getDefaultHotPhasePolicy();
        policyToEdit.policy.phases.frozen = {
          min_age: '1234m',
          actions: { searchable_snapshot: { snapshot_repository: 'myRepo' } },
        };

        httpRequestsMockHelpers.setLoadPolicies([policyToEdit]);
        httpRequestsMockHelpers.setLoadSnapshotPolicies([]);
        httpRequestsMockHelpers.setListSnapshotRepos({ repositories: ['abc'] });
        httpRequestsMockHelpers.setListNodes({
          nodesByRoles: {},
          nodesByAttributes: { 'test:123': ['node-1'] },
          isUsingDeprecatedDataRoleConfig: false,
        });

        const actions = await setupTest();
        await actions.savePolicy();
        await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

        const lastReq: HttpFetchOptionsWithPath[] = httpSetup.post.mock.calls.pop() || [];
        const [requestUrl, requestBody] = lastReq;
        const parsedReqBody = JSON.parse((requestBody as Record<string, any>).body);

        expect(requestUrl).toBe(`${API_BASE_PATH}/policies`);
        expect(parsedReqBody.phases.frozen).toEqual({
          min_age: '1234m',
          actions: {
            searchable_snapshot: {
              snapshot_repository: 'myRepo',
            },
          },
        });
      });
    });
  });

  describe('delete phase', () => {
    test('default value', async () => {
      httpRequestsMockHelpers.setDefaultResponses();

      const actions = await setupTest();
      await actions.togglePhase('delete');
      actions.delete.setSnapshotPolicy('test');
      await actions.savePolicy();
      await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

      const lastReq: HttpFetchOptionsWithPath[] = httpSetup.post.mock.calls.pop() || [];
      const [requestUrl, requestBody] = lastReq;
      const parsedReqBody = JSON.parse((requestBody as Record<string, any>).body);

      expect(requestUrl).toBe(`${API_BASE_PATH}/policies`);
      expect(parsedReqBody.phases.delete).toEqual({
        min_age: '365d',
        actions: {
          delete: {
            delete_searchable_snapshot: true,
          },
          wait_for_snapshot: {
            policy: 'test',
          },
        },
      });
    });
  });

  describe('shrink', () => {
    test('shrink shard size', async () => {
      httpRequestsMockHelpers.setDefaultResponses();

      const actions = await setupTest();
      await actions.hot.setShrinkSize('50');

      await actions.togglePhase('warm');
      await actions.warm.setMinAgeValue('11');
      await actions.warm.setShrinkSize('100');
      await actions.warm.toggleAllowWriteAfterShrink();

      await actions.savePolicy();
      await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

      expect(httpSetup.post).toHaveBeenLastCalledWith(
        `${API_BASE_PATH}/policies`,
        expect.objectContaining({
          body: JSON.stringify({
            name: 'my_policy',
            phases: {
              hot: {
                min_age: '0ms',
                actions: {
                  rollover: {
                    max_age: '30d',
                    max_primary_shard_size: '50gb',
                  },
                  shrink: {
                    allow_write_after_shrink: false,
                    max_primary_shard_size: '50gb',
                  },
                },
              },
              warm: {
                min_age: '11d',
                actions: {
                  set_priority: {
                    priority: 50,
                  },
                  shrink: {
                    allow_write_after_shrink: true,
                    max_primary_shard_size: '100gb',
                  },
                },
              },
            },
          }),
        })
      );
    }, 10000);
  });
});
