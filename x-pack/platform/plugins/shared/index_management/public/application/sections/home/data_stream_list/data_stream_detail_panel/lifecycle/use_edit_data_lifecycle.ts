/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { i18n } from '@kbn/i18n';
import {
  Streams,
  convertGetResponseIntoUpsertRequest,
  isDslLifecycle as isStreamsDslLifecycle,
  isIlmLifecycle as isStreamsIlmLifecycle,
  isInheritLifecycle as isStreamsInheritLifecycle,
  isInheritFailureStore,
  isEnabledFailureStore,
} from '@kbn/streams-schema';
import {
  CLOUD_SUBSCRIPTION_FEATURES_URL,
  CONTACT_US_URL,
  SUBSCRIPTION_FEATURES_URL,
} from '@kbn/data-lifecycle-phases';
import type { IlmPolicyForFlyout } from '@kbn/data-lifecycle-phases';
import type { IndexManagementLocatorParams } from '@kbn/index-management-shared-types';

import type { DataStream, TemplateDeserialized } from '../../../../../../../common';
import { API_BASE_PATH } from '../../../../../../../common/constants';
import { splitSizeAndUnits } from '../../../../../../../common';
import {
  getIlmPolicyNameForSummary,
  isIlmLifecyclePreferred,
  isNextGenIlm,
} from '../../../../../lib/data_streams';
import { useAppContext } from '../../../../../app_context';
import {
  updateDSFailureStore,
  updateDataLifecycle,
  updateDataStreamSettings,
  updateIndexSettings,
  loadSnapshotRepositories,
} from '../../../../../services/api';
import { sendRequest } from '../../../../../services/use_request';
// Import the constant directly from its module (not the public barrel `../../../../../..`)
// to avoid a circular dependency that leaves `services/api` exports undefined at runtime.
import { INDEX_MANAGEMENT_LOCATOR_ID } from '../../../../../../locator';
import type { EditDataLifecycleFlyoutOnApplyArgs } from '../../../../../components/data_lifecycle/edit_data_lifecycle_flyout/edit_data_lifecycle_flyout';
import type { ResolvedDataStreamLifecycle } from './use_resolved_data_stream_lifecycle';
import {
  isRecord,
  isWiredStreamDataStream,
  isWiredRootDataStream,
  normalizeEsLifecycle,
  streamsDslToEsLifecycle,
  resolveStreamsFailureStore,
  getTemplateIlmSettings,
} from './lifecycle_utils';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const throwIfRequestError = (result: { error?: unknown } | undefined, message: string): void => {
  if (result?.error) {
    throw new Error(`${message}: ${getErrorMessage(result.error)}`);
  }
};

interface UseEditDataLifecycleArgs {
  dataStream: DataStream | null | undefined;
  resolvedLifecycle: ResolvedDataStreamLifecycle;
  onClose: (shouldReload?: boolean) => void;
}

/**
 * Read-only reference data seeded when the flyout opens (from the Streams parent for
 * wired streams, or the index template otherwise). It is the "inherited" baseline the
 * flyout compares the user's draft against; it is set as a whole on open and never
 * mutated field-by-field afterwards.
 */
interface FlyoutSeed {
  indexTemplateHref?: string;
  templateLifecycle?: DataStream['lifecycle'];
  successfulLifecycle?: DataStream['lifecycle'];
  templateIlmPolicyName?: string;
  templateFailureStoreDefaults?: {
    enabled: boolean;
    retention?: string;
    retentionDisabled?: boolean;
  };
}

/**
 * Encapsulates all state and side effects for the "Edit data lifecycle" flow:
 * opening the flyout (seeding its draft state from the resolved lifecycle), the
 * ILM policy inspection flyout, and persisting changes. Keeping this out of the
 * detail panel lets that component focus on presentation.
 */
export const useEditDataLifecycle = ({
  dataStream,
  resolvedLifecycle,
  onClose,
}: UseEditDataLifecycleArgs) => {
  const { config, core, plugins, services, url } = useAppContext();
  const locator = url.locators.get<IndexManagementLocatorParams>(INDEX_MANAGEMENT_LOCATOR_ID);

  const [isEditingDataLifecycle, setIsEditingDataLifecycle] = useState(false);
  const [ilmPolicies, setIlmPolicies] = useState<IlmPolicyForFlyout[]>([]);
  const [hasManageIlm, setHasManageIlm] = useState(true);
  const [selectedIlmPolicyName, setSelectedIlmPolicyName] = useState<string | undefined>(undefined);
  const [lifecycleMethod, setLifecycleMethod] = useState<'dlm' | 'ilm'>('dlm');
  const [failureStoreEnabled, setFailureStoreEnabled] = useState(false);
  const [hasEnterpriseLicense, setHasEnterpriseLicense] = useState(false);
  const [defaultSnapshotRepository, setDefaultSnapshotRepository] = useState<string | null>(null);
  const [hasExistingRepositories, setHasExistingRepositories] = useState(false);
  const [inheritSuccessfulLifecycle, setInheritSuccessfulLifecycle] = useState(false);
  const [inheritFailedLifecycle, setInheritFailedLifecycle] = useState(false);
  const [flyoutSeed, setFlyoutSeed] = useState<FlyoutSeed>({});
  const [inspectedIlmPolicyName, setInspectedIlmPolicyName] = useState<string | undefined>(
    undefined
  );

  const loadDefaultSnapshotRepository = useCallback(async () => {
    try {
      const { data } = await loadSnapshotRepositories();
      setDefaultSnapshotRepository(data?.defaultRepository ?? null);
      // Treat repositories as existing when the list reports any, or (as a fallback for users who
      // cannot list repositories) when a default repository is configured.
      setHasExistingRepositories(
        Boolean(data?.hasRepositories) || Boolean(data?.defaultRepository)
      );
    } catch {
      setDefaultSnapshotRepository(null);
      setHasExistingRepositories(false);
    }
  }, []);

  const loadIlmPolicies = useCallback(async () => {
    try {
      const { data } = await sendRequest<{
        hasManageIlm: boolean;
        policies: IlmPolicyForFlyout[];
      }>({
        path: `${API_BASE_PATH}/data_streams/ilm_policies`,
        method: 'get',
      });
      setIlmPolicies(Array.isArray(data?.policies) ? data.policies : []);
      setHasManageIlm(data?.hasManageIlm ?? false);
    } catch {
      setIlmPolicies([]);
      setHasManageIlm(false);
    }
  }, []);

  // Eagerly load ILM policies for the summary's policy inspection.
  useEffect(() => {
    if (config.isServerless) return;
    if (!dataStream) return;
    if (!isIlmLifecyclePreferred(dataStream)) return;
    const summaryIlmPolicyName = getIlmPolicyNameForSummary(dataStream);
    if (typeof summaryIlmPolicyName !== 'string' || summaryIlmPolicyName.length === 0) return;
    if (ilmPolicies.length > 0) return;

    loadIlmPolicies();
  }, [config.isServerless, dataStream, ilmPolicies.length, loadIlmPolicies]);

  useEffect(() => {
    const licensing = plugins.licensing;
    if (!licensing) {
      return;
    }

    const subscription = licensing.license$.subscribe((license) => {
      setHasEnterpriseLicense(license.isActive && license.hasAtLeast('enterprise'));
    });

    return () => subscription.unsubscribe();
  }, [plugins.licensing]);

  const successfulDlmDefaultValue = useMemo(() => {
    const baseLifecycle = flyoutSeed.successfulLifecycle ?? dataStream?.lifecycle;
    const effectiveLifecycle =
      baseLifecycle?.enabled === true ? baseLifecycle : flyoutSeed.templateLifecycle;
    const candidateLifecycle = inheritSuccessfulLifecycle
      ? flyoutSeed.templateLifecycle
      : effectiveLifecycle;

    if (!candidateLifecycle?.enabled) {
      return undefined;
    }

    const frozenAfter =
      typeof candidateLifecycle.frozen_after === 'string' &&
      candidateLifecycle.frozen_after.length > 0
        ? candidateLifecycle.frozen_after
        : undefined;
    const dataRetention =
      typeof candidateLifecycle.data_retention === 'string' &&
      candidateLifecycle.data_retention.length > 0
        ? candidateLifecycle.data_retention
        : undefined;

    const frozen =
      frozenAfter !== undefined
        ? (() => {
            const { size, unit } = splitSizeAndUnits(frozenAfter);
            return size && unit ? { enabled: true, value: size, unit } : undefined;
          })()
        : undefined;

    const del =
      dataRetention !== undefined
        ? (() => {
            const { size, unit } = splitSizeAndUnits(dataRetention);
            return size && unit ? { enabled: true, value: size, unit } : undefined;
          })()
        : undefined;

    return {
      ...(frozen ? { frozen } : {}),
      ...(del ? { delete: del } : {}),
    };
  }, [
    flyoutSeed.successfulLifecycle,
    dataStream?.lifecycle,
    inheritSuccessfulLifecycle,
    flyoutSeed.templateLifecycle,
  ]);

  const failedDeletePhaseDefaultValue = useMemo(() => {
    const inheritedRetention =
      flyoutSeed.templateFailureStoreDefaults?.retention ??
      dataStream?.failureStoreRetention?.defaultRetentionPeriod;

    const retention = inheritFailedLifecycle
      ? inheritedRetention
      : dataStream?.failureStoreEnabled === true
      ? dataStream?.failureStoreRetention?.customRetentionPeriod ??
        dataStream?.failureStoreRetention?.defaultRetentionPeriod
      : inheritedRetention;
    const retentionDisabled = inheritFailedLifecycle
      ? flyoutSeed.templateFailureStoreDefaults?.retentionDisabled === true
      : dataStream?.failureStoreRetention?.retentionDisabled === true;

    const fallback = { enabled: false, value: '60', unit: 'd' };
    if (!retention || retention === -1) {
      return fallback;
    }

    const { size, unit } = splitSizeAndUnits(retention);
    if (!size || !unit) {
      return fallback;
    }

    return {
      enabled: !retentionDisabled,
      value: size,
      unit,
    };
  }, [
    inheritFailedLifecycle,
    flyoutSeed.templateFailureStoreDefaults?.retention,
    flyoutSeed.templateFailureStoreDefaults?.retentionDisabled,
    dataStream?.failureStoreEnabled,
    dataStream?.failureStoreRetention?.defaultRetentionPeriod,
    dataStream?.failureStoreRetention?.customRetentionPeriod,
    dataStream?.failureStoreRetention?.retentionDisabled,
  ]);

  const handleInheritSuccessfulLifecycleChange = useCallback(
    (next: boolean) => {
      setInheritSuccessfulLifecycle(next);

      if (!dataStream) {
        return;
      }

      if (next) {
        if (flyoutSeed.templateIlmPolicyName) {
          setLifecycleMethod('ilm');
          setSelectedIlmPolicyName(flyoutSeed.templateIlmPolicyName);
        } else {
          setLifecycleMethod('dlm');
          setSelectedIlmPolicyName(undefined);
        }
      } else {
        // Back to the data stream's own configuration
        const nextMethod = isNextGenIlm(dataStream) ? 'ilm' : 'dlm';
        setLifecycleMethod(nextMethod);
        setSelectedIlmPolicyName(nextMethod === 'ilm' ? dataStream.ilmPolicyName : undefined);
      }
    },
    [dataStream, flyoutSeed.templateIlmPolicyName]
  );

  const handleInheritFailedLifecycleChange = useCallback((next: boolean) => {
    setInheritFailedLifecycle(next);

    // Do not mutate `failureStoreEnabled` draft state here.
    // The flyout should display either the inherited (template) value or the
    // user's draft, without overwriting unsaved changes when toggling inheritance.
  }, []);

  const inspectedIlmPolicy = useMemo(() => {
    if (!inspectedIlmPolicyName) return undefined;
    return ilmPolicies.find((p) => p.name === inspectedIlmPolicyName)?.serializedPolicy;
  }, [ilmPolicies, inspectedIlmPolicyName]);

  const openEditFlyout = useCallback(() => {
    const run = async () => {
      if (!dataStream) {
        return;
      }

      loadDefaultSnapshotRepository();
      loadIlmPolicies();

      // Wired streams are managed by the Streams app, which is the source of truth for
      // their lifecycle (writing ES directly has no effect because Streams re-applies its
      // own definition). Seed the flyout from the Streams ingest API for those.
      if (isWiredStreamDataStream(dataStream)) {
        try {
          const { data } = await sendRequest<Streams.all.GetResponse>({
            path: `/api/streams/${encodeURIComponent(dataStream.name)}`,
            method: 'get',
          });

          if (data && Streams.ingest.all.GetResponse.is(data)) {
            const lifecycle = data.stream.ingest.lifecycle;
            const failureStore = data.stream.ingest.failure_store;

            const inheritSuccessful = isStreamsInheritLifecycle(lifecycle);
            const inheritFailed = isInheritFailureStore(failureStore);

            setInheritSuccessfulLifecycle(inheritSuccessful);
            setInheritFailedLifecycle(inheritFailed);

            const effectiveLifecycle = data.effective_lifecycle;
            const lifecycleForUi = inheritSuccessful ? effectiveLifecycle : lifecycle;
            const seed: FlyoutSeed = {};

            if (isStreamsIlmLifecycle(lifecycleForUi)) {
              setLifecycleMethod('ilm');
              setSelectedIlmPolicyName(lifecycleForUi.ilm.policy);
              seed.templateIlmPolicyName = isStreamsIlmLifecycle(effectiveLifecycle)
                ? effectiveLifecycle.ilm.policy
                : undefined;
            } else if (isStreamsDslLifecycle(lifecycleForUi)) {
              setLifecycleMethod('dlm');
              setSelectedIlmPolicyName(undefined);
              seed.successfulLifecycle = streamsDslToEsLifecycle(lifecycleForUi.dsl);
              seed.templateLifecycle = isStreamsDslLifecycle(effectiveLifecycle)
                ? streamsDslToEsLifecycle(effectiveLifecycle.dsl)
                : undefined;
              seed.templateIlmPolicyName = isStreamsIlmLifecycle(effectiveLifecycle)
                ? effectiveLifecycle.ilm.policy
                : undefined;
            }

            setFailureStoreEnabled(isEnabledFailureStore(failureStore));

            const effectiveFailureStore = data.effective_failure_store;
            seed.templateFailureStoreDefaults = resolveStreamsFailureStore(effectiveFailureStore);

            setFlyoutSeed(seed);
            setIsEditingDataLifecycle(true);
            return;
          }
        } catch {
          // Fall back to index-template based behavior below.
        }
      }

      // Classic data streams inherit from their index template. The lifecycle is resolved
      // by the shared `useResolvedDataStreamLifecycle` hook so the edit flyout and
      // the details summary stay consistent.
      setFailureStoreEnabled(Boolean(dataStream.failureStoreEnabled));

      const shouldInheritIlm =
        resolvedLifecycle.inheritSuccessful &&
        resolvedLifecycle.resolvedIlmPolicyName !== undefined;
      const nextMethod = shouldInheritIlm || isNextGenIlm(dataStream) ? 'ilm' : 'dlm';
      setLifecycleMethod(nextMethod);
      setSelectedIlmPolicyName(
        shouldInheritIlm
          ? resolvedLifecycle.resolvedIlmPolicyName
          : nextMethod === 'ilm'
          ? dataStream.ilmPolicyName
          : undefined
      );

      setInheritSuccessfulLifecycle(resolvedLifecycle.inheritSuccessful);
      setInheritFailedLifecycle(resolvedLifecycle.inheritFailed);

      const href =
        locator?.getRedirectUrl({
          page: 'index_template',
          indexTemplate: dataStream.indexTemplateName,
        }) ?? undefined;

      setFlyoutSeed({
        indexTemplateHref: href,
        templateIlmPolicyName: resolvedLifecycle.resolvedIlmPolicyName,
        templateLifecycle: resolvedLifecycle.resolvedLifecycle,
        templateFailureStoreDefaults: resolvedLifecycle.resolvedFailureStore,
      });

      setIsEditingDataLifecycle(true);
    };

    void run();
  }, [dataStream, loadDefaultSnapshotRepository, loadIlmPolicies, locator, resolvedLifecycle]);

  const applyDataLifecycle = useCallback(
    async ({ successfulData, failedData }: EditDataLifecycleFlyoutOnApplyArgs) => {
      if (!dataStream) {
        return;
      }

      const showSaveSuccessToast = () =>
        services.notificationService.showSuccessToast(
          i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.saveSuccessTitle', {
            defaultMessage: 'Data lifecycle updated',
          })
        );

      try {
        // Wired streams are managed by the Streams app: persist through the Streams ingest
        // API so the Streams definition (the source of truth) is updated. Writing ES directly
        // would be ignored because Streams re-applies its own definition.
        if (isWiredStreamDataStream(dataStream)) {
          const streamsGet = await sendRequest<Streams.all.GetResponse>({
            path: `/api/streams/${encodeURIComponent(dataStream.name)}`,
            method: 'get',
          });
          throwIfRequestError(streamsGet, 'Failed to load stream definition');

          if (streamsGet.data && Streams.ingest.all.GetResponse.is(streamsGet.data)) {
            const upsertRequest = convertGetResponseIntoUpsertRequest(streamsGet.data);
            if (!Streams.ingest.all.UpsertRequest.is(upsertRequest)) {
              return;
            }
            const currentLifecycle = upsertRequest.stream.ingest.lifecycle;

            const preservedDownsample =
              isStreamsDslLifecycle(currentLifecycle) &&
              Array.isArray(currentLifecycle.dsl.downsample)
                ? currentLifecycle.dsl.downsample
                : undefined;

            const nextLifecycle = (() => {
              if (!successfulData) {
                return undefined;
              }

              if (successfulData.inheritLifecycle) {
                return { inherit: {} };
              }

              if (successfulData.method === 'ilm') {
                const ilmPolicyName = successfulData.ilmPolicyName;
                if (typeof ilmPolicyName !== 'string' || ilmPolicyName.length === 0) {
                  return { inherit: {} };
                }
                return { ilm: { policy: ilmPolicyName } };
              }

              return {
                dsl: {
                  ...(typeof successfulData.dataRetention === 'string' &&
                  successfulData.dataRetention.length > 0
                    ? { data_retention: successfulData.dataRetention }
                    : {}),
                  ...(typeof successfulData.frozenAfter === 'string' &&
                  successfulData.frozenAfter.length > 0
                    ? { frozen_after: successfulData.frozenAfter }
                    : {}),
                  ...(preservedDownsample ? { downsample: preservedDownsample } : {}),
                },
              };
            })();

            const nextFailureStore = (() => {
              if (!failedData || failedData.inheritLifecycle) {
                return { inherit: {} };
              }

              if (failedData.failureStoreEnabled !== true) {
                return { disabled: {} };
              }

              if (failedData.retentionDisabled === true) {
                return { lifecycle: { disabled: {} } };
              }

              const retention = failedData.retention;
              return {
                lifecycle: {
                  enabled:
                    typeof retention === 'string' && retention.length > 0
                      ? { data_retention: retention }
                      : {},
                },
              };
            })();

            const nextIngest = {
              ...upsertRequest.stream.ingest,
              ...(nextLifecycle ? { lifecycle: nextLifecycle } : {}),
              // Only override the failure store when the failed-data tab was part of this apply.
              // The Inspect-policy "Apply" shortcut sends only `successfulData`, so we keep the
              // stream's current failure store (already carried over by the spread above) instead
              // of resetting it to inherit.
              ...(failedData ? { failure_store: nextFailureStore } : {}),
            };

            const streamsPut = await sendRequest({
              path: `/api/streams/${encodeURIComponent(dataStream.name)}/_ingest`,
              method: 'put',
              body: { ingest: nextIngest },
            });
            throwIfRequestError(streamsPut, 'Failed to update stream ingest settings');

            setIsEditingDataLifecycle(false);
            showSaveSuccessToast();
            onClose(true);
            return;
          }
        }

        const indexTemplateName = dataStream.indexTemplateName;

        const loadIndexTemplate = async (): Promise<TemplateDeserialized | undefined> => {
          const res = await sendRequest<TemplateDeserialized>({
            path: `${API_BASE_PATH}/index_templates/${encodeURIComponent(indexTemplateName)}`,
            method: 'get',
          });
          throwIfRequestError(res, 'Failed to load index template');
          return res.data ?? undefined;
        };

        const applySuccessful = async () => {
          if (!successfulData) {
            return;
          }

          if (successfulData.inheritLifecycle) {
            // "Inherit" means reset to the index template defaults (Streams behavior),
            // not disabling lifecycle outright.
            const template = await loadIndexTemplate();
            if (!template) {
              return;
            }

            const resolvedTemplateLifecycle: DataStream['lifecycle'] | undefined =
              template.template?.lifecycle ??
              (template._kbnMeta?.hasDatastream ? { enabled: true } : undefined);

            const tmplLifecycle = normalizeEsLifecycle(resolvedTemplateLifecycle);
            const { templateIlmName, preferIlm } = getTemplateIlmSettings(template);

            const tmplHasDslConfig = tmplLifecycle.enabled === true;
            const hasEffectiveDsl = tmplHasDslConfig && !(preferIlm && templateIlmName);

            if (hasEffectiveDsl) {
              const putDsl = await updateDataLifecycle([dataStream.name], {
                enabled: true,
                frozenAfter:
                  typeof resolvedTemplateLifecycle?.frozen_after === 'string'
                    ? resolvedTemplateLifecycle.frozen_after
                    : undefined,
                dataRetention:
                  typeof resolvedTemplateLifecycle?.data_retention === 'string'
                    ? resolvedTemplateLifecycle.data_retention
                    : undefined,
              });
              throwIfRequestError(putDsl, 'Failed to update data lifecycle');
              // ILM settings do not exist in serverless, so only clear data stream-level ILM
              // overrides on stateful deployments.
              if (!config.isServerless) {
                // "Inherit" means removing data stream-level ILM overrides so ES can fall back to
                // the index template settings.
                const clearDsSettings = await updateDataStreamSettings([dataStream.name], {
                  'index.lifecycle.name': null,
                  'index.lifecycle.prefer_ilm': null,
                });
                throwIfRequestError(clearDsSettings, 'Failed to clear data stream ILM settings');
                const indexResults = await Promise.all(
                  dataStream.indices.map((index) =>
                    updateIndexSettings(index.name, {
                      'index.lifecycle.name': null,
                      'index.lifecycle.prefer_ilm': null,
                    })
                  )
                );
                indexResults.forEach((r) =>
                  throwIfRequestError(r, 'Failed to update index settings')
                );
              }
              return;
            }

            if (templateIlmName) {
              const disableDsl = await updateDataLifecycle([dataStream.name], { enabled: false });
              throwIfRequestError(disableDsl, 'Failed to disable data lifecycle');
              // Clear data stream-level settings so ILM is inherited from the index template,
              // but update existing backing indices so the data stream reflects the change immediately.
              const clearDsSettings = await updateDataStreamSettings([dataStream.name], {
                'index.lifecycle.name': null,
                'index.lifecycle.prefer_ilm': null,
              });
              throwIfRequestError(clearDsSettings, 'Failed to clear data stream ILM settings');
              const indexResults = await Promise.all(
                dataStream.indices.map((index) =>
                  updateIndexSettings(index.name, {
                    'index.lifecycle.name': templateIlmName,
                    'index.lifecycle.prefer_ilm': true,
                  })
                )
              );
              indexResults.forEach((r) =>
                throwIfRequestError(r, 'Failed to update index settings')
              );
              return;
            }

            // No lifecycle defaults on the template: clear to DSL disabled + no ILM override.
            const disableDsl = await updateDataLifecycle([dataStream.name], { enabled: false });
            throwIfRequestError(disableDsl, 'Failed to disable data lifecycle');
            // ILM settings do not exist in serverless.
            if (!config.isServerless) {
              const clearDsSettings = await updateDataStreamSettings([dataStream.name], {
                'index.lifecycle.name': null,
                'index.lifecycle.prefer_ilm': null,
              });
              throwIfRequestError(clearDsSettings, 'Failed to clear data stream ILM settings');
            }
            return;
          }

          if (successfulData.method === 'dlm') {
            const putDsl = await updateDataLifecycle([dataStream.name], {
              enabled: true,
              frozenAfter: successfulData.frozenAfter,
              dataRetention: successfulData.dataRetention,
            });
            throwIfRequestError(putDsl, 'Failed to update data lifecycle');
            // ILM settings do not exist in serverless; only switch the stream to DSL by clearing
            // ILM overrides on stateful deployments.
            if (!config.isServerless) {
              // Ensure ILM settings are cleared so the stream is managed by DSL.
              const putDsSettings = await updateDataStreamSettings([dataStream.name], {
                'index.lifecycle.name': null,
                'index.lifecycle.prefer_ilm': false,
              });
              throwIfRequestError(putDsSettings, 'Failed to update data stream ILM settings');
              const indexResults = await Promise.all(
                dataStream.indices.map((index) =>
                  updateIndexSettings(index.name, {
                    'index.lifecycle.name': null,
                    'index.lifecycle.prefer_ilm': false,
                  })
                )
              );
              indexResults.forEach((r) =>
                throwIfRequestError(r, 'Failed to update index settings')
              );
            }
            return;
          }

          // Apply the ILM policy as a data stream-level override only. We must not mutate the
          // shared index template here: the template is the inheritance source, and overwriting
          // its lifecycle would corrupt what "inherit" resolves to for this and other data streams.
          const disableDsl = await updateDataLifecycle([dataStream.name], { enabled: false });
          throwIfRequestError(disableDsl, 'Failed to disable data lifecycle');

          const putDsSettings = await updateDataStreamSettings([dataStream.name], {
            'index.lifecycle.name': successfulData.ilmPolicyName,
            'index.lifecycle.prefer_ilm': true,
          });
          throwIfRequestError(putDsSettings, 'Failed to update data stream ILM settings');

          // Data stream settings only affect future backing indices, so update the existing
          // backing indices too for the change to take effect immediately.
          const indexResults = await Promise.all(
            dataStream.indices.map((index) =>
              updateIndexSettings(index.name, {
                'index.lifecycle.name': successfulData.ilmPolicyName,
                'index.lifecycle.prefer_ilm': true,
              })
            )
          );
          indexResults.forEach((r) => throwIfRequestError(r, 'Failed to update index settings'));
        };

        const applyFailed = async () => {
          if (!failedData) {
            return;
          }

          if (failedData.inheritLifecycle) {
            // "Inherit" delegates to the server (`inheritFailureStore`), which resolves the
            // template and either deletes the data stream-level options (when the template leaves
            // the failure store disabled) or re-applies the template's resolved options (when the
            // template enables it). Deleting on the disabled case removes the explicit override so
            // the data stream reads as inherited rather than as an explicit disable.
            const del = await updateDSFailureStore([dataStream.name], {
              dsFailureStore: false,
              inheritFailureStore: true,
            });
            throwIfRequestError(del, 'Failed to inherit failure store configuration');
            return;
          }

          const put = await updateDSFailureStore([dataStream.name], {
            dsFailureStore: failedData.failureStoreEnabled,
            customRetentionPeriod: failedData.retention,
            retentionDisabled: failedData.retentionDisabled,
          });
          throwIfRequestError(put, 'Failed to update failure store configuration');
        };

        // Apply both parts independently so that a failure in one does not discard the other's
        // result. Elasticsearch has no transaction spanning these calls, so part of the
        // configuration may persist even when the other fails; we surface a tailored message and
        // still close + reload the flyout so it reflects whatever actually persisted.
        const [successfulResult, failedResult] = await Promise.allSettled([
          applySuccessful(),
          applyFailed(),
        ]);

        setIsEditingDataLifecycle(false);

        const successfulFailed = successfulResult.status === 'rejected';
        const failedFailed = failedResult.status === 'rejected';

        if (!successfulFailed && !failedFailed) {
          showSaveSuccessToast();
          onClose(true);
          return;
        }

        const successfulReason =
          successfulResult.status === 'rejected'
            ? getErrorMessage(successfulResult.reason)
            : undefined;
        const failedReason =
          failedResult.status === 'rejected' ? getErrorMessage(failedResult.reason) : undefined;

        // An un-attempted half resolves without doing anything, so the paired messages below
        // ("one half saved, the other did not") only hold when both halves were attempted.
        const attemptedSuccessful = Boolean(successfulData);
        const attemptedFailed = Boolean(failedData);

        if (successfulFailed && failedFailed) {
          services.notificationService.showDangerToast(
            i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.saveErrorTitle', {
              defaultMessage: 'Could not save changes',
            }),
            [successfulReason, failedReason].filter(Boolean).join('; ')
          );
        } else if (!attemptedSuccessful || !attemptedFailed) {
          services.notificationService.showDangerToast(
            i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.saveErrorTitle', {
              defaultMessage: 'Could not save changes',
            }),
            successfulReason ?? failedReason
          );
        } else if (successfulFailed) {
          services.notificationService.showDangerToast(
            i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.saveSuccessfulDataErrorTitle', {
              defaultMessage:
                'The failed data lifecycle was saved, but the successful data lifecycle could not be saved',
            }),
            successfulReason
          );
        } else {
          services.notificationService.showDangerToast(
            i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.saveFailedDataErrorTitle', {
              defaultMessage:
                'The successful data lifecycle was saved, but the failed data lifecycle could not be saved',
            }),
            failedReason
          );
        }

        // Reload so the flyout no longer shows stale values for the part that did persist.
        onClose(true);
      } catch (error) {
        services.notificationService.showDangerToast(
          i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.saveErrorTitle', {
            defaultMessage: 'Could not save changes',
          }),
          getErrorMessage(error)
        );
      }
    },
    [services.notificationService, dataStream, onClose, config.isServerless]
  );

  const closeEditFlyout = useCallback(() => setIsEditingDataLifecycle(false), []);
  const closeInspectFlyout = useCallback(() => setInspectedIlmPolicyName(undefined), []);

  // A wired root stream has no parent, so it cannot inherit anything: hide every
  // inheritance affordance (toggle and label) for it.
  const isWiredRoot = isWiredRootDataStream(dataStream);

  const inheritLabel =
    !isWiredRoot && isWiredStreamDataStream(dataStream)
      ? i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.inheritFromParentLabel', {
          defaultMessage: 'Inherit lifecycle from parent stream',
        })
      : undefined;

  // For a wired root, suppress the "view index template" inherit link too so no
  // inheritance UI is rendered at all.
  const inheritIndexTemplateHref = isWiredRoot ? undefined : flyoutSeed.indexTemplateHref;

  const flyoutSuccessfulData = useMemo(
    () => ({
      inheritLifecycle: isWiredRoot ? false : inheritSuccessfulLifecycle,
      onInheritLifecycleChange: isWiredRoot ? undefined : handleInheritSuccessfulLifecycleChange,
      inheritLabel,
      indexTemplateHref: inheritIndexTemplateHref,
      dlm: {
        defaultValue: successfulDlmDefaultValue,
        // The cluster-wide maximum retention only constrains DLM retention in Serverless.
        maximumRetentionPeriod: config.isServerless
          ? dataStream?.lifecycle?.globalMaxRetention
          : undefined,
        hasEnterpriseLicense,
        hasDefaultSnapshotRepository: defaultSnapshotRepository !== null,
        defaultSnapshotRepository: defaultSnapshotRepository ?? undefined,
        hasExistingRepositories,
        manageRepositoriesUrl: core.getUrlForApp('management', {
          path: '/data/snapshot_restore/repositories',
        }),
        createDefaultRepositoryUrl: core.getUrlForApp('management', {
          path: '/data/snapshot_restore/add_repository',
        }),
        canCreateDefaultSnapshotRepository:
          core.application.capabilities.management?.data?.snapshot_restore === true,
        enterprise: {
          isCloudEnabled: plugins.cloud?.isCloudEnabled === true,
          canManageLicense:
            core.application.capabilities.management?.stack?.license_management === true,
          trialDaysLeft: plugins.cloud?.trialDaysLeft?.(),
          subscriptionFeaturesUrl: plugins.cloud?.isCloudEnabled
            ? CLOUD_SUBSCRIPTION_FEATURES_URL
            : SUBSCRIPTION_FEATURES_URL,
          onUpgrade: plugins.cloud?.isCloudEnabled
            ? undefined
            : () => window.open(CONTACT_US_URL, '_blank', 'noopener'),
        },
        onRefreshDefaultSnapshotRepository: loadDefaultSnapshotRepository,
      },
      ilm: config.isServerless
        ? undefined
        : {
            method: lifecycleMethod,
            onMethodChange: setLifecycleMethod,
            policies: ilmPolicies,
            selectedPolicyName: selectedIlmPolicyName,
            onPolicySelect: setSelectedIlmPolicyName,
            onPolicyInspect: (policyName: string) => setInspectedIlmPolicyName(policyName),
            canManageIlm: hasManageIlm,
            hasExistingIlmPolicy: isNextGenIlm(dataStream),
          },
    }),
    [
      config.isServerless,
      core,
      dataStream,
      defaultSnapshotRepository,
      handleInheritSuccessfulLifecycleChange,
      hasEnterpriseLicense,
      hasManageIlm,
      hasExistingRepositories,
      ilmPolicies,
      inheritIndexTemplateHref,
      inheritLabel,
      inheritSuccessfulLifecycle,
      isWiredRoot,
      lifecycleMethod,
      loadDefaultSnapshotRepository,
      plugins.cloud,
      selectedIlmPolicyName,
      successfulDlmDefaultValue,
    ]
  );

  const flyoutFailedData = useMemo(
    () => ({
      inheritLifecycle: isWiredRoot ? false : inheritFailedLifecycle,
      onInheritLifecycleChange: isWiredRoot ? undefined : handleInheritFailedLifecycleChange,
      inheritLabel,
      indexTemplateHref: inheritIndexTemplateHref,
      failureStoreEnabled: inheritFailedLifecycle
        ? flyoutSeed.templateFailureStoreDefaults?.enabled ??
          (dataStream?.failureStoreSettings === undefined
            ? failureStoreEnabled
            : dataStream?.matchesFailureStoreClusterPattern === true)
        : failureStoreEnabled,
      onFailureStoreChange: setFailureStoreEnabled,
      deletePhaseDefaultValue: failedDeletePhaseDefaultValue,
    }),
    [
      dataStream?.failureStoreSettings,
      dataStream?.matchesFailureStoreClusterPattern,
      failedDeletePhaseDefaultValue,
      failureStoreEnabled,
      handleInheritFailedLifecycleChange,
      inheritIndexTemplateHref,
      inheritFailedLifecycle,
      inheritLabel,
      isWiredRoot,
      flyoutSeed.templateFailureStoreDefaults?.enabled,
    ]
  );

  return {
    isServerless: config.isServerless,
    /** ILM policies loaded for the flyout; also consumed by the summary to count phases. */
    ilmPolicies,
    isEditingDataLifecycle,
    openEditFlyout,
    closeEditFlyout,
    applyDataLifecycle,
    flyoutSuccessfulData,
    flyoutFailedData,
    inspectedIlmPolicyName,
    inspectedIlmPolicy,
    closeInspectFlyout,
  };
};
