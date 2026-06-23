/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildVisualizationConfig, type VisualizationConfig } from '@kbn/agent-builder-tools-base';
import type { ModelProvider, ToolEventEmitter } from '@kbn/agent-builder-server';
import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/logging';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import { createPanelFailureResult, type PanelContentAttempt } from '../resolve_panel';
import { getErrorMessage } from '../utils';
import type { VisPanelResolutionRequest } from '../operations/panels';

/** Host plumbing the vis resolver needs to call the visualization builder. */
export interface VisPanelResolverDeps {
  logger: Logger;
  modelProvider: ModelProvider;
  events: ToolEventEmitter;
  esClient: IScopedClusterClient;
}

/**
 * Default implementation of the generate core's `ResolvePanelContent` seam for
 * `vis` panels.
 *
 * Builds inline Lens panel content from natural language / ES|QL using Kibana
 * plumbing (model provider, ES client, the visualization builder) and returns
 * it to the core through the type-agnostic {@link PanelContentAttempt} contract.
 *
 * It ships in `core/resolvers/` so any caller of the generation core — the
 * dashboard tool or a CLI host — gets a ready-to-use vis resolver from one
 * place. It is still wired in through the `resolvePanelContent` seam, so tests
 * can inject a fake and a host can substitute its own resolver if ever needed.
 */
export const createVisPanelResolver = ({
  logger,
  modelProvider,
  events,
  esClient,
}: VisPanelResolverDeps) => {
  return async ({
    operationType,
    identifier,
    nlQuery,
    index,
    chartType,
    esql,
    existingPanel,
  }: VisPanelResolutionRequest): Promise<PanelContentAttempt> => {
    try {
      if (existingPanel && existingPanel.type !== LENS_EMBEDDABLE_TYPE) {
        return createPanelFailureResult(
          operationType,
          identifier,
          `Panel "${identifier}" with type "${existingPanel.type}" is not supported for inline visualization editing.`
        );
      }

      const existingConfig =
        existingPanel?.type === LENS_EMBEDDABLE_TYPE
          ? (existingPanel?.config as VisualizationConfig)
          : undefined;

      const result = await buildVisualizationConfig({
        nlQuery,
        index,
        chartType,
        esql,
        existingConfig: existingConfig ? JSON.stringify(existingConfig) : undefined,
        parsedExistingConfig: existingConfig,
        includeTimeRange: false,
        modelProvider,
        logger,
        events,
        esClient,
      });

      return {
        type: 'success',
        panelContent: {
          type: LENS_EMBEDDABLE_TYPE,
          config: result.validatedConfig,
        },
      };
    } catch (error) {
      return createPanelFailureResult(operationType, identifier, getErrorMessage(error));
    }
  };
};
