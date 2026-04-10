/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiMarkdownFormat, EuiPanel } from '@elastic/eui';

export interface StepExplanationProps {
  explanation: string;
  visible: boolean;
}

export const StepExplanation: React.FC<StepExplanationProps> = ({ explanation, visible }) => {
  if (!visible) return null;

  return (
    <EuiPanel color="subdued" paddingSize="m" hasBorder={false} data-test-subj="stepExplanation">
      <EuiMarkdownFormat textSize="s">{explanation}</EuiMarkdownFormat>
    </EuiPanel>
  );
};
