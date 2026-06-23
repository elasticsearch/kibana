/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import React from 'react';
import type { EuiExpressionProps } from '@elastic/eui';
import { EuiExpression, EuiPopover } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { ALL_VALUE } from '@kbn/slo-schema';
import { isEmpty } from 'lodash';
import { allOptionText } from './fields';
import type { Suggestion } from '../hooks/use_fetch_synthetics_suggestions';

interface Props {
  title?: ReactNode;
  value?: string[];
  children?: ReactNode;
  color?: EuiExpressionProps['color'];
  selectedField?: string;
  fieldName: string;
  setSelectedField: (value?: string) => void;
  allSuggestions?: Record<string, Suggestion[]>;
}

export function FieldPopoverExpression({
  title,
  value,
  children,
  color,
  selectedField,
  fieldName,
  setSelectedField,
  allSuggestions,
}: Props) {
  const isPopoverOpen = selectedField === fieldName;

  const suggestions = allSuggestions?.[fieldName];

  let label =
    !isEmpty(value) && value
      ? suggestions
          ?.filter((suggestion) => value.includes(suggestion.value))
          ?.map((suggestion) => suggestion.label)
          .join(', ')
      : allOptionText;

  if (value?.includes(ALL_VALUE)) {
    label = allOptionText;
  }

  const closePopover = () => setSelectedField(selectedField === fieldName ? undefined : fieldName);
  return (
    <span>
      <EuiPopover
        isOpen={isPopoverOpen}
        anchorPosition="downLeft"
        closePopover={closePopover}
        button={
          <EuiExpression
            description={title}
            value={label}
            isActive={Boolean(selectedField)}
            color={color}
            onClick={closePopover}
          />
        }
        repositionOnScroll
        aria-label={i18n.translate('xpack.synthetics.fieldPopoverExpression.popoverAriaLabel', {
          defaultMessage: 'Field selection options',
        })}
      >
        <div style={{ width: 300 }}>{children}</div>
      </EuiPopover>
    </span>
  );
}
