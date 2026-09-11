/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

import type { GlobalDataTag } from '../../../common/types';

import { agentPolicyStatuses, dataTypes } from '../../../common/constants';
import { isValidNamespace } from '../../../common/services';
import { getSettingsAPISchema } from '../../services/form_settings';

import { ProxyHeadersSchema } from '../rest_spec/fleet_proxies';

import { PackagePolicySchema, PackagePolicyResponseSchema } from './package_policy';

export const AgentPolicyNamespaceSchema = schema.string({
  minLength: 1,
  validate: (value) => {
    const namespaceValidation = isValidNamespace(value || '');
    if (!namespaceValidation.valid && namespaceValidation.error) {
      return namespaceValidation.error;
    }
  },
});

function validateNonEmptyString(val: string) {
  if (val.trim() === '') {
    return 'Invalid empty string';
  }
}

const TWO_WEEKS_SECONDS = 1209600;

function isInteger(n: number) {
  if (!Number.isInteger(n)) {
    return `${n} is not a valid integer`;
  }
}

const memoryRegex = /^\d+(Mi|Gi)$/;
function validateMemory(s: string) {
  if (!memoryRegex.test(s)) {
    return 'Invalid memory format';
  }
}

const cpuRegex = /^(\d+m|\d+(\.\d+)?)$/;
function validateCPU(s: string) {
  if (!cpuRegex.test(s)) {
    return 'Invalid CPU format';
  }
}

export const AgentPolicyBaseSchema = {
  id: schema.maybe(schema.string()),
  space_ids: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
  name: schema.string({ minLength: 1, validate: validateNonEmptyString }),
  namespace: AgentPolicyNamespaceSchema,
  description: schema.maybe(schema.string()),
  is_managed: schema.maybe(schema.boolean()),
  has_fleet_server: schema.maybe(schema.boolean()),
  is_default: schema.maybe(schema.boolean()),
  is_default_fleet_server: schema.maybe(schema.boolean()),
  unenroll_timeout: schema.maybe(schema.number({ min: 0, validate: isInteger })),
  inactivity_timeout: schema.number({
    min: 0,
    defaultValue: TWO_WEEKS_SECONDS,
    validate: isInteger,
  }),
  monitoring_enabled: schema.maybe(
    schema.arrayOf(
      schema.oneOf([
        schema.literal(dataTypes.Logs),
        schema.literal(dataTypes.Metrics),
        schema.literal(dataTypes.Traces),
      ]),
      { maxSize: 3 }
    )
  ),
  keep_monitoring_alive: schema.maybe(
    schema.oneOf([
      schema.literal(null),
      schema.boolean({
        defaultValue: false,
        meta: {
          description:
            'When set to true, monitoring will be enabled but logs/metrics collection will be disabled',
        },
      }),
    ])
  ),
  data_output_id: schema.maybe(schema.oneOf([schema.literal(null), schema.string()])),
  monitoring_output_id: schema.maybe(schema.oneOf([schema.literal(null), schema.string()])),
  download_source_id: schema.maybe(schema.oneOf([schema.literal(null), schema.string()])),
  download_source_ids: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 3 })),
  fleet_server_host_id: schema.maybe(schema.oneOf([schema.literal(null), schema.string()])),
  agent_features: schema.maybe(
    schema.arrayOf(
      schema.object({
        name: schema.string(),
        enabled: schema.boolean(),
      }),
      { maxSize: 100 }
    )
  ),
  is_protected: schema.maybe(schema.boolean()),
  overrides: schema.maybe(
    schema.oneOf([
      schema.literal(null),
      schema.recordOf(schema.string(), schema.any(), {
        validate: (val) => {
          if (Object.keys(val).some((key) => key.match(/^inputs(\.)?/))) {
            return 'inputs overrides is not allowed';
          }
          if (Object.keys(val).some((key) => key.match(/^output_permissions(\.)?/))) {
            return 'output_permissions overrides is not allowed';
          }
        },
        meta: {
          description:
            'Override settings that are defined in the agent policy. Input settings cannot be overridden. The override option should be used only in unusual circumstances and not as a routine procedure.',
        },
      }),
    ])
  ),
  ...getSettingsAPISchema('AGENT_POLICY_ADVANCED_SETTINGS'),
  supports_agentless: schema.maybe(
    schema.oneOf([
      schema.literal(null),
      schema.boolean({
        defaultValue: false,
        meta: {
          description: 'Indicates whether the agent policy supports agentless integrations.',
        },
      }),
    ])
  ),
  global_data_tags: schema.maybe(
    schema.arrayOf(
      schema.object({
        name: schema.string(),
        value: schema.oneOf([schema.string(), schema.number()]),
      }),
      {
        validate: validateGlobalDataTagInput,
        meta: {
          description:
            'User defined data tags that are added to all of the inputs. The values can be strings or numbers.',
        },
        maxSize: 100,
      }
    )
  ),
  agentless: schema.maybe(
    schema.object({
      cloud_connectors: schema.maybe(
        schema.object({
          target_csp: schema.maybe(
            schema.oneOf([schema.literal('aws'), schema.literal('azure'), schema.literal('gcp')])
          ),
          enabled: schema.boolean(),
        })
      ),
      resources: schema.maybe(
        schema.object({
          requests: schema.maybe(
            schema.object({
              memory: schema.maybe(schema.string({ validate: validateMemory })),
              cpu: schema.maybe(schema.string({ validate: validateCPU })),
            })
          ),
        })
      ),
    })
  ),
  monitoring_pprof_enabled: schema.maybe(schema.boolean()),
  monitoring_http: schema.maybe(
    schema.object({
      enabled: schema.maybe(schema.boolean()),
      host: schema.maybe(schema.string({ defaultValue: 'localhost' })),
      port: schema.maybe(schema.number({ min: 0, max: 65353, defaultValue: 6791 })),
      buffer: schema.maybe(schema.object({ enabled: schema.boolean({ defaultValue: false }) })),
    })
  ),
  monitoring_diagnostics: schema.maybe(
    schema.object({
      limit: schema.maybe(
        schema.object({
          interval: schema.maybe(schema.string()),
          burst: schema.maybe(schema.number()),
        })
      ),
      uploader: schema.maybe(
        schema.object({
          max_retries: schema.maybe(schema.number()),
          init_dur: schema.maybe(schema.string()),
          max_dur: schema.maybe(schema.string()),
        })
      ),
    })
  ),
  required_versions: schema.maybe(
    schema.oneOf([
      schema.literal(null),
      schema.arrayOf(
        schema.object({
          version: schema.string({
            meta: {
              description: 'Target version for automatic agent upgrade',
            },
          }),
          percentage: schema.number({
            min: 0,
            max: 100,
            meta: {
              description: 'Target percentage of agents to auto upgrade',
            },
          }),
        }),
        { maxSize: 100 }
      ),
    ])
  ),
  is_verifier: schema.maybe(
    schema.boolean({
      defaultValue: false,
      meta: {
        description:
          'Indicates this is a short-lived verifier policy used for OTel permission verification.',
      },
    })
  ),
};

function validateGlobalDataTagInput(tags: GlobalDataTag[]): string | undefined {
  const seen = new Set<string>([]);
  const duplicates: string[] = [];
  const namesWithSpaces: string[] = [];
  const errors: string[] = [];

  for (const tag of tags) {
    if (/\s/.test(tag.name)) {
      namesWithSpaces.push(`'${tag.name}'`);
    }

    if (!seen.has(tag.name.trim())) {
      seen.add(tag.name.trim());
    } else {
      duplicates.push(`'${tag.name.trim()}'`);
    }
  }

  if (duplicates.length !== 0) {
    errors.push(
      `Found duplicate tag names: [${duplicates.join(', ')}], duplicate tag names are not allowed.`
    );
  }
  if (namesWithSpaces.length !== 0) {
    errors.push(
      `Found tag names with spaces: [${namesWithSpaces.join(
        ', '
      )}], tag names with spaces are not allowed.`
    );
  }

  if (errors.length !== 0) {
    return errors.join(' ');
  }
}

const BaseSSLSchema = schema.object({
  verification_mode: schema.maybe(schema.string()),
  certificate_authorities: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 10 })),
  certificate: schema.maybe(schema.string()),
  key: schema.maybe(schema.string()),
  renegotiation: schema.maybe(schema.string()),
});

const BaseSecretsSchema = schema
  .object({
    ssl: schema.maybe(
      schema.object({
        key: schema.object({
          id: schema.maybe(schema.string()),
        }),
      })
    ),
  })
  .extendsDeep({
    unknowns: 'allow',
  });

export const AgentPolicySchemaV3 = schema
  .object({
    ...AgentPolicyBaseSchema,
  })
  .extends(
    {
      has_agent_version_conditions: schema.maybe(schema.boolean()),
    },
    { meta: { id: 'agent_policy_v3' } }
  );

export const AgentPolicySchemaV4 = AgentPolicySchemaV3.extends(
  {
    min_agent_version: schema.maybe(schema.nullable(schema.string())),
    package_agent_version_conditions: schema.maybe(
      schema.nullable(
        schema.arrayOf(
          schema.object({
            name: schema.string(),
            title: schema.string(),
            version_condition: schema.string(),
          }),
          { maxSize: 1000 }
        )
      )
    ),
  },
  { meta: { id: 'agent_policy_v4' } }
);

export const AgentPolicySchemaV5 = AgentPolicySchemaV4.extends(
  {
    is_verifier: schema.maybe(schema.boolean()),
  },
  { meta: { id: 'agent_policy_v5' } }
);

export const AgentPolicySchemaV6 = AgentPolicySchemaV5.extends(
  {
    agentless: schema.maybe(
      schema.object({
        cloud_connectors: schema.maybe(
          schema.object({
            target_csp: schema.maybe(
              schema.oneOf([schema.literal('aws'), schema.literal('azure'), schema.literal('gcp')])
            ),
            enabled: schema.boolean(),
          })
        ),
        resources: schema.maybe(
          schema.object({
            requests: schema.maybe(
              schema.object({
                memory: schema.maybe(schema.string({ validate: validateMemory })),
                cpu: schema.maybe(schema.string({ validate: validateCPU })),
              })
            ),
          })
        ),
        cluster_id: schema.maybe(schema.string()),
      })
    ),
  },
  { meta: { id: 'agent_policy_v6' } }
);

export const AgentPolicySchemaV7 = AgentPolicySchemaV6.extends(
  {
    is_preconfigured: schema.maybe(schema.boolean()),
    revision: schema.maybe(schema.number()),
    schema_version: schema.maybe(schema.string()),
    status: schema.maybe(
      schema.oneOf([
        schema.literal(agentPolicyStatuses.Active),
        schema.literal(agentPolicyStatuses.Inactive),
      ])
    ),
    updated_at: schema.maybe(schema.string()),
    updated_by: schema.maybe(schema.string()),
  },
  { meta: { id: 'agent_policy_v7' } }
);

export const NewAgentPolicySchema = AgentPolicySchemaV6.extends(
  {
    supports_agentless: schema.maybe(
      schema.oneOf([
        schema.literal(null),
        schema.boolean({
          defaultValue: false,
          meta: {
            description:
              'Indicates whether the agent policy supports agentless integrations. Deprecated in favor of the Fleet managed integrations API.',
            deprecated: true,
          },
        }),
      ])
    ),
    force: schema.maybe(schema.boolean()),
  },
  { meta: { id: 'new_agent_policy' } }
);

export const AgentPolicySchema = AgentPolicySchemaV6.extends(
  {
    id: schema.string(),
    is_managed: schema.maybe(schema.boolean()),
    status: schema.oneOf([
      schema.literal(agentPolicyStatuses.Active),
      schema.literal(agentPolicyStatuses.Inactive),
    ]),
    package_policies: schema.maybe(
      schema.oneOf([
        schema.arrayOf(schema.string(), { maxSize: 1000 }),
        schema.arrayOf(PackagePolicySchema, { maxSize: 1000 }),
      ])
    ),
    updated_at: schema.string(),
    updated_by: schema.string(),
  },
  { meta: { id: 'agent_policy' } }
);

export const AgentPolicyResponseSchema = AgentPolicySchema.extends(
  {
    revision: schema.number(),
    agents: schema.maybe(schema.number()),
    unprivileged_agents: schema.maybe(schema.number()),
    fips_agents: schema.maybe(schema.number()),
    agents_per_version: schema.maybe(
      schema.arrayOf(
        schema.object({
          version: schema.string(),
          count: schema.number(),
        }),
        { maxSize: 1000 }
      )
    ),
    is_protected: schema.boolean({
      meta: {
        description:
          'Indicates whether the agent policy has tamper protection enabled. Defaults to `false`.',
      },
    }),
    version: schema.maybe(schema.string()),
    is_preconfigured: schema.maybe(schema.boolean()),
    schema_version: schema.maybe(schema.string()),
    min_agent_version: schema.maybe(schema.nullable(schema.string())),
    package_agent_version_conditions: schema.maybe(
      schema.nullable(
        schema.arrayOf(
          schema.object({
            name: schema.string(),
            title: schema.string(),
            version_condition: schema.string(),
          }),
          { maxSize: 1000 }
        )
      )
    ),
    created_at: schema.maybe(schema.string()),
    package_policies: schema.maybe(
      schema.oneOf([
        schema.arrayOf(schema.string(), { maxSize: 10000 }),
        schema.arrayOf(PackagePolicyResponseSchema, {
          meta: {
            description:
              'This field is present only when retrieving a single agent policy, or when retrieving a list of agent policies with the `?full=true` parameter',
          },
          maxSize: 10000,
        }),
      ])
    ),
  },
  { meta: { id: 'agent_policy_response' } }
);

export const GetAgentPolicyResponseSchema = schema.object(
  { item: AgentPolicyResponseSchema },
  { meta: { id: 'get_agent_policy_response' } }
);

export const OTelCollectorPipelineIDSchema = schema.oneOf([
  schema.literal('logs'),
  schema.literal('metrics'),
  schema.literal('traces'),
  schema.string(),
]);

export const OTelCollectorPipelineSchema = schema.maybe(
  schema.object({
    receivers: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 1000 })),
    processors: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 1000 })),
    exporters: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 1000 })),
  })
);
export const OtelCollectorConfigSchema = {
  extensions: schema.maybe(schema.recordOf(schema.string(), schema.any())),
  receivers: schema.maybe(schema.recordOf(schema.string(), schema.any())),
  processors: schema.maybe(schema.recordOf(schema.string(), schema.any())),
  connectors: schema.maybe(schema.recordOf(schema.string(), schema.any())),
  exporters: schema.maybe(schema.recordOf(schema.string(), schema.any())),
  service: schema.maybe(
    schema.object({
      extensions: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 1000 })),
      pipelines: schema.maybe(
        schema.recordOf(OTelCollectorPipelineIDSchema, OTelCollectorPipelineSchema)
      ),
    })
  ),
};

export const FullAgentPolicyResponseSchema = schema.object(
  {
    id: schema.string(),
    namespaces: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
    outputs: schema
      .recordOf(
        schema.string(),
        schema.object({
          type: schema.string(),
          hosts: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
          ca_sha256: schema.maybe(schema.oneOf([schema.literal(null), schema.string()])),
          proxy_url: schema.maybe(schema.string()),
          proxy_headers: schema.maybe(ProxyHeadersSchema),
        })
      )
      .extendsDeep({
        unknowns: 'allow',
      }),
    output_permissions: schema.maybe(
      schema.recordOf(schema.string(), schema.recordOf(schema.string(), schema.any()))
    ),
    fleet: schema.maybe(
      schema.oneOf([
        schema.object({
          hosts: schema.arrayOf(schema.string(), { maxSize: 100 }),
          proxy_url: schema.maybe(schema.string()),
          proxy_headers: schema.maybe(ProxyHeadersSchema),
          ssl: schema.maybe(BaseSSLSchema),
          secrets: schema.maybe(BaseSecretsSchema),
        }),
        schema.object({
          kibana: schema.object({
            hosts: schema.arrayOf(schema.string(), { maxSize: 100 }),
            protocol: schema.string(),
            path: schema.maybe(schema.string()),
          }),
        }),
      ])
    ),
    inputs: schema.arrayOf(
      schema
        .object({
          id: schema.string(),
          name: schema.string(),
          revision: schema.number(),
          type: schema.string(),
          data_stream: schema.object({
            namespace: schema.string(),
          }),
          use_output: schema.string(),
          package_policy_id: schema.string(),
          meta: schema.maybe(
            schema.object({
              package: schema
                .maybe(
                  schema.object({
                    name: schema.string(),
                    version: schema.string(),
                  })
                )
                .extendsDeep({
                  unknowns: 'allow',
                }),
            })
          ),
          streams: schema.maybe(
            schema
              .arrayOf(
                schema.object({
                  id: schema.string(),
                  data_stream: schema.object({
                    dataset: schema.string(),
                    type: schema.maybe(schema.string()),
                  }),
                }),
                { maxSize: 10000 }
              )
              .extendsDeep({
                unknowns: 'allow',
              })
          ),
          processors: schema.maybe(
            schema.arrayOf(
              schema.object({
                add_fields: schema.object({
                  target: schema.string(),
                  fields: schema.recordOf(
                    schema.string(),
                    schema.oneOf([schema.string(), schema.number()])
                  ),
                }),
              }),
              { maxSize: 10000 }
            )
          ),
        })
        .extendsDeep({
          unknowns: 'allow',
        }),
      { maxSize: 10000 }
    ),
    revision: schema.maybe(schema.number()),
    agent: schema.maybe(
      schema.object({
        monitoring: schema.object({
          namespace: schema.maybe(schema.string()),
          use_output: schema.maybe(schema.string()),
          enabled: schema.boolean(),
          metrics: schema.boolean(),
          logs: schema.boolean(),
          traces: schema.boolean(),
          apm: schema.maybe(schema.any()),
          _runtime_experimental: schema.maybe(schema.string()),
          pprof: schema.maybe(
            schema.object({
              enabled: schema.boolean(),
            })
          ),
          http: schema.maybe(
            schema.object({
              enabled: schema.maybe(schema.boolean()),
              host: schema.maybe(schema.string()),
              port: schema.maybe(schema.number()),
            })
          ),
          diagnostics: schema.maybe(
            schema.object({
              limit: schema.maybe(
                schema.object({
                  interval: schema.maybe(schema.string()),
                  burst: schema.maybe(schema.number()),
                })
              ),
              uploader: schema.maybe(
                schema.object({
                  max_retries: schema.maybe(schema.number()),
                  init_dur: schema.maybe(schema.string()),
                  max_dur: schema.maybe(schema.string()),
                })
              ),
            })
          ),
        }),
        download: schema.object({
          sourceURI: schema.string(),
          sources: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 3 })),
          ssl: schema.maybe(BaseSSLSchema),
          auth: schema.maybe(
            schema.object({
              username: schema.maybe(schema.string()),
              password: schema.maybe(schema.string()),
              api_key: schema.maybe(schema.string()),
              headers: schema.maybe(
                schema.arrayOf(schema.object({ key: schema.string(), value: schema.string() }), {
                  maxSize: 100,
                })
              ),
            })
          ),
          secrets: schema.maybe(BaseSecretsSchema),
          timeout: schema.maybe(schema.string()),
          target_directory: schema.maybe(schema.string()),
          proxy_url: schema.maybe(schema.string()),
          proxy_headers: schema.maybe(ProxyHeadersSchema),
        }),
        features: schema.recordOf(
          schema.string(),
          schema.object({
            enabled: schema.boolean(),
          })
        ),
        protection: schema.maybe(
          schema.object({
            enabled: schema.boolean(),
            uninstall_token_hash: schema.string(),
            signing_key: schema.string(),
          })
        ),
        logging: schema.maybe(
          schema.object({
            level: schema.maybe(schema.string()),
            to_files: schema.maybe(schema.boolean()),
            files: schema.maybe(
              schema.object({
                rotateeverybytes: schema.maybe(schema.number()),
                keepfiles: schema.maybe(schema.number()),
                interval: schema.maybe(schema.string()),
              })
            ),
            metrics: schema.maybe(
              schema.object({
                period: schema.maybe(schema.string()),
              })
            ),
          })
        ),
        limits: schema.maybe(
          schema.object({
            go_max_procs: schema.maybe(schema.number()),
          })
        ),
        internal: schema.maybe(schema.any()),
      })
    ),
    secret_references: schema.maybe(
      schema.arrayOf(
        schema.object({
          id: schema.string(),
        }),
        { maxSize: 10000 }
      )
    ),
    signed: schema.maybe(
      schema.object({
        data: schema.string(),
        signature: schema.string(),
      })
    ),
    ...OtelCollectorConfigSchema,
  },
  { meta: { id: 'full_agent_policy' } }
);
const MinimalOutputSchema = schema.object({
  id: schema.string(),
  name: schema.string(),
});

const IntegrationsOutputSchema = schema.arrayOf(
  schema.object({
    pkgName: schema.maybe(schema.string()),
    integrationPolicyName: schema.maybe(schema.string()),
    id: schema.maybe(schema.string()),
    name: schema.maybe(schema.string()),
  }),
  { maxSize: 1000 }
);

const OutputsForAgentPolicySchema = schema.object({
  agentPolicyId: schema.maybe(schema.string()),
  monitoring: schema.object({
    output: MinimalOutputSchema,
  }),
  data: schema.object({
    output: MinimalOutputSchema,
    integrations: schema.maybe(IntegrationsOutputSchema),
  }),
});

export const GetAgentPolicyOutputsResponseSchema = schema.object(
  { item: OutputsForAgentPolicySchema },
  { meta: { id: 'get_agent_policy_outputs_response' } }
);

export const GetListAgentPolicyOutputsResponseSchema = schema.object(
  { items: schema.arrayOf(OutputsForAgentPolicySchema, { maxSize: 10000 }) },
  { meta: { id: 'get_list_agent_policy_outputs_response' } }
);
