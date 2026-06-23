/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { dashboardCompositionPrompt } from './composition';
import { gridLayoutPrompt } from './grid_layout';

/**
 * Dashboard design guidance (composition + panel layout) inlined directly into the dashboard
 * generation guidance so the agent always has the composition and layout rules available while
 * building or editing a dashboard.
 */
export const dashboardDesignGuidancePrompt = `${dashboardCompositionPrompt}

${gridLayoutPrompt}`;
