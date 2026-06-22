/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useState, useEffect, useCallback } from 'react';
import useEffectOnce from 'react-use/lib/useEffectOnce';

import type { UiSettingsScope } from '@kbn/core-ui-settings-common';
import type { UiSettingMetadata } from '@kbn/management-settings-types';
import type { SolutionView } from '@kbn/spaces-plugin/common';
import { useServices } from '../services';

/**
 * React hook which retrieves settings metadata from the server,
 * normalizes them to a predictable format, {@link UiSettingMetadata}, and returns
 * them as an observed collection.
 * @param scope The {@link UiSettingsScope} of the settings to be retrieved.
 * @returns An object with settings and a loading flag.
 */
export const useSettings = (scope: UiSettingsScope) => {
  const { getAllowlistedSettings, subscribeToUpdates, getActiveSpace, subscribeToActiveSpace } =
    useServices();
  const [solutionView, setSolutionView] = useState<SolutionView>();
  const [settings, setSettings] = useState<Record<string, UiSettingMetadata>>({});
  const [isLoading, setIsLoading] = useState(true);

  const refreshSettings = useCallback(
    (currentScope: UiSettingsScope, currentSolution: SolutionView | undefined) => {
      getAllowlistedSettings(currentScope, currentSolution).then((result) => {
        setSettings(result);
        setIsLoading(false);
      });
    },
    [getAllowlistedSettings]
  );

  useEffectOnce(() => {
    const subscription = subscribeToActiveSpace(() => {
      getActiveSpace().then((space) => {
        const solution = space.solution ?? 'classic';
        setSolutionView(solution);
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  });

  useEffect(() => {
    refreshSettings(scope, solutionView);
  }, [solutionView, scope, refreshSettings]);

  useEffectOnce(() => {
    const subscription = subscribeToUpdates(() => {
      refreshSettings(scope, solutionView);
    }, scope);

    return () => {
      subscription.unsubscribe();
    };
  });

  return { settings, isLoading };
};
