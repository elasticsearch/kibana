/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { i18n } from '@kbn/i18n';
import type {
  Streams,
  IngestStreamLifecycle,
  IngestStreamEffectiveLifecycle,
} from '@kbn/streams-schema';
import {
  Streams as StreamsSchema,
  effectiveToIngestLifecycle,
  isIlmLifecycle,
  isInheritLifecycle,
  isRoot,
} from '@kbn/streams-schema';
import type { DataLifecycleMethod, IlmPolicyForFlyout } from '@kbn/data-lifecycle-phases';
import {
  buildDataLifecycleApplyPayload,
  EditDataLifecycleFlyoutBody,
  FlyoutFooterWithRetentionWarning,
  useRetentionWarning,
} from '@kbn/data-lifecycle-phases';
import type { PolicyFromES } from '@kbn/index-lifecycle-management-common-shared';
import type { CoreStart } from '@kbn/core/public';
import type { StreamsRepositoryClient } from '@kbn/streams-plugin/public/api';
import { useGeneratedHtmlId } from '@elastic/eui';
import { isEqual } from 'lodash';
import { InspectIlmPolicyFlyout } from '@kbn/data-lifecycle-phases';
import { useStreamsAppFetch } from '../../../../../../hooks/use_streams_app_fetch';
import type { EditFlyoutPreviewModel } from '../../common/hooks/use_edit_flyout_preview_sync';
import { useEditFlyoutPreviewSyncFromModel } from '../../common/hooks/use_edit_flyout_preview_sync';
import { useInheritLink } from '../../common/hooks/use_inherit_link';
import { useOverrideSettingsConfirmation } from '../../common/hooks/use_override_settings_confirmation';
import { LifecycleFlyout } from '../../common/lifecycle_flyout';
import { getLifecycleFlyoutContainer } from '../../common/get_lifecycle_flyout_container';
import { computeSuccessfulLifecycleFlyoutPreview } from '../../common/data_lifecycle/compute_successful_lifecycle_flyout_preview';
import type { IlmPhasesMap } from '../../common/data_lifecycle/preview_models';

const getIlmPolicies = async ({
  http,
  signal,
}: {
  http: CoreStart['http'];
  signal: AbortSignal;
}): Promise<PolicyFromES[]> => {
  return await http.get('/api/index_lifecycle_management/policies', {
    headers: { 'X-Elastic-Internal-Origin': 'Kibana' },
    signal,
  });
};

const mapIlmPolicyToFlyout = (policy: PolicyFromES): IlmPolicyForFlyout => {
  return {
    name: policy.name,
    phases: policy.policy.phases,
    serializedPolicy: policy.policy,
  };
};

export interface UseEditSuccessfulLifecycleFlyoutArgs {
  definition: Streams.ingest.all.GetResponse;
  stats?: { size?: string; sizeBytes?: number; totalDocs?: number };
  core: CoreStart;
  http: CoreStart['http'];
  application: CoreStart['application'];
  streamsRepositoryClient: StreamsRepositoryClient;
  isServerless: boolean;
  euiTheme: { colors: { severity: { success: string } } };
  ilmPhases: IlmPhasesMap;
  signal: AbortSignal;
  updateLifecycle: (lifecycle: IngestStreamLifecycle) => Promise<boolean>;
  updateInProgress: boolean;
  isExternalFlyoutOpen: boolean;
}

export const useEditSuccessfulLifecycleFlyout = ({
  definition,
  stats,
  core,
  http,
  application,
  streamsRepositoryClient,
  isServerless,
  euiTheme,
  ilmPhases,
  signal,
  updateLifecycle,
  updateInProgress,
  isExternalFlyoutOpen,
}: UseEditSuccessfulLifecycleFlyoutArgs) => {
  const titleId = useGeneratedHtmlId({
    prefix: 'streamsEditSuccessfulDataLifecycleFlyoutTitle',
  });

  const [isOpen, setIsOpen] = useState(false);
  const [inheritLifecycle, setInheritLifecycle] = useState(false);
  const [method, setMethod] = useState<DataLifecycleMethod>('dlm');
  const [selectedIlmPolicyName, setSelectedIlmPolicyName] = useState<string | undefined>(undefined);
  const [ilmPolicies, setIlmPolicies] = useState<IlmPolicyForFlyout[]>([]);
  const [isLoadingIlmPolicies, setIsLoadingIlmPolicies] = useState(false);
  const [inspectedIlmPolicyName, setInspectedIlmPolicyName] = useState<string | null>(null);
  const selectedPolicyNameAtInspectRef = useRef<string | undefined>(undefined);

  const canShowInherit = !(
    StreamsSchema.WiredStream.GetResponse.is(definition) && isRoot(definition.stream.name)
  );

  const inheritedFetchEnabled = isOpen && !isServerless && canShowInherit;

  const {
    value: inheritedEffectiveLifecycle,
    loading: isLoadingInheritedEffectiveLifecycle,
    refresh: resetInheritedEffectiveLifecycle,
  } = useStreamsAppFetch(
    async ({ signal: fetchSignal }) => {
      if (!inheritedFetchEnabled) {
        return null;
      }
      const { lifecycle } = await streamsRepositoryClient.fetch(
        'GET /internal/streams/{name}/lifecycle/_inherited',
        {
          signal: fetchSignal,
          params: { path: { name: definition.stream.name } },
        }
      );
      return lifecycle;
    },
    [inheritedFetchEnabled, streamsRepositoryClient, definition.stream.name],
    { withTimeRange: false, withRefresh: false }
  );

  const inheritedEffectiveLifecycleOrNull = isLoadingInheritedEffectiveLifecycle
    ? null
    : inheritedEffectiveLifecycle ?? null;

  const isLoadingInherited =
    inheritLifecycle && inheritedFetchEnabled && inheritedEffectiveLifecycleOrNull === null;

  const hotColor = isServerless ? euiTheme.colors.severity.success : ilmPhases.hot.color;

  const openFlyout = useCallback(() => {
    if (isExternalFlyoutOpen) {
      return;
    }

    const nextInherit = isInheritLifecycle(definition.stream.ingest.lifecycle);
    const nextMethod: DataLifecycleMethod = isIlmLifecycle(definition.effective_lifecycle)
      ? 'ilm'
      : 'dlm';
    const nextPolicyName = isIlmLifecycle(definition.effective_lifecycle)
      ? definition.effective_lifecycle.ilm.policy
      : undefined;

    setInheritLifecycle(nextInherit);
    setMethod(nextMethod);
    setSelectedIlmPolicyName(nextPolicyName);
    resetInheritedEffectiveLifecycle();
    setIsOpen(true);

    if (!isServerless && !isLoadingIlmPolicies && ilmPolicies.length === 0) {
      setIsLoadingIlmPolicies(true);
      getIlmPolicies({ http, signal })
        .then((policies) => setIlmPolicies(policies.map(mapIlmPolicyToFlyout)))
        .catch((error) => {
          setIlmPolicies([]);
          if (signal.aborted) {
            return;
          }
          core.notifications.toasts.addError(error, {
            title: i18n.translate('xpack.streams.editSuccessfulLifecycle.failedToLoadIlmPolicies', {
              defaultMessage: 'Failed to load ILM policies',
            }),
          });
        })
        .finally(() => setIsLoadingIlmPolicies(false));
    }
  }, [
    core.notifications.toasts,
    definition.effective_lifecycle,
    definition.stream.ingest.lifecycle,
    http,
    ilmPolicies.length,
    isLoadingIlmPolicies,
    isExternalFlyoutOpen,
    isServerless,
    resetInheritedEffectiveLifecycle,
    signal,
  ]);

  const closeInspectFlyout = useCallback(() => {
    setInspectedIlmPolicyName(null);
  }, []);

  const closeFlyout = useCallback(() => {
    closeInspectFlyout();
    setIsOpen(false);
  }, [closeInspectFlyout]);

  // Single source of truth for mapping an inherited effective lifecycle onto the
  // flyout's method/policy state. A `null` inherited lifecycle means "not resolved
  // yet", in which case we only clear the selected policy and wait for the fetch.
  const applyInheritedLifecycle = useCallback(
    (inherited: IngestStreamEffectiveLifecycle | null | undefined) => {
      if (inherited && isIlmLifecycle(inherited)) {
        setMethod('ilm');
        setSelectedIlmPolicyName(inherited.ilm.policy);
        return;
      }
      if (inherited) {
        setMethod('dlm');
      }
      setSelectedIlmPolicyName(undefined);
    },
    []
  );

  const onChangeInheritLifecycle = useCallback(
    (next: boolean) => {
      if (next) {
        setInheritLifecycle(true);
        applyInheritedLifecycle(inheritedEffectiveLifecycleOrNull);
        if (inheritedEffectiveLifecycleOrNull === null) {
          resetInheritedEffectiveLifecycle();
        }
        return;
      }
      setInheritLifecycle(false);
    },
    [applyInheritedLifecycle, inheritedEffectiveLifecycleOrNull, resetInheritedEffectiveLifecycle]
  );

  useEffect(() => {
    if (!inheritLifecycle) {
      return;
    }
    applyInheritedLifecycle(inheritedEffectiveLifecycleOrNull);
  }, [applyInheritedLifecycle, inheritLifecycle, inheritedEffectiveLifecycleOrNull]);

  const inheritLabel = StreamsSchema.WiredStream.GetResponse.is(definition)
    ? i18n.translate('xpack.streams.editSuccessfulLifecycle.inheritFromParentLabel', {
        defaultMessage: 'Inherit lifecycle from parent stream',
      })
    : i18n.translate('xpack.streams.editSuccessfulLifecycle.inheritFromIndexTemplateLabel', {
        defaultMessage: 'Inherit lifecycle from index template',
      });

  const inheritLink = useInheritLink(definition, {
    classicIndexTemplate: i18n.translate(
      'xpack.streams.editSuccessfulLifecycle.viewIndexTemplateLinkLabel',
      { defaultMessage: 'View index template' }
    ),
    wiredParentStream: i18n.translate(
      'xpack.streams.editSuccessfulLifecycle.viewParentStreamLinkLabel',
      { defaultMessage: 'View parent stream' }
    ),
  });

  const retentionWarning = useRetentionWarning({
    ilmPolicies,
    selectedIlmPolicyName: method === 'ilm' ? selectedIlmPolicyName : undefined,
    canUseDownsampling: definition.index_mode === 'time_series',
    inheritLifecycle,
  });

  const { confirmOverride, modal: overrideModal } = useOverrideSettingsConfirmation({
    definition,
  });

  const openInspectPolicy = useCallback(
    (policyName: string) => {
      selectedPolicyNameAtInspectRef.current = selectedIlmPolicyName;
      setInspectedIlmPolicyName(policyName);
    },
    [selectedIlmPolicyName]
  );

  const applyPayload = useMemo(() => {
    if (!isOpen) return null;
    return buildDataLifecycleApplyPayload({
      inheritLifecycle,
      method,
      ilmPolicyName: selectedIlmPolicyName,
    });
  }, [inheritLifecycle, isOpen, method, selectedIlmPolicyName]);

  const nextLifecycle: IngestStreamLifecycle | undefined = useMemo(() => {
    if (!applyPayload) return undefined;

    if (applyPayload.inheritLifecycle) {
      return { inherit: {} };
    }

    if (applyPayload.method === 'ilm') {
      return { ilm: { policy: applyPayload.ilmPolicyName } };
    }

    const baseline = effectiveToIngestLifecycle(definition.effective_lifecycle);
    if ('dsl' in baseline) return baseline;
    return { dsl: {} };
  }, [applyPayload, definition.effective_lifecycle]);

  const isApplyDisabled = useMemo(() => {
    if (!definition.privileges.lifecycle) return true;
    if (!applyPayload) return true;
    if (!nextLifecycle) return true;
    if (inheritLifecycle && inheritedFetchEnabled && inheritedEffectiveLifecycleOrNull === null)
      return true;
    return isEqual(definition.stream.ingest.lifecycle, nextLifecycle) || updateInProgress;
  }, [
    applyPayload,
    definition.privileges.lifecycle,
    definition.stream.ingest.lifecycle,
    inheritLifecycle,
    inheritedFetchEnabled,
    inheritedEffectiveLifecycleOrNull,
    nextLifecycle,
    updateInProgress,
  ]);

  const flyoutPreview = useMemo(() => {
    if (!isOpen) {
      return null;
    }
    return computeSuccessfulLifecycleFlyoutPreview({
      inheritLifecycle,
      inheritedEffectiveLifecycle: inheritedEffectiveLifecycleOrNull,
      method,
      selectedIlmPolicyName,
      inspectedIlmPolicyName,
      selectedIlmPolicyNameAtInspect: selectedPolicyNameAtInspectRef.current,
      ilmPolicies,
      effectiveLifecycle: definition.effective_lifecycle,
      indexMode: definition.index_mode,
      isServerless,
      ilmPhases,
      hotColor,
      stats,
    });
  }, [
    definition.effective_lifecycle,
    definition.index_mode,
    hotColor,
    ilmPhases,
    ilmPolicies,
    inheritLifecycle,
    inheritedEffectiveLifecycleOrNull,
    inspectedIlmPolicyName,
    isOpen,
    isServerless,
    method,
    selectedIlmPolicyName,
    stats,
  ]);

  const previewModel = useMemo<EditFlyoutPreviewModel>(() => {
    if (!isOpen || !flyoutPreview) {
      return null;
    }

    const hasEdits = nextLifecycle
      ? !isEqual(definition.stream.ingest.lifecycle, nextLifecycle)
      : false;
    const hasUnsavedChanges = hasEdits && !updateInProgress;

    if (flyoutPreview.action === 'clear') {
      return { action: 'clear', hasUnsavedChanges };
    }

    return {
      action: 'apply',
      timelineModel: flyoutPreview.timelineModel,
      retentionPeriod: flyoutPreview.retentionPeriod,
      dataPhasesCount: flyoutPreview.dataPhasesCount,
      downsampleStepsCount: flyoutPreview.downsampleStepsCount,
      hasUnsavedChanges: flyoutPreview.suppressUnsavedChanges ? false : hasUnsavedChanges,
    };
  }, [definition.stream.ingest.lifecycle, flyoutPreview, isOpen, nextLifecycle, updateInProgress]);

  useEditFlyoutPreviewSyncFromModel({
    isFlyoutOpen: isOpen,
    isExternalFlyoutOpen,
    preview: previewModel,
  });

  const previewHeader = useMemo(() => {
    if (inheritLifecycle) {
      if (inheritedEffectiveLifecycleOrNull === null) {
        return undefined;
      }

      const ilmPolicyName = isIlmLifecycle(inheritedEffectiveLifecycleOrNull)
        ? inheritedEffectiveLifecycleOrNull.ilm.policy
        : undefined;
      const inheritedMethod: 'dlm' | 'ilm' = ilmPolicyName ? 'ilm' : 'dlm';
      return {
        inheritLifecycle: true,
        method: inheritedMethod,
        ilmPolicyName,
        canShowInheritBadge: canShowInherit,
      };
    }

    const previewIlmPolicyName =
      method === 'ilm' &&
      inspectedIlmPolicyName &&
      selectedIlmPolicyName === selectedPolicyNameAtInspectRef.current
        ? inspectedIlmPolicyName
        : selectedIlmPolicyName;

    return {
      inheritLifecycle,
      method,
      ilmPolicyName: previewIlmPolicyName,
      canShowInheritBadge: canShowInherit,
    };
  }, [
    canShowInherit,
    inheritLifecycle,
    inheritedEffectiveLifecycleOrNull,
    inspectedIlmPolicyName,
    method,
    selectedIlmPolicyName,
  ]);

  const inspectFlyout = useMemo(() => {
    if (!isOpen || !inspectedIlmPolicyName) {
      return null;
    }

    const inspected = ilmPolicies.find((p) => p.name === inspectedIlmPolicyName);
    if (!inspected?.serializedPolicy) {
      return null;
    }

    return (
      <InspectIlmPolicyFlyout
        policyName={inspectedIlmPolicyName}
        policy={inspected.serializedPolicy}
        onBack={closeInspectFlyout}
        onEditPolicy={(policyToEdit) =>
          application.navigateToApp('management', {
            path: `data/index_lifecycle_management/policies/edit/${encodeURIComponent(
              policyToEdit
            )}`,
            openInNewTab: true,
          })
        }
        primaryAction={{
          label: i18n.translate(
            'xpack.streams.editSuccessfulLifecycle.inspectIlmPolicy.primaryActionApplyLabel',
            { defaultMessage: 'Apply' }
          ),
          onClick: async (policyToApply) => {
            closeInspectFlyout();
            const succeeded = await updateLifecycle({ ilm: { policy: policyToApply } });
            if (succeeded) {
              setInheritLifecycle(false);
              setMethod('ilm');
              setSelectedIlmPolicyName(policyToApply);
            }
          },
          'data-test-subj': 'inspectIlmPolicyFlyoutSelectAndApplyButton',
          isDisabled: updateInProgress,
        }}
        type="push"
        container={getLifecycleFlyoutContainer()}
        ownFocus={false}
      />
    );
  }, [
    application,
    closeInspectFlyout,
    ilmPolicies,
    inspectedIlmPolicyName,
    isOpen,
    updateInProgress,
    updateLifecycle,
  ]);

  const flyout = !isOpen ? null : (
    <>
      <LifecycleFlyout
        onClose={closeFlyout}
        ownFocus={false}
        paddingSize="none"
        data-test-subj="streamsEditSuccessfulDataLifecycleFlyout"
        titleId={titleId}
        title={i18n.translate('xpack.streams.editSuccessfulLifecycle.title', {
          defaultMessage: 'Edit successful data lifecycle',
        })}
      >
        <EditDataLifecycleFlyoutBody
          inherit={
            canShowInherit
              ? {
                  value: inheritLifecycle,
                  onChange: onChangeInheritLifecycle,
                  label: inheritLabel,
                  link: inheritLink,
                }
              : undefined
          }
          method={
            isServerless
              ? undefined
              : {
                  value: method,
                  onChange: setMethod,
                }
          }
          ilm={
            isServerless
              ? undefined
              : {
                  policies: isLoadingIlmPolicies ? [] : ilmPolicies,
                  selectedPolicyName: selectedIlmPolicyName,
                  isLoadingInherited,
                  onSelect: setSelectedIlmPolicyName,
                  onInspect: openInspectPolicy,
                }
          }
        />

        <FlyoutFooterWithRetentionWarning
          onCancel={closeFlyout}
          onApply={() => {
            if (!nextLifecycle) return;
            if (inheritLifecycle) {
              updateLifecycle(nextLifecycle);
              return;
            }
            confirmOverride(() => updateLifecycle(nextLifecycle), { targetMethod: method });
          }}
          isApplyDisabled={isApplyDisabled}
          showWarning={retentionWarning}
        />
      </LifecycleFlyout>

      {inspectFlyout}
      {overrideModal}
    </>
  );

  return {
    isOpen,
    titleId,
    openFlyout,
    closeFlyout,
    flyout,
    previewHeader,
  };
};
