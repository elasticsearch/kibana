/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ESQLColumn, ESQLIdentifier, ESQLSingleAstItem } from '@elastic/esql/types';
import { isParametrized } from '@elastic/esql';
import { UnmappedFieldsStrategy, type ICommandContext } from '../../../registry/types';
import { errors, getMessageFromId } from '../errors';
import { getColumnExists, getColumnName } from '../columns';
import { getExpressionType } from '../expressions';
import type { ESQLMessage } from '../../types';

interface ColumnValidationOptions {
  skipUnsupportedOrConflictingColumnValidation?: boolean;
}

export function validateColumnForCommand(
  column: ESQLColumn | ESQLIdentifier,
  commandName: string,
  context: ICommandContext,
  options?: ColumnValidationOptions
): ESQLMessage[] {
  return new ColumnValidator(column, context, commandName, options).validate();
}

export class ColumnValidator {
  constructor(
    private readonly column: ESQLColumn | ESQLIdentifier,
    private readonly context: ICommandContext,
    private readonly commandName: string,
    private readonly options: ColumnValidationOptions = {}
  ) {}

  validate(): ESQLMessage[] {
    if (!this.exists || this.isPreviouslyUsedUnmappedColumn) {
      if (this.isUnmappedColumnAllowed) {
        return [errors.unmappedColumnWarning(this.column)];
      } else {
        return [errors.unknownColumn(this.column)];
      }
    }

    if (!this.options.skipUnsupportedOrConflictingColumnValidation) {
      const columnName = getColumnName(this.column);
      const column = this.context.columns.get(columnName);

      if (!column?.userDefined && column?.type === 'unsupported') {
        const originalTypes = column.originalTypes ?? [];

        if (column.hasConflict && originalTypes.length > 1) {
          return [
            errors.columnTypeConflict(
              this.column,
              columnName,
              originalTypes,
              this.shouldWarnForUnsupportedOrConflictingColumn
            ),
          ];
        }

        return [
          errors.unsupportedFieldType(
            this.column,
            columnName,
            this.shouldWarnForUnsupportedOrConflictingColumn
          ),
        ];
      }
    }

    return [];
  }

  private get exists(): boolean {
    if (
      this.column.text.length > 0 &&
      !isParametrized(this.column) &&
      !getColumnExists(this.column, this.context, this.commandName === 'row')
    ) {
      return false;
    }

    return true;
  }

  private get isUnmappedColumnAllowed(): boolean {
    const unmappedFieldsStrategy = this.context.unmappedFieldsStrategy;
    return (
      unmappedFieldsStrategy === UnmappedFieldsStrategy.LOAD ||
      unmappedFieldsStrategy === UnmappedFieldsStrategy.NULLIFY
    );
  }

  private get isPreviouslyUsedUnmappedColumn(): boolean {
    const columnName = getColumnName(this.column);
    const column = this.context.columns.get(columnName);
    return Boolean(column && column.isUnmappedField);
  }

  private get shouldWarnForUnsupportedOrConflictingColumn(): boolean {
    return this.commandName === 'keep' || this.commandName === 'drop';
  }
}

export const validatePrefixAssignmentExpression = ({
  expression,
  commandName,
  acceptedTypes,
  typeLabel,
  context,
}: {
  expression: ESQLSingleAstItem | undefined;
  commandName: string;
  acceptedTypes: readonly string[];
  typeLabel: string;
  context?: ICommandContext;
}): ESQLMessage[] => {
  if (!expression || expression.incomplete) {
    return [];
  }

  const expressionType = getExpressionType(
    expression,
    context?.columns,
    context?.unmappedFieldsStrategy
  );

  if (!acceptedTypes.includes(expressionType)) {
    return [
      getMessageFromId({
        messageId: 'unsupportedColumnTypeForCommand',
        values: {
          command: commandName.toUpperCase(),
          type: typeLabel,
          column: expression.text,
          givenType: expressionType,
        },
        locations: expression.location,
      }),
    ];
  }

  return [];
};
