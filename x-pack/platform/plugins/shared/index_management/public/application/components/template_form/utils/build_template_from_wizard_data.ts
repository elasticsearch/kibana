/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TemplateDeserialized } from '../../../../../common';
import type { DataStreamOptions } from '../../../../../common/types/data_streams';
import { serializeAsESLifecycle, resolveLogisticsLifecycle } from '../../../../../common/lib';

export interface TemplateFormWizardData {
  logistics: Omit<TemplateDeserialized, '_kbnMeta' | 'template'>;
  settings?: Record<string, unknown>;
  mappings?: Record<string, unknown>;
  aliases?: Record<string, unknown>;
  components: TemplateDeserialized['composedOf'];
}

/**
 * If no mappings, settings or aliases are defined, it is better to not send empty
 * object for those values.
 * This method takes care of that and other cleanup of empty fields.
 * @param template The template object to clean up
 */
const cleanupTemplateObject = (template: TemplateDeserialized) => {
  const outputTemplate = { ...template };

  if (outputTemplate.template) {
    if (outputTemplate.template.settings === undefined) {
      delete outputTemplate.template.settings;
    }
    if (outputTemplate.template.mappings === undefined) {
      delete outputTemplate.template.mappings;
    }
    if (outputTemplate.template.aliases === undefined) {
      delete outputTemplate.template.aliases;
    }
    if (Object.keys(outputTemplate.template).length === 0) {
      delete outputTemplate.template;
    }
    if (outputTemplate.lifecycle) {
      delete outputTemplate.lifecycle;
    }
  }

  return outputTemplate;
};

export const buildTemplateFromWizardData = ({
  initialTemplate,
  wizardData,
  dataStreamOptions,
}: {
  initialTemplate: TemplateDeserialized;
  wizardData: TemplateFormWizardData;
  dataStreamOptions?: DataStreamOptions;
}): TemplateDeserialized => {
  const isDataStreamTemplate = Boolean(wizardData.logistics.dataStream);

  const outputTemplate = {
    ...wizardData.logistics,
    _kbnMeta: initialTemplate._kbnMeta,
    deprecated: initialTemplate.deprecated,
    composedOf: wizardData.components,
    template: {
      settings: wizardData.settings,
      mappings: wizardData.mappings,
      aliases: wizardData.aliases,
      lifecycle: isDataStreamTemplate
        ? serializeAsESLifecycle(
            resolveLogisticsLifecycle(wizardData.logistics.lifecycle, {
              isDataStreamTemplate: true,
            })
          )
        : wizardData.logistics.lifecycle
        ? serializeAsESLifecycle(wizardData.logistics.lifecycle)
        : undefined,
      ...(dataStreamOptions && { data_stream_options: dataStreamOptions }),
    },
    ignoreMissingComponentTemplates: initialTemplate.ignoreMissingComponentTemplates,
  };

  return cleanupTemplateObject(outputTemplate as TemplateDeserialized);
};
