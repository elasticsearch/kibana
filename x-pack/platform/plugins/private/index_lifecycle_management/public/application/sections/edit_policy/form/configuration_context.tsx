/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { get } from 'lodash';
import type { FunctionComponent } from 'react';
import React, { createContext, useContext } from 'react';

import { useFormData } from '../../../../shared_imports';

import { isUsingCustomRolloverPath, isUsingDownsamplePath } from '../constants';

export interface Configuration {
  /**
   * Whether the serialized policy will use rollover. This blocks certain actions in
   * the form such as hot phase (forcemerge, shrink) and cold phase (searchable snapshot).
   */
  isUsingRollover: boolean;
  /**
   * If this value is true, phases after hot cannot set shrink, forcemerge or
   * searchable_snapshot actions.
   *
   * See https://github.com/elastic/elasticsearch/blob/main/docs/reference/ilm/actions/ilm-searchable-snapshot.asciidoc
   */
  isUsingSearchableSnapshotInHotPhase: boolean;
  isUsingSearchableSnapshotInColdPhase: boolean;

  /**
   * When downsample enabled it implicitly makes index readonly,
   * We should hide readonly action if downsample is enabled
   */
  isUsingDownsampleInHotPhase: boolean;
  isUsingDownsampleInWarmPhase: boolean;
  isUsingDownsampleInColdPhase: boolean;
}

const ConfigurationContext = createContext<Configuration>(null as any);

const pathToHotPhaseSearchableSnapshot =
  'phases.hot.actions.searchable_snapshot.snapshot_repository';

const pathToColdPhaseSearchableSnapshot =
  'phases.cold.actions.searchable_snapshot.snapshot_repository';

const pathToHotPhaseEnabled = '_meta.hot.enabled';

export const ConfigurationProvider: FunctionComponent<{ children?: React.ReactNode }> = ({
  children,
}) => {
  const [formData] = useFormData({
    watch: [
      pathToHotPhaseEnabled,
      pathToHotPhaseSearchableSnapshot,
      pathToColdPhaseSearchableSnapshot,
      isUsingCustomRolloverPath,
      isUsingDownsamplePath('hot'),
      isUsingDownsamplePath('warm'),
      isUsingDownsamplePath('cold'),
    ],
  });
  const hotEnabled = Boolean(get(formData, pathToHotPhaseEnabled, true));
  // Provide default value, as path may become undefined if removed from the DOM
  const isUsingCustomRollover = get(formData, isUsingCustomRolloverPath, true);

  const context: Configuration = {
    isUsingRollover: hotEnabled ? isUsingCustomRollover : false,
    isUsingSearchableSnapshotInHotPhase:
      hotEnabled && get(formData, pathToHotPhaseSearchableSnapshot) != null,
    isUsingSearchableSnapshotInColdPhase: get(formData, pathToColdPhaseSearchableSnapshot) != null,
    isUsingDownsampleInHotPhase: hotEnabled && !!get(formData, isUsingDownsamplePath('hot')),
    isUsingDownsampleInWarmPhase: !!get(formData, isUsingDownsamplePath('warm')),
    isUsingDownsampleInColdPhase: !!get(formData, isUsingDownsamplePath('cold')),
  };

  return <ConfigurationContext.Provider value={context}>{children}</ConfigurationContext.Provider>;
};

export const useConfiguration = () => {
  const ctx = useContext(ConfigurationContext);
  if (!ctx) throw new Error('Cannot use configuration outside of configuration context');

  return ctx;
};
