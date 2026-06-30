/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isUndefined, omitBy } from 'lodash';
import type {
  Logger,
  SavedObjectsClientContract,
  SavedObjectsCreateOptions,
} from '@kbn/core/server';
import { significantEventsPrompt } from '@kbn/streams-ai/src/significant_events/prompt';
import { featuresPrompt } from '@kbn/streams-ai/src/features/prompt';
import { descriptionPrompt } from '@kbn/streams-ai/src/description/prompt';
import { streamsPromptsSOType } from './prompts_config';
import type { PromptsConfigAttributes } from './prompts_config';

export type { PromptsConfigAttributes };

const defaultsPrompts = {
  featurePromptOverride: featuresPrompt,
  significantEventsPromptOverride: significantEventsPrompt,
  descriptionPromptOverride: descriptionPrompt,
};

const SINGLETON_PROMPTS_ID = 'streams-prompts-config-id';

export class PromptsConfigService {
  private readonly soClient: SavedObjectsClientContract;
  private readonly logger: Logger;

  constructor({ soClient, logger }: { soClient: SavedObjectsClientContract; logger: Logger }) {
    this.soClient = soClient;
    this.logger = logger;
  }

  /**
   * Upsert a new prompt saved object.
   * attributes is a plain object (e.g. { name, systemPromptTemplate, userPromptTemplate, inputExample })
   * Note: no forced singleton id/overwrite — allow multiple prompt objects (user-created).
   */
  async upsertPrompt(attributes: PromptsConfigAttributes, options?: SavedObjectsCreateOptions) {
    // fetch existing and merge it in to avoid overwriting other fields
    const existing = await this.getPrompt();

    this.logger.debug('Creating significant events prompt');
    const data = await this.soClient.create(
      streamsPromptsSOType,
      {
        ...defaultsPrompts,
        ...existing,
        ...omitBy(attributes, isUndefined),
      },
      {
        ...(options ?? {}),
        id: SINGLETON_PROMPTS_ID,
        overwrite: true,
      }
    );
    return data.attributes;
  }

  async getPrompt() {
    try {
      const data = await this.soClient.get<PromptsConfigAttributes>(
        streamsPromptsSOType,
        SINGLETON_PROMPTS_ID
      );
      this.logger.debug(`Retrieved significant events prompt ${SINGLETON_PROMPTS_ID}`);
      return {
        featurePromptOverride:
          data.attributes.featurePromptOverride || defaultsPrompts.featurePromptOverride,
        significantEventsPromptOverride:
          data.attributes.significantEventsPromptOverride ||
          defaultsPrompts.significantEventsPromptOverride,
        descriptionPromptOverride:
          data.attributes.descriptionPromptOverride || defaultsPrompts.descriptionPromptOverride,
      };
    } catch (err) {
      // saved objects client throws with statusCode 404 for not found
      if (
        (err as { output?: { statusCode?: number } })?.output?.statusCode === 404 ||
        (err as { statusCode?: number })?.statusCode === 404
      ) {
        // return the packaged default prompt on 404 as well
        return defaultsPrompts;
      }
      throw err;
    }
  }

  /**
   * Delete the prompts saved object (reset to defaults).
   */
  async resetPrompts(): Promise<void> {
    this.logger.debug(`Deleting significant events prompt ${SINGLETON_PROMPTS_ID}`);
    await this.soClient.delete(streamsPromptsSOType, SINGLETON_PROMPTS_ID);
  }
}
