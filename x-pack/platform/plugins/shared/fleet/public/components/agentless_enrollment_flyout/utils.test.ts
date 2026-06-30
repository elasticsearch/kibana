/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { resolveIntegrationTitle } from './utils';

describe('resolveIntegrationTitle', () => {
  const policyTemplates = [
    {
      name: 'aws',
      inputs: [
        { type: 's3', title: 'AWS S3' },
        { type: 'cloudwatch', title: 'AWS CloudWatch' },
      ],
    },
  ];

  it('falls back to the policy name when the package title is unavailable', () => {
    expect(
      resolveIntegrationTitle({
        packageTitle: undefined,
        policyTemplates,
        selectedInput: { policyTemplate: 'aws', type: 's3' },
        fallbackName: 'My agentless policy',
      })
    ).toBe('My agentless policy');
  });

  it('uses the package title when no input is selected', () => {
    expect(
      resolveIntegrationTitle({
        packageTitle: 'Amazon Web Services',
        policyTemplates,
        selectedInput: undefined,
        fallbackName: 'My agentless policy',
      })
    ).toBe('Amazon Web Services');
  });

  it('uses the selected input title when it resolves', () => {
    expect(
      resolveIntegrationTitle({
        packageTitle: 'Amazon Web Services',
        policyTemplates,
        selectedInput: { policyTemplate: 'aws', type: 's3' },
        fallbackName: 'My agentless policy',
      })
    ).toBe('AWS S3');
  });

  it('falls back to the package title when the policy template is not found', () => {
    expect(
      resolveIntegrationTitle({
        packageTitle: 'Amazon Web Services',
        policyTemplates,
        selectedInput: { policyTemplate: 'gcp', type: 's3' },
        fallbackName: 'My agentless policy',
      })
    ).toBe('Amazon Web Services');
  });

  it('falls back to the package title when the input type is not found in the template', () => {
    expect(
      resolveIntegrationTitle({
        packageTitle: 'Amazon Web Services',
        policyTemplates,
        selectedInput: { policyTemplate: 'aws', type: 'kinesis' },
        fallbackName: 'My agentless policy',
      })
    ).toBe('Amazon Web Services');
  });
});
