/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * localStorage key persisting the user's push vs overlay flyout preference.
 * Read when opening a flyout so the choice sticks across sessions.
 */
export const FLYOUT_PUSH_VS_OVERLAY_LOCAL_STORAGE = 'securitySolution.flyoutV2.pushVsOverlay';
