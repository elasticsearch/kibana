/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo } from 'react';
import {
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSkeletonRectangle,
  useEuiTheme,
} from '@elastic/eui';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import { css } from '@emotion/react';
import { OptionalFieldLabel } from '../../optional_field_label';
import { useGetTemplates } from '../../templates_v2/hooks/use_get_templates';
import {
  DEFAULT_EMPTY_TEMPLATE_NAME,
  TEMPLATE_HELP_TEXT,
  TEMPLATE_LABEL,
  TEMPLATE_SELECT_PLACEHOLDER,
} from '../../create/translations';

interface Props {
  owner: string;
  templateId: string | null;
  isLoading?: boolean;
  isDisabled?: boolean;
  onChange: (params: { templateId: string | null; templateVersion: string | null }) => void;
}

const EMPTY_VALUE = '';

const TemplateSelectorV2Component: React.FC<Props> = ({
  owner,
  templateId,
  isLoading = false,
  isDisabled = false,
  onChange,
}) => {
  const { euiTheme } = useEuiTheme();

  const { data: templatesData, isLoading: isLoadingTemplates } = useGetTemplates({
    queryParams: { page: 1, perPage: 10000, owner: [owner], isEnabled: true },
  });

  const options: Array<EuiComboBoxOptionOption<string>> = useMemo(
    () => [
      { label: DEFAULT_EMPTY_TEMPLATE_NAME, value: EMPTY_VALUE },
      ...(templatesData?.templates ?? []).map((template) => ({
        key: template.templateId,
        label: template.name,
        value: template.templateId,
      })),
    ],
    [templatesData?.templates]
  );

  const selectedOptions = useMemo(
    () =>
      templateId
        ? options.filter((opt) => opt.value === templateId)
        : [{ label: DEFAULT_EMPTY_TEMPLATE_NAME, value: EMPTY_VALUE }],
    [options, templateId]
  );

  const handleChange = useCallback(
    (selected: Array<EuiComboBoxOptionOption<string>>) => {
      const selection = selected[0] ?? null;
      const selectedValue = selection?.value ?? EMPTY_VALUE;

      if (!selectedValue) {
        onChange({ templateId: null, templateVersion: null });
        return;
      }

      const matched = (templatesData?.templates ?? []).find((t) => t.templateId === selectedValue);

      onChange({
        templateId: selectedValue,
        templateVersion: matched?.templateVersion != null ? String(matched.templateVersion) : null,
      });
    },
    [onChange, templatesData?.templates]
  );

  return (
    <EuiFormRow
      id="casesConnectorTemplateV2"
      fullWidth
      label={TEMPLATE_LABEL}
      labelAppend={
        <EuiFlexGroup
          alignItems="center"
          gutterSize="s"
          css={css`
            flex-grow: 0;
          `}
          responsive={false}
        >
          <EuiFlexItem grow={false}>{OptionalFieldLabel}</EuiFlexItem>
        </EuiFlexGroup>
      }
      helpText={TEMPLATE_HELP_TEXT}
    >
      {isLoadingTemplates ? (
        <EuiSkeletonRectangle width="100%" height={euiTheme.size.xxl} borderRadius="m" />
      ) : (
        <EuiComboBox
          fullWidth
          singleSelection={{ asPlainText: true }}
          placeholder={TEMPLATE_SELECT_PLACEHOLDER}
          options={options}
          selectedOptions={selectedOptions}
          onChange={handleChange}
          isLoading={isLoading}
          isDisabled={isLoading || isDisabled}
          data-test-subj="cases-connector-template-v2-select"
        />
      )}
    </EuiFormRow>
  );
};

TemplateSelectorV2Component.displayName = 'TemplateSelectorV2';

export const TemplateSelectorV2 = memo(TemplateSelectorV2Component);
