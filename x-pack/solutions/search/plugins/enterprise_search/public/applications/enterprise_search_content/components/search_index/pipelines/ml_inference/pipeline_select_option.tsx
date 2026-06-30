/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { EuiFlexGroup, EuiFlexItem, EuiIcon, EuiText, EuiTextColor, EuiTitle } from '@elastic/eui';

import { MLModelTypeBadge } from '../ml_model_type_badge';

import type { MLInferencePipelineOption } from './pipeline_select_logic';
import { EXISTING_PIPELINE_DISABLED_MISSING_SOURCE_FIELDS, MODEL_REDACTED_VALUE } from './utils';

export interface PipelineSelectOptionProps {
  checked?: 'on';
  disabled?: boolean;
  label: string;
  pipeline: MLInferencePipelineOption;
}

// TODO: Make disabledReason required and remove EXISTING_PIPELINE_DISABLED_MISSING_SOURCE_FIELDS call without args
export const PipelineSelectOptionDisabled: React.FC<{ disabledReason?: string }> = ({
  disabledReason,
}) => {
  return (
    <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiIcon type="warning" color="warning" aria-hidden />
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiTextColor color="warning">
          {/* @ts-expect-error Type 'string | ((commaSeparatedMissingSourceFields: string) => string)' is not assignable to type 'ReactNode' */}
          {disabledReason ?? EXISTING_PIPELINE_DISABLED_MISSING_SOURCE_FIELDS}
        </EuiTextColor>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

export const PipelineSelectOption: React.FC<PipelineSelectOptionProps> = ({ pipeline }) => {
  const modelIdDisplay = pipeline.modelId.length > 0 ? pipeline.modelId : MODEL_REDACTED_VALUE;
  return (
    // TODO: Add model state & pipeline info link. Make sure to check mobile rendering when doing this!
    <EuiFlexGroup direction="column" gutterSize="xs">
      <EuiFlexItem>
        <EuiTitle size="xs">
          <h4>{pipeline.pipelineName}</h4>
        </EuiTitle>
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiFlexGroup gutterSize="s" justifyContent="flexStart" alignItems="center">
          <EuiFlexItem grow={pipeline.modelType.length === 0}>
            <EuiText size="s" color="subdued">
              {modelIdDisplay}
            </EuiText>
          </EuiFlexItem>
          {pipeline.modelType.length > 0 && (
            <EuiFlexItem>
              {/* Wrap in a span to prevent the badge from growing to a whole row on mobile*/}
              <span>
                <MLModelTypeBadge type={pipeline.modelType} />
              </span>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem>
        {pipeline.disabled ? (
          <PipelineSelectOptionDisabled disabledReason={pipeline.disabledReason} />
        ) : (
          <EuiText size="s">{pipeline.sourceFields.join(', ')}</EuiText>
        )}
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
