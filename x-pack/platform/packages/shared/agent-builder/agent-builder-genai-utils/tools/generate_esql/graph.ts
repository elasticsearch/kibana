/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { StateGraph, Annotation } from '@langchain/langgraph';
import type { TimeRange } from '@kbn/agent-builder-common';
import type { ScopedModel } from '@kbn/agent-builder-server';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { EsqlDocumentBase } from '@kbn/inference-plugin/server/tasks/nl_to_esql/doc_base';
import { correctCommonEsqlMistakes } from '@kbn/inference-plugin/common';
import { extractTextContent } from '../../langchain/messages';
import type { EsqlResponse } from '../utils/esql';
import { resolveResourceForEsqlWithSamplingStats } from '../utils/resources';
import type { ValidateEsqlQueryCallbacks } from '../utils/esql';
import {
  extractEsqlQueries,
  executeEsql,
  validateEsqlQuery,
  buildTimeRangeParams,
} from '../utils/esql';
import { createRequestDocumentationPrompt, createGenerateEsqlPrompt } from './prompts';
import type { ResolvedResourceWithSampling } from '../utils/resources';
import type {
  Action,
  ExecuteQueryAction,
  ValidateQueryAction,
  AutocorrectQueryAction,
  GenerateQueryAction,
  RequestDocumentationAction,
} from './actions';
import {
  isGenerateQueryAction,
  isAutocorrectQueryAction,
  isExecuteQueryAction,
  isValidateQueryAction,
} from './actions';
import type { EsqlLoadedDocumentation } from './documentation';

const StateAnnotation = Annotation.Root({
  // inputs
  nlQuery: Annotation<string>(),
  target: Annotation<string>(),
  executeQuery: Annotation<boolean>(),
  maxRetries: Annotation<number>(),
  additionalInstructions: Annotation<string | undefined>(),
  additionalContext: Annotation<string | undefined>(),
  rowLimit: Annotation<number | undefined>(),
  disableNamedParams: Annotation<boolean | undefined>(),
  timeRange: Annotation<TimeRange>(),
  // internal
  resource: Annotation<ResolvedResourceWithSampling>(),
  currentTry: Annotation<number>({ reducer: (a, b) => b, default: () => 0 }),
  actions: Annotation<Action[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  // outputs
  answer: Annotation<string>(),
  query: Annotation<string>(),
  results: Annotation<EsqlResponse>(),
  error: Annotation<string>(),
});

export type StateType = typeof StateAnnotation.State;

export const createNlToEsqlGraph = ({
  model,
  esClient,
  docBase,
  documentation,
  esqlCallbacks,
  includeDatasets = false,
}: {
  model: ScopedModel;
  esClient: ElasticsearchClient;
  docBase: EsqlDocumentBase;
  documentation: EsqlLoadedDocumentation;
  esqlCallbacks?: ValidateEsqlQueryCallbacks;
  includeDatasets?: boolean;
}) => {
  const resolveTarget = async (state: StateType) => {
    const resolvedResource = await resolveResourceForEsqlWithSamplingStats({
      resourceName: state.target,
      samplingSize: 100,
      includeDatasets,
      esClient,
    });

    return { resource: resolvedResource };
  };

  // request doc step - retrieve the list of relevant commands and functions that may be useful to generate the query
  const requestDocumentation = async (state: StateType) => {
    const requestDocModel = model.chatModel.withStructuredOutput(
      z
        .object({
          commands: z
            .array(z.string())
            .optional()
            .describe('ES|QL source and processing commands to get documentation for.'),
          functions: z
            .array(z.string())
            .optional()
            .describe('ES|QL functions to get documentation for.'),
        })
        .describe('Tool to use to request ES|QL documentation'),
      { name: 'request_documentation' }
    );

    const { commands = [], functions = [] } = await requestDocModel.invoke(
      createRequestDocumentationPrompt({
        nlQuery: state.nlQuery,
        documentation,
        resource: state.resource,
      })
    );

    const requestedKeywords = [...commands, ...functions];
    const fetchedDoc = docBase.getDocumentation(requestedKeywords);

    const action: RequestDocumentationAction = {
      type: 'request_documentation',
      requestedKeywords,
      fetchedDoc,
    };

    return {
      actions: [action],
    };
  };

  // generate esql step - generate the esql query based on the doc and the user's input
  const generateEsql = async (state: StateType) => {
    const generateModel = model.chatModel;

    const response = await generateModel.invoke(
      createGenerateEsqlPrompt({
        nlQuery: state.nlQuery,
        documentation,
        resource: state.resource,
        previousActions: state.actions,
        additionalInstructions: state.additionalInstructions,
        additionalContext: state.additionalContext,
        rowLimit: state.rowLimit,
        disableNamedParams: state.disableNamedParams,
      })
    );

    const responseText = extractTextContent(response);
    const queries = extractEsqlQueries(responseText);

    const action: GenerateQueryAction = {
      type: 'generate_query',
      success: queries.length > 0,
      query: queries[0],
      response: responseText,
    };

    return {
      actions: [action],
      currentTry: state.currentTry + 1,
    };
  };

  const branchAfterGenerate = async (state: StateType) => {
    const lastAction = state.actions[state.actions.length - 1];
    if (!isGenerateQueryAction(lastAction)) {
      throw new Error(`Last action is not a generate_query action`);
    }
    if (lastAction.success) {
      return 'autocorrect_query';
    } else if (state.currentTry >= state.maxRetries) {
      return 'finalize';
    } else {
      return 'generate_esql';
    }
  };

  // autocorrect step - try to correct common mistakes in the esql query
  const autocorrectQuery = async (state: StateType) => {
    const lastAction = state.actions[state.actions.length - 1];
    if (!isGenerateQueryAction(lastAction) || !lastAction.query) {
      throw new Error(`Last action is not a generate_query action`);
    }

    const correction = correctCommonEsqlMistakes(lastAction.query);

    const action: AutocorrectQueryAction = {
      type: 'autocorrect_query',
      wasCorrected: correction.isCorrection,
      input: correction.input,
      output: correction.output,
    };

    return {
      actions: [action],
    };
  };

  const branchAfterAutocorrect = async (state: StateType) => {
    if (state.executeQuery) {
      return 'execute_query';
    } else {
      return 'validate_query';
    }
  };

  const validateQueryStep = async (state: StateType) => {
    let query: string;
    const lastAction = state.actions[state.actions.length - 1];
    if (isGenerateQueryAction(lastAction) && lastAction.query) {
      query = lastAction.query;
    } else if (isAutocorrectQueryAction(lastAction)) {
      query = lastAction.output;
    } else {
      throw new Error(`Last action is not a generate_query or autocorrect_query action`);
    }

    const errorMessage = await validateEsqlQuery(query, esqlCallbacks);
    const action: ValidateQueryAction = {
      type: 'validate_query',
      success: !errorMessage,
      query,
      error: errorMessage,
    };

    return {
      actions: [action],
    };
  };

  const branchAfterValidate = async (state: StateType) => {
    const lastAction = state.actions[state.actions.length - 1];
    if (!isValidateQueryAction(lastAction)) {
      throw new Error(`Last action is not a validate_query action`);
    }
    if (lastAction.success || state.currentTry >= state.maxRetries) {
      return 'finalize';
    } else {
      return 'generate_esql';
    }
  };

  // execute query step - validate first (ANTLR), then execute only if valid
  const executeQuery = async (state: StateType) => {
    let query: string;
    const lastAction = state.actions[state.actions.length - 1];
    if (isGenerateQueryAction(lastAction) && lastAction.query) {
      query = lastAction.query;
    } else if (isAutocorrectQueryAction(lastAction)) {
      query = lastAction.output;
    } else {
      throw new Error(`Last action is not a generate_query or autocorrect_query action`);
    }

    const validationError = await validateEsqlQuery(query, esqlCallbacks);
    if (validationError) {
      return {
        actions: [
          {
            type: 'execute_query',
            success: false,
            query,
            error: validationError,
          },
        ],
      };
    }

    let action: ExecuteQueryAction;
    try {
      const results = await executeEsql({
        query,
        params: buildTimeRangeParams(state.timeRange),
        esClient,
      });
      action = {
        type: 'execute_query',
        success: true,
        query,
        results,
      };
    } catch (e) {
      action = {
        type: 'execute_query',
        success: false,
        query,
        error: e.message,
      };
    }

    return {
      actions: [action],
    };
  };

  const branchAfterQueryExecution = async (state: StateType) => {
    const lastAction = state.actions[state.actions.length - 1];
    if (!isExecuteQueryAction(lastAction)) {
      throw new Error(`Last action is not an execute_query action`);
    }
    if (lastAction.success || state.currentTry >= state.maxRetries) {
      return 'finalize';
    } else {
      return 'generate_esql';
    }
  };

  // finalize step - process / generate the outputs
  const finalize = async (state: StateType) => {
    const lastAction = state.actions[state.actions.length - 1];
    const generateActions = state.actions.filter(isGenerateQueryAction);

    // ended via query execution - either successful or failure hitting max retries
    if (isExecuteQueryAction(lastAction)) {
      return {
        answer: generateActions[generateActions.length - 1].response,
        query: lastAction.query,
        results: lastAction.results,
        error: lastAction.error,
      };
    }
    // ended via AST validation when executeQuery=false - success or failure hitting max retries
    if (isValidateQueryAction(lastAction)) {
      return {
        answer: generateActions[generateActions.length - 1].response,
        query: lastAction.query,
        error: lastAction.error,
      };
    }
    // ended via autocorrect - when executeQuery=false and validation was skipped (should not happen after adding validate_query)
    if (isAutocorrectQueryAction(lastAction)) {
      return {
        answer: generateActions[generateActions.length - 1].response,
        query: lastAction.output,
      };
    }
    // ended via query generation - because the LLM didn't generate a query for some reason
    if (isGenerateQueryAction(lastAction)) {
      return {
        error: 'No query was generated',
        answer: lastAction.response,
        query: lastAction.query,
      };
    }

    // can't really happen, but just to make TS happy
    return {};
  };

  const graph = new StateGraph(StateAnnotation)
    // nodes
    .addNode('resolve_target', resolveTarget)
    .addNode('request_documentation', requestDocumentation)
    .addNode('generate_esql', generateEsql)
    .addNode('autocorrect_query', autocorrectQuery)
    .addNode('execute_query', executeQuery)
    .addNode('validate_query', validateQueryStep)
    .addNode('finalize', finalize)
    // edges
    .addEdge('__start__', 'resolve_target')
    .addEdge('resolve_target', 'request_documentation')
    .addEdge('request_documentation', 'generate_esql')
    .addConditionalEdges('generate_esql', branchAfterGenerate, {
      generate_esql: 'generate_esql',
      autocorrect_query: 'autocorrect_query',
      finalize: 'finalize',
    })
    .addConditionalEdges('autocorrect_query', branchAfterAutocorrect, {
      execute_query: 'execute_query',
      validate_query: 'validate_query',
    })
    .addConditionalEdges('execute_query', branchAfterQueryExecution, {
      generate_esql: 'generate_esql',
      finalize: 'finalize',
    })
    .addConditionalEdges('validate_query', branchAfterValidate, {
      generate_esql: 'generate_esql',
      finalize: 'finalize',
    })
    .addEdge('finalize', '__end__')
    .compile();

  return graph;
};
