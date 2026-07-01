/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { builtInStepDefinitions, getBuiltInStepStability } from '@kbn/workflows';
import { stepSchemas } from '../../../../../../common/step_schemas';
import { triggerSchemas } from '../../../../../trigger_schemas';
import { getCachedAllConnectors } from '../../connectors_cache';
import { getExtensionStability } from '../../get_stability_note';

function addAriaPrefix(prefixes: Set<string>, value: string | undefined): void {
  if (value !== undefined && value.length > 0) {
    prefixes.add(value);
  }
}

function addConnectorDisplayNamePrefix(
  prefixes: Set<string>,
  connectorType: string,
  summary: string | undefined,
  description: string | undefined
): void {
  const isDynamicConnector =
    !connectorType.startsWith('elasticsearch.') && !connectorType.startsWith('kibana.');
  if (!isDynamicConnector) {
    return;
  }

  const shortName = summary ?? description;
  if (shortName === undefined) {
    return;
  }

  const displayName = shortName.replace(' connector', '').replace(' (no instances configured)', '');
  if (displayName !== connectorType) {
    addAriaPrefix(prefixes, displayName);
  }
}

/**
 * Collects suggest-widget aria-label prefixes for items that should show a tech preview badge.
 * Monaco list rows expose aria-label starting with the completion label text.
 */
export function collectTechPreviewSuggestAriaPrefixes(): string[] {
  const prefixes = new Set<string>();

  for (const trigger of triggerSchemas.getTriggerDefinitions()) {
    if (getExtensionStability(trigger) === 'tech_preview') {
      addAriaPrefix(prefixes, trigger.id);
    }
  }

  for (const stepDefinition of builtInStepDefinitions) {
    if (getBuiltInStepStability(stepDefinition.id) === 'tech_preview') {
      addAriaPrefix(prefixes, stepDefinition.id);
    }
  }

  for (const stepDefinition of stepSchemas.getAllRegisteredStepDefinitions()) {
    if (getExtensionStability(stepDefinition) === 'tech_preview') {
      addAriaPrefix(prefixes, stepDefinition.id);
    }
  }

  for (const connector of getCachedAllConnectors().filter((c) => c.stability === 'tech_preview')) {
    addAriaPrefix(prefixes, connector.type);
    addConnectorDisplayNamePrefix(
      prefixes,
      connector.type,
      connector.summary ?? undefined,
      connector.description ?? undefined
    );
  }

  return [...prefixes];
}
