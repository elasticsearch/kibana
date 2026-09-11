/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// eslint-disable-next-line @kbn/imports/no_direct_handlebars_import
import Handlebars from 'handlebars';
import { resolve } from 'path';
import type { BundleGenerationContext, GenerationContext } from '../parser/get_generation_context';
import { registerHelpers } from './register_helpers';
import { registerTemplates } from './register_templates';

export const AVAILABLE_TEMPLATES = [
  'zod_operation_schema',
  'api_client_supertest',
  'api_client_quickstart',
  'api_client_scout',
] as const;

export type TemplateName = (typeof AVAILABLE_TEMPLATES)[number];

export interface ITemplateService {
  compileTemplate: (templateName: TemplateName, context: GenerationContext) => string;
  compileBundleTemplate: (templateName: TemplateName, context: BundleGenerationContext) => string;
}

/**
 * Initialize the template service. This service encapsulates the handlebars
 * initialization logic and provides helper methods for compiling templates.
 */
export const initTemplateService = async (): Promise<ITemplateService> => {
  // Create a handlebars instance and register helpers and partials
  const handlebars = Handlebars.create();
  registerHelpers(handlebars);
  const templates = await registerTemplates(resolve(__dirname, './templates'), handlebars);

  return {
    compileTemplate: (templateName: TemplateName, context: GenerationContext) => {
      return handlebars.compile(templates[templateName])(context);
    },
    compileBundleTemplate: (templateName: TemplateName, context: BundleGenerationContext) => {
      return handlebars.compile(templates[templateName])(context);
    },
  };
};
