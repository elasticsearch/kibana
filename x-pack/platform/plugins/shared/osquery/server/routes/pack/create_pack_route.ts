/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment-timezone';
import { v4 as uuidv4 } from 'uuid';
import { set } from '@kbn/safer-lodash-set';
import { has, unset, some, mapKeys, mapValues } from 'lodash';
import { produce } from 'immer-v9';
import type { PackagePolicy } from '@kbn/fleet-plugin/common';
import { LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE } from '@kbn/fleet-plugin/common';
import type { IRouter } from '@kbn/core/server';

import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { createInternalSavedObjectsClientForSpaceId } from '../../utils/get_internal_saved_object_client';
import type { CreatePackRequestBodySchema } from '../../../common/api';
import { buildRouteValidation } from '../../utils/build_validation/route_validation';
import { API_VERSIONS } from '../../../common/constants';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import type { StartPlugins } from '../../types';
import { PLUGIN_ID } from '../../../common';
import { packSavedObjectType } from '../../../common/types';
import {
  convertSOQueriesToPackConfig,
  convertPackQueriesToSO,
  fetchAllPackagePolicies,
  findMatchingShards,
  getInitialPolicies,
  buildTargetingWarning,
  groupAgentPolicyIdsByPackagePolicy,
  makePackKey,
  resolvePackTargetScope,
  resolveSharedPackagePolicyShard,
  validatePackScheduleFields,
  buildScheduleResponseSlice,
  stripPerQueryRruleFields,
  convergePerQueryIntervals,
} from './utils';
import { convertShardsToArray } from '../utils';
import type { PackSavedObject } from '../../common/types';
import type { PackResponseData, TargetingWarning } from './types';
import type { PackQueryInput } from './utils';
import { createPackRequestBodySchema } from '../../../common/api';
import { getUserInfo } from '../../lib/get_user_info';
import { escapeFilterValue } from '../utils/generate_copy_name';
import { createPackResponseSchema } from './response_schemas';

type PackSavedObjectLimited = Omit<PackSavedObject, 'saved_object_id' | 'references'>;

export const createPackRoute = (router: IRouter, osqueryContext: OsqueryAppContext) => {
  router.versioned
    .post({
      access: 'public',
      path: '/api/osquery/packs',
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
            body: buildRouteValidation<
              typeof createPackRequestBodySchema,
              CreatePackRequestBodySchema
            >(createPackRequestBodySchema),
          },
          response: {
            200: {
              body: () => createPackResponseSchema,
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

        const logger = osqueryContext.logFactory.get('pack');
        const agentPolicyService = osqueryContext.service.getAgentPolicyService();

        const packagePolicyService = osqueryContext.service.getPackagePolicyService();

        const [, startPlugins] = await osqueryContext.getStartServices();
        const currentUser = await getUserInfo({
          request,
          security: (startPlugins as StartPlugins).security,
          logger,
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
          // Pack-level schedule fields (PR C). Stripped when the feature
          // flag is off so a request that smuggles them in still produces
          // a legacy-shape SO and Fleet config.
          schedule_type: rawScheduleType,
          interval: rawInterval,
          rrule_schedule: rawRruleSchedule,
        } = request.body;

        const scheduleType = isRruleFeatureEnabled ? rawScheduleType : undefined;
        const packInterval = isRruleFeatureEnabled ? rawInterval : undefined;
        const rruleSchedule = isRruleFeatureEnabled ? rawRruleSchedule : undefined;

        // Strip per-query RRULE override fields when the flag is off (request-
        // boundary gate). The wire-boundary gate in convertSOQueriesToPackConfig
        // is defense in depth — this gate keeps RRULE state off the SO entirely.
        const gatedQueries = isRruleFeatureEnabled
          ? rawQueries
          : mapValues(rawQueries, (rawQuery) => {
              const {
                schedule_type: _scheduleType,
                rrule_schedule: _rruleSchedule,
                ...rest
              } = rawQuery as PackQueryInput;

              return rest;
            });

        const convergedQueries = gatedQueries
          ? convergePerQueryIntervals(gatedQueries as Record<string, PackQueryInput>, scheduleType)
          : gatedQueries;

        const scheduleErr = validatePackScheduleFields({
          packScheduleType: scheduleType,
          packInterval,
          packRrule: rruleSchedule,
          queries: convergedQueries as Record<string, PackQueryInput>,
        });
        if (scheduleErr) {
          return response.badRequest({ body: { message: scheduleErr } });
        }

        const now = moment().toISOString();
        const queries = mapValues(convergedQueries, (queryData) => ({
          ...queryData,
          schedule_id: uuidv4(),
          start_date: now,
        })) as Record<string, PackQueryInput>;
        const conflictingEntries = await spaceScopedClient.find({
          type: packSavedObjectType,
          filter: `${packSavedObjectType}.attributes.name: "${escapeFilterValue(name)}"`,
        });

        if (
          conflictingEntries.saved_objects.length &&
          some(conflictingEntries.saved_objects, ['attributes.name', name])
        ) {
          return response.conflict({ body: `Pack with name "${name}" already exists.` });
        }

        // Drain ALL policies via keyset `fetchAllItems`; an offset-capped
        // `list({ perPage: 1000 })` would drop attachments on policies past 1000.
        const packagePolicies = await fetchAllPackagePolicies(
          packagePolicyService,
          spaceScopedClient
        );

        const { policiesList, invalidPolicies } = getInitialPolicies(
          packagePolicies,
          policy_ids ?? [],
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

        const references = policiesList.map((id) => ({
          id,
          name: agentPoliciesIdMap[id]?.name,
          type: LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
        }));

        const packSO = await spaceScopedClient.create<PackSavedObjectLimited>(
          packSavedObjectType,
          {
            name,
            description,
            queries: convertPackQueriesToSO(queries),
            enabled,
            created_at: moment().toISOString(),
            created_by: username,
            created_by_profile_uid: profileUid,
            updated_at: moment().toISOString(),
            updated_by: username,
            updated_by_profile_uid: profileUid,
            shards: convertShardsToArray(shards),
            // Pack-level schedule fields. Stamped only when the feature flag
            // is on — the gated `scheduleType` is `undefined` otherwise. The
            // mode/value coupling below is already enforced by
            // `validatePackScheduleFields`; the redundant null/defined checks
            // are defense in depth so a missed validator branch can never
            // write a mode-mismatched pair to the SO.
            ...(scheduleType ? { schedule_type: scheduleType } : {}),
            ...(scheduleType === 'interval' && packInterval !== undefined
              ? { interval: packInterval }
              : {}),
            ...(scheduleType === 'rrule' && rruleSchedule ? { rrule_schedule: rruleSchedule } : {}),
          },
          {
            references,
            refresh: 'wait_for',
          }
        );

        const isGlobalPack = Boolean(shards?.['*']);

        // Group + classify write targets once so the Fleet write path and the
        // targeting warning operate on the same resolved topology.
        const packagePolicyWriteTargets = policiesList.length
          ? groupAgentPolicyIdsByPackagePolicy(policiesList, packagePolicies)
          : new Map<string, { packagePolicy: PackagePolicy; agentPolicyIds: string[] }>();
        const scopeResults = resolvePackTargetScope(packagePolicyWriteTargets, isGlobalPack);

        if (enabled && policiesList.length) {
          const packKey = makePackKey(packSO.attributes.name, spaceId);
          const { queries: builtQueries, ...packDefaults } = convertSOQueriesToPackConfig(queries, {
            spaceId,
            packSchedule: {
              schedule_type: scheduleType,
              interval: packInterval,
              rrule_schedule: rruleSchedule,
            },
            isRruleFeatureEnabled,
            fallbackStartDate: packSO.attributes.created_at,
          });

          const buildPackBlock = (agentPolicyIds: string[]) => ({
            shard: resolveSharedPackagePolicyShard(agentPolicyIds, policyShards),
            pack_id: packSO.id,
            pack_name: packSO.attributes.name,
            ...packDefaults,
            queries: builtQueries,
          });

          // A shared package policy is written once, covering every agent policy
          // in its `policy_ids`. Kibana cannot narrow that: `osquery_manager`
          // declares `multiple: false`, so Fleet permits only ONE osquery
          // package policy per agent policy and a dedicated "targeted" policy
          // can never be created for an agent policy that already has one.
          // Delivery therefore stays over-broad; `targeting_warning` below tells
          // the user which agent policies also receive the pack, and how to
          // separate them. See #285994.
          await Promise.all(
            scopeResults.map(({ packagePolicy, agentPolicyIds }) =>
              packagePolicyService?.update(
                spaceScopedClient,
                esClient,
                packagePolicy.id,
                produce<PackagePolicy>(packagePolicy, (draft) => {
                  unset(draft, 'id');
                  if (!has(draft, 'inputs[0].streams')) {
                    set(draft, 'inputs[0].streams', []);
                  }

                  set(
                    draft,
                    `inputs[0].config.osquery.value.packs.${packKey}`,
                    buildPackBlock(agentPolicyIds)
                  );

                  return draft;
                })
              )
            )
          );
        }

        // Detect over-broad package policies (targeting warning). Only meaningful
        // when the pack was actually written above — a disabled pack reaches no
        // agent policy at all, so warning about over-reach would be misleading.
        // Advisory only: the pack SO and Fleet writes are already committed, so a
        // failed name lookup must not turn a successful create into an error
        // (same best-effort contract as update_pack_route).
        let targetingWarning: TargetingWarning | undefined;
        if (enabled && policiesList.length) {
          try {
            targetingWarning = await buildTargetingWarning(
              scopeResults,
              agentPolicyService,
              spaceScopedClient
            );
          } catch (err) {
            logger.warn(
              `Failed to build targeting warning for pack ${packSO.id}: ${(err as Error).message}`
            );
          }
        }

        set(packSO, 'attributes.queries', queries);

        const { attributes } = packSO;

        const data: PackResponseData = {
          name: attributes.name,
          description: attributes.description,
          queries: stripPerQueryRruleFields(attributes.queries, isRruleFeatureEnabled),
          version: attributes.version,
          enabled: attributes.enabled,
          created_at: attributes.created_at,
          created_by: attributes.created_by,
          created_by_profile_uid: attributes.created_by_profile_uid,
          updated_at: attributes.updated_at,
          updated_by: attributes.updated_by,
          updated_by_profile_uid: attributes.updated_by_profile_uid,
          policy_ids: attributes.policy_ids,
          shards: attributes.shards,
          saved_object_id: packSO.id,
          // Discriminated response — see buildScheduleResponseSlice.
          ...buildScheduleResponseSlice(
            { schedule_type: scheduleType, interval: packInterval, rrule_schedule: rruleSchedule },
            isRruleFeatureEnabled
          ),
          ...(targetingWarning ? { targeting_warning: targetingWarning } : {}),
        };

        return response.ok({
          body: {
            data,
          },
        });
      }
    );
};
