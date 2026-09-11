/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import { loggingSystemMock, savedObjectsClientMock } from '@kbn/core/server/mocks';

import {
  DATA_STREAM_TYPE_VAR_NAME,
  GLOBAL_DATA_TAG_EXCLUDED_INPUTS,
  OTEL_COLLECTOR_INPUT_TYPE,
} from '../../../common/constants/epm';
import { LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE } from '../../../common/constants';
import { appContextService } from '../app_context';
import { _compilePackagePolicyInputs, getPackagePolicySavedObjectType } from '../package_policy';
import { getAgentTemplateAssetsMap } from '../epm/packages/get';

import type { PackagePolicy, PackagePolicyInput } from '../../types';

import {
  getInputId,
  storedPackagePoliciesToAgentInputs,
  storedPackagePolicyToAgentInputs,
} from './package_policies_to_agent_inputs';

jest.mock('../app_context');
jest.mock('../epm/packages/get', () => ({
  getAgentTemplateAssetsMap: jest.fn(),
}));
// `package_policy` imports `recompileInputsWithAgentVersion` back from this module, so a
// `jest.requireActual` factory here re-enters this mock while it is still being built and hands the
// module under test a different set of mock functions than the ones these tests configure. Only
// these two exports are used from `package_policy`, so declare them directly instead.
jest.mock('../package_policy', () => ({
  _compilePackagePolicyInputs: jest.fn(),
  getPackagePolicySavedObjectType: jest.fn(),
}));

const packageInfoCache = new Map();
packageInfoCache.set('mock_package-0.0.0', {
  name: 'mock_package',
  version: '0.0.0',
  release: 'beta',
  policy_templates: [
    {
      multiple: true,
    },
  ],
});
packageInfoCache.set('limited_package-0.0.0', {
  name: 'limited_package',
  version: '0.0.0',
  release: 'ga',
  policy_templates: [
    {
      multiple: false,
    },
  ],
});
packageInfoCache.set('endpoint-8.5.0', {
  name: 'endpoint',
  version: '8.5.0',
  release: 'ga',
  policy_templates: [
    {
      multiple: false,
    },
  ],
});
packageInfoCache.set('mock_package_agentless-0.0.0', {
  name: 'mock_package_agentless',
  version: '0.0.0',
  policy_templates: [
    {
      multiple: true,
      deployment_modes: {
        agentless: {
          organization: 'elastic',
          division: 'engineering',
          team: 'security-service-integrations',
        },
      },
    },
  ],
});

describe('Fleet - storedPackagePoliciesToAgentInputs', () => {
  const mockPackagePolicy: PackagePolicy = {
    id: 'some-uuid',
    name: 'mock_package-policy',
    description: '',
    created_at: '',
    created_by: '',
    updated_at: '',
    updated_by: '',
    policy_id: '',
    policy_ids: [''],
    enabled: true,
    namespace: 'default',
    inputs: [],
    revision: 1,
  };

  const mockInput: PackagePolicyInput = {
    type: 'test-logs',
    enabled: true,
    vars: {
      inputVar: { value: 'input-value' },
      inputVar2: { value: undefined },
      inputVar3: {
        type: 'yaml',
        value: 'testField: test',
      },
      inputVar4: { value: '' },
    },
    streams: [
      {
        id: 'test-logs-foo',
        enabled: true,
        data_stream: { dataset: 'foo', type: 'logs' },
        vars: {
          fooVar: { value: 'foo-value' },
          fooVar2: { value: [1, 2] },
        },
        compiled_stream: {
          fooKey: 'fooValue1',
          fooKey2: ['fooValue2'],
          data_stream: { dataset: 'foo' }, // data_stream.dataset can be set in the compiled stream, ensure that rest of data_stream object is properly merged.
        },
      },
      {
        id: 'test-logs-bar',
        enabled: true,
        data_stream: { dataset: 'bar', type: 'logs' },
        vars: {
          barVar: { value: 'bar-value' },
          barVar2: { value: [1, 2] },
          barVar3: {
            type: 'yaml',
            value:
              '- namespace: mockNamespace\n  #disabledProp: ["test"]\n  anotherProp: test\n- namespace: mockNamespace2\n  #disabledProp: ["test2"]\n  anotherProp: test2',
          },
          barVar4: {
            type: 'yaml',
            value: '',
          },
          barVar5: {
            type: 'yaml',
            value: 'testField: test\n invalidSpacing: foo',
          },
        },
      },
    ],
  };

  const mockInput2: PackagePolicyInput = {
    type: 'test-metrics',
    policy_template: 'some-template',
    enabled: true,
    vars: {
      inputVar: { value: 'input-value' },
      inputVar2: { value: undefined },
      inputVar3: {
        type: 'yaml',
        value: 'testField: test',
      },
      inputVar4: { value: '' },
    },
    streams: [
      {
        id: 'test-metrics-foo',
        enabled: true,
        data_stream: { dataset: 'foo', type: 'metrics' },
        vars: {
          fooVar: { value: 'foo-value' },
          fooVar2: { value: [1, 2] },
        },
        compiled_stream: {
          fooKey: 'fooValue1',
          fooKey2: ['fooValue2'],
          data_stream: { dataset: 'foo' }, // data_stream.dataset can be set in the compiled stream, ensure that rest of data_stream object is properly merged.
        },
      },
    ],
  };

  it('returns no inputs for package policy with no inputs, or only disabled inputs', async () => {
    expect(await storedPackagePoliciesToAgentInputs([mockPackagePolicy], packageInfoCache)).toEqual(
      []
    );

    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            package: {
              name: 'mock_package',
              title: 'Mock package',
              version: '0.0.0',
            },
          },
        ],
        packageInfoCache
      )
    ).toEqual([]);

    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            inputs: [{ ...mockInput, enabled: false }],
          },
        ],
        packageInfoCache
      )
    ).toEqual([]);
  });

  it('returns agent inputs with streams', async () => {
    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            package: {
              name: 'mock_package',
              title: 'Mock package',
              version: '0.0.0',
            },
            inputs: [mockInput],
          },
        ],
        packageInfoCache
      )
    ).toEqual([
      {
        id: 'test-logs-some-uuid',
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        revision: 1,
        type: 'test-logs',
        data_stream: { namespace: 'default' },
        use_output: 'default',
        meta: {
          package: {
            name: 'mock_package',
            version: '0.0.0',
            release: 'beta',
          },
        },
        streams: [
          {
            id: 'test-logs-foo',
            data_stream: { dataset: 'foo', type: 'logs' },
            fooKey: 'fooValue1',
            fooKey2: ['fooValue2'],
          },
          {
            id: 'test-logs-bar',
            data_stream: { dataset: 'bar', type: 'logs' },
          },
        ],
      },
    ]);
  });

  it('returns unique agent inputs IDs with policy template name for all packages including limited ones', async () => {
    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            package: {
              name: 'mock_package',
              title: 'Mock package',
              version: '0.0.0',
            },
            inputs: [mockInput, mockInput2],
            output_id: 'new-output',
          },
          {
            ...mockPackagePolicy,
            package: {
              name: 'limited_package',
              title: 'Limited package',
              version: '0.0.0',
            },
            inputs: [mockInput2],
          },
        ],
        packageInfoCache
      )
    ).toEqual([
      {
        id: 'test-logs-some-uuid',
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        revision: 1,
        type: 'test-logs',
        data_stream: { namespace: 'default' },
        use_output: 'new-output',
        meta: {
          package: {
            name: 'mock_package',
            version: '0.0.0',
            release: 'beta',
          },
        },
        streams: [
          {
            id: 'test-logs-foo',
            data_stream: { dataset: 'foo', type: 'logs' },
            fooKey: 'fooValue1',
            fooKey2: ['fooValue2'],
          },
          {
            id: 'test-logs-bar',
            data_stream: { dataset: 'bar', type: 'logs' },
          },
        ],
      },
      {
        id: 'test-metrics-some-template-some-uuid',
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        revision: 1,
        type: 'test-metrics',
        data_stream: { namespace: 'default' },
        use_output: 'new-output',
        meta: {
          package: {
            name: 'mock_package',
            version: '0.0.0',
            policy_template: 'some-template',
            release: 'beta',
          },
        },
        streams: [
          {
            id: 'test-metrics-foo',
            data_stream: { dataset: 'foo', type: 'metrics' },
            fooKey: 'fooValue1',
            fooKey2: ['fooValue2'],
          },
        ],
      },
      {
        id: 'test-metrics-some-template-some-uuid',
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        revision: 1,
        type: 'test-metrics',
        data_stream: { namespace: 'default' },
        use_output: 'default',
        meta: {
          package: {
            name: 'limited_package',
            version: '0.0.0',
            release: 'ga',
            policy_template: 'some-template',
          },
        },
        streams: [
          {
            id: 'test-metrics-foo',
            data_stream: { dataset: 'foo', type: 'metrics' },
            fooKey: 'fooValue1',
            fooKey2: ['fooValue2'],
          },
        ],
      },
    ]);
  });

  it('returns simplified ID for endpoint (Elastic Defend) package', async () => {
    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            package: {
              name: 'endpoint',
              title: 'Endpoint',
              version: '8.5.0',
            },
            inputs: [mockInput2],
          },
        ],
        packageInfoCache
      )
    ).toEqual([
      {
        id: 'some-uuid',
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        revision: 1,
        type: 'test-metrics',
        data_stream: { namespace: 'default' },
        use_output: 'default',
        meta: {
          package: {
            name: 'endpoint',
            version: '8.5.0',
            release: 'ga',
            policy_template: 'some-template',
          },
        },
        streams: [
          {
            id: 'test-metrics-foo',
            data_stream: { dataset: 'foo', type: 'metrics' },
            fooKey: 'fooValue1',
            fooKey2: ['fooValue2'],
          },
        ],
      },
    ]);
  });

  it('returns agent inputs without streams', async () => {
    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            package: {
              name: 'mock_package',
              title: 'Mock package',
              version: '0.0.0',
            },
            inputs: [
              {
                ...mockInput,
                compiled_input: {
                  inputVar: 'input-value',
                },
                streams: [],
              },
            ],
          },
        ],
        packageInfoCache
      )
    ).toEqual([
      {
        id: 'test-logs-some-uuid',
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        revision: 1,
        type: 'test-logs',
        data_stream: { namespace: 'default' },
        use_output: 'default',
        meta: {
          package: {
            name: 'mock_package',
            version: '0.0.0',
            release: 'beta',
          },
        },
        inputVar: 'input-value',
      },
    ]);
  });

  it('returns agent inputs without disabled streams', async () => {
    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            inputs: [
              {
                ...mockInput,
                streams: [{ ...mockInput.streams[0] }, { ...mockInput.streams[1], enabled: false }],
              },
            ],
          },
        ],
        packageInfoCache
      )
    ).toEqual([
      {
        id: 'test-logs-some-uuid',
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        revision: 1,
        type: 'test-logs',
        data_stream: { namespace: 'default' },
        use_output: 'default',
        streams: [
          {
            id: 'test-logs-foo',
            data_stream: { dataset: 'foo', type: 'logs' },
            fooKey: 'fooValue1',
            fooKey2: ['fooValue2'],
          },
        ],
      },
    ]);
  });

  it('returns agent inputs with deeply merged config values', async () => {
    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            inputs: [
              {
                ...mockInput,
                compiled_input: {
                  agent_input_template_group1_vars: {
                    inputVar: 'input-value',
                  },
                  agent_input_template_group2_vars: {
                    inputVar3: {
                      testFieldGroup: {
                        subField1: 'subfield1',
                      },
                      testField: 'test',
                    },
                  },
                },
                config: {
                  agent_input_template_group1_vars: {
                    value: {
                      inputVar2: {},
                    },
                  },
                  agent_input_template_group2_vars: {
                    value: {
                      inputVar3: {
                        testFieldGroup: {
                          subField2: 'subfield2',
                        },
                      },
                      inputVar4: '',
                    },
                  },
                },
              },
            ],
          },
        ],
        packageInfoCache
      )
    ).toEqual([
      {
        id: 'test-logs-some-uuid',
        revision: 1,
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        type: 'test-logs',
        data_stream: { namespace: 'default' },
        use_output: 'default',
        agent_input_template_group1_vars: {
          inputVar: 'input-value',
          inputVar2: {},
        },
        agent_input_template_group2_vars: {
          inputVar3: {
            testField: 'test',
            testFieldGroup: {
              subField1: 'subfield1',
              subField2: 'subfield2',
            },
          },
          inputVar4: '',
        },
        streams: [
          {
            id: 'test-logs-foo',
            data_stream: { dataset: 'foo', type: 'logs' },
            fooKey: 'fooValue1',
            fooKey2: ['fooValue2'],
          },
          { id: 'test-logs-bar', data_stream: { dataset: 'bar', type: 'logs' } },
        ],
      },
    ]);
  });
  it('returns agent inputs using package policy namespace if defined', async () => {
    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            inputs: [
              {
                ...mockInput,
                streams: [{ ...mockInput.streams[0] }, { ...mockInput.streams[1], enabled: false }],
              },
            ],
            namespace: 'packagepolicyspace',
          },
        ],
        packageInfoCache,
        'default',
        'agentpolicyspace'
      )
    ).toEqual([
      {
        id: 'test-logs-some-uuid',
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        revision: 1,
        type: 'test-logs',
        data_stream: { namespace: 'packagepolicyspace' },
        use_output: 'default',
        streams: [
          {
            id: 'test-logs-foo',
            data_stream: { dataset: 'foo', type: 'logs' },
            fooKey: 'fooValue1',
            fooKey2: ['fooValue2'],
          },
        ],
      },
    ]);
  });
  it('returns agent inputs using agent policy namespace if package policy namespace is blank', async () => {
    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            inputs: [
              {
                ...mockInput,
                streams: [{ ...mockInput.streams[0] }, { ...mockInput.streams[1], enabled: false }],
              },
            ],
            namespace: '',
          },
        ],
        packageInfoCache,
        'default',
        'agentpolicyspace'
      )
    ).toEqual([
      {
        id: 'test-logs-some-uuid',
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        revision: 1,
        type: 'test-logs',
        data_stream: { namespace: 'agentpolicyspace' },
        use_output: 'default',
        streams: [
          {
            id: 'test-logs-foo',
            data_stream: { dataset: 'foo', type: 'logs' },
            fooKey: 'fooValue1',
            fooKey2: ['fooValue2'],
          },
        ],
      },
    ]);
  });

  it('returns agent inputs merged with overrides from package policies if available for that input', async () => {
    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            inputs: [
              {
                ...mockInput,
              },
            ],
            namespace: '',
            overrides: {
              inputs: {
                'test-logs-some-uuid': {
                  log_level: 'debug',
                },
              },
            },
          },
        ],
        packageInfoCache,
        'default',
        'agentpolicyspace'
      )
    ).toEqual([
      {
        id: 'test-logs-some-uuid',
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        revision: 1,
        type: 'test-logs',
        data_stream: { namespace: 'agentpolicyspace' },
        use_output: 'default',
        log_level: 'debug',
        streams: [
          {
            id: 'test-logs-foo',
            data_stream: { dataset: 'foo', type: 'logs' },
            fooKey: 'fooValue1',
            fooKey2: ['fooValue2'],
          },
          {
            data_stream: {
              dataset: 'bar',
              type: 'logs',
            },
            id: 'test-logs-bar',
          },
        ],
      },
    ]);
  });

  it('returns agent inputs merged with overrides based on passed input id', async () => {
    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            package: {
              name: 'mock_package',
              title: 'Mock package',
              version: '0.0.0',
            },
            inputs: [mockInput, mockInput2],
            namespace: '',
            overrides: {
              inputs: {
                'test-logs-some-uuid': {
                  log_level: 'debug',
                },
              },
            },
          },
        ],
        packageInfoCache
      )
    ).toEqual([
      {
        id: 'test-logs-some-uuid',
        log_level: 'debug',
        data_stream: {
          namespace: 'default',
        },
        meta: {
          package: {
            name: 'mock_package',
            version: '0.0.0',
            release: 'beta',
          },
        },
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        revision: 1,
        streams: [
          {
            data_stream: {
              dataset: 'foo',
              type: 'logs',
            },
            fooKey: 'fooValue1',
            fooKey2: ['fooValue2'],
            id: 'test-logs-foo',
          },
          {
            data_stream: {
              dataset: 'bar',
              type: 'logs',
            },
            id: 'test-logs-bar',
          },
        ],
        type: 'test-logs',
        use_output: 'default',
      },
      {
        data_stream: {
          namespace: 'default',
        },
        id: 'test-metrics-some-template-some-uuid',
        meta: {
          package: {
            name: 'mock_package',
            version: '0.0.0',
            release: 'beta',
            policy_template: 'some-template',
          },
        },
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        revision: 1,
        streams: [
          {
            data_stream: {
              dataset: 'foo',
              type: 'metrics',
            },
            fooKey: 'fooValue1',
            fooKey2: ['fooValue2'],
            id: 'test-metrics-foo',
          },
        ],
        type: 'test-metrics',
        use_output: 'default',
      },
    ]);
  });

  it('returns unchanged agent inputs if overrides are empty', async () => {
    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            inputs: [
              {
                ...mockInput,
                streams: [{ ...mockInput.streams[0] }, { ...mockInput.streams[1], enabled: false }],
              },
            ],
            namespace: '',
            overrides: {
              inputs: {},
            },
          },
        ],
        packageInfoCache,
        'default',
        'agentpolicyspace'
      )
    ).toEqual([
      {
        id: 'test-logs-some-uuid',
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        revision: 1,
        type: 'test-logs',
        data_stream: { namespace: 'agentpolicyspace' },
        use_output: 'default',
        streams: [
          {
            id: 'test-logs-foo',
            data_stream: { dataset: 'foo', type: 'logs' },
            fooKey: 'fooValue1',
            fooKey2: ['fooValue2'],
          },
        ],
      },
    ]);
  });

  it('returns agent inputs with overridden data_stream.type from stream vars', async () => {
    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            package: {
              name: 'mock_package',
              title: 'Mock package',
              version: '0.0.0',
            },
            inputs: [
              {
                ...mockInput,
                streams: [
                  {
                    ...mockInput.streams[0],
                    vars: {
                      ...mockInput.streams[0].vars,
                      'data_stream.type': { value: 'metrics' },
                    },
                  },
                ],
              },
            ],
          },
        ],
        packageInfoCache
      )
    ).toEqual([
      {
        id: 'test-logs-some-uuid',
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        revision: 1,
        type: 'test-logs',
        data_stream: { namespace: 'default' },
        use_output: 'default',
        meta: {
          package: {
            name: 'mock_package',
            version: '0.0.0',
            release: 'beta',
          },
        },
        streams: [
          {
            id: 'test-logs-foo',
            data_stream: { dataset: 'foo', type: 'metrics' },
            fooKey: 'fooValue1',
            fooKey2: ['fooValue2'],
          },
        ],
      },
    ]);
  });

  it('does not override data_stream.type when stream var is not set', async () => {
    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            package: {
              name: 'mock_package',
              title: 'Mock package',
              version: '0.0.0',
            },
            inputs: [
              {
                ...mockInput,
                streams: [mockInput.streams[0]],
              },
            ],
          },
        ],
        packageInfoCache
      )
    ).toEqual([
      {
        id: 'test-logs-some-uuid',
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        revision: 1,
        type: 'test-logs',
        data_stream: { namespace: 'default' },
        use_output: 'default',
        meta: {
          package: {
            name: 'mock_package',
            version: '0.0.0',
            release: 'beta',
          },
        },
        streams: [
          {
            id: 'test-logs-foo',
            data_stream: { dataset: 'foo', type: 'logs' },
            fooKey: 'fooValue1',
            fooKey2: ['fooValue2'],
          },
        ],
      },
    ]);
  });

  it('returns agent inputs with add fields process if global data tags are defined', async () => {
    const excludedInputs: PackagePolicyInput[] = [];
    const expectedExcluded = [];

    for (const input of GLOBAL_DATA_TAG_EXCLUDED_INPUTS) {
      excludedInputs.push({
        type: input,
        enabled: true,
        vars: {
          inputVar: { value: 'input-value' },
          inputVar2: { value: undefined },
          inputVar3: {
            type: 'yaml',
            value: 'testField: test',
          },
          inputVar4: { value: '' },
        },
        streams: [],
      });

      expectedExcluded.push({
        data_stream: {
          namespace: 'default',
        },
        id: `${input}-some-uuid`,
        meta: {
          package: {
            name: 'mock_package',
            version: '0.0.0',
            release: 'beta',
          },
        },
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        revision: 1,
        type: input,
        use_output: 'default',
      });
    }

    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            package: {
              name: 'mock_package',
              title: 'Mock package',
              version: '0.0.0',
            },
            inputs: [
              ...excludedInputs,
              {
                ...mockInput,
                compiled_input: {
                  inputVar: 'input-value',
                },
                streams: [],
              },
              {
                ...mockInput2,
                compiled_input: {
                  inputVar: 'input-value',
                },
                streams: [],
              },
            ],
          },
        ],
        packageInfoCache,
        undefined,
        undefined,
        [
          { name: 'testName', value: 'testValue' },
          { name: 'testName2', value: 'testValue2' },
        ]
      )
    ).toEqual([
      ...expectedExcluded,
      {
        id: 'test-logs-some-uuid',
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        processors: [
          {
            add_fields: {
              fields: {
                testName: 'testValue',
                testName2: 'testValue2',
              },
              target: '',
            },
          },
        ],
        revision: 1,
        type: 'test-logs',
        data_stream: { namespace: 'default' },
        use_output: 'default',
        meta: {
          package: {
            name: 'mock_package',
            version: '0.0.0',
            release: 'beta',
          },
        },
        inputVar: 'input-value',
      },
      {
        id: 'test-metrics-some-template-some-uuid',
        data_stream: {
          namespace: 'default',
        },
        inputVar: 'input-value',
        meta: {
          package: {
            name: 'mock_package',
            version: '0.0.0',
            release: 'beta',
            policy_template: 'some-template',
          },
        },
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        processors: [
          {
            add_fields: {
              target: '',
              fields: {
                testName: 'testValue',
                testName2: 'testValue2',
              },
            },
          },
        ],
        revision: 1,
        type: 'test-metrics',
        use_output: 'default',
      },
    ]);
  });

  it('does not include processor add_fields when global tags array is empty', async () => {
    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            package: {
              name: 'mock_package',
              title: 'Mock package',
              version: '0.0.0',
            },
            inputs: [
              {
                ...mockInput,
                compiled_input: {
                  inputVar: 'input-value',
                },
                streams: [],
              },
            ],
          },
        ],
        packageInfoCache,
        undefined,
        undefined,
        []
      )
    ).toEqual([
      {
        id: 'test-logs-some-uuid',
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        revision: 1,
        type: 'test-logs',
        data_stream: { namespace: 'default' },
        use_output: 'default',
        meta: {
          package: {
            name: 'mock_package',
            version: '0.0.0',
            release: 'beta',
          },
        },
        inputVar: 'input-value',
      },
    ]);
  });

  it('returns agent inputs with add fields process from global data tags excluding agentless defaults', async () => {
    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            name: 'mock_package_agentless-policy',
            package: {
              name: 'mock_package_agentless',
              title: 'Mock package agentless',
              version: '0.0.0',
            },
            inputs: [
              {
                ...mockInput,
                compiled_input: {
                  inputVar: 'input-value',
                },
                streams: [],
              },
              {
                ...mockInput2,
                compiled_input: {
                  inputVar: 'input-value',
                },
                streams: [],
              },
            ],
          },
        ],
        packageInfoCache,
        undefined,
        undefined,
        [
          { name: 'testName', value: 'testValue' },
          { name: 'testName2', value: 'testValue2' },
          { name: 'organization', value: 'elastic' },
          { name: 'division', value: 'engineering' },
          { name: 'team', value: 'security-service-integrations' },
          { name: 'organization', value: 'foo' },
        ]
      )
    ).toEqual([
      {
        id: 'test-logs-some-uuid',
        name: 'mock_package_agentless-policy',
        package_policy_id: 'some-uuid',
        processors: [
          {
            add_fields: {
              fields: {
                testName: 'testValue',
                testName2: 'testValue2',
                organization: 'foo',
              },
              target: '',
            },
          },
        ],
        revision: 1,
        type: 'test-logs',
        data_stream: { namespace: 'default' },
        use_output: 'default',
        meta: {
          package: {
            name: 'mock_package_agentless',
            version: '0.0.0',
          },
        },
        inputVar: 'input-value',
      },
      {
        id: 'test-metrics-some-template-some-uuid',
        data_stream: {
          namespace: 'default',
        },
        inputVar: 'input-value',
        meta: {
          package: {
            name: 'mock_package_agentless',
            version: '0.0.0',
            policy_template: 'some-template',
          },
        },
        name: 'mock_package_agentless-policy',
        package_policy_id: 'some-uuid',
        processors: [
          {
            add_fields: {
              target: '',
              fields: {
                testName: 'testValue',
                testName2: 'testValue2',
                organization: 'foo',
              },
            },
          },
        ],
        revision: 1,
        type: 'test-metrics',
        use_output: 'default',
      },
    ]);
  });
  it('merges package policy global_data_tags into the add_fields processor', async () => {
    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            package: {
              name: 'mock_package',
              title: 'Mock package',
              version: '0.0.0',
            },
            supports_agentless: true,
            global_data_tags: [
              { name: 'client_id', value: 'acme' },
              { name: 'env', value: 'prod' },
            ],
            inputs: [
              {
                ...mockInput,
                compiled_input: {
                  inputVar: 'input-value',
                },
                streams: [],
              },
            ],
          },
        ],
        packageInfoCache,
        undefined,
        undefined,
        undefined
      )
    ).toEqual([
      {
        id: 'test-logs-some-uuid',
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        processors: [
          {
            add_fields: {
              fields: {
                client_id: 'acme',
                env: 'prod',
              },
              target: '',
            },
          },
        ],
        revision: 1,
        type: 'test-logs',
        data_stream: { namespace: 'default' },
        use_output: 'default',
        meta: {
          package: {
            name: 'mock_package',
            version: '0.0.0',
            release: 'beta',
          },
        },
        inputVar: 'input-value',
      },
    ]);
  });

  it('merges agent policy global_data_tags and package policy global_data_tags together', async () => {
    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            package: {
              name: 'mock_package',
              title: 'Mock package',
              version: '0.0.0',
            },
            supports_agentless: true,
            global_data_tags: [{ name: 'client_id', value: 'acme' }],
            inputs: [
              {
                ...mockInput,
                compiled_input: {
                  inputVar: 'input-value',
                },
                streams: [],
              },
            ],
          },
        ],
        packageInfoCache,
        undefined,
        undefined,
        [{ name: 'organization', value: 'elastic' }]
      )
    ).toEqual([
      {
        id: 'test-logs-some-uuid',
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        processors: [
          {
            add_fields: {
              fields: {
                organization: 'elastic',
                client_id: 'acme',
              },
              target: '',
            },
          },
        ],
        revision: 1,
        type: 'test-logs',
        data_stream: { namespace: 'default' },
        use_output: 'default',
        meta: {
          package: {
            name: 'mock_package',
            version: '0.0.0',
            release: 'beta',
          },
        },
        inputVar: 'input-value',
      },
    ]);
  });

  it('does not add processor when package policy global_data_tags is empty', async () => {
    expect(
      await storedPackagePoliciesToAgentInputs(
        [
          {
            ...mockPackagePolicy,
            package: {
              name: 'mock_package',
              title: 'Mock package',
              version: '0.0.0',
            },
            supports_agentless: true,
            global_data_tags: [],
            inputs: [
              {
                ...mockInput,
                compiled_input: {
                  inputVar: 'input-value',
                },
                streams: [],
              },
            ],
          },
        ],
        packageInfoCache,
        undefined,
        undefined,
        undefined
      )
    ).toEqual([
      {
        id: 'test-logs-some-uuid',
        name: 'mock_package-policy',
        package_policy_id: 'some-uuid',
        revision: 1,
        type: 'test-logs',
        data_stream: { namespace: 'default' },
        use_output: 'default',
        meta: {
          package: {
            name: 'mock_package',
            version: '0.0.0',
            release: 'beta',
          },
        },
        inputVar: 'input-value',
      },
    ]);
  });
});

describe('Fleet - storedPackagePoliciesToAgentInputs - version specific inputs backfill', () => {
  const versionedPackagePolicy: PackagePolicy = {
    id: 'versioned-uuid',
    name: 'auditd-policy',
    description: '',
    created_at: '',
    created_by: '',
    updated_at: '',
    updated_by: '',
    policy_id: '',
    policy_ids: [''],
    enabled: true,
    namespace: 'default',
    package: {
      name: 'mock_package',
      title: 'Mock package',
      version: '0.0.0',
    },
    package_agent_version_condition: '^9.6.0',
    inputs: [{ type: 'test-logs', enabled: true, streams: [] }],
    revision: 1,
  };

  // Deliberately distinguishable from the package policy's own inputs and from the stored '9.5'
  // entry, so the assertions can tell a recompile apart from the defaults being passed through.
  const recompiledInputs: PackagePolicyInput[] = [
    { type: 'test-logs-recompiled', enabled: true, streams: [] },
  ];
  const storedInputsFor95: PackagePolicyInput[] = [
    { type: 'test-logs-9-5', enabled: true, streams: [] },
  ];

  const soVersion = 'WzEsMV0=';

  let logger: ReturnType<typeof loggingSystemMock.createLogger>;

  const makeSoClient = (existingInputsForVersions?: Record<string, PackagePolicyInput[]>) => {
    const soClient = savedObjectsClientMock.create();
    soClient.get.mockResolvedValue({
      id: versionedPackagePolicy.id,
      type: LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE,
      references: [],
      version: soVersion,
      attributes: existingInputsForVersions
        ? { inputs_for_versions: existingInputsForVersions }
        : {},
    } as any);
    soClient.update.mockResolvedValue({} as any);
    return soClient;
  };

  const getAgentInputs = (
    soClient: ReturnType<typeof savedObjectsClientMock.create>,
    packagePolicy: PackagePolicy = versionedPackagePolicy
  ) =>
    storedPackagePoliciesToAgentInputs(
      [packagePolicy],
      packageInfoCache,
      undefined,
      undefined,
      undefined,
      '9.6',
      soClient,
      true
    );

  beforeEach(() => {
    logger = loggingSystemMock.createLogger();
    jest.mocked(appContextService.getLogger).mockReturnValue(logger);
    jest
      .mocked(appContextService.getExperimentalFeatures)
      .mockReturnValue({ enableVersionSpecificPolicies: true } as any);
    jest
      .mocked(getPackagePolicySavedObjectType)
      .mockResolvedValue(LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE);
    jest.mocked(getAgentTemplateAssetsMap).mockResolvedValue(new Map() as any);
    jest.mocked(_compilePackagePolicyInputs).mockReturnValue(recompiledInputs);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('recompiles and persists inputs for an agent version missing from inputs_for_versions instead of throwing', async () => {
    const soClient = makeSoClient({ '9.5': storedInputsFor95 });

    const result = await getAgentInputs(soClient);

    // It is the recompiled inputs that reach the agent, not the defaults and not the '9.5' entry.
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'test-logs-recompiled' });
    expect(_compilePackagePolicyInputs).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'mock_package' }),
      {},
      versionedPackagePolicy.inputs,
      expect.anything(),
      '9.6'
    );
    // The stored versions are preserved and the write is guarded by the version that was read, so a
    // concurrent backfill of another version cannot be dropped by this one.
    expect(soClient.update).toHaveBeenCalledWith(
      LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE,
      versionedPackagePolicy.id,
      {
        inputs_for_versions: {
          '9.5': storedInputsFor95,
          '9.6': recompiledInputs,
        },
      },
      { version: soVersion }
    );
  });

  it('uses the already compiled inputs for a version present in inputs_for_versions without recompiling', async () => {
    const soClient = makeSoClient({ '9.6': storedInputsFor95 });

    const result = await getAgentInputs(soClient);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'test-logs-9-5' });
    expect(_compilePackagePolicyInputs).not.toHaveBeenCalled();
    expect(soClient.update).not.toHaveBeenCalled();
  });

  it('backfills a package policy that has no inputs_for_versions at all', async () => {
    // Written before enableVersionSpecificPolicies was turned on, so nothing was ever compiled for
    // it. Previously this fell through to the default inputs silently.
    const soClient = makeSoClient(undefined);

    const result = await getAgentInputs(soClient);

    expect(result[0]).toMatchObject({ type: 'test-logs-recompiled' });
    expect(soClient.update).toHaveBeenCalledWith(
      LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE,
      versionedPackagePolicy.id,
      { inputs_for_versions: { '9.6': recompiledInputs } },
      { version: soVersion }
    );
  });

  it('does not compile or persist for a package policy that has no version conditions', async () => {
    // hasAgentVersionConditions is computed once per agent policy, so it is true here even though
    // this package policy has no conditions of its own. It must not get inputs_for_versions written.
    const { package_agent_version_condition: _condition, ...withoutCondition } =
      versionedPackagePolicy;
    const soClient = makeSoClient(undefined);

    const result = await getAgentInputs(soClient, withoutCondition as PackagePolicy);

    expect(result[0]).toMatchObject({ type: 'test-logs' });
    expect(_compilePackagePolicyInputs).not.toHaveBeenCalled();
    expect(soClient.update).not.toHaveBeenCalled();
  });

  it('falls back to the default inputs when the recompile itself throws', async () => {
    jest.mocked(_compilePackagePolicyInputs).mockImplementation(() => {
      throw new Error('missing package assets');
    });
    const soClient = makeSoClient({ '9.5': storedInputsFor95 });

    const result = await getAgentInputs(soClient);

    // The agent policy read still succeeds rather than aborting the whole request.
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'test-logs' });
    expect(soClient.update).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to compile inputs for agent version 9.6')
    );
  });

  it('warns and still serves the recompiled inputs when persisting fails', async () => {
    // getFullAgentPolicy is reachable from read only routes whose request scoped client may not be
    // allowed to write, which would otherwise recompile on every request with nothing in the logs.
    const soClient = makeSoClient({ '9.5': storedInputsFor95 });
    soClient.update.mockRejectedValue(new Error('forbidden'));

    const result = await getAgentInputs(soClient);

    expect(result[0]).toMatchObject({ type: 'test-logs-recompiled' });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to persist inputs for agent version 9.6')
    );
  });

  it('does not warn when a concurrent write already changed the saved object', async () => {
    const soClient = makeSoClient({ '9.5': storedInputsFor95 });
    soClient.update.mockRejectedValue(
      SavedObjectsErrorHelpers.createConflictError(
        LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE,
        versionedPackagePolicy.id
      )
    );

    const result = await getAgentInputs(soClient);

    expect(result[0]).toMatchObject({ type: 'test-logs-recompiled' });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('the saved object changed concurrently')
    );
  });
});

describe('storedPackagePolicyToAgentInputs - dynamic_signal_types handling', () => {
  const baseMockPolicy: PackagePolicy = {
    id: 'some-uuid',
    name: 'mock-policy',
    description: '',
    created_at: '',
    created_by: '',
    updated_at: '',
    updated_by: '',
    policy_id: '',
    policy_ids: [''],
    enabled: true,
    namespace: 'default',
    inputs: [],
    revision: 1,
    package: { name: 'sql_server_input_otel', version: '1.0.0', title: 'SQL Server OTel' },
  };

  const dynamicPackageInfo: any = {
    name: 'sql_server_input_otel',
    version: '1.0.0',
    type: 'input',
    policy_templates: [
      {
        name: 'otel',
        input: OTEL_COLLECTOR_INPUT_TYPE,
        dynamic_signal_types: true,
        title: 'SQL OTel',
        description: 'OTel input',
        template_path: 'some/path.hbs',
      },
    ],
  };

  it('strips undefined type for dynamic_signal_types package stream when data_stream.type variable is not set', () => {
    const policy: PackagePolicy = {
      ...baseMockPolicy,
      inputs: [
        {
          type: OTEL_COLLECTOR_INPUT_TYPE,
          enabled: true,
          streams: [
            {
              id: 'stream-dynamic',
              enabled: true,
              data_stream: { dataset: 'otel.dataset' },
            } as any,
          ],
        },
      ],
    };

    const result = storedPackagePolicyToAgentInputs(policy, dynamicPackageInfo);
    expect(result).toHaveLength(1);
    const stream = result[0].streams?.[0];
    expect(stream).toBeDefined();
    expect(stream?.data_stream.type).toBeUndefined();
    // Ensure the key is stripped (not present as undefined)
    expect('type' in (stream?.data_stream ?? {})).toBe(false);
  });

  it('uses data_stream.type variable value when set for dynamic_signal_types package', () => {
    const policy: PackagePolicy = {
      ...baseMockPolicy,
      inputs: [
        {
          type: OTEL_COLLECTOR_INPUT_TYPE,
          enabled: true,
          streams: [
            {
              id: 'stream-dynamic',
              enabled: true,
              data_stream: { dataset: 'otel.dataset' },
              vars: { [DATA_STREAM_TYPE_VAR_NAME]: { value: 'metrics' } },
            } as any,
          ],
        },
      ],
    };

    const result = storedPackagePolicyToAgentInputs(policy, dynamicPackageInfo);
    expect(result).toHaveLength(1);
    const stream = result[0].streams?.[0];
    expect(stream?.data_stream.type).toEqual('metrics');
  });

  it('throws for non-dynamic package with undefined data_stream.type', () => {
    const nonDynamicPackageInfo: any = {
      name: 'regular-package',
      version: '1.0.0',
      type: 'integration',
      policy_templates: [],
    };
    const policy: PackagePolicy = {
      ...baseMockPolicy,
      package: { name: 'regular-package', version: '1.0.0', title: 'Regular' },
      inputs: [
        {
          type: 'logfile',
          enabled: true,
          streams: [
            {
              id: 'stream-no-type',
              enabled: true,
              data_stream: { dataset: 'regular.dataset' },
            } as any,
          ],
        },
      ],
    };

    expect(() => storedPackagePolicyToAgentInputs(policy, nonDynamicPackageInfo)).toThrow(
      '[data_stream.type]: unexpected undefined stream type for non-dynamic package'
    );
  });
});

describe('getInputId', () => {
  it('should use name instead of type when name is present', () => {
    const id = getInputId(
      {
        type: 'otelcol',
        name: 'filelog_otel',
        policy_template: 'nginx',
        enabled: true,
        streams: [],
      },
      'pkg-policy-123'
    );

    expect(id).toBe('filelog_otel-nginx-pkg-policy-123');
  });

  it('should fall back to type when name is not present', () => {
    const id = getInputId(
      {
        type: 'logfile',
        policy_template: 'nginx',
        enabled: true,
        streams: [],
      },
      'pkg-policy-123'
    );

    expect(id).toBe('logfile-nginx-pkg-policy-123');
  });

  it('should produce unique ids for same-type inputs with different names', () => {
    const id1 = getInputId(
      {
        type: 'otelcol',
        name: 'filelog_otel',
        policy_template: 'nginx',
        enabled: true,
        streams: [],
      },
      'pkg-policy-123'
    );
    const id2 = getInputId(
      {
        type: 'otelcol',
        name: 'nginx_otel',
        policy_template: 'nginx',
        enabled: true,
        streams: [],
      },
      'pkg-policy-123'
    );

    expect(id1).not.toBe(id2);
  });
});

describe('storedPackagePolicyToAgentInputs - condition handling', () => {
  const basePolicy: PackagePolicy = {
    id: 'pkg-uuid',
    name: 'pkg',
    description: '',
    created_at: '',
    created_by: '',
    updated_at: '',
    updated_by: '',
    policy_id: '',
    policy_ids: [''],
    enabled: true,
    namespace: 'default',
    inputs: [],
    revision: 1,
  };

  const makeInput = (overrides: Partial<PackagePolicyInput> = {}): PackagePolicyInput => ({
    type: 'logfile',
    enabled: true,
    streams: [
      {
        id: 'stream-1',
        enabled: true,
        data_stream: { dataset: 'foo', type: 'logs' },
      },
    ],
    ...overrides,
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('integration-level condition fans out to inputs', () => {
    const result = storedPackagePolicyToAgentInputs({
      ...basePolicy,
      condition: "${host.platform} == 'linux'",
      inputs: [makeInput(), makeInput({ type: 'metrics' })],
    });
    expect(result).toHaveLength(2);
    expect(result[0].condition).toBe("${host.platform} == 'linux'");
    expect(result[1].condition).toBe("${host.platform} == 'linux'");
  });

  it('integration-level condition is omitted on otelcol-type inputs', () => {
    const result = storedPackagePolicyToAgentInputs({
      ...basePolicy,
      condition: "${host.platform} == 'linux'",
      inputs: [makeInput({ type: OTEL_COLLECTOR_INPUT_TYPE })],
    });
    expect(result).toHaveLength(1);
    expect(result[0].condition).toBeUndefined();
  });

  it('integration-level condition is omitted on agentless policies', () => {
    const result = storedPackagePolicyToAgentInputs({
      ...basePolicy,
      supports_agentless: true,
      condition: "${host.platform} == 'linux'",
      inputs: [makeInput()],
    });
    expect(result).toHaveLength(1);
    expect(result[0].condition).toBeUndefined();
  });

  it('input-level user condition AND-combines with compiled_input.condition', () => {
    const result = storedPackagePolicyToAgentInputs({
      ...basePolicy,
      inputs: [
        makeInput({
          condition: "${host.platform} != 'windows'",
          compiled_input: { condition: "${host.platform} == 'linux'", some_key: 'value' },
        }),
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].condition).toBe(
      "(${host.platform} == 'linux') and (${host.platform} != 'windows')"
    );
    expect((result[0] as any).some_key).toBe('value');
  });

  it('stream-level user condition AND-combines with compiled_stream.condition', () => {
    const result = storedPackagePolicyToAgentInputs({
      ...basePolicy,
      inputs: [
        makeInput({
          streams: [
            {
              id: 'stream-1',
              enabled: true,
              data_stream: { dataset: 'foo', type: 'logs' },
              condition: "${host.name} == 'mybox'",
              compiled_stream: {
                condition: "arrayContains(${docker.labels}, 'monitor')",
                extra: 'v',
              } as any,
            },
          ],
        }),
      ],
    });
    expect(result[0].streams?.[0].condition).toBe(
      "(arrayContains(${docker.labels}, 'monitor')) and (${host.name} == 'mybox')"
    );
    expect((result[0].streams?.[0] as any).extra).toBe('v');
  });

  it('all three levels combine on the emitted input', () => {
    const result = storedPackagePolicyToAgentInputs({
      ...basePolicy,
      condition: "${host.platform} == 'linux'",
      inputs: [
        makeInput({
          condition: "${host.platform} != 'windows'",
          compiled_input: { condition: "${host.name} == 'fleet-host'" },
          streams: [
            {
              id: 'stream-1',
              enabled: true,
              data_stream: { dataset: 'foo', type: 'logs' },
              condition: "arrayContains(${host.tags}, 'production')",
              compiled_stream: {
                condition: "arrayContains(${docker.labels}, 'monitor')",
              } as any,
            },
          ],
        }),
      ],
    });
    // Flat 3-part combine: integration / template / user.
    expect(result[0].condition).toBe(
      "(${host.platform} == 'linux') and (${host.name} == 'fleet-host') and (${host.platform} != 'windows')"
    );
    expect(result[0].streams?.[0].condition).toBe(
      "(arrayContains(${docker.labels}, 'monitor')) and (arrayContains(${host.tags}, 'production'))"
    );
  });

  it('no conditions set anywhere → no condition keys emitted', () => {
    const result = storedPackagePolicyToAgentInputs({
      ...basePolicy,
      inputs: [makeInput()],
    });
    expect('condition' in result[0]).toBe(false);
    expect('condition' in (result[0].streams?.[0] ?? {})).toBe(false);
  });

  it('non-string condition value (e.g. boolean true) does not throw — #273082', () => {
    // The Fleet UI can persist condition as boolean `true`; combineConditions must not call
    // .trim() on a non-string value or it throws "c?.trim is not a function".
    expect(() =>
      storedPackagePolicyToAgentInputs({
        ...basePolicy,
        inputs: [
          makeInput({
            streams: [
              {
                id: 'stream-1',
                enabled: true,
                data_stream: { dataset: 'foo', type: 'logs' },
                condition: true as any,
              },
            ],
          }),
        ],
      })
    ).not.toThrow();
  });

  it('overrides.inputs[id].condition still wins (no regression)', () => {
    const inputId = 'logfile-pkg-uuid';
    const result = storedPackagePolicyToAgentInputs({
      ...basePolicy,
      condition: "${host.platform} == 'linux'",
      overrides: {
        inputs: {
          [inputId]: { condition: "${host.platform} == 'darwin'" },
        },
      },
      inputs: [
        makeInput({
          condition: "${host.platform} != 'windows'",
        }),
      ],
    });
    expect(result[0].condition).toBe("${host.platform} == 'darwin'");
  });
});
