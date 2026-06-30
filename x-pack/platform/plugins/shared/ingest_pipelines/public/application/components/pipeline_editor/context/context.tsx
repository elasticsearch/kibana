/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FunctionComponent } from 'react';
import React from 'react';

import type { FieldAccessPattern } from '../../../../../common/types';
import type { Props as ProcessorsContextProps } from './processors_context';
import { PipelineProcessorsContextProvider } from './processors_context';
import { TestPipelineContextProvider } from './test_pipeline_context';

interface Props extends ProcessorsContextProps {
  children: React.ReactNode;
  fieldAccessPattern?: FieldAccessPattern;
}

export const ProcessorsEditorContextProvider: FunctionComponent<Props> = ({
  children,
  onUpdate,
  value,
  onFlyoutOpen,
  fieldAccessPattern,
}: Props) => {
  return (
    <TestPipelineContextProvider fieldAccessPattern={fieldAccessPattern}>
      <PipelineProcessorsContextProvider
        onFlyoutOpen={onFlyoutOpen}
        onUpdate={onUpdate}
        value={value}
      >
        {children}
      </PipelineProcessorsContextProvider>
    </TestPipelineContextProvider>
  );
};
