/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { FC, MouseEvent, SetStateAction } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCodeBlock,
  EuiCopy,
  EuiFieldSearch,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiIconTip,
  EuiPanel,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  EuiToolTip,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { KbnDangerCallout } from '@kbn/ui-callout';

import type { DatasetMappings } from '../../../common';
import { FieldMappingForm, getFieldTypeDocsHelpText } from './field_mapping_form';

export enum DataType {
  KEYWORD = 'keyword',
  TEXT = 'text',
  LONG = 'long',
  INTEGER = 'integer',
  DOUBLE = 'double',
  BOOLEAN = 'boolean',
  DATETIME = 'datetime',
  UNSIGNED_LONG = 'unsigned_long',
  IP = 'ip',
}

export interface MappingEditorField {
  id: string;
  name: string;
  path: string;
  type: '' | DataType;
  format: string;
}

export interface MappingEditorValue {
  dynamic: boolean;
  idPath: string;
  fields: MappingEditorField[];
}

interface FieldValidationErrors {
  name?: string;
  type?: string;
  format?: string;
}

export interface MappingEditorValidationResult {
  isValid: boolean;
  hasAnyDeclaredMappings: boolean;
  globalErrors: string[];
  idPathError?: string;
  fieldErrorsById: Record<string, FieldValidationErrors>;
}

export interface MappingEditorProps {
  value: MappingEditorValue;
  onChange: (next: SetStateAction<MappingEditorValue>) => void;
  /**
   * When true, shows a JSON preview matching the docs.
   * Defaults to true because the output is typically copy/pasted.
   */
  showJsonPreview?: boolean;
}

const typeToDatasetMappingType = (
  type: DataType
): DatasetMappings['properties'][string]['type'] => {
  if (type === DataType.DATETIME) return 'date';
  return type;
};

const ELASTICSEARCH_MAPPING_REFERENCE_BASE_URL =
  'https://www.elastic.co/docs/reference/elasticsearch/mapping-reference';

const TYPE_INFO_BY_VALUE: Record<DataType, { label: string; docs: string }> = {
  [DataType.BOOLEAN]: {
    label: 'Boolean',
    docs: `${ELASTICSEARCH_MAPPING_REFERENCE_BASE_URL}/boolean`,
  },
  [DataType.DATETIME]: {
    label: 'Date',
    docs: `${ELASTICSEARCH_MAPPING_REFERENCE_BASE_URL}/date`,
  },
  [DataType.DOUBLE]: {
    label: 'Double',
    docs: `${ELASTICSEARCH_MAPPING_REFERENCE_BASE_URL}/number`,
  },
  [DataType.INTEGER]: {
    label: 'Integer',
    docs: `${ELASTICSEARCH_MAPPING_REFERENCE_BASE_URL}/number`,
  },
  [DataType.IP]: {
    label: 'IP',
    docs: `${ELASTICSEARCH_MAPPING_REFERENCE_BASE_URL}/ip`,
  },
  [DataType.KEYWORD]: {
    label: 'Keyword',
    docs: `${ELASTICSEARCH_MAPPING_REFERENCE_BASE_URL}/keyword`,
  },
  [DataType.LONG]: {
    label: 'Long',
    docs: `${ELASTICSEARCH_MAPPING_REFERENCE_BASE_URL}/number`,
  },
  [DataType.TEXT]: {
    label: 'Text',
    docs: `${ELASTICSEARCH_MAPPING_REFERENCE_BASE_URL}/text`,
  },
  [DataType.UNSIGNED_LONG]: {
    label: 'Unsigned long',
    docs: `${ELASTICSEARCH_MAPPING_REFERENCE_BASE_URL}/unsigned-long`,
  },
};

const renderBoldMatches = (text: string, query: string): React.ReactNode => {
  const t = text ?? '';
  const q = query.trim();

  if (!t) return <span aria-hidden="true">&nbsp;</span>;
  if (!q) return t;

  const lowerText = t.toLowerCase();
  const lowerQuery = q.toLowerCase();

  const parts: React.ReactNode[] = [];
  let idx = 0;
  while (idx < t.length) {
    const matchAt = lowerText.indexOf(lowerQuery, idx);
    if (matchAt === -1) {
      parts.push(t.slice(idx));
      break;
    }

    if (matchAt > idx) {
      parts.push(t.slice(idx, matchAt));
    }

    parts.push(<strong key={`m-${matchAt}`}>{t.slice(matchAt, matchAt + q.length)}</strong>);
    idx = matchAt + q.length;
  }

  return <>{parts}</>;
};

const TYPE_OPTIONS: Array<{ value: '' | DataType; text: string }> = [
  {
    value: '',
    text: i18n.translate('xpack.dataFederation.mappingEditor.typePlaceholder', {
      defaultMessage: 'Select type',
    }),
  },
  { value: DataType.BOOLEAN, text: TYPE_INFO_BY_VALUE[DataType.BOOLEAN].label },
  { value: DataType.DATETIME, text: TYPE_INFO_BY_VALUE[DataType.DATETIME].label },
  { value: DataType.DOUBLE, text: TYPE_INFO_BY_VALUE[DataType.DOUBLE].label },
  { value: DataType.INTEGER, text: TYPE_INFO_BY_VALUE[DataType.INTEGER].label },
  { value: DataType.IP, text: TYPE_INFO_BY_VALUE[DataType.IP].label },
  { value: DataType.KEYWORD, text: TYPE_INFO_BY_VALUE[DataType.KEYWORD].label },
  { value: DataType.LONG, text: TYPE_INFO_BY_VALUE[DataType.LONG].label },
  { value: DataType.TEXT, text: TYPE_INFO_BY_VALUE[DataType.TEXT].label },
  { value: DataType.UNSIGNED_LONG, text: TYPE_INFO_BY_VALUE[DataType.UNSIGNED_LONG].label },
];

export const emptyMappingEditorValue = (): MappingEditorValue => ({
  dynamic: true,
  idPath: '',
  fields: [],
});

const isFieldBlank = (field: MappingEditorField): boolean => {
  return (
    field.name.trim() === '' &&
    field.path.trim() === '' &&
    field.type === '' &&
    field.format.trim() === ''
  );
};

export const validateMappingEditorValue = (
  value: MappingEditorValue
): MappingEditorValidationResult => {
  const fieldErrorsById: Record<string, FieldValidationErrors> = {};
  const globalErrors: string[] = [];

  const nonBlankFields = value.fields.filter((f) => !isFieldBlank(f));

  const trimmedNames = nonBlankFields.map((f) => ({ id: f.id, name: f.name.trim() }));
  const nameCounts = trimmedNames.reduce<Record<string, number>>((acc, { name }) => {
    if (!name) return acc;
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});

  for (const f of nonBlankFields) {
    const errors: FieldValidationErrors = {};

    const name = f.name.trim();
    if (!name) {
      errors.name = i18n.translate('xpack.dataFederation.mappingEditor.validation.nameRequired', {
        defaultMessage: 'Name is required.',
      });
    } else if ((nameCounts[name] ?? 0) > 1) {
      errors.name = i18n.translate('xpack.dataFederation.mappingEditor.validation.nameDuplicate', {
        defaultMessage: 'Names must be unique.',
      });
    }

    if (!f.type) {
      errors.type = i18n.translate('xpack.dataFederation.mappingEditor.validation.typeRequired', {
        defaultMessage: 'Type is required.',
      });
    }

    const format = f.format.trim();
    if (format && f.type !== DataType.DATETIME) {
      errors.format = i18n.translate(
        'xpack.dataFederation.mappingEditor.validation.formatDateOnly',
        {
          defaultMessage: 'Format is only valid for type date.',
        }
      );
    }

    if (Object.keys(errors).length > 0) {
      fieldErrorsById[f.id] = errors;
    }
  }

  // Treat "mappings present" as having at least one fully-declared field (name + type)
  const declaredFieldCount = nonBlankFields.filter((f) => f.name.trim() && f.type).length;
  const hasAnyDeclaredMappings = declaredFieldCount > 0;

  const idPath = value.idPath.trim();
  let idPathError: string | undefined;
  // Only enforce _id.path matching a declared mapped field when dynamic fields are disabled.
  if (idPath && value.dynamic === false) {
    const candidatePaths = nonBlankFields
      .flatMap((f) => {
        const logical = f.name.trim();
        const physical = f.path.trim();
        return [logical, physical].filter((v): v is string => Boolean(v));
      })
      .filter((v, idx, arr) => arr.indexOf(v) === idx);

    if (!candidatePaths.includes(idPath)) {
      idPathError = i18n.translate('xpack.dataFederation.mappingEditor.validation.idPathUnknown', {
        defaultMessage: '_id.path must match an existing mapped field name or rename-to value.',
      });
    }
  }

  const isValid =
    globalErrors.length === 0 && !idPathError && Object.keys(fieldErrorsById).length === 0;

  return {
    isValid,
    hasAnyDeclaredMappings,
    globalErrors,
    idPathError,
    fieldErrorsById,
  };
};

export const buildDatasetMappings = (value: MappingEditorValue): DatasetMappings | undefined => {
  const properties = value.fields.reduce<DatasetMappings['properties']>((acc, f) => {
    const name = f.name.trim();
    if (!name || !f.type) return acc;

    const type = typeToDatasetMappingType(f.type);
    const prop: DatasetMappings['properties'][string] = { type };

    const path = f.path.trim();
    if (path) prop.path = path;

    const format = f.format.trim();
    if (type === 'date' && format) prop.format = format;

    acc[name] = prop;
    return acc;
  }, {});

  const dynamic = value.dynamic;
  const idPath = value.idPath.trim();

  const hasAny = Object.keys(properties).length > 0;

  if (!hasAny) return undefined;

  return {
    ...(!dynamic ? { dynamic: 'false' as const } : {}),
    properties,
    ...(idPath ? { _id: { path: idPath } } : {}),
  };
};

export const MappingEditor: FC<MappingEditorProps> = ({
  value,
  onChange,
  showJsonPreview = true,
}) => {
  const nextId = useRef(0);
  const validation = useMemo(() => validateMappingEditorValue(value), [value]);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [fieldSearch, setFieldSearch] = useState('');
  const [draftField, setDraftField] = useState<MappingEditorField>(() => ({
    id: 'draft',
    name: '',
    path: '',
    type: '',
    format: '',
  }));
  const [validatedFieldIds, setValidatedFieldIds] = useState<readonly string[]>([]);
  const [draftValidationAttempted, setDraftValidationAttempted] = useState(false);

  const markFieldValidated = useCallback((id: string) => {
    setValidatedFieldIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const hasValidatedFieldErrors = useMemo(() => {
    return validatedFieldIds.some((id) => validation.fieldErrorsById[id] !== undefined);
  }, [validatedFieldIds, validation.fieldErrorsById]);

  const shouldShowValidationCallout = Boolean(validation.idPathError) || hasValidatedFieldErrors;

  const addField = useCallback(() => {
    const id = `mapping-field-${nextId.current++}`;
    onChange((prev) => ({
      ...prev,
      fields: [
        ...prev.fields,
        {
          id,
          name: '',
          path: '',
          type: '',
          format: '',
        },
      ],
    }));
    setEditingFieldId(id);
  }, [onChange]);

  const removeField = useCallback(
    (id: string) => {
      onChange((prev) => ({
        ...prev,
        fields: prev.fields.filter((f) => f.id !== id),
      }));
      setEditingFieldId((current) => (current === id ? null : current));
      setValidatedFieldIds((prev) => prev.filter((v) => v !== id));
    },
    [onChange]
  );

  const updateField = useCallback(
    (id: string, patch: Partial<MappingEditorField>) => {
      onChange((prev) => ({
        ...prev,
        fields: prev.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      }));
    },
    [onChange]
  );

  const mappings = useMemo(() => buildDatasetMappings(value), [value]);
  const previewJson = useMemo(() => {
    if (!mappings) return '';
    return JSON.stringify({ mappings }, null, 2);
  }, [mappings]);

  const filteredFields = useMemo(() => {
    const q = fieldSearch.trim().toLowerCase();
    if (!q) return value.fields;

    return value.fields.filter((f) => {
      const name = f.name.trim().toLowerCase();
      const renameTo = f.path.trim().toLowerCase();
      return name.includes(q) || renameTo.includes(q);
    });
  }, [fieldSearch, value.fields]);

  const draftFieldErrors = useMemo(() => {
    if (!draftValidationAttempted) return {};

    const errors: { name?: string; type?: string; format?: string } = {};
    const name = draftField.name.trim();
    const type = draftField.type;

    if (!name) {
      errors.name = i18n.translate('xpack.dataFederation.mappingEditor.validation.nameRequired', {
        defaultMessage: 'Logical name is required.',
      });
    } else {
      const isDuplicate = value.fields.some((f) => f.name.trim() === name);
      if (isDuplicate) {
        errors.name = i18n.translate(
          'xpack.dataFederation.mappingEditor.validation.nameDuplicate',
          {
            defaultMessage: 'Names must be unique.',
          }
        );
      }
    }

    if (!type) {
      errors.type = i18n.translate('xpack.dataFederation.mappingEditor.validation.typeRequired', {
        defaultMessage: 'Type is required.',
      });
    }

    const format = draftField.format.trim();
    if (format && type !== DataType.DATETIME) {
      errors.format = i18n.translate(
        'xpack.dataFederation.mappingEditor.validation.formatDateOnly',
        {
          defaultMessage: 'Format is only valid for type date.',
        }
      );
    }

    return errors;
  }, [draftField, draftValidationAttempted, value.fields]);

  const addDraftField = useCallback(() => {
    setDraftValidationAttempted(true);

    const name = draftField.name.trim();
    const type = draftField.type;
    const format = draftField.format.trim();
    const isDuplicate = Boolean(name) && value.fields.some((f) => f.name.trim() === name);
    const hasErrors =
      !name || !type || isDuplicate || (Boolean(format) && type !== DataType.DATETIME);
    if (hasErrors) return;

    const id = `mapping-field-${nextId.current++}`;
    onChange((prev) => ({
      ...prev,
      fields: [
        ...prev.fields,
        {
          ...draftField,
          id,
          name,
          path: draftField.path.trim(),
          format: draftField.format.trim(),
        },
      ],
    }));

    // Reset draft for subsequent additions (only visible in empty state).
    setDraftField({
      id: 'draft',
      name: '',
      path: '',
      type: '',
      format: '',
    });
    setDraftValidationAttempted(false);
  }, [draftField, onChange, value.fields]);

  return (
    <EuiPanel paddingSize="m" hasBorder data-test-subj="dataFederationMappingEditor">
      <EuiTitle size="s">
        <h3>
          {i18n.translate('xpack.dataFederation.mappingEditor.title', {
            defaultMessage: 'Dataset mappings',
          })}
        </h3>
      </EuiTitle>

      <EuiSpacer size="s" />

      <EuiText size="s" color="subdued">
        <p>
          {i18n.translate('xpack.dataFederation.mappingEditor.description', {
            defaultMessage:
              'Declare a schema, rename physical columns using “path”, optionally add a date “format”, and select a source column to use as “_id”.',
          })}
        </p>
      </EuiText>

      <EuiSpacer size="m" />

      {!validation.isValid && shouldShowValidationCallout ? (
        <>
          <KbnDangerCallout
            title={i18n.translate('xpack.dataFederation.mappingEditor.validation.title', {
              defaultMessage: 'Fix mapping errors',
            })}
            text={
              <ul>
                {validation.globalErrors.map((e, idx) => (
                  <li key={idx}>{e}</li>
                ))}
                {validation.idPathError ? <li>{validation.idPathError}</li> : null}
                {hasValidatedFieldErrors ? (
                  <li>
                    {i18n.translate('xpack.dataFederation.mappingEditor.validation.fieldErrors', {
                      defaultMessage: 'One or more fields are incomplete or invalid.',
                    })}
                  </li>
                ) : null}
              </ul>
            }
            data-test-subj="dataFederationMappingEditorValidationError"
          />
          <EuiSpacer size="m" />
        </>
      ) : null}

      <EuiFlexGroup gutterSize="m">
        <EuiFlexItem>
          <EuiFormRow
            helpText={i18n.translate('xpack.dataFederation.mappingEditor.dynamicDescription', {
              defaultMessage: 'Dynamic fields will be inferred at query time if not mapped.',
            })}
            fullWidth
          >
            <EuiSwitch
              name="dataFederationMappingEditorDynamic"
              label={
                <>
                  {i18n.translate('xpack.dataFederation.mappingEditor.dynamicLabel', {
                    defaultMessage: 'Dynamic fields',
                  })}{' '}
                  <EuiIconTip
                    content={i18n.translate('xpack.dataFederation.mappingEditor.dynamicHelp', {
                      defaultMessage:
                        'When enabled, undeclared columns are included (schema inference overlays your declared fields). Disable to treat your declaration as the complete schema.',
                    })}
                    position="right"
                  />
                </>
              }
              checked={value.dynamic}
              onChange={(e) => onChange((prev) => ({ ...prev, dynamic: e.target.checked }))}
              data-test-subj="dataFederationMappingEditorDynamic"
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFormRow
            label={i18n.translate('xpack.dataFederation.mappingEditor.idPathLabel', {
              defaultMessage: '_id.path',
            })}
            helpText={i18n.translate('xpack.dataFederation.mappingEditor.idPathHelp', {
              defaultMessage: 'Optional source column whose value becomes the row’s _id.',
            })}
            isInvalid={Boolean(validation.idPathError)}
            error={validation.idPathError}
            fullWidth
          >
            <EuiFieldText
              isInvalid={Boolean(validation.idPathError)}
              fullWidth
              value={value.idPath}
              onChange={(e) => onChange((prev) => ({ ...prev, idPath: e.target.value }))}
              data-test-subj="dataFederationMappingEditorIdPath"
              placeholder={i18n.translate('xpack.dataFederation.mappingEditor.idPathPlaceholder', {
                defaultMessage: 'e.g. request_id or user.id',
              })}
            />
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h4>
              {i18n.translate('xpack.dataFederation.mappingEditor.fieldsTitle', {
                defaultMessage: 'Mapped fields',
              })}
            </h4>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <EuiText size="xs" color="subdued">
            {i18n.translate('xpack.dataFederation.mappingEditor.timestampRecommendation', {
              defaultMessage:
                'Mapping your timestamp field and renaming it to @timestamp is recommended.',
            })}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
            <EuiFlexItem grow={false} style={{ alignSelf: 'flex-end' }}>
              {(() => {
                const isVisible = editingFieldId === null && value.fields.length > 0;
                return (
                  <div
                    style={{
                      width: 'fit-content',
                      visibility: isVisible ? 'visible' : 'hidden',
                    }}
                    aria-hidden={!isVisible}
                  >
                    <EuiButton
                      iconType="plusCircle"
                      size="s"
                      color="primary"
                      onClick={addField}
                      data-test-subj="dataFederationMappingEditorAddField"
                    >
                      {i18n.translate('xpack.dataFederation.mappingEditor.addFieldButton', {
                        defaultMessage: 'Add field',
                      })}
                    </EuiButton>
                  </div>
                );
              })()}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <div style={{ width: 320 }}>
                <EuiFieldSearch
                  placeholder={i18n.translate('xpack.dataFederation.mappingEditor.searchFields', {
                    defaultMessage: 'Search fields',
                  })}
                  aria-label={i18n.translate('xpack.dataFederation.mappingEditor.searchFields', {
                    defaultMessage: 'Search fields',
                  })}
                  value={fieldSearch}
                  onChange={(event) => setFieldSearch(event.target.value)}
                  fullWidth
                  data-test-subj="dataFederationMappingEditorSearchFields"
                />
              </div>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="s" />

      {value.fields.length === 0 ? (
        <EuiPanel paddingSize="s" color="subdued" hasBorder={false}>
          <FieldMappingForm
            value={draftField}
            onChange={(patch: Partial<MappingEditorField>) =>
              setDraftField((prev) => ({ ...prev, ...patch }))
            }
            typeOptions={TYPE_OPTIONS}
            typeHelpText={getFieldTypeDocsHelpText(draftField.type, TYPE_INFO_BY_VALUE)}
            errors={draftFieldErrors}
            dateTypeValue={DataType.DATETIME}
            actions={
              <EuiButton
                iconType="plusCircle"
                size="s"
                onClick={addDraftField}
                data-test-subj="dataFederationMappingEditorDraftAddField"
              >
                {i18n.translate('xpack.dataFederation.mappingEditor.addFirstField', {
                  defaultMessage: 'Add field',
                })}
              </EuiButton>
            }
            fieldTypeTestSubj="dataFederationMappingEditorDraftFieldType"
            fieldNameTestSubj="dataFederationMappingEditorDraftFieldName"
            fieldPathTestSubj="dataFederationMappingEditorDraftFieldPath"
            fieldFormatTestSubj="dataFederationMappingEditorDraftFieldFormat"
          />
        </EuiPanel>
      ) : filteredFields.length === 0 ? (
        <EuiText size="s" color="subdued">
          <p>
            {i18n.translate('xpack.dataFederation.mappingEditor.noSearchResults', {
              defaultMessage: 'No fields match your search.',
            })}
          </p>
        </EuiText>
      ) : (
        <EuiFlexGroup direction="column" gutterSize="s">
          {filteredFields.map((f) => {
            const isDate = f.type === DataType.DATETIME;
            const isEditing = editingFieldId === f.id;
            const shouldShowRowValidation = validatedFieldIds.includes(f.id);
            const rowErrors = shouldShowRowValidation
              ? validation.fieldErrorsById[f.id]
              : undefined;
            return (
              <EuiFlexItem key={f.id}>
                <EuiPanel paddingSize="s" color="subdued" hasBorder={false}>
                  <EuiFlexGroup gutterSize="m" alignItems="flexStart">
                    {isEditing ? (
                      <>
                        <FieldMappingForm
                          value={f}
                          onChange={(patch: Partial<MappingEditorField>) => {
                            updateField(f.id, patch);
                          }}
                          typeOptions={TYPE_OPTIONS}
                          typeHelpText={getFieldTypeDocsHelpText(f.type, TYPE_INFO_BY_VALUE)}
                          pathHelpText={i18n.translate(
                            'xpack.dataFederation.mappingEditor.physicalPathHelp',
                            {
                              defaultMessage: 'Physical column name, if differs from name.',
                            }
                          )}
                          errors={rowErrors}
                          dateTypeValue={DataType.DATETIME}
                          actions={
                            <EuiFlexGroup
                              gutterSize="s"
                              direction="row"
                              alignItems="center"
                              responsive={false}
                            >
                              <EuiFlexItem grow={false}>
                                <EuiButtonEmpty
                                  iconType="check"
                                  size="s"
                                  onClick={() => {
                                    const nextValidation = validateMappingEditorValue(value);
                                    const fieldErrors = nextValidation.fieldErrorsById[f.id];
                                    markFieldValidated(f.id);
                                    if (fieldErrors) return;
                                    setEditingFieldId(null);
                                  }}
                                  data-test-subj="dataFederationMappingEditorDoneField"
                                >
                                  {i18n.translate('xpack.dataFederation.mappingEditor.doneField', {
                                    defaultMessage: 'Done',
                                  })}
                                </EuiButtonEmpty>
                              </EuiFlexItem>
                            </EuiFlexGroup>
                          }
                          fieldTypeTestSubj="dataFederationMappingEditorFieldType"
                          fieldNameTestSubj="dataFederationMappingEditorFieldName"
                          fieldPathTestSubj="dataFederationMappingEditorFieldPath"
                          fieldFormatTestSubj="dataFederationMappingEditorFieldFormat"
                        />
                      </>
                    ) : (
                      <>
                        <EuiFlexItem>
                          <EuiText size="s">{renderBoldMatches(f.name, fieldSearch)}</EuiText>
                          <EuiText size="xs" color="subdued">
                            {i18n.translate('xpack.dataFederation.mappingEditor.sourceLabel', {
                              defaultMessage: 'Source: {source}',
                              values: { source: f.path || f.name || '' },
                            })}
                          </EuiText>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiFlexGroup
                            gutterSize="s"
                            direction="row"
                            alignItems="center"
                            responsive={false}
                          >
                            <EuiFlexItem grow={false}>
                              {f.type ? (
                                <EuiBadge color="hollow">
                                  {TYPE_INFO_BY_VALUE[f.type as DataType].label}
                                </EuiBadge>
                              ) : (
                                <span aria-hidden="true">&nbsp;</span>
                              )}
                            </EuiFlexItem>
                            <EuiFlexItem grow={false}>
                              <EuiCopy
                                textToCopy={JSON.stringify(
                                  {
                                    [f.name || 'field']: {
                                      type: f.type
                                        ? typeToDatasetMappingType(f.type as DataType)
                                        : '',
                                      ...(f.path ? { path: f.path } : {}),
                                      ...(isDate && f.format ? { format: f.format } : {}),
                                    },
                                  },
                                  null,
                                  2
                                )}
                              >
                                {(copy) => (
                                  <EuiToolTip
                                    content={i18n.translate(
                                      'xpack.dataFederation.mappingEditor.copyField',
                                      { defaultMessage: 'Copy field mapping' }
                                    )}
                                  >
                                    <EuiButtonIcon
                                      iconType="copy"
                                      aria-label={i18n.translate(
                                        'xpack.dataFederation.mappingEditor.copyFieldAriaLabel',
                                        { defaultMessage: 'Copy field mapping' }
                                      )}
                                      type="button"
                                      onClick={(e: MouseEvent<HTMLButtonElement>) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        copy();
                                      }}
                                      data-test-subj="dataFederationMappingEditorCopyField"
                                    />
                                  </EuiToolTip>
                                )}
                              </EuiCopy>
                            </EuiFlexItem>
                            <EuiFlexItem grow={false}>
                              <EuiToolTip
                                content={i18n.translate(
                                  'xpack.dataFederation.mappingEditor.editField',
                                  {
                                    defaultMessage: 'Edit',
                                  }
                                )}
                              >
                                <EuiButtonIcon
                                  iconType="pencil"
                                  aria-label={i18n.translate(
                                    'xpack.dataFederation.mappingEditor.editFieldAriaLabel',
                                    { defaultMessage: 'Edit field' }
                                  )}
                                  type="button"
                                  onClick={(e: MouseEvent<HTMLButtonElement>) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setEditingFieldId(f.id);
                                  }}
                                  data-test-subj="dataFederationMappingEditorEditField"
                                />
                              </EuiToolTip>
                            </EuiFlexItem>
                            <EuiFlexItem grow={false}>
                              <EuiToolTip
                                content={i18n.translate(
                                  'xpack.dataFederation.mappingEditor.removeField',
                                  { defaultMessage: 'Remove' }
                                )}
                              >
                                <EuiButtonIcon
                                  iconType="trash"
                                  color="danger"
                                  aria-label={i18n.translate(
                                    'xpack.dataFederation.mappingEditor.removeFieldAriaLabel',
                                    { defaultMessage: 'Remove field' }
                                  )}
                                  type="button"
                                  onClick={(e: MouseEvent<HTMLButtonElement>) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    removeField(f.id);
                                  }}
                                  data-test-subj="dataFederationMappingEditorRemoveField"
                                />
                              </EuiToolTip>
                            </EuiFlexItem>
                          </EuiFlexGroup>
                        </EuiFlexItem>
                      </>
                    )}
                  </EuiFlexGroup>
                </EuiPanel>
              </EuiFlexItem>
            );
          })}
        </EuiFlexGroup>
      )}

      {showJsonPreview ? (
        <>
          <EuiSpacer size="m" />
          <EuiTitle size="xs">
            <h4>
              {i18n.translate('xpack.dataFederation.mappingEditor.previewTitle', {
                defaultMessage: 'Request snippet',
              })}
            </h4>
          </EuiTitle>
          <EuiSpacer size="s" />
          {/* TODO remove */}
          <EuiCodeBlock language="json" isCopyable paddingSize="s">
            {previewJson ||
              '{\n  "mappings": {\n    "dynamic": "false",\n    "properties": {\n      "@timestamp": {\n        "type": "date",\n        "path": "event_time",\n        "format": "yyyy-MM-dd HH:mm:ss"\n      }\n    },\n    "_id": {\n      "path": "request_id"\n    }\n  }\n}'}
          </EuiCodeBlock>
        </>
      ) : null}
    </EuiPanel>
  );
};
