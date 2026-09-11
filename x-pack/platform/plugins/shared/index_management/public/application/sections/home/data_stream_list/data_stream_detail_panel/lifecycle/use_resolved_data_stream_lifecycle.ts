/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  isDslLifecycle as isStreamsDslLifecycle,
  isIlmLifecycle as isStreamsIlmLifecycle,
  isInheritLifecycle as isStreamsInheritLifecycle,
  isInheritFailureStore,
} from '@kbn/streams-schema';
import type { Streams } from '@kbn/streams-schema';

import type { DataStream, TemplateDeserialized } from '../../../../../../../common';
import { API_BASE_PATH } from '../../../../../../../common/constants';
import { isNextGenIlm } from '../../../../../lib/data_streams';
import { sendRequest } from '../../../../../services/use_request';
import {
  isRecord,
  isWiredStreamDataStream,
  isWiredRootDataStream,
  normalizeEsLifecycle,
  streamsDslToEsLifecycle,
  resolveStreamsFailureStore,
  getTemplateIlmSettings,
} from './lifecycle_utils';
import type { ResolvedFailureStore } from './lifecycle_utils';

export type { ResolvedFailureStore } from './lifecycle_utils';

/**
 * The fully resolved lifecycle of a data stream, combining the data stream's own
 * configuration with whatever it inherits from its source.
 */
export interface ResolvedDataStreamLifecycle {
  isLoading: boolean;
  inheritSuccessful: boolean;
  inheritFailed: boolean;
  resolvedIlmPolicyName?: string;
  resolvedLifecycle?: DataStream['lifecycle'];
  resolvedFailureStore?: ResolvedFailureStore;
}

const resolveStreamsLifecycle = (
  response: Streams.ingest.all.GetResponse
): ResolvedDataStreamLifecycle => {
  const lifecycle = response.stream.ingest.lifecycle;
  const failureStore = response.stream.ingest.failure_store;
  const effectiveLifecycle = response.effective_lifecycle;
  const effectiveFailureStore = response.effective_failure_store;

  const resolvedLifecycle = isStreamsDslLifecycle(effectiveLifecycle)
    ? streamsDslToEsLifecycle(effectiveLifecycle.dsl)
    : undefined;

  return {
    isLoading: false,
    inheritSuccessful: isStreamsInheritLifecycle(lifecycle),
    inheritFailed: isInheritFailureStore(failureStore),
    resolvedIlmPolicyName: isStreamsIlmLifecycle(effectiveLifecycle)
      ? effectiveLifecycle.ilm.policy
      : undefined,
    resolvedLifecycle,
    resolvedFailureStore: resolveStreamsFailureStore(effectiveFailureStore),
  };
};

const resolveTemplateLifecycle = (
  dataStream: DataStream,
  template: TemplateDeserialized
): ResolvedDataStreamLifecycle => {
  const failureStore: unknown = template.template?.data_stream_options?.failure_store;

  const resolvedLifecycle =
    template.template?.lifecycle ??
    (template._kbnMeta.hasDatastream ? { enabled: true } : undefined);

  const dsLifecycle = normalizeEsLifecycle(dataStream.lifecycle);
  const tmplLifecycle = normalizeEsLifecycle(resolvedLifecycle);

  const dsLifecycleEnabledRaw = dataStream.lifecycle?.enabled;
  const dsDeterminedBy = dataStream.lifecycle?.retention_determined_by;
  const dsMatchesTemplateDsl =
    dsLifecycle.enabled === tmplLifecycle.enabled &&
    dsLifecycle.data_retention === tmplLifecycle.data_retention &&
    dsLifecycle.frozen_after === tmplLifecycle.frozen_after;
  const dsHasExplicitDslOverride =
    dsLifecycleEnabledRaw === false ||
    (dsDeterminedBy === 'data_stream_configuration' && !dsMatchesTemplateDsl) ||
    dataStream.lifecycleSettings?.preferIlm !== undefined;

  const tmplHasDslConfig = tmplLifecycle.enabled === true;
  const shouldInheritDsl = tmplHasDslConfig && !dsHasExplicitDslOverride;

  const { templateIlmName, preferIlm } = getTemplateIlmSettings(template, {
    fallbackToTemplateIlmPolicy: true,
  });

  const hasEffectiveDsl = tmplHasDslConfig && !(preferIlm && templateIlmName);
  const effectiveTemplateIlmName = hasEffectiveDsl ? undefined : templateIlmName;

  const hasExplicitIlmOverride =
    dataStream.lifecycleSettings?.explicitIlmPolicyName !== undefined ||
    dataStream.lifecycleSettings?.preferIlm !== undefined;
  const shouldInheritIlm =
    isNextGenIlm(dataStream) &&
    effectiveTemplateIlmName !== undefined &&
    dataStream.ilmPolicyName === effectiveTemplateIlmName &&
    !hasExplicitIlmOverride;

  const inheritSuccessful = shouldInheritDsl || shouldInheritIlm;

  const resolvedTemplateFailureEnabled =
    isRecord(failureStore) && typeof failureStore.enabled === 'boolean'
      ? failureStore.enabled
      : dataStream.matchesFailureStoreClusterPattern === true;

  const inheritFailed = (() => {
    // An explicit `enabled: false` override (from the data stream `_options`) means the user
    // deliberately disabled the failure store, so it is never inherited. This is reliable because
    // "inherit" removes the override (deleteDataStreamOptions) rather than writing
    // `{ enabled: false }`, so an explicit disabled option can only come from an explicit user
    // choice — even when the index template also leaves the failure store disabled.
    if (dataStream.failureStoreSettings?.enabled === false) {
      return false;
    }

    // When Elasticsearch reports the failure store retention is determined by the default
    // failures retention (`default_failures_retention`) rather than by `data_stream_configuration`,
    // there is no explicit data stream override and the failure store is inherited — regardless of
    // how `enabled` was resolved.
    if (
      dataStream.failureStoreEnabled === true &&
      dataStream.failureStoreRetention?.retentionDeterminedBy === 'default_failures_retention' &&
      dataStream.failureStoreRetention?.retentionDisabled !== true &&
      dataStream.failureStoreRetention?.customRetentionPeriod === undefined
    ) {
      return true;
    }

    const tmplFailureLifecycle: unknown = isRecord(failureStore)
      ? failureStore.lifecycle
      : undefined;
    const tmplFailureLifecycleRecord = isRecord(tmplFailureLifecycle)
      ? tmplFailureLifecycle
      : undefined;
    const tmplLifecycleEnabled = tmplFailureLifecycleRecord?.enabled;
    const tmplDataRetention = tmplFailureLifecycleRecord?.data_retention;

    const dsEnabled = dataStream.failureStoreEnabled === true;
    // Only a *custom* retention is an explicit override. A default retention (the value
    // Elasticsearch applies when nothing is configured) must be treated as "no explicit
    // retention" so it still compares as inherited against a template that also leaves it
    // unset — otherwise a materialized default would look like a user override.
    const dsDataRetention = dataStream.failureStoreRetention?.customRetentionPeriod;
    const dsLifecycleEnabled =
      dataStream.failureStoreRetention?.retentionDisabled === true ? false : undefined;

    const resolvedTemplateLifecycleEnabled =
      typeof tmplLifecycleEnabled === 'boolean'
        ? tmplLifecycleEnabled
        : resolvedTemplateFailureEnabled === true
        ? true
        : undefined;

    const resolvedTemplateDataRetention =
      (typeof tmplDataRetention === 'string' && tmplDataRetention.length > 0) ||
      tmplDataRetention === -1
        ? tmplDataRetention
        : undefined;

    const lifecycleEnabledMatches =
      resolvedTemplateFailureEnabled !== true
        ? true
        : resolvedTemplateLifecycleEnabled === false
        ? dsLifecycleEnabled === false
        : dsLifecycleEnabled !== false;

    return (
      dsEnabled === resolvedTemplateFailureEnabled &&
      lifecycleEnabledMatches &&
      (dsDataRetention ?? undefined) === (resolvedTemplateDataRetention ?? undefined)
    );
  })();

  const resolvedFailureStore: ResolvedFailureStore =
    isRecord(failureStore) && typeof failureStore.enabled === 'boolean'
      ? (() => {
          const lifecycle: unknown = failureStore.lifecycle;
          const lifecycleRecord = isRecord(lifecycle) ? lifecycle : undefined;
          const lifecycleEnabled: unknown = lifecycleRecord?.enabled;
          const dataRetention: unknown = lifecycleRecord?.data_retention;
          return {
            enabled: failureStore.enabled,
            retention: typeof dataRetention === 'string' ? dataRetention : undefined,
            retentionDisabled: lifecycleEnabled === false,
          };
        })()
      : // The index template does not define a failure store: fall back to the data stream's
        // effective failure store so the inherited preview reflects what Elasticsearch applies
        // (e.g. the default failures retention).
        {
          enabled:
            dataStream.failureStoreEnabled === true ||
            dataStream.matchesFailureStoreClusterPattern === true,
          retention: dataStream.failureStoreRetention?.defaultRetentionPeriod,
          retentionDisabled: dataStream.failureStoreRetention?.retentionDisabled === true,
        };

  return {
    isLoading: false,
    inheritSuccessful,
    inheritFailed,
    resolvedIlmPolicyName: effectiveTemplateIlmName,
    resolvedLifecycle,
    resolvedFailureStore,
  };
};

/**
 * Fallback resolution when the index template cannot be loaded. Uses only the explicit
 * markers available on the data stream itself.
 */
const resolveFallbackLifecycle = (dataStream: DataStream): ResolvedDataStreamLifecycle => {
  const inheritSuccessful = (() => {
    if (isNextGenIlm(dataStream)) {
      return (
        dataStream.lifecycleSettings?.explicitIlmPolicyName === undefined &&
        dataStream.lifecycleSettings?.preferIlm === undefined
      );
    }
    if (dataStream.lifecycleSettings?.preferIlm !== undefined) {
      return false;
    }
    const determinedBy = dataStream.lifecycle?.retention_determined_by;
    return determinedBy !== undefined ? determinedBy !== 'data_stream_configuration' : false;
  })();

  const inheritFailed = (() => {
    if (dataStream.failureStoreSettings === undefined) {
      return true;
    }
    return (
      dataStream.failureStoreEnabled === true &&
      dataStream.failureStoreRetention?.retentionDeterminedBy === 'default_failures_retention' &&
      dataStream.failureStoreRetention?.retentionDisabled !== true &&
      dataStream.failureStoreRetention?.customRetentionPeriod === undefined
    );
  })();

  return {
    isLoading: false,
    inheritSuccessful,
    inheritFailed,
  };
};

interface UseResolvedDataStreamLifecycleArgs {
  dataStream: DataStream | null | undefined;
  streamsGetResponse?: Streams.ingest.all.GetResponse;
}

/**
 * Resolves a data stream's lifecycle (successful and failed ingest) from its source: the
 * Streams parent for wired streams (`_meta.managed_by === 'streams'`), or the index template
 * otherwise. It exposes both the effective values and whether each part is inherited.
 *
 * The edit flyout consumes these resolved values. The details summary may instead show
 * the actual lifecycle of historical backing indices that remain eligible in a lookup stream.
 */
export const useResolvedDataStreamLifecycle = ({
  dataStream,
  streamsGetResponse,
}: UseResolvedDataStreamLifecycleArgs): ResolvedDataStreamLifecycle => {
  const [templateLifecycle, setTemplateLifecycle] = useState<
    ResolvedDataStreamLifecycle | undefined
  >(undefined);

  const isWired = isWiredStreamDataStream(dataStream);

  useEffect(() => {
    let cancelled = false;
    setTemplateLifecycle(undefined);

    if (!dataStream || isWired) {
      return;
    }

    const templateName = dataStream.indexTemplateName;
    if (!templateName) {
      setTemplateLifecycle(resolveFallbackLifecycle(dataStream));
      return;
    }

    sendRequest<TemplateDeserialized>({
      path: `${API_BASE_PATH}/index_templates/${encodeURIComponent(templateName)}`,
      method: 'get',
    })
      .then(({ data: template }) => {
        if (cancelled) return;
        setTemplateLifecycle(
          template
            ? resolveTemplateLifecycle(dataStream, template)
            : resolveFallbackLifecycle(dataStream)
        );
      })
      .catch(() => {
        if (cancelled) return;
        setTemplateLifecycle(resolveFallbackLifecycle(dataStream));
      });

    return () => {
      cancelled = true;
    };
  }, [dataStream, isWired]);

  const isWiredRoot = isWiredRootDataStream(dataStream);

  return useMemo<ResolvedDataStreamLifecycle>(() => {
    if (!dataStream) {
      return { isLoading: true, inheritSuccessful: false, inheritFailed: false };
    }

    const resolved = ((): ResolvedDataStreamLifecycle | undefined => {
      if (streamsGetResponse) {
        return resolveStreamsLifecycle(streamsGetResponse);
      }

      if (isWired) {
        // Wired stream, but the Streams definition has not loaded yet.
        return { isLoading: true, inheritSuccessful: false, inheritFailed: false };
      }

      return templateLifecycle;
    })();

    if (!resolved) {
      return { isLoading: true, inheritSuccessful: false, inheritFailed: false };
    }

    // A wired root stream has no parent, so it never inherits anything.
    if (isWiredRoot) {
      return { ...resolved, inheritSuccessful: false, inheritFailed: false };
    }

    return resolved;
  }, [dataStream, isWired, isWiredRoot, streamsGetResponse, templateLifecycle]);
};
