/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment-timezone';
import { v4 as uuidv4 } from 'uuid';
import { set } from '@kbn/safer-lodash-set';
import {
  unset,
  has,
  difference,
  filter,
  map,
  mapKeys,
  mapValues,
  uniq,
  some,
  isEmpty,
  keyBy,
} from 'lodash';
import { produce } from 'immer';
import type { PackagePolicy } from '@kbn/fleet-plugin/common';
import {
  LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
  PACKAGE_POLICY_SAVED_OBJECT_TYPE,
} from '@kbn/fleet-plugin/common';
import { type IRouter, SavedObjectsErrorHelpers } from '@kbn/core/server';

import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { createInternalSavedObjectsClientForSpaceId } from '../../utils/get_internal_saved_object_client';
import type {
  UpdatePacksRequestParamsSchema,
  UpdatePacksRequestBodySchema,
} from '../../../common/api';
import { buildRouteValidation } from '../../utils/build_validation/route_validation';
import { API_VERSIONS } from '../../../common/constants';
import { OSQUERY_INTEGRATION_NAME } from '../../../common';
import type { RRuleScheduleConfig } from '../../../common';
import { packSavedObjectType } from '../../../common/types';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import type { StartPlugins } from '../../types';
import { PLUGIN_ID } from '../../../common';
import {
  convertSOQueriesToPack,
  convertPackQueriesToSO,
  convertSOQueriesToPackConfig,
  getInitialPolicies,
  findMatchingShards,
  policyHasPack,
  removePackFromPolicy,
  makePackKey,
  validatePackScheduleFields,
  resolvePackScheduleForUpdate,
  buildScheduleResponseSlice,
  stripPerQueryRruleFields,
  stripPriorModePerQueryFields,
} from './utils';

import { convertShardsToArray, convertShardsToObject } from '../utils';
import type { PackSavedObject } from '../../common/types';
import type { PackResponseData } from './types';
import type { PackQueryInput } from './utils';
import { updatePacksRequestBodySchema, updatePacksRequestParamsSchema } from '../../../common/api';
import { getUserInfo } from '../../lib/get_user_info';
import { escapeFilterValue } from '../utils/generate_copy_name';
import { updatePackResponseSchema } from './response_schemas';

export const updatePackRoute = (router: IRouter, osqueryContext: OsqueryAppContext) => {
  router.versioned
    .put({
      access: 'public',
      path: '/api/osquery/packs/{id}',
      security: {
        authz: {
          requiredPrivileges: [`${PLUGIN_ID}-writePacks`],
        },
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: {
            params: buildRouteValidation<
              typeof updatePacksRequestParamsSchema,
              UpdatePacksRequestParamsSchema
            >(updatePacksRequestParamsSchema),
            body: buildRouteValidation<
              typeof updatePacksRequestBodySchema,
              UpdatePacksRequestBodySchema
            >(updatePacksRequestBodySchema),
          },
          response: {
            200: {
              body: () => updatePackResponseSchema,
            },
          },
        },
      },
      async (context, request, response) => {
        const coreContext = await context.core;
        const esClient = coreContext.elasticsearch.client.asCurrentUser;

        const spaceScopedClient = await createInternalSavedObjectsClientForSpaceId(
          osqueryContext,
          request
        );

        const spaceId = osqueryContext?.service?.getActiveSpace
          ? (await osqueryContext.service.getActiveSpace(request))?.id || DEFAULT_SPACE_ID
          : DEFAULT_SPACE_ID;

        const agentPolicyService = osqueryContext.service.getAgentPolicyService();
        const packagePolicyService = osqueryContext.service.getPackagePolicyService();

        const [, startPlugins] = await osqueryContext.getStartServices();
        const currentUser = await getUserInfo({
          request,
          security: (startPlugins as StartPlugins).security,
          logger: osqueryContext.logFactory.get('pack'),
        });
        const username = currentUser?.username ?? undefined;
        const profileUid = currentUser?.profile_uid ?? undefined;

        const isRruleFeatureEnabled = osqueryContext.experimentalFeatures.rruleScheduling;

        const {
          name,
          description,
          queries: rawQueries,
          enabled,
          policy_ids,
          shards = {},
          schedule_type: rawScheduleType,
          interval: rawInterval,
          rrule_schedule: rawRruleSchedule,
        } = request.body;

        // Request-boundary feature-flag gate. Any RRULE-shaped field on the
        // body is considered "present" only when the flag is on; the wire-
        // boundary gate handles the read/Fleet-push side independently.
        const scheduleTypePresent = isRruleFeatureEnabled && rawScheduleType !== undefined;
        const intervalPresent = isRruleFeatureEnabled && rawInterval !== undefined;
        const rruleSchedulePresent = isRruleFeatureEnabled && rawRruleSchedule !== undefined;

        const gatedQueries: Record<string, PackQueryInput> | undefined = isRruleFeatureEnabled
          ? (rawQueries as Record<string, PackQueryInput> | undefined)
          : rawQueries
          ? (mapValues(rawQueries, (rawQuery) => {
              const {
                schedule_type: _scheduleType,
                rrule_schedule: _rruleSchedule,
                ...rest
              } = rawQuery as PackQueryInput;

              return rest;
            }) as Record<string, PackQueryInput>)
          : undefined;

        let currentPackSO;
        try {
          currentPackSO = await spaceScopedClient.get<PackSavedObject>(
            packSavedObjectType,
            request.params.id
          );
        } catch (err) {
          if (SavedObjectsErrorHelpers.isNotFoundError(err)) {
            return response.notFound({
              body: { message: `Pack ${request.params.id} not found` },
            });
          }

          throw err;
        }

        const existingScheduleIds = keyBy(
          (currentPackSO.attributes.queries ?? []).filter(
            (existingQuery: { id: string; schedule_id?: string }) => existingQuery.schedule_id
          ),
          'id'
        );

        // Broader index of every current SO query (regardless of
        // `schedule_id` presence) — used to merge partial per-query
        // `rrule_schedule` payloads against the existing per-query rrule
        // on same-mode override edits. Without this, sending only
        // `{ rrule_schedule: { rrule: '...' } }` on one query would
        // overwrite its `start_date` / `splay` on the SO.
        const existingQueriesById = keyBy(currentPackSO.attributes.queries ?? [], 'id') as Record<
          string,
          { rrule_schedule?: PackQueryInput['rrule_schedule'] }
        >;

        const resolved = resolvePackScheduleForUpdate({
          current: {
            schedule_type: currentPackSO.attributes.schedule_type,
            interval: currentPackSO.attributes.interval,
            rrule_schedule: currentPackSO.attributes.rrule_schedule,
          },
          request: {
            schedule_type: rawScheduleType,
            interval: rawInterval,
            rrule_schedule: rawRruleSchedule,
            scheduleTypePresent,
            intervalPresent,
            rruleSchedulePresent,
          },
          isRruleFeatureEnabled,
        });

        const now = moment().toISOString();

        // On a pack-mode transition the request typically doesn't restate
        // `queries`, but the SO carries per-query fields from the prior mode
        // (e.g. `fast.interval: 30` from an old interval pack). Without a
        // rewrite those fields stay on the SO and surface via GET/find,
        // leaking cross-mode state. Hydrate from the current SO when the
        // request omits `queries`, then strip prior-mode per-query fields so
        // the merged set is consistent with the new pack mode before both
        // validation and SO write.
        const baseQueries =
          gatedQueries ??
          (resolved.transitioned
            ? (convertSOQueriesToPack(currentPackSO.attributes.queries ?? []) as Record<
                string,
                PackQueryInput
              >)
            : undefined);

        const queries = baseQueries
          ? (mapValues(baseQueries, (queryData, queryId) => {
              const existing = existingScheduleIds[queryId];
              const carried = resolved.transitioned
                ? stripPriorModePerQueryFields(queryData, resolved.scheduleType)
                : queryData;

              // Mirror of the pack-level partial-merge in
              // `resolvePackScheduleForUpdate`: on a same-mode rrule
              // override edit, shallow-merge the request's per-query
              // `rrule_schedule` over the existing one so the client can
              // change just `splay` (or `rrule`) without restating the
              // rest. Mode transitions skip the merge — they already had
              // their prior-mode fields stripped by `carried`.
              const existingRrule = existingQueriesById[queryId]?.rrule_schedule;
              const merged =
                !resolved.transitioned &&
                resolved.scheduleType === 'rrule' &&
                carried.schedule_type === 'rrule' &&
                carried.rrule_schedule &&
                existingRrule
                  ? {
                      ...carried,
                      rrule_schedule: { ...existingRrule, ...carried.rrule_schedule },
                    }
                  : carried;

              return {
                ...merged,
                schedule_id: existing?.schedule_id ?? uuidv4(),
                start_date: existing?.start_date ?? now,
              };
            }) as Record<string, PackQueryInput>)
          : undefined;

        const scheduleErr = validatePackScheduleFields({
          packScheduleType: resolved.scheduleType ?? undefined,
          packInterval: resolved.interval ?? undefined,
          packRrule: resolved.rrule_schedule ?? undefined,
          queries: queries as Record<string, PackQueryInput> | undefined,
        });
        if (scheduleErr) {
          return response.badRequest({ body: { message: scheduleErr } });
        }

        if (name) {
          const conflictingEntries = await spaceScopedClient.find<PackSavedObject>({
            type: packSavedObjectType,
            filter: `${packSavedObjectType}.attributes.name: "${escapeFilterValue(name)}"`,
          });

          if (
            some(
              filter(conflictingEntries.saved_objects, (packSO) => packSO.id !== currentPackSO.id),
              ['attributes.name', name]
            )
          ) {
            return response.conflict({ body: `Pack with name "${name}" already exists.` });
          }
        }

        const { items: packagePolicies } = (await packagePolicyService?.list(spaceScopedClient, {
          kuery: `${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.package.name:${OSQUERY_INTEGRATION_NAME}`,
          perPage: 1000,
          page: 1,
        })) ?? { items: [] };
        const currentPackagePolicies = filter(packagePolicies, (packagePolicy) =>
          policyHasPack(packagePolicy, currentPackSO.attributes.name, spaceId)
        );

        // When `policy_ids` is omitted from the request, preserve the pack's
        // existing policy attachments. Otherwise an unrelated PUT (e.g. just
        // toggling schedule_type) would strip the pack from every assigned
        // policy because `getInitialPolicies` interprets the missing field as
        // "intersect with empty set."
        const currentAgentPolicyIds = map(
          filter(currentPackSO.references, ['type', LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE]),
          'id'
        );
        const effectivePolicyIds = policy_ids ?? currentAgentPolicyIds;

        const { policiesList, invalidPolicies } = getInitialPolicies(
          packagePolicies,
          effectivePolicyIds,
          shards
        );

        if (invalidPolicies?.length) {
          return response.badRequest({
            body: `The following policy ids are invalid: ${invalidPolicies.join(', ')}`,
          });
        }

        const agentPolicies = await agentPolicyService?.getByIds(spaceScopedClient, policiesList);

        const policyShards = findMatchingShards(agentPolicies, shards);

        const agentPoliciesIdMap = mapKeys(agentPolicies, 'id');

        const nonAgentPolicyReferences = filter(
          currentPackSO.references,
          (reference) => reference.type !== LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE
        );
        const getUpdatedReferences = () => {
          if (!policy_ids && isEmpty(shards)) {
            return currentPackSO.references;
          }

          return [
            ...nonAgentPolicyReferences,
            ...policiesList.map((id) => ({
              id,
              name: agentPoliciesIdMap[id]?.name,
              type: LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
            })),
          ];
        };

        const references = getUpdatedReferences();

        // Build the schedule slice for the SO write. Honor read→merge→write
        // by only including a field on the patch when the request actually
        // sent it (or when transitioning between modes). The patch slot
        // uses the SO's strict shape — the value comes from
        // `resolved.rrule_schedule`, which is the post-merge object
        // already gated through `validatePackScheduleFields`.
        const scheduleSoPatch: Partial<
          Pick<PackSavedObject, 'schedule_type' | 'interval' | 'rrule_schedule'>
        > = {};
        if (isRruleFeatureEnabled) {
          if (scheduleTypePresent) {
            scheduleSoPatch.schedule_type = resolved.scheduleType ?? null;
          }

          if (resolved.transitioned || intervalPresent) {
            scheduleSoPatch.interval = resolved.interval ?? null;
          }

          if (resolved.transitioned || rruleSchedulePresent) {
            // Narrowing: `resolved.rrule_schedule` is typed as a partial
            // because the request body may be partial. By the time we
            // reach this write, `validatePackScheduleFields` has already
            // 400'd any merged result that is not a full
            // `RRuleScheduleConfig`, so the runtime value is either the
            // strict shape, `null` (clear), or `undefined`.
            scheduleSoPatch.rrule_schedule = (resolved.rrule_schedule ??
              null) as RRuleScheduleConfig | null;
          }
        }

        await spaceScopedClient.update<PackSavedObject>(
          packSavedObjectType,
          request.params.id,
          {
            enabled,
            name,
            description: description || '',
            queries: queries && convertPackQueriesToSO(queries),
            updated_at: moment().toISOString(),
            updated_by: username,
            updated_by_profile_uid: profileUid,
            shards: convertShardsToArray(shards),
            ...scheduleSoPatch,
          },
          {
            refresh: 'wait_for',
            references,
          }
        );

        const updatedPackSO = await spaceScopedClient.get<PackSavedObject>(
          packSavedObjectType,
          request.params.id
        );

        const convertedQueries = stripPerQueryRruleFields(
          convertSOQueriesToPack(updatedPackSO.attributes.queries),
          isRruleFeatureEnabled
        );

        const buildFleetPackBlock = (agentPolicyId: string) => {
          const { queries: builtQueries, ...packDefaults } = convertSOQueriesToPackConfig(
            convertedQueries,
            {
              spaceId,
              packSchedule: {
                schedule_type: updatedPackSO.attributes.schedule_type,
                interval: updatedPackSO.attributes.interval,
                rrule_schedule: updatedPackSO.attributes.rrule_schedule,
              },
              isRruleFeatureEnabled,
            }
          );

          return {
            shard: policyShards[agentPolicyId] ?? 100,
            pack_id: updatedPackSO.id,
            ...packDefaults,
            queries: builtQueries,
          };
        };

        const buildResponseData = (): PackResponseData => {
          const { attributes: attrs } = updatedPackSO;
          // policy_ids and shards must mirror the GET contract: policy attachments
          // live on `references`, not `attributes`, and the public shards shape is
          // an object map (read_pack_route uses convertShardsToObject).
          const policyIds = map(
            filter(updatedPackSO.references, ['type', LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE]),
            'id'
          );

          return {
            name: attrs.name,
            description: attrs.description,
            queries: convertedQueries as unknown as PackResponseData['queries'],
            version: attrs.version,
            enabled: attrs.enabled,
            created_at: attrs.created_at,
            created_by: attrs.created_by,
            created_by_profile_uid: attrs.created_by_profile_uid,
            updated_at: attrs.updated_at,
            updated_by: attrs.updated_by,
            updated_by_profile_uid: attrs.updated_by_profile_uid,
            policy_ids: policyIds,
            // TODO: collapse `PackResponseData.shards` (currently `SOShard`,
            // array form) onto the documented public contract `Record<string,
            // number>`. The OAS, the GET responses, and the runtime validator's
            // `oneOf(array, object)` all point to the object form being the real
            // public shape; the array typing here is a leak of the internal SO
            // storage shape. Fix would also let `find_pack_route` and
            // `create_pack_route` stop returning array form silently. Tracked
            // separately — this cast is the bridge until then.
            shards: convertShardsToObject(attrs.shards) as unknown as PackResponseData['shards'],
            saved_object_id: updatedPackSO.id,
            // Discriminated response — see buildScheduleResponseSlice.
            ...buildScheduleResponseSlice(attrs, isRruleFeatureEnabled),
          };
        };

        if (enabled == null && !currentPackSO.attributes.enabled) {
          return response.ok({ body: { data: buildResponseData() } });
        }

        if (enabled != null && enabled !== currentPackSO.attributes.enabled) {
          if (enabled) {
            const policyIds = policy_ids || !isEmpty(shards) ? policiesList : currentAgentPolicyIds;

            await Promise.all(
              policyIds.map((agentPolicyId) => {
                const packagePolicy = packagePolicies.find((policy) =>
                  policy.policy_ids.includes(agentPolicyId)
                );
                if (packagePolicy) {
                  return packagePolicyService?.update(
                    spaceScopedClient,
                    esClient,
                    packagePolicy.id,
                    produce<PackagePolicy>(packagePolicy, (draft) => {
                      unset(draft, 'id');
                      if (!has(draft, 'inputs[0].streams')) {
                        set(draft, 'inputs[0].streams', []);
                      }

                      const pk = makePackKey(updatedPackSO.attributes.name, spaceId);
                      removePackFromPolicy(draft, updatedPackSO.attributes.name, spaceId);
                      set(
                        draft,
                        `inputs[0].config.osquery.value.packs.${pk}`,
                        buildFleetPackBlock(agentPolicyId)
                      );

                      return draft;
                    })
                  );
                }
              })
            );
          } else {
            await Promise.all(
              currentAgentPolicyIds.map((agentPolicyId) => {
                const packagePolicy = currentPackagePolicies.find((policy) =>
                  policy.policy_ids.includes(agentPolicyId)
                );
                if (!packagePolicy) return;

                return packagePolicyService?.update(
                  spaceScopedClient,
                  esClient,
                  packagePolicy.id,
                  produce<PackagePolicy>(packagePolicy, (draft) => {
                    unset(draft, 'id');
                    removePackFromPolicy(draft, currentPackSO.attributes.name, spaceId);

                    return draft;
                  })
                );
              })
            );
          }
        } else {
          // `policiesList` is the post-validation set returned by
          // `getInitialPolicies` (only ids that map to a real Fleet package
          // policy). Diff against `currentAgentPolicyIds` to compute the
          // remove / keep-and-update / add buckets. Validated empirically by
          // the multi-policy fan-out probe.
          const agentPolicyIdsToRemove = uniq(difference(currentAgentPolicyIds, policiesList));
          const agentPolicyIdsToUpdate = uniq(
            difference(currentAgentPolicyIds, agentPolicyIdsToRemove)
          );
          const agentPolicyIdsToAdd = uniq(difference(policiesList, currentAgentPolicyIds));

          await Promise.all(
            agentPolicyIdsToRemove.map((agentPolicyId) => {
              const packagePolicy = currentPackagePolicies.find((policy) =>
                policy.policy_ids.includes(agentPolicyId)
              );
              if (packagePolicy) {
                return packagePolicyService?.update(
                  spaceScopedClient,
                  esClient,
                  packagePolicy.id,
                  produce<PackagePolicy>(packagePolicy, (draft) => {
                    unset(draft, 'id');
                    removePackFromPolicy(draft, currentPackSO.attributes.name, spaceId);

                    return draft;
                  })
                );
              }
            })
          );

          await Promise.all(
            agentPolicyIdsToUpdate.map((agentPolicyId) => {
              const packagePolicy = packagePolicies.find((policy) =>
                policy.policy_ids.includes(agentPolicyId)
              );
              if (packagePolicy) {
                return packagePolicyService?.update(
                  spaceScopedClient,
                  esClient,
                  packagePolicy.id,
                  produce<PackagePolicy>(packagePolicy, (draft) => {
                    unset(draft, 'id');
                    if (updatedPackSO.attributes.name !== currentPackSO.attributes.name) {
                      removePackFromPolicy(draft, currentPackSO.attributes.name, spaceId);
                    }

                    const pk = makePackKey(updatedPackSO.attributes.name, spaceId);
                    removePackFromPolicy(draft, updatedPackSO.attributes.name, spaceId);
                    set(
                      draft,
                      `inputs[0].config.osquery.value.packs.${pk}`,
                      buildFleetPackBlock(agentPolicyId)
                    );

                    return draft;
                  })
                );
              }
            })
          );

          await Promise.all(
            agentPolicyIdsToAdd.map((agentPolicyId) => {
              const packagePolicy = packagePolicies.find((policy) =>
                policy.policy_ids.includes(agentPolicyId)
              );

              if (packagePolicy) {
                return packagePolicyService?.update(
                  spaceScopedClient,
                  esClient,
                  packagePolicy.id,
                  produce<PackagePolicy>(packagePolicy, (draft) => {
                    unset(draft, 'id');
                    if (!(draft.inputs.length && draft.inputs[0].streams.length)) {
                      set(draft, 'inputs[0].streams', []);
                    }

                    const pk = makePackKey(updatedPackSO.attributes.name, spaceId);
                    set(
                      draft,
                      `inputs[0].config.osquery.value.packs.${pk}`,
                      buildFleetPackBlock(agentPolicyId)
                    );

                    return draft;
                  })
                );
              }
            })
          );
        }

        return response.ok({
          body: { data: buildResponseData() },
        });
      }
    );
};
