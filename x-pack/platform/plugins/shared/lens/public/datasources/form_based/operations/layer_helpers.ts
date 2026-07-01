/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { partition, mapValues, pickBy } from 'lodash';
import type { CoreStart } from '@kbn/core/public';
import type { Query } from '@kbn/es-query';
import memoizeOne from 'memoize-one';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import { UI_SETTINGS } from '@kbn/data-plugin/public';
import type {
  BuildColumnBaseOptions,
  TimeScaleUnit,
  ReferenceBasedIndexPatternColumn,
  DateRange,
  FormBasedLayer,
  GenericIndexPatternColumn,
  FormBasedPrivateState,
  TermsIndexPatternColumn,
  FramePublicAPI,
  IndexPattern,
  IndexPatternField,
  VisualizationDimensionGroupConfig,
  FormulaIndexPatternColumn,
  BaseIndexPatternColumn,
  DatasourceFixAction,
} from '@kbn/lens-common';
import { nonNullable } from '../../../utils';
import {
  operationDefinitionMap,
  operationDefinitions,
  type OperationType,
  type RequiredReference,
  type OperationDefinition,
  type GenericOperationDefinition,
  type FieldBasedOperationErrorMessage,
} from './definitions';
import type { DataViewDragDropOperation } from '../types';
import { getSortScoreByPriorityForField } from './operations';
import { generateId } from '../../../id_generator';
import { insertOrReplaceFormulaColumn } from './definitions/formula';
import { documentField } from '../document_field';
import { isColumnOfType } from './definitions/helpers';
import type { DataType, OperationMetadata } from '../../..';

export interface ColumnAdvancedParams {
  filter?: Query | undefined;
  timeShift?: string | undefined;
  timeScale?: TimeScaleUnit | undefined;
  dataType?: DataType;
}

interface ColumnChange {
  op: OperationType;
  layer: FormBasedLayer;
  columnId: string;
  indexPattern: IndexPattern;
  field?: IndexPatternField;
  visualizationGroups: VisualizationDimensionGroupConfig[];
  targetGroup?: string;
  shouldResetLabel?: boolean;
  shouldCombineField?: boolean;
  incompleteParams?: ColumnAdvancedParams;
  incompleteFieldName?: string;
  incompleteFieldOperation?: OperationType;
  columnParams?: Record<string, unknown>;
  initialParams?: { params: Record<string, unknown> }; // TODO: bind this to the op parameter
  references?: Array<Omit<ColumnChange, 'layer'>>;
  respectOrder?: boolean;
}

interface ColumnCopy {
  layers: Record<string, FormBasedLayer>;
  target: DataViewDragDropOperation;
  source: DataViewDragDropOperation;
  shouldDeleteSource?: boolean;
}

export function copyColumn({ layers, source, target }: ColumnCopy): Record<string, FormBasedLayer> {
  return createCopiedColumn(layers, target, source);
}

function createCopiedColumn(
  layers: Record<string, FormBasedLayer>,
  target: DataViewDragDropOperation,
  source: DataViewDragDropOperation
): Record<string, FormBasedLayer> {
  const sourceLayer = layers[source.layerId];
  const sourceColumn = sourceLayer.columns[source.columnId];
  const targetLayer = layers[target.layerId];
  let columns = { ...targetLayer.columns };
  if ('references' in sourceColumn) {
    const def = operationDefinitionMap[sourceColumn.operationType];
    if ('createCopy' in def) {
      return def.createCopy(layers, source, target, operationDefinitionMap); // Allow managed references to recursively insert new columns
    }
    const referenceColumns = sourceColumn.references.reduce((refs, sourceRef) => {
      const newRefId = generateId();
      return { ...refs, [newRefId]: { ...sourceLayer.columns[sourceRef] } };
    }, {});

    columns = {
      ...columns,
      ...referenceColumns,
      [target.columnId]: {
        ...sourceColumn,
        references: Object.keys(referenceColumns),
      },
    };
  } else {
    columns = {
      ...columns,
      [target.columnId]: { ...sourceColumn },
    };
  }

  return {
    ...layers,
    [target.layerId]: adjustColumnReferences({
      ...targetLayer,
      columns,
      columnOrder: getColumnOrder({ ...targetLayer, columns }),
    }),
  };
}

export function insertOrReplaceColumn(args: ColumnChange): FormBasedLayer {
  if (args.layer.columns[args.columnId]) {
    return replaceColumn(args);
  }
  return insertNewColumn(args);
}

function ensureCompatibleParamsAreMoved<T extends ColumnAdvancedParams>(
  column: T,
  referencedOperation: GenericOperationDefinition,
  previousColumn: ColumnAdvancedParams
) {
  const newColumn = { ...column };
  if (referencedOperation.filterable) {
    newColumn.filter = (previousColumn as ReferenceBasedIndexPatternColumn).filter;
  }
  if (referencedOperation.shiftable) {
    newColumn.timeShift = (previousColumn as ReferenceBasedIndexPatternColumn).timeShift;
  }
  if (referencedOperation.timeScalingMode !== 'disabled') {
    newColumn.timeScale = (previousColumn as ReferenceBasedIndexPatternColumn).timeScale;
  }
  return newColumn;
}

const insertReferences = ({
  layer,
  references,
  requiredReferences,
  indexPattern,
  visualizationGroups,
  targetGroup,
}: {
  layer: FormBasedLayer;
  references: Exclude<ColumnChange['references'], undefined>;
  requiredReferences: RequiredReference[];
  indexPattern: IndexPattern;
  visualizationGroups: VisualizationDimensionGroupConfig[];
  targetGroup?: string;
}) => {
  references.forEach((reference) => {
    const validOperations = requiredReferences.filter((validation) =>
      isOperationAllowedAsReference({ validation, operationType: reference.op, indexPattern })
    );

    if (!validOperations.length) {
      throw new Error(
        `Can't create reference, ${reference.op} has a validation function which doesn't allow any operations`
      );
    }
  });

  const referenceIds: string[] = [];
  references.forEach((reference) => {
    const operation = operationDefinitionMap[reference.op];

    if (operation.input === 'none') {
      layer = insertNewColumn({
        layer,
        columnId: reference.columnId,
        op: operation.type,
        indexPattern,
        columnParams: { ...reference.columnParams },
        incompleteParams: reference.incompleteParams,
        initialParams: reference.initialParams,
        ...(reference.references ? { references: reference.references } : {}),
        visualizationGroups,
        targetGroup,
      });

      referenceIds.push(reference.columnId);
      return;
    }

    const field =
      operation.input === 'field' &&
      reference.field &&
      operation.getPossibleOperationForField(reference.field)
        ? reference.field
        : undefined;

    if (field) {
      // Recursively update the layer for each new reference
      layer = insertNewColumn({
        layer,
        columnId: reference.columnId,
        op: operation.type,
        indexPattern,
        field,
        incompleteParams: reference.incompleteParams,
        initialParams: reference.initialParams,
        columnParams: { ...reference.columnParams },
        visualizationGroups,
        targetGroup,
      });
      referenceIds.push(reference.columnId);
      return;
    }
  });
  return { layer, referenceIds };
};

const generateNewReferences = ({
  op,
  incompleteFieldOperation,
  incompleteFieldName,
  columnParams,
  layer,
  requiredReferences,
  indexPattern,
  visualizationGroups,
  targetGroup,
}: {
  op: string;
  incompleteFieldName?: string;
  incompleteFieldOperation?: OperationType;
  columnParams?: Record<string, unknown>;
  layer: FormBasedLayer;
  requiredReferences: RequiredReference[];
  indexPattern: IndexPattern;
  visualizationGroups: VisualizationDimensionGroupConfig[];
  targetGroup?: string;
}) => {
  const referenceIds = requiredReferences.map((validation) => {
    const validOperations = Object.values(operationDefinitionMap).filter(({ type }) =>
      isOperationAllowedAsReference({ validation, operationType: type, indexPattern })
    );

    if (!validOperations.length) {
      throw new Error(
        `Can't create reference, ${op} has a validation function which doesn't allow any operations`
      );
    }

    const newId = generateId();
    if (incompleteFieldOperation && incompleteFieldName) {
      const validFields = indexPattern.fields.filter(
        (validField) => validField.name === incompleteFieldName
      );
      layer = insertNewColumn({
        layer,
        columnId: newId,
        op: incompleteFieldOperation,
        indexPattern,
        field: validFields[0] ?? documentField,
        visualizationGroups,
        columnParams,
        targetGroup,
      });
    }
    if (validOperations.length === 1) {
      const def = validOperations[0];

      let validFields =
        def.input === 'field' ? indexPattern.fields.filter(def.getPossibleOperationForField) : [];

      if (incompleteFieldName) {
        validFields = validFields.filter((validField) => validField.name === incompleteFieldName);
      }
      if (def.input === 'none') {
        layer = insertNewColumn({
          layer,
          columnId: newId,
          op: def.type,
          indexPattern,
          visualizationGroups,
          targetGroup,
        });
      } else if (validFields.length === 1) {
        // Recursively update the layer for each new reference
        layer = insertNewColumn({
          layer,
          columnId: newId,
          op: def.type,
          indexPattern,
          field: validFields[0],
          visualizationGroups,
          targetGroup,
        });
      } else {
        layer = {
          ...layer,
          incompleteColumns: {
            ...layer.incompleteColumns,
            [newId]: { operationType: def.type },
          },
        };
      }
    }
    return newId;
  });

  return { layer, referenceIds };
};

// Insert a column into an empty ID. The field parameter is required when constructing
// a field-based operation, but will cause the function to fail for any other type of operation.
export function insertNewColumn({
  op,
  layer,
  columnId,
  field,
  indexPattern,
  visualizationGroups,
  targetGroup,
  incompleteParams,
  incompleteFieldName,
  incompleteFieldOperation,
  columnParams,
  initialParams,
  references,
  respectOrder,
}: ColumnChange): FormBasedLayer {
  const operationDefinition = operationDefinitionMap[op];

  if (!operationDefinition) {
    throw new Error('No suitable operation found for given parameters');
  }

  if (layer.columns[columnId]) {
    throw new Error(`Can't insert a column with an ID that is already in use`);
  }

  const baseOptions: BuildColumnBaseOptions = {
    indexPattern,
    previousColumn: { ...incompleteParams, ...initialParams },
  };

  if (operationDefinition.input === 'none' || operationDefinition.input === 'managedReference') {
    if (field) {
      throw new Error(`Can't create operation ${op} with the provided field ${field.name}`);
    }
    if (operationDefinition.input === 'managedReference') {
      // TODO: need to create on the fly the new columns for Formula,
      // like we do for fullReferences to show a seamless transition
    }
    const possibleOperation = operationDefinition.getPossibleOperation(indexPattern);
    const isBucketed = Boolean(possibleOperation?.isBucketed);
    const addOperationFn = isBucketed ? addBucket : addMetric;
    const buildColumnFn = operationDefinition.buildColumn({ ...baseOptions, layer }, columnParams);

    return updateDefaultLabels(
      addOperationFn(
        layer,
        buildColumnFn,
        columnId,
        visualizationGroups,
        targetGroup,
        respectOrder
      ),
      indexPattern
    );
  }

  if (operationDefinition.input === 'fullReference') {
    if (field) {
      throw new Error(`Reference-based operations can't take a field as input when creating`);
    }

    let tempLayer = { ...layer };
    let referenceIds: string[] = [];
    if (references) {
      const result = insertReferences({
        layer: tempLayer,
        references,
        requiredReferences: operationDefinition.requiredReferences,
        indexPattern,
        visualizationGroups,
        targetGroup,
      });
      [tempLayer, referenceIds] = [result.layer, result.referenceIds];
    } else {
      const result = generateNewReferences({
        op,
        incompleteFieldName,
        incompleteFieldOperation,
        columnParams,
        layer: tempLayer,
        requiredReferences: operationDefinition.requiredReferences,
        indexPattern,
        visualizationGroups,
        targetGroup,
      });
      [tempLayer, referenceIds] = [result.layer, result.referenceIds];
    }

    const possibleOperation = operationDefinition.getPossibleOperation(indexPattern);
    if (!possibleOperation) {
      throw new Error(`Can't create operation ${op} because it's incompatible with the data view`);
    }
    const isBucketed = Boolean(possibleOperation.isBucketed);

    const addOperationFn = isBucketed ? addBucket : addMetric;
    const buildColumnFn = columnParams
      ? operationDefinition.buildColumn(
          { ...baseOptions, layer: tempLayer, referenceIds },
          columnParams
        )
      : operationDefinition.buildColumn({ ...baseOptions, layer: tempLayer, referenceIds });
    return updateDefaultLabels(
      addOperationFn(
        tempLayer,
        buildColumnFn,
        columnId,
        visualizationGroups,
        targetGroup,
        respectOrder
      ),
      indexPattern
    );
  }

  const invalidFieldName = (layer.incompleteColumns ?? {})[columnId]?.sourceField;
  const invalidField = invalidFieldName ? indexPattern.getFieldByName(invalidFieldName) : undefined;

  if (!field && invalidField) {
    const possibleOperation = operationDefinition.getPossibleOperationForField(invalidField);
    if (!possibleOperation) {
      throw new Error(
        `Tried to create an invalid operation ${operationDefinition.type} using previously selected field ${invalidField.name}`
      );
    }
    const isBucketed = Boolean(possibleOperation.isBucketed);
    if (isBucketed) {
      return updateDefaultLabels(
        addBucket(
          layer,
          operationDefinition.buildColumn({ ...baseOptions, layer, field: invalidField }),
          columnId,
          visualizationGroups,
          targetGroup,
          respectOrder
        ),
        indexPattern
      );
    } else {
      return updateDefaultLabels(
        addMetric(
          layer,
          operationDefinition.buildColumn({ ...baseOptions, layer, field: invalidField }),
          columnId
        ),
        indexPattern
      );
    }
  } else if (!field) {
    // Labels don't need to be updated because it's incomplete
    return {
      ...layer,
      incompleteColumns: {
        ...(layer.incompleteColumns ?? {}),
        [columnId]: { operationType: op },
      },
    };
  }

  const possibleOperation = operationDefinition.getPossibleOperationForField(field);
  if (!possibleOperation) {
    return {
      ...layer,
      incompleteColumns: {
        ...(layer.incompleteColumns ?? {}),
        [columnId]: { operationType: op, sourceField: field.name },
      },
    };
  }

  const newColumn = operationDefinition.buildColumn({ ...baseOptions, layer, field }, columnParams);
  const isBucketed = Boolean(possibleOperation.isBucketed);
  const addOperationFn = isBucketed ? addBucket : addMetric;
  return updateDefaultLabels(
    addOperationFn(layer, newColumn, columnId, visualizationGroups, targetGroup, respectOrder),
    indexPattern
  );
}

function replaceFormulaColumn(
  {
    operationDefinition,
    layer,
    previousColumn,
    indexPattern,
    previousDefinition,
    columnId,
  }: {
    operationDefinition: Extract<GenericOperationDefinition, { input: 'managedReference' }>;
    previousDefinition: GenericOperationDefinition;
    layer: FormBasedLayer;
    previousColumn: FormBasedLayer['columns'][number];
    indexPattern: IndexPattern;
    columnId: string;
  },
  { shouldResetLabel }: { shouldResetLabel?: boolean }
) {
  const baseOptions = {
    columns: layer.columns,
    previousColumn,
    indexPattern,
  };
  let tempLayer = layer;
  const newColumn = operationDefinition.buildColumn(
    { ...baseOptions, layer: tempLayer },
    'params' in previousColumn ? previousColumn.params : undefined,
    operationDefinitionMap
  ) as FormulaIndexPatternColumn;

  // now remove the previous references
  if (previousDefinition.input === 'fullReference') {
    (previousColumn as ReferenceBasedIndexPatternColumn).references.forEach((id: string) => {
      tempLayer = deleteColumn({ layer: tempLayer, columnId: id, indexPattern });
    });
  }

  const basicLayer = { ...tempLayer, columns: { ...tempLayer.columns, [columnId]: newColumn } };
  // rebuild the references again for the specific AST generated
  let newLayer;

  try {
    newLayer = newColumn.params.formula
      ? insertOrReplaceFormulaColumn(columnId, newColumn, basicLayer, {
          indexPattern,
        }).layer
      : basicLayer;
  } catch (e) {
    newLayer = basicLayer;
  }

  // when coming to Formula keep the custom label
  const regeneratedColumn = newLayer.columns[columnId];
  if (!shouldResetLabel && previousColumn.customLabel) {
    regeneratedColumn.customLabel = true;
    regeneratedColumn.label = previousColumn.label;
  }

  return updateDefaultLabels(
    adjustColumnReferencesForChangedColumn(
      {
        ...tempLayer,
        columnOrder: getColumnOrder(newLayer),
        columns: newLayer.columns,
      },
      columnId
    ),
    indexPattern
  );
}

export function replaceColumn({
  layer,
  columnId,
  indexPattern,
  op,
  field,
  visualizationGroups,
  initialParams,
  shouldResetLabel,
  shouldCombineField,
  columnParams,
}: ColumnChange): FormBasedLayer {
  const previousColumn = layer.columns[columnId];
  if (!previousColumn) {
    throw new Error(`Can't replace column because there is no prior column`);
  }

  const isNewOperation = op !== previousColumn.operationType;
  const operationDefinition = operationDefinitionMap[op];
  const previousDefinition = operationDefinitionMap[previousColumn.operationType];

  if (!operationDefinition) {
    throw new Error('No suitable operation found for given parameters');
  }

  const baseOptions = {
    columns: layer.columns,
    indexPattern,
    previousColumn,
  };

  if (isNewOperation) {
    let tempLayer = { ...layer };

    tempLayer = resetIncomplete(tempLayer, columnId);

    if (
      previousDefinition.input === 'managedReference' &&
      operationDefinition.input !== previousDefinition.input
    ) {
      // If the transition is incomplete, leave the managed state until it's finished.
      tempLayer = removeOrphanedColumns(
        previousDefinition,
        previousColumn,
        tempLayer,
        indexPattern
      );

      const hypotheticalLayer = insertNewColumn({
        layer: tempLayer,
        columnId,
        indexPattern,
        op,
        field,
        visualizationGroups,
        incompleteParams: previousColumn,
      });

      // if the formula label is not the default one, propagate it to the new operation
      if (
        !shouldResetLabel &&
        previousColumn.customLabel &&
        hypotheticalLayer.columns[columnId] &&
        previousColumn.label !==
          previousDefinition.getDefaultLabel(previousColumn, tempLayer.columns, indexPattern)
      ) {
        hypotheticalLayer.columns[columnId].customLabel = true;
        hypotheticalLayer.columns[columnId].label = previousColumn.label;
      }
      if (hypotheticalLayer.incompleteColumns && hypotheticalLayer.incompleteColumns[columnId]) {
        return {
          ...layer,
          incompleteColumns: hypotheticalLayer.incompleteColumns,
        };
      } else {
        return hypotheticalLayer;
      }
    }

    if (operationDefinition.input === 'fullReference') {
      return applyReferenceTransition({
        layer: tempLayer,
        columnId,
        previousColumn,
        op,
        indexPattern,
        visualizationGroups,
      });
    }

    // Makes common inferences about what the user meant when switching away from a reference:
    // 1. Switching from "Differences of max" to "max" will promote as-is
    // 2. Switching from "Differences of avg of bytes" to "max" will keep the field, but change operation
    if (
      previousDefinition.input === 'fullReference' &&
      (previousColumn as ReferenceBasedIndexPatternColumn).references.length === 1
    ) {
      const previousReferenceId = (previousColumn as ReferenceBasedIndexPatternColumn)
        .references[0];
      const referenceColumn = layer.columns[previousReferenceId];
      if (referenceColumn) {
        const referencedOperation = operationDefinitionMap[referenceColumn.operationType];

        if (referencedOperation.type === op) {
          // Unit tests are labelled as case a1, case a2
          tempLayer = deleteColumn({
            layer: tempLayer,
            columnId: previousReferenceId,
            indexPattern,
          });

          // do not forget to move over also any filter/shift/anything (if compatible)
          // from the reference definition to the new operation.
          const column = ensureCompatibleParamsAreMoved(
            copyCustomLabel({ ...referenceColumn }, previousColumn),
            referencedOperation,
            previousColumn as ReferenceBasedIndexPatternColumn
          );

          tempLayer = {
            ...tempLayer,
            columnOrder: getColumnOrder(tempLayer),
            columns: {
              ...tempLayer.columns,
              [columnId]: column,
            },
          };
          return updateDefaultLabels(
            adjustColumnReferencesForChangedColumn(tempLayer, columnId),
            indexPattern
          );
        } else if (
          !field &&
          'sourceField' in referenceColumn &&
          referencedOperation.input === 'field' &&
          operationDefinition.input === 'field'
        ) {
          // Unit test is case a3
          const matchedField = indexPattern.getFieldByName(referenceColumn.sourceField);
          if (matchedField && operationDefinition.getPossibleOperationForField(matchedField)) {
            field = matchedField;
          }
        }
      }
    }

    // TODO: Refactor all this to be more generic and know less about Formula
    // if managed it has to look at the full picture to have a seamless transition
    if (operationDefinition.input === 'managedReference') {
      return replaceFormulaColumn(
        {
          operationDefinition,
          layer: tempLayer,
          previousColumn,
          indexPattern,
          previousDefinition,
          columnId,
        },
        { shouldResetLabel }
      );
    }

    if (operationDefinition.input === 'none') {
      let newColumn = operationDefinition.buildColumn(
        { ...baseOptions, layer: tempLayer },
        columnParams
      );
      newColumn = copyCustomLabel(newColumn, previousColumn);
      tempLayer = removeOrphanedColumns(
        previousDefinition,
        previousColumn,
        tempLayer,
        indexPattern
      );

      const newLayer = {
        ...tempLayer,
        columns: { ...tempLayer.columns, [columnId]: newColumn },
      };
      return updateDefaultLabels(
        adjustColumnReferencesForChangedColumn(
          {
            ...newLayer,
            columnOrder: getColumnOrder(newLayer),
          },
          columnId
        ),
        indexPattern
      );
    }

    if (!field) {
      let incompleteColumn: {
        operationType: OperationType;
      } & ColumnAdvancedParams = { operationType: op };
      // if no field is available perform a full clean of the column from the layer
      if (previousDefinition.input === 'fullReference') {
        const previousReferenceId = (previousColumn as ReferenceBasedIndexPatternColumn)
          .references[0];
        const referenceColumn = layer.columns[previousReferenceId];
        if (referenceColumn) {
          const referencedOperation = operationDefinitionMap[referenceColumn.operationType];

          incompleteColumn = ensureCompatibleParamsAreMoved(
            incompleteColumn,
            referencedOperation,
            previousColumn
          );
        }
      }
      return {
        ...tempLayer,
        incompleteColumns: {
          ...(tempLayer.incompleteColumns ?? {}),
          [columnId]: incompleteColumn,
        },
      };
    }

    const validOperation = operationDefinition.getPossibleOperationForField(field);
    if (!validOperation) {
      return {
        ...tempLayer,
        incompleteColumns: {
          ...(tempLayer.incompleteColumns ?? {}),
          [columnId]: { operationType: op },
        },
      };
    }

    tempLayer = removeOrphanedColumns(previousDefinition, previousColumn, tempLayer, indexPattern);

    let newColumn = operationDefinition.buildColumn(
      { ...baseOptions, layer: tempLayer, field },
      columnParams
    );
    if (!shouldResetLabel) {
      newColumn = copyCustomLabel(newColumn, previousColumn);
    }
    const newLayer = { ...tempLayer, columns: { ...tempLayer.columns, [columnId]: newColumn } };
    return updateDefaultLabels(
      adjustColumnReferencesForChangedColumn(
        {
          ...newLayer,
          columnOrder: getColumnOrder(newLayer),
        },
        columnId
      ),
      indexPattern
    );
  } else if (
    operationDefinition.input === 'field' &&
    field &&
    'sourceField' in previousColumn &&
    (previousColumn.sourceField !== field.name || operationDefinition?.getParamsForMultipleFields)
  ) {
    // Same operation, new field
    let newColumn = operationDefinition.onFieldChange(
      previousColumn,
      field,
      shouldCombineField ? initialParams?.params : undefined
    );
    if (!shouldResetLabel) {
      newColumn = copyCustomLabel(newColumn, previousColumn);
    }

    const newLayer = resetIncomplete(
      { ...layer, columns: { ...layer.columns, [columnId]: newColumn } },
      columnId
    );

    return updateDefaultLabels(
      adjustColumnReferencesForChangedColumn(
        {
          ...newLayer,
          columnOrder: getColumnOrder(newLayer),
        },
        columnId
      ),
      indexPattern
    );
  } else if (operationDefinition.input === 'managedReference') {
    // Just changing a param in a formula column should trigger
    // a full formula regeneration for side effects on referenced columns
    return replaceFormulaColumn(
      {
        operationDefinition,
        layer,
        previousColumn,
        indexPattern,
        previousDefinition,
        columnId,
      },
      { shouldResetLabel }
    );
  } else {
    throw new Error('nothing changed');
  }
}

function removeOrphanedColumns(
  previousDefinition:
    | OperationDefinition<GenericIndexPatternColumn, 'field'>
    | OperationDefinition<GenericIndexPatternColumn, 'none'>
    | OperationDefinition<GenericIndexPatternColumn, 'fullReference'>
    | OperationDefinition<GenericIndexPatternColumn, 'managedReference'>,
  previousColumn: GenericIndexPatternColumn,
  tempLayer: FormBasedLayer,
  indexPattern: IndexPattern
) {
  let newLayer: FormBasedLayer = tempLayer;
  if (previousDefinition.input === 'managedReference') {
    const [columnId] =
      Object.entries(tempLayer.columns).find(([_, currColumn]) => currColumn === previousColumn) ||
      [];
    if (columnId != null) {
      newLayer = deleteColumn({ layer: tempLayer, columnId, indexPattern });
    }
  }
  if (previousDefinition.input === 'fullReference') {
    (previousColumn as ReferenceBasedIndexPatternColumn).references.forEach((id: string) => {
      newLayer = deleteColumn({
        layer: tempLayer,
        columnId: id,
        indexPattern,
      });
    });
  }
  return newLayer;
}

export function canTransition({
  layer,
  columnId,
  op,
  field,
  indexPattern,
  filterOperations,
  visualizationGroups,
  dateRange,
}: ColumnChange & {
  filterOperations: (meta: OperationMetadata) => boolean;
  dateRange: DateRange;
}): boolean {
  const previousColumn = layer.columns[columnId];
  if (!previousColumn) {
    return true;
  }

  if (previousColumn.operationType === op) {
    return true;
  }

  try {
    const newLayer = replaceColumn({
      layer,
      columnId,
      op,
      field,
      indexPattern,
      visualizationGroups,
    });
    const newDefinition = operationDefinitionMap[op];
    const newColumn = newLayer.columns[columnId];
    return (
      Boolean(newColumn) &&
      !newLayer.incompleteColumns?.[columnId] &&
      filterOperations(newColumn) &&
      !newDefinition.getErrorMessage?.(newLayer, columnId, indexPattern, dateRange)?.length
    );
  } catch (e) {
    return false;
  }
}

/**
 * Function to transition to a fullReference from any different operation.
 * It is always possible to transition to a fullReference, but there are multiple
 * passes needed to copy all the previous state. These are the passes in priority
 * order, each of which has a unit test:
 *
 * 1. Case ref1: referenced columns are an exact match
 *    Side effect: Modifies the reference list directly
 * 2. Case new1: the previous column is an exact match.
 *    Side effect: Deletes and then inserts the previous column
 * 3. Case new2: the reference supports `none` inputs, like filters. not visible in the UI.
 *    Side effect: Inserts a new column
 * 4. Case new3, new4: Fuzzy matching on the previous field
 *    Side effect: Inserts a new column, or an incomplete column
 * 5. Fuzzy matching based on the previous references (case new6)
 *    Side effect: Inserts a new column, or an incomplete column
 *    Side effect: Modifies the reference list directly
 * 6. Case new6: Fall back by generating the column with empty references
 */
function applyReferenceTransition({
  layer,
  columnId,
  previousColumn,
  op,
  indexPattern,
  visualizationGroups,
}: {
  layer: FormBasedLayer;
  columnId: string;
  previousColumn: GenericIndexPatternColumn;
  op: OperationType;
  indexPattern: IndexPattern;
  visualizationGroups: VisualizationDimensionGroupConfig[];
}): FormBasedLayer {
  const operationDefinition = operationDefinitionMap[op];

  if (operationDefinition.input !== 'fullReference') {
    throw new Error(`Requirements for transitioning are not met`);
  }

  let hasExactMatch = false;
  let hasFieldMatch = false;

  const unusedReferencesQueue =
    'references' in previousColumn
      ? [...(previousColumn as ReferenceBasedIndexPatternColumn).references]
      : [];

  const referenceIds = operationDefinition.requiredReferences.map((validation) => {
    const newId = generateId();

    // First priority is to use any references that can be kept (case ref1)
    if (unusedReferencesQueue.length) {
      const otherColumn = layer.columns[unusedReferencesQueue[0]];
      if (isColumnValidAsReference({ validation, column: otherColumn })) {
        return unusedReferencesQueue.shift()!;
      }
    }

    // Second priority is to wrap around the previous column (case new1)
    if (!hasExactMatch && isColumnValidAsReference({ validation, column: previousColumn })) {
      hasExactMatch = true;

      const newLayer = {
        ...layer,
        columns: {
          ...layer.columns,
          [newId]: {
            ...previousColumn,
            // drop the filter for the referenced column because the wrapping operation
            // is filterable as well and will handle it one level higher.
            filter: operationDefinition.filterable ? undefined : previousColumn.filter,
            timeShift: operationDefinition.shiftable ? undefined : previousColumn.timeShift,
          },
        },
      };
      layer = updateDefaultLabels(
        adjustColumnReferencesForChangedColumn(
          {
            ...newLayer,
            columnOrder: getColumnOrder(newLayer),
          },
          newId
        ),
        indexPattern
      );
      return newId;
    }

    // Look for any fieldless operations that can be inserted directly (case new2)
    if (validation.input.includes('none')) {
      const validOperations = operationDefinitions.filter((def) => {
        if (def.input !== 'none') return;
        return isOperationAllowedAsReference({
          validation,
          operationType: def.type,
          indexPattern,
        });
      });

      if (validOperations.length === 1) {
        layer = insertNewColumn({
          layer,
          columnId: newId,
          op: validOperations[0].type,
          indexPattern,
          visualizationGroups,
        });
        return newId;
      }
    }

    // Try to reuse the previous field by finding a possible operation. Because we've alredy
    // checked for an exact operation match, this is guaranteed to be different from previousColumn
    if (!hasFieldMatch && 'sourceField' in previousColumn && validation.input.includes('field')) {
      const previousField = indexPattern.getFieldByName(previousColumn.sourceField);
      const defIgnoringfield = operationDefinitions
        .filter(
          (def) =>
            def.input === 'field' &&
            isOperationAllowedAsReference({ validation, operationType: def.type, indexPattern })
        )
        .sort(getSortScoreByPriorityForField(previousField));

      // No exact match found, so let's determine that the current field can be reused
      const defWithField = defIgnoringfield.filter((def) => {
        if (!previousField) return;
        return isOperationAllowedAsReference({
          validation,
          operationType: def.type,
          field: previousField,
          indexPattern,
        });
      });

      if (defWithField.length > 0) {
        // Found the best match that keeps the field (case new3)
        hasFieldMatch = true;
        layer = insertNewColumn({
          layer,
          columnId: newId,
          op: defWithField[0].type,
          indexPattern,
          field: indexPattern.getFieldByName(previousColumn.sourceField),
          visualizationGroups,
        });
        return newId;
      } else if (defIgnoringfield.length === 1) {
        // Can't use the field, but there is an exact match on the operation (case new4)
        hasFieldMatch = true;
        layer = {
          ...layer,
          incompleteColumns: {
            ...layer.incompleteColumns,
            [newId]: { operationType: defIgnoringfield[0].type },
          },
        };
        return newId;
      }
    }

    // Look for field-based references that we can use to assign a new field-based operation from (case new5)
    if (unusedReferencesQueue.length) {
      const otherColumn = layer.columns[unusedReferencesQueue[0]];
      if (otherColumn && 'sourceField' in otherColumn && validation.input.includes('field')) {
        const previousField = indexPattern.getFieldByName(otherColumn.sourceField);
        if (previousField) {
          const defWithField = operationDefinitions
            .filter(
              (def) =>
                def.input === 'field' &&
                isOperationAllowedAsReference({
                  validation,
                  operationType: def.type,
                  field: previousField,
                  indexPattern,
                })
            )
            .sort(getSortScoreByPriorityForField(previousField));

          if (defWithField.length > 0) {
            layer = insertNewColumn({
              layer,
              columnId: newId,
              op: defWithField[0].type,
              indexPattern,
              field: previousField,
              visualizationGroups,
            });
            return newId;
          }
        }
      }
    }

    // The reference is too ambiguous at this point, but instead of throwing an error (case new6)
    return newId;
  });

  if (unusedReferencesQueue.length) {
    unusedReferencesQueue.forEach((id: string) => {
      layer = deleteColumn({
        layer,
        columnId: id,
        indexPattern,
      });
    });
  }

  layer = {
    ...layer,
    columns: {
      ...layer.columns,
      [columnId]: operationDefinition.buildColumn({
        indexPattern,
        layer,
        referenceIds,
        previousColumn,
      }),
    },
  };
  return updateDefaultLabels(
    adjustColumnReferencesForChangedColumn(
      {
        ...layer,
        columnOrder: getColumnOrder(layer),
      },
      columnId
    ),
    indexPattern
  );
}

function copyCustomLabel(
  newColumn: GenericIndexPatternColumn,
  previousOptions: GenericIndexPatternColumn
) {
  const adjustedColumn = { ...newColumn };
  const operationChanged = newColumn.operationType !== previousOptions.operationType;
  const fieldChanged =
    ('sourceField' in newColumn && newColumn.sourceField) !==
    ('sourceField' in previousOptions && previousOptions.sourceField);
  // only copy custom label if either used operation or used field stayed the same
  if (previousOptions.customLabel && (!operationChanged || !fieldChanged)) {
    adjustedColumn.customLabel = true;
    adjustedColumn.label = previousOptions.label;
  }
  return adjustedColumn;
}

function addBucket(
  layer: FormBasedLayer,
  column: BaseIndexPatternColumn,
  addedColumnId: string,
  visualizationGroups: VisualizationDimensionGroupConfig[],
  targetGroup?: string,
  respectOrder?: boolean
): FormBasedLayer {
  const [buckets, metrics] = partition(
    layer.columnOrder,
    (colId) => layer.columns[colId].isBucketed
  );

  const oldDateHistogramIndex = layer.columnOrder.findIndex(
    (columnId) => layer.columns[columnId].operationType === 'date_histogram'
  );

  let updatedColumnOrder: string[] = [];
  if (oldDateHistogramIndex > -1 && column.operationType === 'terms' && !respectOrder) {
    // Insert the new terms bucket above the first date histogram
    updatedColumnOrder = [
      ...buckets.slice(0, oldDateHistogramIndex),
      addedColumnId,
      ...buckets.slice(oldDateHistogramIndex, buckets.length),
      ...metrics,
    ];
  } else {
    // Insert the new bucket after existing buckets. Users will see the same data
    // they already had, with an extra level of detail.
    updatedColumnOrder = [...buckets, addedColumnId, ...metrics];
  }
  updatedColumnOrder = reorderByGroups(
    visualizationGroups,
    updatedColumnOrder,
    targetGroup,
    addedColumnId
  );
  const tempLayer = {
    ...resetIncomplete(layer, addedColumnId),
    columns: { ...layer.columns, [addedColumnId]: column },
    columnOrder: updatedColumnOrder,
  };
  return adjustColumnReferencesForChangedColumn(
    {
      ...tempLayer,
      columnOrder: getColumnOrder(tempLayer),
    },
    addedColumnId
  );
}

export function reorderByGroups(
  visualizationGroups: VisualizationDimensionGroupConfig[],
  updatedColumnOrder: string[],
  targetGroup: string | undefined,
  addedColumnId: string
) {
  const hidesColumnGrouping =
    targetGroup && visualizationGroups.find((group) => group.groupId === targetGroup)?.hideGrouping;

  // if column grouping is disabled, keep bucket aggregations in the same order as the groups
  // if grouping is known
  if (hidesColumnGrouping) {
    const orderedVisualizationGroups = [...visualizationGroups];
    orderedVisualizationGroups.sort((group1, group2) => {
      if (typeof group1.nestingOrder === undefined) {
        return -1;
      }
      if (typeof group2.nestingOrder === undefined) {
        return 1;
      }
      return group1.nestingOrder! - group2.nestingOrder!;
    });
    const columnGroupIndex: Record<string, number> = {};
    updatedColumnOrder.forEach((columnId) => {
      const groupIndex = orderedVisualizationGroups.findIndex(
        (group) =>
          (columnId === addedColumnId && group.groupId === targetGroup) ||
          group.accessors.some((acc) => acc.columnId === columnId)
      );
      if (groupIndex !== -1) {
        columnGroupIndex[columnId] = groupIndex;
      } else {
        // referenced columns won't show up in visualization groups - put them in the back of the list. This will work as they are always metrics
        columnGroupIndex[columnId] = updatedColumnOrder.length;
      }
    });

    return [...updatedColumnOrder].sort((a, b) => {
      return columnGroupIndex[a] - columnGroupIndex[b];
    });
  } else {
    return updatedColumnOrder;
  }
}

function addMetric(
  layer: FormBasedLayer,
  column: BaseIndexPatternColumn,
  addedColumnId: string
): FormBasedLayer {
  const tempLayer = {
    ...resetIncomplete(layer, addedColumnId),
    columns: {
      ...layer.columns,
      [addedColumnId]: column,
    },
  };
  return adjustColumnReferencesForChangedColumn(
    {
      ...tempLayer,
      columnOrder: getColumnOrder(tempLayer),
    },
    addedColumnId
  );
}

export function getMetricOperationTypes(field: IndexPatternField) {
  return operationDefinitions.sort(getSortScoreByPriorityForField(field)).filter((definition) => {
    if (definition.input !== 'field') return;
    const metadata = definition.getPossibleOperationForField(field);
    return metadata && !metadata.isBucketed && metadata.dataType === 'number';
  });
}

export function updateColumnLabel({
  layer,
  columnId,
  customLabel,
}: {
  layer: FormBasedLayer;
  columnId: string;
  customLabel?: string;
}): FormBasedLayer {
  const oldColumn = layer.columns[columnId];
  return {
    ...layer,
    columns: {
      ...layer.columns,
      [columnId]: {
        ...oldColumn,
        label: customLabel !== undefined ? customLabel : oldColumn.label,
        customLabel: Boolean(customLabel),
      },
    } as Record<string, GenericIndexPatternColumn>,
  };
}

export function updateColumnParam({
  layer,
  columnId,
  paramName,
  value,
}: {
  layer: FormBasedLayer;
  columnId: string;
  paramName: string;
  value: unknown;
}): FormBasedLayer {
  const currentColumn = layer.columns[columnId];
  return {
    ...layer,
    columns: {
      ...layer.columns,
      [columnId]: {
        ...currentColumn,
        params: {
          ...('params' in currentColumn ? currentColumn.params : {}),
          [paramName]: value,
        },
      },
    } as Record<string, GenericIndexPatternColumn>,
  };
}

export function adjustColumnReferences(layer: FormBasedLayer) {
  const newColumns = { ...layer.columns };
  Object.keys(newColumns).forEach((currentColumnId) => {
    const currentColumn = newColumns[currentColumnId];
    if (currentColumn?.operationType) {
      const operationDefinition = operationDefinitionMap[currentColumn.operationType];
      newColumns[currentColumnId] = operationDefinition.onOtherColumnChanged
        ? operationDefinition.onOtherColumnChanged(
            { ...layer, columns: newColumns },
            currentColumnId
          )
        : currentColumn;
    }
  });
  return {
    ...layer,
    columns: newColumns,
  };
}

export function adjustColumnReferencesForChangedColumn(
  layer: FormBasedLayer,
  changedColumnId: string
) {
  const newColumns = { ...layer.columns };
  Object.keys(newColumns).forEach((currentColumnId) => {
    if (currentColumnId !== changedColumnId) {
      const currentColumn = newColumns[currentColumnId];
      const operationDefinition = operationDefinitionMap[currentColumn.operationType];
      newColumns[currentColumnId] = operationDefinition.onOtherColumnChanged
        ? operationDefinition.onOtherColumnChanged(
            { ...layer, columns: newColumns },
            currentColumnId
          )
        : currentColumn;
    }
  });
  return {
    ...layer,
    columns: newColumns,
  };
}

export function deleteColumn({
  layer,
  columnId,
  indexPattern,
}: {
  layer: FormBasedLayer;
  columnId: string;
  indexPattern: IndexPattern;
}): FormBasedLayer {
  const column = layer.columns[columnId];
  if (!column) {
    const newIncomplete = { ...(layer.incompleteColumns || {}) };
    delete newIncomplete[columnId];
    return {
      ...layer,
      columnOrder: layer.columnOrder.filter((id) => id !== columnId),
      incompleteColumns: newIncomplete,
    };
  }

  const extraDeletions: string[] = 'references' in column ? column.references : [];

  const hypotheticalColumns = { ...layer.columns };
  delete hypotheticalColumns[columnId];

  let newLayer = adjustColumnReferencesForChangedColumn(
    {
      ...layer,
      columns: hypotheticalColumns,
    },
    columnId
  );

  extraDeletions.forEach((id) => {
    newLayer = deleteColumn({ layer: newLayer, columnId: id, indexPattern });
  });

  const newIncomplete = { ...(newLayer.incompleteColumns || {}) };
  delete newIncomplete[columnId];

  return updateDefaultLabels(
    {
      ...newLayer,
      columnOrder: getColumnOrder(newLayer),
      incompleteColumns: newIncomplete,
    },
    indexPattern
  );
}

// Column order mostly affects the visual order in the UI. It is derived
// from the columns objects, respecting any existing columnOrder relationships,
// but allowing new columns to be inserted
//
// This does NOT topologically sort references, as this would cause the order in the UI
// to change. Reference order is determined before creating the pipeline in to_expression
export function getColumnOrder(layer: FormBasedLayer): string[] {
  const entries = Object.entries(layer.columns);
  entries.sort(([idA], [idB]) => {
    const indexA = layer.columnOrder.indexOf(idA);
    const indexB = layer.columnOrder.indexOf(idB);
    if (indexA > -1 && indexB > -1) {
      return indexA - indexB;
    } else if (indexA > -1) {
      return -1;
    } else {
      return 1;
    }
  });

  const [aggregations, metrics] = partition(entries, ([, col]) => col.isBucketed);

  return aggregations.map(([id]) => id).concat(metrics.map(([id]) => id));
}

// Splits existing columnOrder into the three categories
export function getExistingColumnGroups(layer: FormBasedLayer): [string[], string[], string[]] {
  const [direct, referenced] = partition(
    layer.columnOrder,
    (columnId) => layer.columns[columnId] && !('references' in layer.columns[columnId])
  );
  return [...partition(direct, (columnId) => layer.columns[columnId]?.isBucketed), referenced];
}

/**
 * Returns true if the given column can be applied to the given index pattern
 */
export function isColumnTransferable(
  column: GenericIndexPatternColumn,
  newIndexPattern: IndexPattern,
  layer: FormBasedLayer
): boolean {
  return (
    operationDefinitionMap[column.operationType].isTransferable(
      column,
      newIndexPattern,
      operationDefinitionMap
    ) &&
    (!('references' in column) ||
      column.references.every((columnId) =>
        isColumnTransferable(layer.columns[columnId], newIndexPattern, layer)
      ))
  );
}

export function updateLayerIndexPattern(
  layer: FormBasedLayer,
  newIndexPattern: IndexPattern
): FormBasedLayer {
  const keptColumns: FormBasedLayer['columns'] = pickBy(layer.columns, (column) => {
    return isColumnTransferable(column, newIndexPattern, layer);
  });
  const newColumns: FormBasedLayer['columns'] = mapValues(keptColumns, (column) => {
    const operationDefinition = operationDefinitionMap[column.operationType];
    return operationDefinition.transfer
      ? operationDefinition.transfer(column, newIndexPattern)
      : column;
  });
  const newColumnOrder = layer.columnOrder.filter((columnId) => newColumns[columnId]);

  return {
    ...layer,
    indexPatternId: newIndexPattern.id,
    columns: newColumns,
    columnOrder: newColumnOrder,
  };
}

type LayerErrorMessage = FieldBasedOperationErrorMessage & {
  fixAction: DatasourceFixAction<FormBasedPrivateState>;
};

/**
 * Collects all errors from the columns in the layer, for display in the workspace. This includes:
 *
 * - All columns have complete references
 * - All column references are valid
 * - All prerequisites are met
 * - If timeshift is used, terms go before date histogram
 * - If timeshift is used, only a single date histogram can be used
 */
export function getErrorMessages(
  layer: FormBasedLayer,
  indexPattern: IndexPattern,
  state: FormBasedPrivateState,
  layerId: string,
  core: CoreStart,
  data: DataPublicPluginStart
): LayerErrorMessage[] | undefined {
  const columns = Object.entries(layer.columns);
  const visibleManagedReferences = columns.filter(
    ([columnId, column]) =>
      !isReferenced(layer, columnId) &&
      operationDefinitionMap[column.operationType].input === 'managedReference'
  );
  const skippedColumns = visibleManagedReferences.flatMap(([columnId]) =>
    getManagedColumnsFrom(columnId, layer.columns).map(([id]) => id)
  );
  const errors: LayerErrorMessage[] = columns
    .flatMap(([columnId, column]) => {
      if (skippedColumns.includes(columnId)) {
        return;
      }
      const def = operationDefinitionMap[column.operationType];
      if (def.getErrorMessage) {
        const currentTimeRange = data.query.timefilter.timefilter.getAbsoluteTime();
        return def.getErrorMessage(
          layer,
          columnId,
          indexPattern,
          { fromDate: currentTimeRange.from, toDate: currentTimeRange.to },
          operationDefinitionMap,
          core.uiSettings.get(UI_SETTINGS.HISTOGRAM_BAR_TARGET)
        );
      }
    })
    .map((errorMessage) => {
      if (typeof errorMessage !== 'object') {
        return errorMessage;
      }
      return {
        ...errorMessage,
        fixAction: errorMessage.fixAction
          ? {
              ...errorMessage.fixAction,
              newState: async (frame: FramePublicAPI) => ({
                ...state,
                layers: {
                  ...state.layers,
                  [layerId]: await errorMessage.fixAction!.newState(data, core, frame, layerId),
                },
              }),
            }
          : undefined,
      };
    })
    // remove the undefined values
    .filter(nonNullable) as LayerErrorMessage[];

  return errors.length ? errors : undefined;
}

export function isReferenced(layer: FormBasedLayer, columnId: string): boolean {
  const allReferences = Object.values(layer.columns).flatMap((col) =>
    'references' in col ? col.references : []
  );
  return allReferences.includes(columnId);
}

const computeReferenceLookup = memoizeOne((layer: FormBasedLayer): Record<string, string> => {
  // speed up things for deep chains as in formula
  const refLookup: Record<string, string> = {};
  for (const [parentId, col] of Object.entries(layer.columns)) {
    if ('references' in col) {
      for (const colId of col.references) {
        refLookup[colId] = parentId;
      }
    }
  }
  return refLookup;
});

/**
 * Given a columnId, returns the visible root column id for it
 * This is useful to map internal properties of referenced columns to the visible column
 * @param layer
 * @param columnId
 * @returns id of the reference root
 */
export function getReferenceRoot(layer: FormBasedLayer, columnId: string): string {
  const refLookup = computeReferenceLookup(layer);
  let currentId = columnId;
  while (isReferenced(layer, currentId)) {
    currentId = refLookup[currentId];
  }
  return currentId;
}

export function hasTermsWithManyBuckets(layer: FormBasedLayer): boolean {
  return layer.columnOrder.some((columnId) => {
    const column = layer.columns[columnId];
    if (column) {
      return isColumnOfType<TermsIndexPatternColumn>('terms', column) && column.params.size > 5;
    }
  });
}

export function isOperationAllowedAsReference({
  operationType,
  validation,
  field,
  indexPattern,
}: {
  operationType: OperationType;
  validation: RequiredReference;
  indexPattern: IndexPattern;
  field?: IndexPatternField;
}): boolean {
  const operationDefinition = operationDefinitionMap[operationType];

  let hasValidMetadata = true;
  if (field && operationDefinition.input === 'field') {
    const metadata = operationDefinition.getPossibleOperationForField(field);
    hasValidMetadata =
      Boolean(metadata) && validation.validateMetadata(metadata!, operationType, field.name);
  } else if (operationDefinition.input === 'none') {
    const metadata = operationDefinition.getPossibleOperation(indexPattern);
    hasValidMetadata = Boolean(metadata) && validation.validateMetadata(metadata!, operationType);
  } else if (operationDefinition.input === 'fullReference') {
    const metadata = operationDefinition.getPossibleOperation(indexPattern);
    hasValidMetadata = Boolean(metadata) && validation.validateMetadata(metadata!, operationType);
  } else {
    // TODO: How can we validate the metadata without a specific field?
  }
  return (
    validation.input.includes(operationDefinition.input) &&
    (!validation.specificOperations || validation.specificOperations.includes(operationType)) &&
    hasValidMetadata
  );
}

// Labels need to be updated when columns are added because reference-based column labels
// are sometimes copied into the parents
export function updateDefaultLabels(
  layer: FormBasedLayer,
  indexPattern: IndexPattern
): FormBasedLayer {
  const copiedColumns = { ...layer.columns };
  layer.columnOrder.forEach((id) => {
    const col = copiedColumns[id];
    if (!col.customLabel) {
      copiedColumns[id] = {
        ...col,
        label: operationDefinitionMap[col.operationType].getDefaultLabel(
          col,
          copiedColumns,
          indexPattern
        ),
      };
    }
  });
  return { ...layer, columns: copiedColumns };
}

export function resetIncomplete(layer: FormBasedLayer, columnId: string): FormBasedLayer {
  const incompleteColumns = { ...(layer.incompleteColumns ?? {}) };
  delete incompleteColumns[columnId];
  return { ...layer, incompleteColumns };
}

// managedReferences have a relaxed policy about operation allowed, so let them pass
function maybeValidateOperations({
  column,
  validation,
}: {
  column: GenericIndexPatternColumn;
  validation: RequiredReference;
}) {
  if (!validation.specificOperations) {
    return true;
  }
  if (operationDefinitionMap[column.operationType].input === 'managedReference') {
    return true;
  }
  return validation.specificOperations.includes(column.operationType);
}

export function isColumnValidAsReference({
  column,
  validation,
}: {
  column: GenericIndexPatternColumn;
  validation: RequiredReference;
}): boolean {
  if (!column) return false;
  const operationType = column.operationType;
  const operationDefinition = operationDefinitionMap[operationType];
  if (!operationDefinition) {
    throw new Error('No suitable operation definition found for ' + operationType);
  }
  return (
    validation.input.includes(operationDefinition.input) &&
    maybeValidateOperations({
      column,
      validation,
    }) &&
    validation.validateMetadata(
      column,
      operationType,
      'sourceField' in column ? column.sourceField : undefined
    )
  );
}

export function getManagedColumnsFrom(
  columnId: string,
  columns: Record<string, GenericIndexPatternColumn>
): Array<[string, GenericIndexPatternColumn]> {
  const allNodes: Record<string, string[]> = {};
  Object.entries(columns).forEach(([id, col]) => {
    allNodes[id] = 'references' in col ? [...col.references] : [];
  });
  const queue: string[] = allNodes[columnId];
  const store: Array<[string, GenericIndexPatternColumn]> = [];

  while (queue.length > 0) {
    const nextId = queue.shift()!;
    store.push([nextId, columns[nextId]]);
    queue.push(...allNodes[nextId]);
  }
  return store.filter(([, column]) => column);
}
