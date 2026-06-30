/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButton,
  EuiCodeBlock,
  EuiComboBox,
  EuiDatePicker,
  EuiFieldNumber,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiForm,
  EuiFormRow,
  EuiLink,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  EuiTitle,
  keys,
  useIsWithinBreakpoints,
  type EuiComboBoxOptionOption,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { formatAgentBuilderErrorMessage } from '@kbn/agent-builder-browser';
import type { ToolDefinitionWithSchema } from '@kbn/agent-builder-common';
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import moment from 'moment';
import React, { useState } from 'react';
import { Controller, FormProvider, useForm, type Control } from 'react-hook-form';
import type { ExecuteToolResponse } from '../../../../../common/http_api/tools';
import { useAgentBuilderServices } from '../../../hooks/use_agent_builder_service';
import { useExecuteTool } from '../../../hooks/tools/use_execute_tools';
import { useTool } from '../../../hooks/tools/use_tools';
import { labels } from '../../../utils/i18n';

const flyoutStyles = css`
  .euiFlyoutBody__overflowContent {
    height: 100%;
  }
`;

const flyoutContentStyles = css`
  height: 100%;
`;

const inputsColumnStyles = css`
  overflow-y: auto;
`;

const submitButtonContainerStyles = css`
  align-self: flex-end;
`;

const i18nMessages = {
  fieldRequiredError: (label: string) =>
    i18n.translate('xpack.agentBuilder.tools.testTool.fieldRequiredError', {
      defaultMessage: '{label} is required',
      values: { label },
    }),
  inputPlaceholder: (label: string) =>
    i18n.translate('xpack.agentBuilder.tools.testTool.inputPlaceholder', {
      defaultMessage: 'Enter {label}',
      values: { label },
    }),
  title: (toolName: string) =>
    i18n.translate('xpack.agentBuilder.tools.testFlyout.title', {
      defaultMessage: 'Test tool: {toolName}',
      values: { toolName },
    }),
  inputsTitle: i18n.translate('xpack.agentBuilder.tools.testTool.inputsTitle', {
    defaultMessage: 'Inputs',
  }),
  executeButton: i18n.translate('xpack.agentBuilder.tools.testTool.executeButton', {
    defaultMessage: 'Submit',
  }),
  responseTitle: i18n.translate('xpack.agentBuilder.tools.testTool.responseTitle', {
    defaultMessage: 'Response',
  }),
  arrayStringHint: i18n.translate('xpack.agentBuilder.tools.testTool.arrayStringHint', {
    defaultMessage: 'Wrap values in quotes to keep them as strings.',
  }),
};

interface ToolParameter {
  name: string;
  label: string;
  description: string;
  value: string;
  type: string;
  optional: boolean;
  format?: string;
}

enum ToolParameterType {
  TEXT = 'text',
  NUMERIC = 'numeric',
  BOOLEAN = 'boolean',
}

const getComponentType = (schemaType: string): ToolParameterType => {
  switch (schemaType) {
    case 'boolean':
      return ToolParameterType.BOOLEAN;
    case 'integer':
    case 'long':
    case 'number':
    case 'double':
    case 'float':
      return ToolParameterType.NUMERIC;
    default:
      return ToolParameterType.TEXT;
  }
};

const getParameters = (tool?: ToolDefinitionWithSchema): Array<ToolParameter> => {
  if (!tool?.schema?.properties) return [];

  const { properties, required } = tool.schema;
  const requiredParams = new Set(required);

  return Object.entries(properties).map(([paramName, paramSchema]) => {
    let type = 'string'; // default fallback

    const schema = typeof paramSchema === 'object' ? paramSchema : undefined;

    if (schema && 'type' in schema && schema.type) {
      if (Array.isArray(schema.type)) {
        type = schema.type[0];
      } else if (typeof schema.type === 'string') {
        type = schema.type;
      }
    }

    const title = schema && 'title' in schema ? schema.title : undefined;
    const description = schema && 'description' in schema ? schema.description : undefined;
    return {
      name: paramName,
      label: title || paramName,
      value: '',
      description: description || '',
      type,
      format: (schema && 'format' in schema && schema.format) || undefined,
      optional: !requiredParams.has(paramName),
    };
  });
};

/**
 * It identifies the type of array values.
 * It allows forcing numeric values like 123 to be parsed as string by wrapping them in quotes.
 */
export const parseArrayEntry = (rawValue: string): string | number | undefined => {
  const trimmed = rawValue.trim();
  if (!trimmed) return;

  const hasMatchingQuotes =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  if (hasMatchingQuotes) {
    return trimmed.slice(1, -1);
  }

  const numericValue = Number(trimmed);
  return Number.isNaN(numericValue) ? trimmed : numericValue;
};

export const parseFormData = (
  formData: Record<string, any>,
  parameters: Array<{ name: string; type: string }>
): Record<string, any> => {
  const parsedFormData: Record<string, any> = {};

  for (const [key, value] of Object.entries(formData)) {
    // Skip empty string values
    if (typeof value === 'string' && value.trim() === '') {
      continue;
    }

    const param = parameters.find((p) => p.name === key);
    if (
      param &&
      (param.type === 'object' || param.type === 'array') &&
      typeof value === 'string' &&
      value.trim() !== ''
    ) {
      try {
        parsedFormData[key] = JSON.parse(value);
      } catch {
        // If parsing fails, use the original string value
        parsedFormData[key] = value;
      }
    } else {
      parsedFormData[key] = value;
    }
  }

  return parsedFormData;
};

const renderFormField = ({
  parameter,
  control,
}: {
  parameter: ToolParameter;
  control: Control<ToolDefinitionWithSchema['configuration']>;
}) => {
  const { label, name, optional, type } = parameter;
  const componentType = getComponentType(type);

  const commonProps = {
    name,
    control,
    rules: {
      required: !optional ? i18nMessages.fieldRequiredError(parameter.label) : false,
    },
  };

  switch (componentType) {
    case ToolParameterType.NUMERIC:
      return (
        <Controller
          {...commonProps}
          render={({ field: { onChange, value, ref, ...field } }) => (
            <EuiFieldNumber
              {...field}
              inputRef={ref}
              data-test-subj={`agentBuilderToolTestInput-${name}`}
              value={(value as number) ?? ''}
              type="number"
              onChange={(e) => onChange(e.target.valueAsNumber ?? e.target.value)}
              placeholder={i18nMessages.inputPlaceholder(label)}
              fullWidth
            />
          )}
        />
      );

    case ToolParameterType.BOOLEAN:
      return (
        <Controller
          {...commonProps}
          rules={{ required: false }}
          render={({ field: { onChange, value, ref, ...field } }) => (
            <EuiSwitch
              {...field}
              data-test-subj={`agentBuilderToolTestInput-${name}`}
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked)}
              label={label}
            />
          )}
        />
      );

    case ToolParameterType.TEXT:
      if (parameter.format === 'date-time') {
        return (
          <Controller
            {...commonProps}
            render={({ field: { onChange, value, ref, ...field } }) => (
              <EuiDatePicker
                {...field}
                data-test-subj={`agentBuilderToolTestInput-${name}`}
                showTimeSelect
                showIcon={false}
                inputRef={ref}
                selected={value ? moment(value) : undefined}
                onChange={(date) => onChange(date ? date.toISOString() : undefined)}
              />
            )}
          />
        );
      }

      if (type === 'array') {
        return (
          <Controller
            {...commonProps}
            render={({ field: { onChange, value } }) => {
              const arrayValue: Array<string | number> = Array.isArray(value) ? value : [];

              const selectedOptions: Array<EuiComboBoxOptionOption<string | number>> =
                arrayValue.map((item) => ({
                  label: String(item),
                  value: item,
                }));

              const handleChange = (selected: Array<EuiComboBoxOptionOption<string | number>>) => {
                onChange(selected.map((opt) => opt.value ?? opt.label));
              };

              const handleCreateOption = (searchValue: string) => {
                const newValue = parseArrayEntry(searchValue);
                if (newValue === undefined) return;
                onChange([...arrayValue, newValue]);
              };

              return (
                <EuiComboBox<string | number>
                  options={[]}
                  selectedOptions={selectedOptions}
                  onChange={handleChange}
                  onCreateOption={handleCreateOption}
                  fullWidth
                  noSuggestions
                  aria-label={label}
                  data-test-subj={`agentBuilderToolTestInput-${name}`}
                  delimiter=","
                  onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
                    if (event.key === keys.ENTER) {
                      // Enter key should not submit the form, instead it should add a new option
                      event.preventDefault();
                    }
                  }}
                />
              );
            }}
          />
        );
      }
    default:
      return (
        <Controller
          {...commonProps}
          render={({ field: { value, ref, ...field } }) => (
            <EuiFieldText
              {...field}
              inputRef={ref}
              data-test-subj={`agentBuilderToolTestInput-${name}`}
              value={value as string}
              placeholder={i18nMessages.inputPlaceholder(label)}
              fullWidth
            />
          )}
        />
      );
  }
};

export interface ToolTestFlyoutProps {
  toolId: string;
  onClose: () => void;
}

export const ToolTestFlyout: React.FC<ToolTestFlyoutProps> = ({ toolId, onClose }) => {
  const isSmallScreen = useIsWithinBreakpoints(['xs', 's', 'm']);
  const { docLinksService } = useAgentBuilderServices();
  const [response, setResponse] = useState<string>('{}');
  // Re-mount new responses, needed for virtualized EuiCodeBlock
  // https://github.com/elastic/eui/issues/9034
  const [responseKey, setResponseKey] = useState<number>(0);

  const form = useForm<Record<string, any>>({
    mode: 'onChange',
  });

  const {
    handleSubmit,
    control,
    formState: { errors },
  } = form;
  const hasErrors = Object.keys(errors).length > 0;

  const { tool, isLoading } = useTool({ toolId });

  const { executeTool, isLoading: isExecuting } = useExecuteTool({
    onSuccess: (data: ExecuteToolResponse) => {
      setResponse(JSON.stringify(data, null, 2));
    },
    onError: (error: Error) => {
      setResponse(JSON.stringify({ error: formatAgentBuilderErrorMessage(error) }, null, 2));
    },
    onSettled: () => {
      setResponseKey((key) => key + 1);
    },
  });

  const onSubmit = async (formData: Record<string, any>) => {
    const parameters = getParameters(tool);
    const parsedFormData = parseFormData(formData, parameters);

    await executeTool({
      toolId: tool!.id,
      toolParams: parsedFormData,
    });
  };

  if (!tool) return null;

  return (
    <EuiFlyout
      onClose={onClose}
      aria-labelledby="flyoutTitle"
      css={flyoutStyles}
      data-test-subj="agentBuilderToolTestFlyout"
    >
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup direction="column" gutterSize="s">
          <EuiFlexItem>
            <EuiTitle size="m">
              <h2 id="flyoutTitle">{i18nMessages.title(tool.id)}</h2>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiLink
              href={`${docLinksService.agentBuilderTools}#testing-your-tools`}
              target="_blank"
              {...getEbtProps({
                element: AGENT_BUILDER_UI_EBT.element.flyout,
                action: AGENT_BUILDER_UI_EBT.action.globalManagement.TOOL_TEST_DOCS,
                detail: AGENT_BUILDER_UI_EBT.entity.TOOL,
              })}
            >
              {i18n.translate('xpack.agentBuilder.tools.testFlyout.documentationLink', {
                defaultMessage: 'Documentation - Testing tools',
              })}
            </EuiLink>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        {isLoading ? (
          <EuiFlexGroup justifyContent="center" alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiLoadingSpinner size="l" />
            </EuiFlexItem>
          </EuiFlexGroup>
        ) : (
          <FormProvider {...form}>
            <EuiFlexGroup
              gutterSize={isSmallScreen ? 'm' : 'l'}
              direction={isSmallScreen ? 'column' : 'row'}
              css={flyoutContentStyles}
            >
              <EuiFlexItem css={inputsColumnStyles}>
                <EuiTitle size="s">
                  <h5>{i18nMessages.inputsTitle}</h5>
                </EuiTitle>
                <EuiSpacer size="m" />
                <EuiForm component="form" onSubmit={handleSubmit(onSubmit)}>
                  <EuiFlexGroup direction="column" gutterSize="none">
                    {getParameters(tool).map((parameter) => {
                      const { name, label, description, type, optional } = parameter;
                      return (
                        <EuiFormRow
                          key={name}
                          label={label}
                          labelAppend={
                            optional && (
                              <EuiText size="xs" color="subdued">
                                {labels.common.optional}
                              </EuiText>
                            )
                          }
                          helpText={
                            <>
                              <code>{type}</code>
                              {description && ` - ${description}`}
                              {type === 'array' && (
                                <>
                                  <br />
                                  {i18nMessages.arrayStringHint}
                                </>
                              )}
                            </>
                          }
                          isInvalid={!!errors[name]}
                          error={errors[name]?.message as string}
                          fullWidth
                        >
                          {renderFormField({
                            parameter,
                            control,
                          })}
                        </EuiFormRow>
                      );
                    })}
                    <EuiSpacer size="m" />
                    <EuiFlexItem css={!isSmallScreen && submitButtonContainerStyles}>
                      <EuiButton
                        type="submit"
                        iconType="sortRight"
                        isLoading={isExecuting}
                        disabled={!tool || hasErrors}
                        data-test-subj="agentBuilderToolTestSubmitButton"
                        {...getEbtProps({
                          element: AGENT_BUILDER_UI_EBT.element.flyout,
                          action: AGENT_BUILDER_UI_EBT.action.globalManagement.TOOL_TEST_SUBMIT,
                          detail: AGENT_BUILDER_UI_EBT.entity.TOOL,
                        })}
                      >
                        {i18nMessages.executeButton}
                      </EuiButton>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiForm>
              </EuiFlexItem>
              <EuiFlexItem grow={2}>
                <EuiTitle size="s">
                  <h5>{i18nMessages.responseTitle}</h5>
                </EuiTitle>
                <EuiSpacer size="m" />
                <EuiCodeBlock
                  key={responseKey}
                  language="json"
                  fontSize="s"
                  paddingSize="m"
                  isCopyable={true}
                  lineNumbers
                  isVirtualized
                  overflowHeight="100%"
                  data-test-subj="agentBuilderToolTestResponse"
                >
                  {response}
                </EuiCodeBlock>
              </EuiFlexItem>
            </EuiFlexGroup>
          </FormProvider>
        )}
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};
