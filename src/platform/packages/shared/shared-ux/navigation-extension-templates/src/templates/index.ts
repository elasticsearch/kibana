/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { type ComponentType, type LazyExoticComponent, lazy } from 'react';

/**
 * closed catalog of templates the navigation extension templates framework knows how to render. Adding a new
 * shape is an intentional, reviewed change to this map (and to `NavTemplateId`).
 */
export const TEMPLATES = {
  list: lazy(() => import('./list_template').then((module) => ({ default: module.ListTemplate }))),
} satisfies Record<string, LazyExoticComponent<ComponentType<any>>>;
