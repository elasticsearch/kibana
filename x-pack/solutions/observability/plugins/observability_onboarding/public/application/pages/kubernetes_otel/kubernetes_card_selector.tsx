/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiCheckableCard,
  EuiFlexGrid,
  EuiFlexItem,
  EuiFormFieldset,
  EuiSpacer,
  EuiText,
  htmlIdGenerator,
} from '@elastic/eui';
import { css } from '@emotion/react';

export interface KubernetesCardOption<TId extends string> {
  id: TId;
  label: string;
  description?: string;
}

interface KubernetesCardSelectorProps<TId extends string> {
  legend: string;
  selectedId: TId;
  options: Array<KubernetesCardOption<TId>>;
  onChange: (id: TId) => void;
  dataTestSubjPrefix: string;
}

export const KubernetesCardSelector = <TId extends string>({
  legend,
  selectedId,
  options,
  onChange,
  dataTestSubjPrefix,
}: KubernetesCardSelectorProps<TId>) => {
  const radioGroupId = useMemo(() => htmlIdGenerator('kubernetesCardSelector')(), []);

  return (
    <EuiFormFieldset legend={{ children: legend, display: 'hidden' }}>
      <EuiFlexGrid columns={2}>
        {options.map((option) => {
          const isSelected = option.id === selectedId;
          return (
            <EuiFlexItem
              key={option.id}
              data-test-subj={`${dataTestSubjPrefix}-${option.id}`}
              data-selected={isSelected ? 'true' : 'false'}
            >
              <EuiCheckableCard
                id={`${radioGroupId}_${option.id}`}
                name={radioGroupId}
                checked={isSelected}
                onChange={() => {
                  onChange(option.id);
                }}
                label={
                  <>
                    <EuiText size="s">
                      <strong>{option.label}</strong>
                    </EuiText>
                    {option.description ? (
                      <>
                        <EuiSpacer size="s" />
                        <EuiText color="subdued" size="s">
                          {option.description}
                        </EuiText>
                      </>
                    ) : null}
                  </>
                }
                css={css`
                  flex-grow: 1;
                `}
              />
            </EuiFlexItem>
          );
        })}
      </EuiFlexGrid>
    </EuiFormFieldset>
  );
};
