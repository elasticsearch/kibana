/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const DEFAULT_ROUTE_UI_SETTING_ID = 'defaultRoute';

export const NAV_CUSTOMIZATION_STORAGE_KEY = 'navigation:customization';

export const AGENT_BUILDER_NAV_AT_TOP_FLAG = 'navigation.agentBuilderAtTop';

export const DEFAULT_ROUTES = {
  classic: '/app/home',
  es: '/app/elasticsearch/home',
  search: '/app/elasticsearch/home',
  // O11y aliases
  oblt: '/app/observability/landing',
  observability: '/app/observability/landing',
  security: '/app/security/get_started',
  workplaceai: '/app/workplace_ai',
  vectordb: '/app/vectordb',
};
