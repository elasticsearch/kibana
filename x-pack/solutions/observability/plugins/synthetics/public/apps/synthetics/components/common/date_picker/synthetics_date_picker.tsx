/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useContext, useEffect } from 'react';
import type { OnRefreshChangeProps } from '@elastic/eui';
import { EuiSuperDatePicker } from '@elastic/eui';
import { useLocation } from 'react-router-dom';
import { parse } from 'query-string';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { ClientPluginsStart } from '../../../../../plugin';
import { useUrlParams } from '../../../hooks';
import { CLIENT_DEFAULTS } from '../../../../../../common/constants';
import { SyntheticsSettingsContext, SyntheticsRefreshContext } from '../../../contexts';

export const SyntheticsDatePicker = ({
  fullWidth,
  defaultDateRange,
}: {
  fullWidth?: boolean;
  // Overrides the app-wide default range when the URL carries no explicit one.
  // Used by the overview to scope its (narrower) default window to itself.
  defaultDateRange?: { from: string; to: string };
}) => {
  const [getUrlParams, updateUrl] = useUrlParams();
  const { search } = useLocation();
  const { commonlyUsedRanges } = useContext(SyntheticsSettingsContext);
  // The picker's built-in auto-refresh dropdown was previously local-state
  // only — clicking it did nothing app-wide. Wire it to
  // SyntheticsRefreshContext so the picker is the single source of truth for
  // both range and auto-refresh, matching what the standalone
  // <AutoRefreshButton /> exposes elsewhere.
  const { refreshApp, refreshInterval, refreshPaused, setRefreshInterval, setRefreshPaused } =
    useContext(SyntheticsRefreshContext);

  const { data } = useKibana<ClientPluginsStart>().services;

  // read time from state and update the url
  const sharedTimeState = data?.query.timefilter.timefilter.getTime();

  const { dateRangeStart: urlStart, dateRangeEnd: urlEnd } = getUrlParams();

  // `getUrlParams` already merges in the app-wide default, so detect absence via
  // the raw URL: only then does `defaultDateRange` take over.
  const rawParams = parse(search[0] === '?' ? search.slice(1) : search);
  const start = rawParams.dateRangeStart != null ? urlStart : defaultDateRange?.from ?? urlStart;
  const end = rawParams.dateRangeEnd != null ? urlEnd : defaultDateRange?.to ?? urlEnd;

  useEffect(() => {
    const { from, to } = sharedTimeState ?? {};
    if (from !== start || to !== end) {
      // if it's coming url. let's update shared state
      data?.query.timefilter.timefilter.setTime({ from: start, to: end });
    }

    // only need at start, rest date picker on change fucn will take care off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const euiCommonlyUsedRanges = commonlyUsedRanges
    ? commonlyUsedRanges.map(
        ({ from, to, display }: { from: string; to: string; display: string }) => {
          return {
            start: from,
            end: to,
            label: display,
          };
        }
      )
    : CLIENT_DEFAULTS.COMMONLY_USED_DATE_RANGES;

  const onRefreshChange = ({ isPaused, refreshInterval: nextIntervalMs }: OnRefreshChangeProps) => {
    setRefreshPaused(isPaused);
    // EUI exposes ms; the synthetics context stores seconds — same conversion
    // the standalone AutoRefreshButton already does.
    setRefreshInterval(nextIntervalMs / 1000);
  };

  return (
    <EuiSuperDatePicker
      width={fullWidth ? 'full' : 'auto'}
      start={start}
      end={end}
      isPaused={refreshPaused}
      refreshInterval={refreshInterval * 1000}
      onRefreshChange={onRefreshChange}
      commonlyUsedRanges={euiCommonlyUsedRanges}
      onTimeChange={({ start: startN, end: endN }) => {
        if (data?.query?.timefilter?.timefilter) {
          data?.query.timefilter.timefilter.setTime({ from: startN, to: endN });
        }

        updateUrl({ dateRangeStart: startN, dateRangeEnd: endN });
        refreshApp();
      }}
      onRefresh={refreshApp}
      updateButtonProps={{
        fill: false,
      }}
    />
  );
};
