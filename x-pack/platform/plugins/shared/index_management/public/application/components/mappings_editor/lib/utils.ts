/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';

import { cloneDeep, isEmpty } from 'lodash';
import type { InferenceServiceSettings } from '@elastic/elasticsearch/lib/api/types';
import type { LocalInferenceServiceSettings } from '@kbn/ml-trained-models-utils/src/constants/trained_models';
import type { EuiSelectableOption } from '@elastic/eui';
import { defaultInferenceEndpoints } from '@kbn/inference-common';
import type {
  ChildFieldName,
  ComboBoxOption,
  DataType,
  Field,
  FieldMeta,
  Fields,
  GenericObject,
  MainType,
  NormalizedField,
  NormalizedFields,
  NormalizedRuntimeFields,
  State,
  ParameterName,
  RuntimeFields,
  SubType,
  SemanticTextField,
} from '../types';

import {
  MAIN_DATA_TYPE_DEFINITION,
  MAX_DEPTH_DEFAULT_EDITOR,
  PARAMETERS_DEFINITION,
  SUB_TYPE_MAP_TO_MAIN,
  TYPE_DEFINITION,
  TYPE_NOT_ALLOWED_MULTIFIELD,
  TYPE_ONLY_ALLOWED_AT_ROOT_LEVEL,
} from '../constants';

import type { TreeItem } from '../components/tree';
import type { FieldConfig } from '../shared_imports';
import type { MappingsOptionData } from '../../../sections/home/index_list/details_page/update_elser_mappings/update_elser_mappings_modal';

export const getUniqueId = () => uuidv4();

const fieldsWithoutMultiFields: DataType[] = [
  // @ts-expect-error aggregate_metric_double is not yet supported by the editor
  'aggregate_metric_double',
  'constant_keyword',
  'flattened',
  'geo_shape',
  'join',
  'percolator',
  'point',
  'shape',
];
export const getChildFieldsName = (dataType: DataType): ChildFieldName | undefined => {
  if (fieldsWithoutMultiFields.includes(dataType)) {
    return undefined;
  } else if (dataType === 'object' || dataType === 'nested') {
    return 'properties';
  }
  return 'fields';
};

export const getFieldMeta = (field: Field, isMultiField?: boolean): FieldMeta => {
  const childFieldsName = getChildFieldsName(field.type);

  const canHaveChildFields = isMultiField ? false : childFieldsName === 'properties';
  const hasChildFields = isMultiField
    ? false
    : canHaveChildFields &&
      Boolean(field[childFieldsName!]) &&
      Object.keys(field[childFieldsName!]!).length > 0;

  const canHaveMultiFields = isMultiField ? false : childFieldsName === 'fields';
  const hasMultiFields = isMultiField
    ? false
    : canHaveMultiFields &&
      Boolean(field[childFieldsName!]) &&
      Object.keys(field[childFieldsName!]!).length > 0;

  return {
    childFieldsName,
    canHaveChildFields,
    hasChildFields,
    canHaveMultiFields,
    hasMultiFields,
    isExpanded: false,
  };
};

const getTypeLabel = (type?: DataType): string => {
  return type && TYPE_DEFINITION[type]
    ? TYPE_DEFINITION[type].label
    : `${TYPE_DEFINITION.other.label}: ${type}`;
};

export const getTypeLabelFromField = (field: { type: DataType }) => {
  const { type } = field;
  const typeLabel = getTypeLabel(type);

  return typeLabel;
};

export const getFieldConfig = <T = unknown>(
  param: ParameterName,
  prop?: string
): FieldConfig<T> => {
  if (prop !== undefined) {
    if (
      !(PARAMETERS_DEFINITION[param] as any).props ||
      !(PARAMETERS_DEFINITION[param] as any).props[prop]
    ) {
      throw new Error(`No field config found for prop "${prop}" on param "${param}" `);
    }
    return (PARAMETERS_DEFINITION[param] as any).props[prop]?.fieldConfig || {};
  }

  return (PARAMETERS_DEFINITION[param] as any)?.fieldConfig || {};
};

/**
 * For "alias" field types, we work internaly by "id" references. When we normalize the fields, we need to
 * replace the actual "path" parameter with the field (internal) `id` the alias points to.
 * This method takes care of doing just that.
 *
 * @param byId The fields map by id
 */

const replaceAliasPathByAliasId = (
  byId: NormalizedFields['byId']
): {
  aliases: NormalizedFields['aliases'];
  byId: NormalizedFields['byId'];
} => {
  const aliases: NormalizedFields['aliases'] = {};

  Object.entries(byId).forEach(([id, field]) => {
    if (field.source.type === 'alias') {
      const aliasTargetField = Object.values(byId).find(
        (_field) => _field.path.join('.') === field.source.path
      );

      if (aliasTargetField) {
        // we set the path to the aliasTargetField "id"
        field.source.path = aliasTargetField.id;

        // We add the alias field to our "aliases" map
        aliases[aliasTargetField.id] = aliases[aliasTargetField.id] || [];
        aliases[aliasTargetField.id].push(id);
      }
    }
  });

  return { aliases, byId };
};

const getMainTypeFromSubType = (subType: SubType): MainType =>
  (SUB_TYPE_MAP_TO_MAIN[subType] ?? 'other') as MainType;

/**
 * Read the field source type and decide if it is a SubType of a MainType
 * A SubType is for example the "float" datatype. It is the SubType of the "numeric" MainType
 *
 * @param sourceType The type declared on the mappings field
 */
export const getTypeMetaFromSource = (
  sourceType: string
): { mainType: MainType; subType?: SubType } => {
  if (!MAIN_DATA_TYPE_DEFINITION[sourceType as MainType]) {
    // If the sourceType provided if **not** one of the MainType, it is probably a SubType type
    const mainType = getMainTypeFromSubType(sourceType as SubType);
    if (!mainType) {
      throw new Error(
        `Property type "${sourceType}" not recognized and no subType was found for it.`
      );
    }
    return { mainType, subType: sourceType as SubType };
  }

  return { mainType: sourceType as MainType };
};

/**
 * In order to better work with the recursive pattern of the mappings `properties`, this method flatten the fields
 * to a `byId` object where the key is the **path** to the field and the value is a `NormalizedField`.
 * The `NormalizedField` contains the field data under `source` and meta information about the capability of the field.
 *
 * @example

// original
{
  myObject: {
    type: 'object',
    properties: {
      name: {
        type: 'text'
      }
    }
  }
}

// normalized
{
  rootLevelFields: ['_uniqueId123'],
  byId: {
    '_uniqueId123': {
      source: { type: 'object' },
      id: '_uniqueId123',
      parentId: undefined,
      hasChildFields: true,
      childFieldsName: 'properties', // "object" type have their child fields under "properties"
      canHaveChildFields: true,
      childFields: ['_uniqueId456'],
    },
    '_uniqueId456': {
      source: { type: 'text' },
      id: '_uniqueId456',
      parentId: '_uniqueId123',
      hasChildFields: false,
      childFieldsName: 'fields', // "text" type have their child fields under "fields"
      canHaveChildFields: true,
      childFields: undefined,
    },
  },
}
 *
 * @param fieldsToNormalize The "properties" object from the mappings (or "fields" object for `text` and `keyword` types)
 */
export const normalize = (fieldsToNormalize: Fields = {}): NormalizedFields => {
  let maxNestedDepth = 0;

  const normalizeFields = (
    props: Fields,
    to: NormalizedFields['byId'],
    paths: string[],
    arrayToKeepRef: string[],
    nestedDepth: number,
    isMultiField: boolean = false,
    parentId?: string
  ): Record<string, any> =>
    Object.entries(props)
      .sort(([a], [b]) => (a > b ? 1 : a < b ? -1 : 0))
      .reduce((acc, [propName, value]) => {
        const id = getUniqueId();
        arrayToKeepRef.push(id);
        const field = { name: propName, ...value } as Field;

        // In some cases for object, the "type" is not defined but the field
        // has properties defined. The mappings editor requires a "type" to be defined
        // so we add it here.
        if (field.type === undefined && field.properties !== undefined) {
          field.type = 'object';
        }

        const meta = getFieldMeta(field, isMultiField);
        const { childFieldsName, hasChildFields, hasMultiFields } = meta;

        if (hasChildFields || hasMultiFields) {
          const nextDepth =
            meta.canHaveChildFields || meta.canHaveMultiFields ? nestedDepth + 1 : nestedDepth;
          meta.childFields = [];
          maxNestedDepth = Math.max(maxNestedDepth, nextDepth);

          normalizeFields(
            field[childFieldsName!]!,
            to,
            [...paths, propName],
            meta.childFields,
            nextDepth,
            meta.canHaveMultiFields,
            id
          );
        }

        const { properties, fields, ...rest } = field;

        const normalizedField: NormalizedField = {
          id,
          parentId,
          nestedDepth,
          isMultiField,
          path: paths.length ? [...paths, propName] : [propName],
          source: rest,
          ...meta,
        };

        acc[id] = normalizedField;

        return acc;
      }, to);

  const rootLevelFields: string[] = [];
  const { byId, aliases } = replaceAliasPathByAliasId(
    normalizeFields(fieldsToNormalize, {}, [], rootLevelFields, 0)
  );

  return {
    byId,
    aliases,
    rootLevelFields,
    maxNestedDepth,
  };
};

/**
 * The alias "path" value internally point to a field "id" (not its path). When we deNormalize the fields,
 * we need to replace the target field "id" by its actual "path", making sure to not mutate our state "fields" object.
 *
 * @param aliases The aliases map
 * @param byId The fields map by id
 */
const replaceAliasIdByAliasPath = (
  aliases: NormalizedFields['aliases'],
  byId: NormalizedFields['byId']
): NormalizedFields['byId'] => {
  const updatedById = { ...byId };

  Object.entries(aliases).forEach(([targetId, aliasesIds]) => {
    const path = updatedById[targetId] ? updatedById[targetId].path.join('.') : '';

    aliasesIds.forEach((id) => {
      const aliasField = updatedById[id];
      if (!aliasField) {
        return;
      }
      const fieldWithUpdatedPath: NormalizedField = {
        ...aliasField,
        source: { ...aliasField.source, path },
      };

      updatedById[id] = fieldWithUpdatedPath;
    });
  });

  return updatedById;
};

export const deNormalize = ({ rootLevelFields, byId, aliases }: NormalizedFields): Fields => {
  const serializedFieldsById = replaceAliasIdByAliasPath(aliases, byId);

  const deNormalizePaths = (ids: string[], to: Fields = {}) => {
    ids.forEach((id) => {
      const { source, childFields, childFieldsName } = serializedFieldsById[id];
      const { name, ...normalizedField } = source;
      const field: Omit<Field, 'name'> = normalizedField;

      to[name] = field;

      if (childFields) {
        field[childFieldsName!] = {};
        return deNormalizePaths(childFields, field[childFieldsName!]);
      }
    });
    return to;
  };

  return deNormalizePaths(rootLevelFields);
};

/**
 * If we change the "name" of a field, we need to update its `path` and the
 * one of **all** of its child properties or multi-fields.
 *
 * @param field The field who's name has changed
 * @param byId The map of all the document fields
 */
export const updateFieldsPathAfterFieldNameChange = (
  field: NormalizedField,
  byId: NormalizedFields['byId']
): { updatedFieldPath: string[]; updatedById: NormalizedFields['byId'] } => {
  const updatedById = { ...byId };
  const paths = field.parentId ? byId[field.parentId].path : [];

  const updateFieldPath = (_field: NormalizedField, _paths: string[]): void => {
    const { name } = _field.source;
    const path = _paths.length === 0 ? [name] : [..._paths, name];

    updatedById[_field.id] = {
      ..._field,
      path,
    };

    if (_field.hasChildFields || _field.hasMultiFields) {
      _field
        .childFields!.map((fieldId) => byId[fieldId])
        .forEach((childField) => {
          updateFieldPath(childField, [..._paths, name]);
        });
    }
  };

  updateFieldPath(field, paths);

  return { updatedFieldPath: updatedById[field.id].path, updatedById };
};

/**
 * Retrieve recursively all the children fields of a field
 *
 * @param field The field to return the children from
 * @param byId Map of all the document fields
 */
export const getAllChildFields = (
  field: NormalizedField,
  byId: NormalizedFields['byId']
): NormalizedField[] => {
  const getChildFields = (_field: NormalizedField, to: NormalizedField[] = []) => {
    if (_field.hasChildFields || _field.hasMultiFields) {
      _field
        .childFields!.map((fieldId) => byId[fieldId])
        .forEach((childField) => {
          to.push(childField);
          getChildFields(childField, to);
        });
    }
    return to;
  };

  return getChildFields(field);
};

/**
 * If we delete an object with child fields or a text/keyword with multi-field,
 * we need to know if any of its "child" fields has an `alias` that points to it.
 * This method traverse the field descendant tree and returns all the aliases found
 * on the field and its possible children.
 */
export const getAllDescendantAliases = (
  field: NormalizedField,
  fields: NormalizedFields,
  aliasesIds: string[] = []
): string[] => {
  const hasAliases = fields.aliases[field.id] && Boolean(fields.aliases[field.id].length);

  if (!hasAliases && !field.hasChildFields && !field.hasMultiFields) {
    return aliasesIds;
  }

  if (hasAliases) {
    fields.aliases[field.id].forEach((id) => {
      aliasesIds.push(id);
    });
  }

  if (field.childFields) {
    field.childFields.forEach((id) => {
      if (!fields.byId[id]) {
        return;
      }
      getAllDescendantAliases(fields.byId[id], fields, aliasesIds);
    });
  }

  return aliasesIds;
};

/**
 * Helper to retrieve a map of all the ancestors of a field
 *
 * @param fieldId The field id
 * @param byId A map of all the fields by Id
 */
export const getFieldAncestors = (
  fieldId: string,
  byId: NormalizedFields['byId']
): { [key: string]: boolean } => {
  const ancestors: { [key: string]: boolean } = {};
  const currentField = byId[fieldId];
  let parent: NormalizedField | undefined =
    currentField.parentId === undefined ? undefined : byId[currentField.parentId];

  while (parent) {
    ancestors[parent.id] = true;
    parent = parent.parentId === undefined ? undefined : byId[parent.parentId];
  }

  return ancestors;
};

export const filterTypesForMultiField = <T extends string = string>(
  options: ComboBoxOption[]
): ComboBoxOption[] =>
  options.filter(
    (option) => TYPE_NOT_ALLOWED_MULTIFIELD.includes(option.value as MainType) === false
  );

export const filterTypesForNonRootFields = <T extends string = string>(
  options: ComboBoxOption[]
): ComboBoxOption[] =>
  options.filter(
    (option) => TYPE_ONLY_ALLOWED_AT_ROOT_LEVEL.includes(option.value as MainType) === false
  );

/**
 * Return the max nested depth of the document fields
 *
 * @param byId Map of all the document fields
 */
export const getMaxNestedDepth = (byId: NormalizedFields['byId']): number =>
  Object.values(byId).reduce((maxDepth, field) => {
    return Math.max(maxDepth, field.nestedDepth);
  }, 0);

/**
 * Create a nested array of fields and its possible children
 * to render a Tree view of them.
 */
export const buildFieldTreeFromIds = (
  fieldsIds: string[],
  byId: NormalizedFields['byId'],
  render: (field: NormalizedField) => JSX.Element | string
): TreeItem[] =>
  fieldsIds.map((id) => {
    const field = byId[id];
    const children = field.childFields
      ? buildFieldTreeFromIds(field.childFields, byId, render)
      : undefined;

    return { label: render(field), children };
  });

/**
 * When changing the type of a field, in most cases we want to delete all its child fields.
 * There are some exceptions, when changing from "text" to "keyword" as both have the same "fields" property.
 */
export const shouldDeleteChildFieldsAfterTypeChange = (
  oldType: DataType,
  newType: DataType
): boolean => {
  if (oldType === 'text' && newType !== 'keyword') {
    return true;
  } else if (oldType === 'keyword' && newType !== 'text') {
    return true;
  } else if (oldType === 'object' && newType !== 'nested') {
    return true;
  } else if (oldType === 'nested' && newType !== 'object') {
    return true;
  }

  return false;
};

export const canUseMappingsEditor = (maxNestedDepth: number) =>
  maxNestedDepth < MAX_DEPTH_DEFAULT_EDITOR;

/**
 * This helper removes all the keys on an object with an "undefined" value.
 * To avoid sending updates from the mappings editor with this type of object:
 *
 *```
 * {
 *   "dyamic": undefined,
 *   "date_detection": undefined,
 *   "dynamic": undefined,
 *   "dynamic_date_formats": undefined,
 *   "dynamic_templates": undefined,
 *   "numeric_detection": undefined,
 *   "properties": {
 *     "title": { "type": "text" }
 *   }
 * }
 *```
 *
 * @param obj The object to retrieve the undefined values from
 * @param recursive A flag to strip recursively into children objects
 */
export const stripUndefinedValues = <T = GenericObject>(obj: GenericObject, recursive = true): T =>
  Object.entries(obj).reduce((acc, [key, value]) => {
    if (value === undefined) {
      return acc;
    }

    if (Array.isArray(value) || value instanceof Date || value === null) {
      return { ...acc, [key]: value };
    }

    return recursive && typeof value === 'object'
      ? { ...acc, [key]: stripUndefinedValues(value, recursive) }
      : { ...acc, [key]: value };
  }, {} as T);

export const normalizeRuntimeFields = (fields: RuntimeFields = {}): NormalizedRuntimeFields => {
  return Object.entries(fields).reduce((acc, [name, field]) => {
    const id = getUniqueId();
    return {
      ...acc,
      [id]: {
        id,
        source: {
          name,
          ...field,
        },
      },
    };
  }, {} as NormalizedRuntimeFields);
};

export const deNormalizeRuntimeFields = (fields: NormalizedRuntimeFields): RuntimeFields => {
  return Object.values(fields).reduce((acc, { source }) => {
    const { name, ...rest } = source;
    return {
      ...acc,
      [name]: rest,
    };
  }, {} as RuntimeFields);
};

/**
 * get all the fields from given state which matches selected DataTypes from filter
 *
 * @param state The state that we are using depending on the context (when adding new fields, static state is used)
 * @param filteredDataTypes data types array from which fields are filtered from given state
 */

export const getFieldsMatchingFilterFromState = (
  state: State,
  filteredDataTypes: string[]
): {
  [id: string]: NormalizedField;
} => {
  return Object.fromEntries(
    Object.entries(state.fields.byId).filter(([_, fieldId]) =>
      filteredDataTypes.includes(getTypeLabelFromField(state.fields.byId[fieldId.id].source))
    )
  );
};

/** accepts Generics argument and returns value, if value is not null or undefined
 * @param value
 */
function isNotNullish<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/** returns normalized field that matches the dataTypes from the filteredDataTypes array
 * @param normalizedFields fields that we are using, depending on the context (when adding new fields, static state is used)
 * @param filteredDataTypes data types array from which fields are filtered from given state. When there are no filter selected, array would be undefined
 */
export const getFieldsFromState = (
  normalizedFields: NormalizedFields,
  filteredDataTypes?: string[]
): NormalizedField[] => {
  const getField = (fieldId: string) => {
    if (filteredDataTypes) {
      if (
        filteredDataTypes.includes(getTypeLabelFromField(normalizedFields.byId[fieldId].source))
      ) {
        return normalizedFields.byId[fieldId];
      }
    } else {
      return normalizedFields.byId[fieldId];
    }
  };
  const fields: Array<NormalizedField | undefined> = filteredDataTypes
    ? Object.entries(normalizedFields.byId).map(([key, _]) => getField(key))
    : normalizedFields.rootLevelFields.map((id) => getField(id));
  return fields.filter(isNotNullish);
};
/**
 * returns true if given value is first occurence of array
 * useful when filtering unique values of an array
 */
function filterUnique<T>(value: T, index: number, array: T[]) {
  return array.indexOf(value) === index;
}
/**
 * returns array consisting of all field types from state's fields including nested fields
 * @param fields
 */
const getallFieldsIncludingNestedFields = (fields: Fields, fieldsArray: DataType[]) => {
  const fieldsValue = Object.values(fields);
  for (const field of fieldsValue) {
    if (field.type) fieldsArray.push(field.type);
    if (field.fields) getallFieldsIncludingNestedFields(field.fields, fieldsArray);
    if (field.properties) getallFieldsIncludingNestedFields(field.properties, fieldsArray);
  }
  return fieldsArray;
};

/** returns all field types from the fields, including multifield and child fields
 * @param allFields fields from state
 */
export const getAllFieldTypesFromState = (allFields: Fields): DataType[] => {
  const fields: DataType[] = [];
  return getallFieldsIncludingNestedFields(allFields, fields).filter(filterUnique);
};

export function isSemanticTextField(field: Partial<Field>): field is SemanticTextField {
  return field.type === 'semantic_text';
}

/**
 * Returns deep copy of state with `copy_to` added to text fields that are referenced by new semantic text fields
 * @param state
 * @returns state
 */

export function getStateWithCopyToFields(state: State): State {
  // Make sure we don't accidentally modify existing state
  let updatedState = cloneDeep(state);
  for (const field of Object.values(updatedState.fields.byId)) {
    if (field.source.type === 'semantic_text') {
      // Check fields already added to the list of to-update fields first
      // API will not accept reference_field so removing it now
      const { reference_field: referenceField, ...source } = field.source;
      field.source = source;

      if (typeof referenceField !== 'string') {
        // reference_field was not set — nothing else to do for this field
        continue;
      }

      /*
        If no reference field is associated,
        no further processing is needed, so we can skip to the next one.
      */
      if (isEmpty(referenceField)) {
        continue;
      }
      const existingTextField =
        getFieldByPathName(updatedState.fields, referenceField) ||
        getFieldByPathName(updatedState.mappingViewFields || { byId: {} }, referenceField);
      if (existingTextField) {
        // Add copy_to to existing text field's copy_to array
        const updatedTextField: NormalizedField = {
          ...existingTextField,
          source: {
            ...existingTextField.source,
            copy_to: existingTextField.source.copy_to
              ? [
                  ...(Array.isArray(existingTextField.source.copy_to)
                    ? existingTextField.source.copy_to
                    : [existingTextField.source.copy_to]),
                  field.path.join('.'),
                ]
              : [field.path.join('.')],
          },
        };

        updatedState = {
          ...updatedState,
          fields: {
            ...updatedState.fields,
            byId: {
              ...updatedState.fields.byId,
              [existingTextField.id]: updatedTextField,
            },
          },
        };
        addChildFieldsToState(updatedTextField, updatedState);
        if (existingTextField.parentId) {
          let currentField = existingTextField;
          let hasParent = true;
          while (hasParent) {
            if (!currentField.parentId) {
              // reached the top of the tree, push current field to root level fields
              updatedState.fields.rootLevelFields.push(currentField.id);
              hasParent = false;
            } else if (updatedState.fields.byId[currentField.parentId]) {
              // parent is already in state, don't need to do anything
              hasParent = false;
            } else {
              // parent is not in state yet
              updatedState.fields.byId[currentField.parentId] =
                updatedState.mappingViewFields.byId[currentField.parentId];
              addChildFieldsToState(
                updatedState.mappingViewFields.byId[currentField.parentId],
                updatedState
              );
              currentField = updatedState.fields.byId[currentField.parentId];
            }
          }
        } else {
          updatedState.fields.rootLevelFields.push(existingTextField.id);
        }
      } else {
        // Reference field not found in the current or view fields, skip copy_to wiring.
        // reference_field was already stripped above, so it won't reach ES.
      }
    }
  }
  return updatedState;
}

function addChildFieldsToState(field: NormalizedField, state: State): State {
  if (!field.childFields || field.childFields.length === 0) {
    return state;
  }
  for (const childFieldId of field.childFields) {
    if (!state.fields.byId[childFieldId]) {
      state.fields.byId[childFieldId] = state.mappingViewFields.byId[childFieldId];
      state = addChildFieldsToState(state.fields.byId[childFieldId], state);
    }
  }
  return state;
}

export const getFieldByPathName = (fields: NormalizedFields, name: string) => {
  return Object.values(fields.byId).find((field) => field.path.join('.') === name);
};

export function isLocalModel(
  model: InferenceServiceSettings
): model is LocalInferenceServiceSettings {
  return ['elser', 'elasticsearch'].includes((model as LocalInferenceServiceSettings).service);
}

export const isElserOnMlNodeSemanticField = (field: NormalizedField) =>
  field.source.inference_id === defaultInferenceEndpoints.ELSER;

export function hasElserOnMlNodeSemanticTextField(fields: NormalizedFields): boolean {
  return Object.values(fields.byId).some(isElserOnMlNodeSemanticField);
}

export function hasSemanticTextField(fields: NormalizedFields): boolean {
  return Object.values(fields.byId).some((field) => field.source.type === 'semantic_text');
}

export const prepareFieldsForEisUpdate = (
  selectedMappings: EuiSelectableOption<MappingsOptionData>[],
  fullNormalized: NormalizedFields
): NormalizedFields => {
  const selectedIds = selectedMappings.flatMap((item) => item.key ?? []);

  const { byId } = fullNormalized;

  const resultById: NormalizedFields['byId'] = {};
  const resultRootLevel: string[] = [];

  function getSelectedFieldData(id: string) {
    // Prevent duplicate processing - if already in resultById, skip
    if (resultById[id]) {
      return;
    }
    const field = byId[id];
    if (!field) return;

    const clonedField = { ...field };

    // Only update inference_id if it exists in source
    if (clonedField.source?.inference_id !== undefined) {
      clonedField.source = {
        ...clonedField.source,
        inference_id: defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID,
      };
    }
    resultById[id] = clonedField;

    // Include parent if it exists and hasn't been processed yet
    if (field.parentId) {
      if (!resultById[field.parentId]) {
        getSelectedFieldData(field.parentId);
      }
    } else {
      resultRootLevel.push(id);
    }
  }

  selectedIds.forEach((id) => getSelectedFieldData(id));

  // Prune childFields arrays so they only include selected field IDs
  Object.values(resultById).forEach((field) => {
    if (field.childFields) {
      field.childFields = field.childFields.filter((id) => !!resultById[id]);
      if (field.childFields.length === 0) {
        delete field.childFields;
      }
    }
  });

  return {
    byId: resultById,
    aliases: {},
    rootLevelFields: resultRootLevel,
    maxNestedDepth: fullNormalized.maxNestedDepth,
  };
};
