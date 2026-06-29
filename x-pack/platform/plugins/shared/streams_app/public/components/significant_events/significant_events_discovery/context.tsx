/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { createContext, useContext, useMemo } from 'react';
import useObservable from 'react-use/lib/useObservable';
import { STREAMS_SIGNIFICANT_EVENTS_MEMORY_ENABLED_FLAG } from '@kbn/streams-plugin/common';
import { useKibana } from '../../../hooks/use_kibana';

interface DiscoverySettingsContextValue {
  isMemoryEnabled: boolean;
}

const DiscoverySettingsContext = createContext<DiscoverySettingsContextValue>({
  isMemoryEnabled: false,
});

export const useDiscoverySettings = () => useContext(DiscoverySettingsContext);

export const DiscoverySettingsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const {
    core: { featureFlags },
  } = useKibana();

  const isMemoryEnabled = useObservable(
    featureFlags.getBooleanValue$(STREAMS_SIGNIFICANT_EVENTS_MEMORY_ENABLED_FLAG, false),
    false
  );

  const value = useMemo(() => ({ isMemoryEnabled }), [isMemoryEnabled]);

  return (
    <DiscoverySettingsContext.Provider value={value}>{children}</DiscoverySettingsContext.Provider>
  );
};
