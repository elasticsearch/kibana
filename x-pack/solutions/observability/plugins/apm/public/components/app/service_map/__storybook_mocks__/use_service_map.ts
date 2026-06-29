/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Storybook mock for `use_service_map`.
 *
 * Webpack's NormalModuleReplacementPlugin (configured in @kbn/storybook) transparently
 * substitutes this module for any `./use_service_map` import within the service_map/
 * directory during Storybook builds. No code change is needed in the component.
 *
 * Data comes from the shared opbeans synthtrace scenario, so the graph shows the
 * same services and topology as other stories that draw from the same scenario.
 */

import { FETCH_STATUS } from '../../../../hooks/use_fetcher';
import { transformToReactFlow } from '../../../../../common/service_map';
import { opbeansScenario, toServiceMapResponse } from '../../../../test_helpers/synthtrace_stories';
import type { UseServiceMapResult } from '../use_service_map';

// Build once at module load — same dataset as the props-direct stories.
const syntheticData = transformToReactFlow(toServiceMapResponse(opbeansScenario()));

export const useServiceMap = (): UseServiceMapResult => ({
  data: syntheticData,
  status: FETCH_STATUS.SUCCESS,
});
