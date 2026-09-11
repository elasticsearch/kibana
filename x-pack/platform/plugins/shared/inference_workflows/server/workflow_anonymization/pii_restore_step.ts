/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { piiRestoreCommonDefinition } from '../../common/workflow_anonymization';
import { restoreTokens } from './token_map';

export const executePiiRestore = ({
  rawContent,
  tokenMap,
}: {
  rawContent: string;
  tokenMap: Parameters<typeof restoreTokens>[1];
}): { content: string } => ({ content: restoreTokens(rawContent, tokenMap) });

export const piiRestoreStepHandler = async ({
  input,
}: {
  input: Parameters<typeof executePiiRestore>[0];
}) => ({
  output: executePiiRestore(input),
});

export const piiRestoreStepDefinition = createServerStepDefinition({
  ...piiRestoreCommonDefinition,
  handler: piiRestoreStepHandler,
});
