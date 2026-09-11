/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const EVENT_GRAPH_VISUALIZATION_API = '/internal/cloud_security_posture/graph' as const;

export const RELATED_ENTITY = 'related.entity' as const;
export const RELATED_USER = 'related.user' as const;
export const RELATED_HOST = 'related.hosts' as const;
export const EVENT_ACTION = 'event.action' as const;
export const EVENT_ID = 'event.id' as const;
export const ENTITY_ID = 'entity.id' as const;

export const SHOW_SEARCH_BAR_BUTTON_TOUR_STORAGE_KEY =
  'securitySolution.graphInvestigation:showSearchBarButtonTour' as const;
export const TOGGLE_SEARCH_BAR_STORAGE_KEY =
  'securitySolution.graphInvestigation:toggleSearchBarState' as const;

export const GRAPH_NODES_LIMIT = 300;
