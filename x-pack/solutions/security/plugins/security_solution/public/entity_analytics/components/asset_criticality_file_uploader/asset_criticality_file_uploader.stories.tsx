/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { StoryFn, Meta } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from 'styled-components';
import { euiLightVars } from '@kbn/ui-theme';
import { TestProvider } from '@kbn/expandable-flyout/src/test/provider';
import { EuiPanel, EuiSpacer } from '@elastic/eui';
import { StorybookProviders } from '../../../common/mock/storybook_providers';
import { AssetCriticalityFileUploader } from './asset_criticality_file_uploader';
import { AssetCriticalityResultStep } from './components/result_step';
import { AssetCriticalityValidationStep } from './components/validation_step';
import { AssetCriticalityFilePickerStep } from './components/file_picker_step';

const validLinesAsText = `user,user-001,low_impact\nuser-002,medium_impact\nuser,user-003,medium_impact\nhost,host-001,extreme_impact\nhost,host-002,extreme_impact\nservice,service-001,extreme_impact`;
const invalidLinesAsText = `user,user-001,wow_impact\ntest,user-002,medium_impact\nuser,user-003,medium_impact,extra_column`;

export default {
  component: AssetCriticalityFileUploader,
  title: 'Entity Analytics/AssetCriticalityFileUploader',
  decorators: [
    (storyFn) => (
      <ThemeProvider theme={() => ({ eui: euiLightVars, darkMode: false })}>
        {storyFn()}
      </ThemeProvider>
    ),
  ],
} as Meta;

export const Default: StoryFn = () => {
  return (
    <StorybookProviders>
      <TestProvider>
        <div css={{ maxWidth: '800px' }}>
          <EuiPanel>
            <AssetCriticalityFileUploader />
          </EuiPanel>
        </div>
      </TestProvider>
    </StorybookProviders>
  );
};

export const FilePickerStep: StoryFn = () => {
  return (
    <StorybookProviders>
      <TestProvider>
        <div css={{ maxWidth: '800px' }}>
          <b>{'Loading state'}</b>
          <EuiSpacer size="s" />

          <EuiPanel>
            <AssetCriticalityFilePickerStep onFileChange={() => {}} isLoading={true} />
          </EuiPanel>
          <EuiSpacer size="xl" />

          <b>{'With Error message'}</b>
          <EuiSpacer size="s" />

          <EuiPanel>
            <AssetCriticalityFilePickerStep
              onFileChange={() => {}}
              isLoading={false}
              errorMessage="An error message"
            />
          </EuiPanel>
          <EuiSpacer size="xl" />

          <b>{'Default'}</b>
          <EuiSpacer size="s" />

          <EuiPanel>
            <AssetCriticalityFilePickerStep onFileChange={() => {}} isLoading={false} />
          </EuiPanel>
        </div>
      </TestProvider>
    </StorybookProviders>
  );
};

export const ValidationStep: StoryFn = () => {
  return (
    <StorybookProviders>
      <TestProvider>
        <div css={{ maxWidth: '800px' }}>
          <b>{'Initial state'}</b>
          <EuiSpacer size="s" />

          <EuiPanel>
            <AssetCriticalityValidationStep
              isLoading={false}
              validatedFile={{
                name: 'test.csv',
                size: 100,
                validLines: {
                  text: validLinesAsText,
                  count: 6,
                },
                invalidLines: {
                  text: invalidLinesAsText,
                  count: 3,
                  errors: [
                    {
                      message: 'error message 1',
                      index: 1,
                    },
                    {
                      message: 'error message 2',
                      index: 2,
                    },
                    {
                      message: 'error message 3',
                      index: 3,
                    },
                  ],
                },
              }}
              onConfirm={() => {}}
              onReturn={() => {}}
            />
          </EuiPanel>
          <EuiSpacer size="xl" />

          <b>{'Loading state'}</b>
          <EuiSpacer size="s" />

          <EuiPanel>
            <AssetCriticalityValidationStep
              isLoading={true}
              validatedFile={{
                name: 'test.csv',
                size: 100,
                validLines: {
                  text: validLinesAsText,
                  count: 6,
                },
                invalidLines: {
                  text: invalidLinesAsText,
                  count: 3,
                  errors: [
                    {
                      message: 'error message 1',
                      index: 1,
                    },
                    {
                      message: 'error message 2',
                      index: 2,
                    },
                    {
                      message: 'error message 3',
                      index: 3,
                    },
                  ],
                },
              }}
              onConfirm={() => {}}
              onReturn={() => {}}
            />
          </EuiPanel>
        </div>
      </TestProvider>
    </StorybookProviders>
  );
};

export const ResultsStep: StoryFn = () => {
  return (
    <StorybookProviders>
      <TestProvider>
        <div css={{ maxWidth: '800px' }}>
          <b>{'Success'}</b>
          <EuiSpacer size="s" />

          <EuiPanel>
            <AssetCriticalityResultStep
              onReturn={() => {}}
              validLinesAsText={validLinesAsText}
              result={{
                errors: [],
                stats: {
                  total: 10,
                  successful: 10,
                  failed: 0,
                },
              }}
            />
          </EuiPanel>
          <EuiSpacer size="xl" />

          <b>{'Partial error'}</b>
          <EuiSpacer size="s" />

          <EuiPanel>
            <AssetCriticalityResultStep
              onReturn={() => {}}
              validLinesAsText={validLinesAsText}
              result={{
                errors: [
                  { message: 'error message 1', index: 1 },
                  { message: 'error message 2', index: 3 },
                  { message: 'error message 3', index: 5 },
                ],
                stats: {
                  total: 6,
                  successful: 2,
                  failed: 3,
                },
              }}
            />
          </EuiPanel>

          <EuiSpacer size="xl" />

          <b>{'Complete failure'}</b>
          <EuiSpacer size="s" />

          <EuiPanel>
            <AssetCriticalityResultStep
              onReturn={() => {}}
              validLinesAsText=""
              errorMessage="Something went wrong"
            />
          </EuiPanel>
        </div>
      </TestProvider>
    </StorybookProviders>
  );
};
