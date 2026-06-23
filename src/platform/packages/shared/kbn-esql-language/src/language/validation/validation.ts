/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { LicenseType } from '@kbn/licensing-types';
import type { ESQLCallbacks } from '@kbn/esql-types';
import type { ESQLCommand } from '@elastic/esql/types';
import { EsqlQuery } from '@elastic/esql';
import type { ESQLAstAllCommands } from '@elastic/esql/types';
import { esqlCommandRegistry } from '../../commands/registry';
import type { ICommandCallbacks } from '../../commands/registry/types';
import { UnmappedFieldsStrategy } from '../../commands/registry/types';
import { getMessageFromId } from '../../commands/definitions/utils';
import { QueryColumns } from '../../query_columns_service';
import { retrievePolicies, retrieveSources } from './resources';
import type { ReferenceMaps, ValidationOptions, ValidationResult } from './types';
import { getSubqueriesToValidate } from './subqueries';
import { getUnmappedFieldsStrategy } from '../../commands/definitions/utils/settings';
import { areNewUnmappedFieldsAllowed } from '../../query_columns_service/helpers';
import type { ESQLMessage } from '../../commands';

/**
 * ES|QL validation public API
 * It takes a query string and returns a list of messages (errors and warnings) after validate
 * The astProvider is optional, but if not provided the default one will be used.
 * This is useful for async loading the ES|QL parser and reduce the bundle size, or to swap grammar version.
 * As for the callbacks, while optional, the validation function will selectively ignore some errors types based on each callback missing.
 *
 * @param queryString - The query string to validate
 * @param callbacks - Optional callbacks for resource retrieval.
 * @param options.invalidateColumnsCache - Invalidates the columns metadata cache before validation. Has no effect if 'getColumnsFor' callback is not provided.
 *
 */
export async function validateQuery(
  queryString: string,
  callbacks?: ESQLCallbacks,
  options?: ValidationOptions
): Promise<ValidationResult> {
  return validateAst(queryString, callbacks, options);
}

function shouldValidateCallback<K extends keyof ESQLCallbacks>(
  callbacks: ESQLCallbacks | undefined,
  name: K
): boolean {
  return callbacks?.[name] !== undefined;
}

/**
 * This function will perform an high level validation of the
 * query AST. An initial syntax validation is already performed by the parser
 * while here it can detect things like function names, types correctness and potential warnings
 * @param ast A valid AST data structure
 */
async function validateAst(
  queryString: string,
  callbacks?: ESQLCallbacks,
  options?: ValidationOptions
): Promise<ValidationResult> {
  const messages: ESQLMessage[] = [];

  const parsingResult = EsqlQuery.fromSrc(queryString);

  const headerCommands = parsingResult.ast.header ?? [];

  const rootCommands = parsingResult.ast.commands;

  const [sources, availablePolicies, joinIndices, timeSeriesSources, views, datasets] =
    await Promise.all([
      shouldValidateCallback(callbacks, 'getSources')
        ? retrieveSources(rootCommands, callbacks)
        : new Set<string>(),
      shouldValidateCallback(callbacks, 'getPolicies')
        ? retrievePolicies(rootCommands, callbacks)
        : new Map(),
      shouldValidateCallback(callbacks, 'getJoinIndices')
        ? callbacks?.getJoinIndices?.()
        : undefined,
      shouldValidateCallback(callbacks, 'getTimeseriesIndices')
        ? callbacks?.getTimeseriesIndices?.()
        : undefined,
      shouldValidateCallback(callbacks, 'getViews') ? callbacks?.getViews?.() : undefined,
      shouldValidateCallback(callbacks, 'getDatasets') ? callbacks?.getDatasets?.() : undefined,
    ]);

  const license = await callbacks?.getLicense?.();
  const hasMinimumLicenseRequired = license
    ? (minimumLicenseRequired: LicenseType) => license.hasAtLeast(minimumLicenseRequired)
    : undefined;

  // Validate the header commands
  for (const command of headerCommands) {
    const references: ReferenceMaps = {
      sources,
      columns: new Map(), // no columns available in header
      policies: availablePolicies,
      query: queryString,
      joinIndices: joinIndices?.indices || [],
      timeSeriesSources: timeSeriesSources?.indices,
      views: views?.views ?? [],
      datasets: datasets?.datasets ?? [],
    };

    const commandMessages = validateCommand(command, references, rootCommands, {
      ...callbacks,
      hasMinimumLicenseRequired,
    });
    messages.push(...commandMessages);
  }

  const unmappedFieldsStrategyFromHeader = getUnmappedFieldsStrategy(headerCommands);

  /**
   * Even though we are validating single commands, we work with subqueries.
   *
   * The reason is that building the list of columns available in each command requires
   * the full command subsequence that precedes that command.
   */
  const subqueries = getSubqueriesToValidate(rootCommands, headerCommands);
  for (const subquery of subqueries) {
    const currentCommand = subquery.commands[subquery.commands.length - 1];

    const subqueryForColumns =
      currentCommand.name === 'join' || currentCommand.name === 'promql'
        ? subquery
        : { ...subquery, commands: subquery.commands.slice(0, -1) };

    const queryForColumns =
      currentCommand.name === 'promql'
        ? queryString.slice(0, currentCommand.location.max + 1)
        : queryString;

    const columns = shouldValidateCallback(callbacks, 'getColumnsFor')
      ? await new QueryColumns(subqueryForColumns, queryForColumns, callbacks, options).asMap()
      : new Map();

    const references: ReferenceMaps = {
      sources,
      columns,
      policies: availablePolicies,
      query: queryString,
      joinIndices: joinIndices?.indices || [],
      timeSeriesSources: timeSeriesSources?.indices,
      views: views?.views ?? [],
      datasets: datasets?.datasets ?? [],
    };

    const unmappedFieldsStrategy = areNewUnmappedFieldsAllowed(subqueryForColumns.commands)
      ? unmappedFieldsStrategyFromHeader
      : UnmappedFieldsStrategy.DEFAULT;

    const commandMessages = validateCommand(
      currentCommand,
      references,
      rootCommands,
      {
        ...callbacks,
        hasMinimumLicenseRequired,
      },
      unmappedFieldsStrategy
    );
    messages.push(...commandMessages);
  }

  const parserErrors = parsingResult.errors;

  /**
   * Some changes to the grammar deleted the literal names for some tokens.
   * This is a workaround to restore the literals that were lost.
   *
   * See https://github.com/elastic/elasticsearch/pull/124177 for context.
   */
  for (const error of parserErrors) {
    error.message = error.message.replace(/\bLP\b/, "'('");
    error.message = error.message.replace(/\bOPENING_BRACKET\b/, "'['");
  }

  return {
    errors: [...parserErrors, ...messages.filter(({ type }) => type === 'error')],
    warnings: messages.filter(({ type }) => type === 'warning'),
  };
}

function validateCommand(
  command: ESQLAstAllCommands,
  references: ReferenceMaps,
  rootCommands: ESQLCommand[],
  callbacks?: ICommandCallbacks,
  unmappedFieldsStrategy?: UnmappedFieldsStrategy
): ESQLMessage[] {
  const messages: ESQLMessage[] = [];
  if (command.incomplete) {
    return messages;
  }
  // do not check the command exists, the grammar is already picking that up
  const commandDefinition = esqlCommandRegistry.getCommandByName(command.name);

  if (!commandDefinition) {
    return messages;
  }

  // Check license requirements for the command
  if (callbacks?.hasMinimumLicenseRequired) {
    const license = commandDefinition.metadata.license;

    if (license && !callbacks.hasMinimumLicenseRequired(license.toLowerCase() as LicenseType)) {
      messages.push(
        getMessageFromId({
          messageId: 'licenseRequired',
          values: {
            name: command.name.toUpperCase(),
            requiredLicense: license.toUpperCase(),
          },
          locations: command.location,
        })
      );
    }
  }

  const context = {
    columns: references.columns,
    policies: references.policies,
    sources: [...references.sources].map((source) => ({ name: source, hidden: false })),
    joinSources: references.joinIndices,
    timeSeriesSources: references.timeSeriesSources,
    views: references.views,
    datasets: references.datasets,
    unmappedFieldsStrategy,
  };

  if (commandDefinition.methods.validate) {
    const allErrors = commandDefinition.methods.validate(command, rootCommands, context, callbacks);

    const filteredErrors = allErrors.filter((error) => {
      if (error.errorType === 'semantic' && error.requiresCallback) {
        return shouldValidateCallback(callbacks, error.requiresCallback as keyof ESQLCallbacks);
      }

      // All other errors pass through (syntax errors, untagged errors, etc.)
      return true;
    });

    messages.push(...filteredErrors);
  }

  // no need to check for mandatory options passed
  // as they are already validated at syntax level
  return messages;
}
