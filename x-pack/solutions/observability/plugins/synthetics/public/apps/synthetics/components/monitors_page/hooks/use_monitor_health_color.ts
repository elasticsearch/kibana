/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEuiTheme } from '@elastic/eui';
import { useCallback } from 'react';

export const useMonitorHealthColor = () => {
  const { euiTheme } = useEuiTheme();

  return useCallback(
    (status: string) => {
      const isAmsterdam = euiTheme.themeName === 'EUI_THEME_AMSTERDAM';

      switch (status) {
        case 'up':
          return isAmsterdam ? euiTheme.colors.vis.euiColorVis0 : euiTheme.colors.success;
        case 'down':
          return isAmsterdam ? euiTheme.colors.vis.euiColorVis9 : euiTheme.colors.vis.euiColorVis6;
        case 'stale':
          // Stopped reporting → amber, so a stale location reads as "investigate"
          // rather than a neutral/disabled grey.
          return euiTheme.colors.warning;
        default:
          return euiTheme.colors.disabled;
      }
    },
    [euiTheme]
  );
};
