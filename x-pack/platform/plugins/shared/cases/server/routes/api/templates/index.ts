/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConfigType } from '../../../config';
import { getTemplatesRoute } from './get_templates_route';
import { getTemplateRoute } from './get_template_route';
import { getPublicTemplatesRoute } from './get_public_templates_route';
import { getPublicTemplateRoute } from './get_public_template_route';
import { postTemplateRoute } from './post_template_route';
import { putTemplateRoute } from './put_template_route';
import { patchTemplateRoute } from './patch_template_route';
import { bulkDeleteTemplatesRoute } from './bulk_delete_templates_route';
import { bulkExportTemplatesRoute } from './bulk_export_templates_route';
import { getTemplateTagsRoute } from './get_template_tags_route';
import { getTemplateCreatorsRoute } from './get_template_creators_route';

/**
 * Register public readonly template routes conditionally, based on feature flag
 */
export const getPublicTemplateRoutes = (config: ConfigType) => {
  if (!config.templates.enabled) {
    return [];
  }

  return [getPublicTemplatesRoute, getPublicTemplateRoute];
};

/**
 * Register template routes conditionally, based on feature flag
 */
export const getTemplateRoutes = (config: ConfigType) => {
  if (!config.templates.enabled) {
    return [];
  }

  return [
    getTemplatesRoute,
    getTemplateRoute,
    postTemplateRoute,
    putTemplateRoute,
    patchTemplateRoute,
    bulkDeleteTemplatesRoute,
    bulkExportTemplatesRoute,
    getTemplateTagsRoute,
    getTemplateCreatorsRoute,
  ];
};
