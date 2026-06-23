/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiCheckableCard, EuiFlexItem, EuiText, useGeneratedHtmlId } from '@elastic/eui';
import { editDataLifecycleFlyoutStrings as strings } from './strings';
import type { DataLifecycleMethod } from './types';

export interface LifecycleMethodCardProps {
  method: DataLifecycleMethod;
  selectedMethod: DataLifecycleMethod;
  disabled: boolean;
  onChange: (next: DataLifecycleMethod) => void;
}

const lifecycleMethodCardConfig: Record<
  DataLifecycleMethod,
  { title: string; description: string }
> = {
  dlm: { title: strings.dlmCardTitle, description: strings.dlmCardDescription },
  ilm: { title: strings.ilmCardTitle, description: strings.ilmCardDescription },
};

export const LifecycleMethodCard = ({
  method,
  selectedMethod,
  disabled,
  onChange,
}: LifecycleMethodCardProps) => {
  const { title, description } = lifecycleMethodCardConfig[method];
  const checkableCardId = useGeneratedHtmlId({
    prefix: `editDataLifecycle-method-${method}`,
  });

  return (
    <EuiFlexItem>
      <EuiCheckableCard
        id={checkableCardId}
        data-test-subj={`editDataLifecycle-methodCard-${method}`}
        label={
          <>
            <EuiText size="s">
              <strong>{title}</strong>
            </EuiText>
            <EuiText size="xs" color="subdued">
              {description}
            </EuiText>
          </>
        }
        checkableType="radio"
        checked={selectedMethod === method}
        disabled={disabled}
        onChange={() => onChange(method)}
      />
    </EuiFlexItem>
  );
};
