/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PublishingSubject } from '../publishing_subject';
import type { HasParentApi } from './has_parent_api';
import { apiHasParentApi } from './has_parent_api';
import type { PublishesViewMode, ViewMode } from './publishes_view_mode';
import { apiPublishesViewMode } from './publishes_view_mode';

/**
 * This API can access a view mode, either its own or from its parent API.
 */
export type CanAccessViewMode =
  | Partial<PublishesViewMode>
  | Partial<HasParentApi<Partial<PublishesViewMode>>>;

/**
 * A type guard which can be used to determine if a given API has access to a view mode, its own or from its parent.
 */
export const apiCanAccessViewMode = (api: unknown): api is CanAccessViewMode => {
  return apiPublishesViewMode(api) || (apiHasParentApi(api) && apiPublishesViewMode(api.parentApi));
};

/**
 * A function which will get the view mode from the API or the parent API. if this api has a view mode AND its
 * parent has a view mode, we consider the APIs version the source of truth.
 */
export const getInheritedViewMode = (api?: unknown): ViewMode | undefined => {
  if (apiPublishesViewMode(api)) return api.viewMode$.getValue();
  if (apiHasParentApi(api) && apiPublishesViewMode(api.parentApi)) {
    return api.parentApi.viewMode$.getValue();
  }
};

export const getViewModeSubject = (api?: unknown): PublishingSubject<ViewMode> | undefined => {
  if (apiPublishesViewMode(api)) return api.viewMode$;
  if (apiHasParentApi(api) && apiPublishesViewMode(api.parentApi)) {
    return api.parentApi.viewMode$;
  }
};
