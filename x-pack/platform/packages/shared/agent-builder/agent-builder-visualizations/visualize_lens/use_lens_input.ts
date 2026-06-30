/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { DataViewsServicePublic } from '@kbn/data-views-plugin/public/types';
import type { LensPublicStart, TypedLensByValueInput } from '@kbn/lens-plugin/public';
import { LensConfigBuilder } from '@kbn/lens-embeddable-utils';
import type { TimeRange } from '@kbn/es-query';
import useAsync from 'react-use/lib/useAsync';

interface Params {
  dataViews: DataViewsServicePublic;
  lens: LensPublicStart;
  lensConfig: any;
  timeRange?: TimeRange;
}

interface ReturnValue {
  lensInput: TypedLensByValueInput | undefined;
  setLensInput: (v: TypedLensByValueInput) => void;
  isLoading: boolean;
  error?: Error;
}

export function useLensInput({ dataViews, lens, lensConfig, timeRange }: Params): ReturnValue {
  const lensHelpersAsync = useAsync(() => lens.stateHelperApi(), [lens]);
  // convert lens config to lens attributes
  const lensResult = useMemo(() => {
    try {
      return { attributes: new LensConfigBuilder().fromAPIFormat(lensConfig) };
    } catch (e) {
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }
  }, [lensConfig]);

  const [lensInput, setLensInput] = useState<TypedLensByValueInput | undefined>(() =>
    lensResult.attributes
      ? {
          attributes: lensResult.attributes,
          id: uuidv4(),
          timeRange,
        }
      : undefined
  );

  const configError = 'error' in lensResult ? lensResult.error : undefined;
  const isLoading = !configError && (!lensHelpersAsync.value || !lensInput);

  return {
    lensInput,
    setLensInput,
    isLoading,
    error: configError || lensHelpersAsync.error || undefined,
  };
}
