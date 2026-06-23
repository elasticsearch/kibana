/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButtonIcon,
  EuiCheckbox,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiIconTip,
  EuiSuperSelect,
  EuiTableRow,
  EuiTableRowCell,
  EuiText,
  EuiToken,
  EuiToolTip,
  useEuiTheme,
  useIsWithinBreakpoints,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { AGENT_BUILDER_UI_EBT, EsqlToolFieldType } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import React, { useCallback, useMemo } from 'react';
import type { FieldArrayWithId, FieldError } from 'react-hook-form';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useEsqlParamsValidation } from '../../hooks/use_esql_params_validation';
import { i18nMessages } from '../../i18n';
import { EsqlParamSource, type EsqlToolFormData } from '../../types/tool_form_types';
import { EsqlParamValueInput, getEmptyValue } from './esql_param_value_input';

const FIELD_TYPE_TOKEN_MAP: Record<EsqlToolFieldType, string> = {
  [EsqlToolFieldType.STRING]: 'tokenString',
  [EsqlToolFieldType.INTEGER]: 'tokenNumber',
  [EsqlToolFieldType.FLOAT]: 'tokenNumber',
  [EsqlToolFieldType.BOOLEAN]: 'tokenBoolean',
  [EsqlToolFieldType.DATE]: 'tokenDate',
  [EsqlToolFieldType.ARRAY]: 'tokenArray',
};

interface EsqlParamRowProps {
  index: number;
  paramField: FieldArrayWithId<EsqlToolFormData, 'params', 'id'>;
  removeParamField: (index: number) => void;
}

export const EsqlParamRow: React.FC<EsqlParamRowProps> = ({
  index,
  paramField,
  removeParamField,
}) => {
  const { euiTheme } = useEuiTheme();
  const isMobile = useIsWithinBreakpoints(['xs', 's']);
  const { control, formState, setValue } = useFormContext<EsqlToolFormData>();
  const { errors, isSubmitted } = formState;

  const { triggerEsqlParamWarnings, triggerEsqlParamFieldsValidation } = useEsqlParamsValidation();

  const handleValidation = useCallback(() => {
    triggerEsqlParamFieldsValidation(['name', 'defaultValue']);
    triggerEsqlParamWarnings();
  }, [triggerEsqlParamFieldsValidation, triggerEsqlParamWarnings]);

  const [warning, source, isOptional, paramType] = useWatch({
    control,
    name: [
      `params.${index}.warning`,
      `params.${index}.source`,
      `params.${index}.optional`,
      `params.${index}.type`,
    ],
  });

  const paramErrors = errors.params?.[index];
  const errorMessages = useMemo(() => {
    // Mobile will display field level validation errors
    if (isMobile) return '';
    return [
      paramErrors?.name,
      paramErrors?.description,
      paramErrors?.type,
      paramErrors?.defaultValue,
    ]
      .filter((error): error is FieldError => !!error)
      .map((error) => error.message)
      .join('\n');
  }, [
    paramErrors?.name,
    paramErrors?.description,
    paramErrors?.type,
    paramErrors?.defaultValue,
    isMobile,
  ]);

  return (
    <EuiTableRow
      key={paramField.id}
      css={css`
        &:hover {
          background-color: inherit; /* Disable row hover effect */
        }
      `}
    >
      <EuiTableRowCell>
        {!isMobile &&
          ((errorMessages && (
            <EuiIconTip
              content={errorMessages}
              type="errorFill"
              color={euiTheme.colors.danger}
              size="m"
            />
          )) ||
            (warning && (
              <EuiIconTip
                content={warning}
                type="warningFill"
                color={euiTheme.colors.warning}
                size="m"
              />
            )) ||
            (source === EsqlParamSource.Inferred ? (
              <EuiIcon type="sparkles" color="subdued" size="m" aria-hidden={true} />
            ) : (
              <EuiIcon type="pencil" color="subdued" size="m" aria-hidden={true} />
            )))}
      </EuiTableRowCell>
      <EuiTableRowCell
        textOnly={false}
        mobileOptions={{
          header: i18nMessages.paramNameLabel,
          width: '100%',
        }}
      >
        <Controller
          control={control}
          name={`params.${index}.name`}
          render={({
            field: { ref, onChange, onBlur, ...field },
            fieldState: { invalid, error },
          }) => (
            <EuiFlexGroup direction="column" gutterSize="s">
              <EuiFieldText
                compressed
                fullWidth
                placeholder={i18nMessages.paramNamePlaceholder}
                inputRef={ref}
                isInvalid={invalid}
                onBlur={handleValidation}
                onChange={(event) => {
                  onChange(event);
                  if (source === EsqlParamSource.Inferred) {
                    setValue(`params.${index}.source`, EsqlParamSource.Custom);
                  }
                  if (isSubmitted) {
                    handleValidation();
                  }
                }}
                {...field}
              />
              {isMobile &&
                (invalid && error?.message ? (
                  <EuiText size="xs" color="danger">
                    {error.message}
                  </EuiText>
                ) : (
                  warning && (
                    <EuiText size="xs" color="warning">
                      {warning}
                    </EuiText>
                  )
                ))}
            </EuiFlexGroup>
          )}
        />
      </EuiTableRowCell>
      <EuiTableRowCell
        textOnly={false}
        mobileOptions={{
          header: i18nMessages.paramDescriptionLabel,
          width: '100%',
        }}
      >
        <Controller
          control={control}
          name={`params.${index}.description`}
          render={({ field: { ref, ...field }, fieldState: { invalid, error } }) => (
            <EuiFlexGroup direction="column" gutterSize="s">
              <EuiFieldText
                compressed
                fullWidth
                placeholder={i18nMessages.paramDescriptionPlaceholder}
                inputRef={ref}
                isInvalid={invalid}
                {...field}
              />
              {isMobile && invalid && error?.message && (
                <EuiText size="xs" color="danger">
                  {error.message}
                </EuiText>
              )}
            </EuiFlexGroup>
          )}
        />
      </EuiTableRowCell>
      <EuiTableRowCell
        textOnly={false}
        mobileOptions={{
          header: i18nMessages.paramTypeLabel,
          width: '100%',
        }}
      >
        <Controller
          control={control}
          name={`params.${index}.type`}
          render={({
            field: { ref, onChange, value: typeValue, ...field },
            fieldState: { invalid, error },
          }) => (
            <EuiFlexGroup direction="column" gutterSize="s">
              <EuiSuperSelect
                compressed
                fullWidth
                popoverProps={{
                  panelMinWidth: 150,
                  zIndex: (euiTheme.levels.header as number) - 1, // ensure the popover doesn't render on top of the bottom bar
                }}
                options={Object.values(EsqlToolFieldType).map((option) => ({
                  value: option,
                  inputDisplay: (
                    <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                      <EuiFlexItem grow={false}>
                        <EuiToken
                          iconType={FIELD_TYPE_TOKEN_MAP[option]}
                          css={css`
                            width: ${euiTheme.size.m};
                            height: ${euiTheme.size.m};
                          `}
                        />
                      </EuiFlexItem>
                      <EuiFlexItem>{option}</EuiFlexItem>
                    </EuiFlexGroup>
                  ),
                }))}
                valueOfSelected={typeValue as EsqlToolFieldType}
                isInvalid={invalid}
                onChange={(newType) => {
                  onChange(newType);
                  setValue(`params.${index}.defaultValue`, getEmptyValue(newType));
                  handleValidation();
                }}
                {...field}
              />
              {isMobile && invalid && error?.message && (
                <EuiText size="xs" color="danger">
                  {error.message}
                </EuiText>
              )}
            </EuiFlexGroup>
          )}
        />
      </EuiTableRowCell>
      <EuiTableRowCell align="center">
        <Controller
          control={control}
          name={`params.${index}.optional`}
          render={({ field: { ref, onChange, value, ...field } }) => (
            <EuiCheckbox
              id={`params.${index}.optional`}
              inputRef={ref}
              onChange={(e) => {
                onChange(e.target.checked);
                handleValidation();
              }}
              checked={value}
              {...field}
            />
          )}
        />
      </EuiTableRowCell>
      <EuiTableRowCell textOnly={false}>
        <Controller
          control={control}
          name={`params.${index}.defaultValue`}
          render={({ field: { ref, onChange, value }, fieldState: { invalid, error } }) => (
            <EuiFlexGroup direction="column" gutterSize="s">
              <EsqlParamValueInput
                type={paramType as EsqlToolFieldType}
                compressed
                fullWidth
                disabled={!isOptional}
                placeholder={i18nMessages.defaultValuePlaceholder}
                inputRef={ref}
                isInvalid={isOptional && invalid}
                value={value}
                onChange={(newValue) => {
                  onChange(newValue);
                  handleValidation();
                }}
              />
              {isMobile && isOptional && invalid && error?.message && (
                <EuiText size="xs" color="danger">
                  {error.message}
                </EuiText>
              )}
            </EuiFlexGroup>
          )}
        />
      </EuiTableRowCell>
      <EuiTableRowCell hasActions>
        <EuiToolTip content={i18nMessages.removeParamButtonLabel} disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="trash"
            color="danger"
            onClick={() => {
              removeParamField(index);
              triggerEsqlParamFieldsValidation(['name']);
            }}
            size="s"
            aria-label={i18nMessages.removeParamButtonLabel}
            {...getEbtProps({
              element: AGENT_BUILDER_UI_EBT.element.pageContent,
              action: AGENT_BUILDER_UI_EBT.action.globalManagement.REMOVE_PARAM,
            })}
          />
        </EuiToolTip>
      </EuiTableRowCell>
    </EuiTableRow>
  );
};
