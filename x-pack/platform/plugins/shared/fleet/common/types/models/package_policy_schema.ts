/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

import { isValidNamespace } from '../../services';
import { MAX_REUSABLE_AGENT_POLICIES_PER_PACKAGE_POLICY } from '../../constants/package_policy';

export const PackagePolicyNamespaceSchema = schema.string({
  validate: (value) => {
    const namespaceValidation = isValidNamespace(value || '', true);
    if (!namespaceValidation.valid && namespaceValidation.error) {
      return namespaceValidation.error;
    }
  },
  meta: {
    description:
      "The package policy namespace. Leave blank to inherit the agent policy's namespace.",
  },
});

export const ConfigRecordSchema = schema.recordOf(
  schema.string(),
  schema.object({
    type: schema.maybe(schema.string()),
    value: schema.maybe(schema.any()),
    frozen: schema.maybe(schema.boolean()),
  }),
  {
    meta: {
      description: 'Package variable (see integration documentation for more information)',
    },
  }
);

export const VarGroupSelectionsSchema = schema.maybe(
  schema.recordOf(schema.string(), schema.string(), {
    meta: {
      description:
        'Variable group selections. Maps var_group name to the selected option name within that group.',
    },
  })
);

export const DeprecationInfoSchema = schema.object(
  {
    description: schema.string(),
    since: schema.maybe(schema.string()),
    replaced_by: schema.maybe(
      schema.recordOf(
        schema.oneOf([
          schema.literal('package'),
          schema.literal('policyTemplate'),
          schema.literal('input'),
          schema.literal('dataStream'),
          schema.literal('variable'),
        ]),
        schema.string()
      )
    ),
  },
  { meta: { id: 'deprecation_info' } }
);

const PackagePolicyStreamsSchema = {
  id: schema.maybe(schema.string()), // BWC < 7.11
  enabled: schema.boolean(),
  keep_enabled: schema.maybe(schema.boolean()),
  release: schema.maybe(
    schema.oneOf([schema.literal('ga'), schema.literal('beta'), schema.literal('experimental')])
  ),
  data_stream: schema.object({
    dataset: schema.string(),
    type: schema.maybe(schema.string()),
    elasticsearch: schema.maybe(
      schema.object({
        privileges: schema.maybe(
          schema.object({
            indices: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
          })
        ),
        dynamic_dataset: schema.maybe(schema.boolean()),
        dynamic_namespace: schema.maybe(schema.boolean()),
      })
    ),
  }),
  vars: schema.maybe(ConfigRecordSchema),
  var_group_selections: VarGroupSelectionsSchema,
  config: schema.maybe(ConfigRecordSchema),
  compiled_stream: schema.maybe(schema.any()),
  condition: schema.maybe(
    schema.nullable(
      schema.string({
        maxLength: 10000,
        meta: {
          description: 'Agent condition expression to evaluate whether to apply this stream.',
        },
      })
    )
  ),
  deprecated: schema.maybe(DeprecationInfoSchema),
  migrate_from: schema.maybe(schema.string()),
};

export const PackagePolicyInputsSchema = {
  id: schema.maybe(schema.string()),
  name: schema.maybe(schema.string()),
  type: schema.string(),
  policy_template: schema.maybe(schema.string()),
  enabled: schema.boolean(),
  keep_enabled: schema.maybe(schema.boolean()),
  vars: schema.maybe(ConfigRecordSchema),
  var_group_selections: VarGroupSelectionsSchema,
  config: schema.maybe(ConfigRecordSchema),
  streams: schema.arrayOf(schema.object(PackagePolicyStreamsSchema), { maxSize: 1000 }),
  condition: schema.maybe(
    schema.nullable(
      schema.string({
        maxLength: 10000,
        meta: {
          description: 'Agent condition expression to evaluate whether to apply this input.',
        },
      })
    )
  ),
  deprecated: schema.maybe(DeprecationInfoSchema),
  migrate_from: schema.maybe(schema.string()),
};

export const ExperimentalDataStreamFeaturesSchema = schema.arrayOf(
  schema.object({
    data_stream: schema.string(),
    features: schema.object({
      synthetic_source: schema.maybe(schema.boolean({ defaultValue: false })),
      tsdb: schema.maybe(schema.boolean({ defaultValue: false })),
      doc_value_only_numeric: schema.maybe(schema.boolean({ defaultValue: false })),
      doc_value_only_other: schema.maybe(schema.boolean({ defaultValue: false })),
    }),
  }),
  { maxSize: 100 }
);

export const PackagePolicyPackageSchema = schema.object(
  {
    name: schema.string({
      meta: {
        description: 'Package name',
      },
    }),
    title: schema.maybe(schema.string()),
    version: schema.string({
      meta: {
        description: 'Package version',
      },
    }),
    experimental_data_stream_features: schema.maybe(ExperimentalDataStreamFeaturesSchema),
    requires_root: schema.maybe(schema.boolean()),
    fips_compatible: schema.maybe(schema.boolean()),
  },
  { meta: { id: 'package_policy_package' } }
);

export const PackagePolicyBaseSchema = {
  name: schema.string({
    meta: {
      description: 'Unique name for the package policy.',
    },
  }),
  description: schema.maybe(
    schema.string({
      meta: {
        description: 'Package policy description',
      },
    })
  ),
  namespace: schema.maybe(PackagePolicyNamespaceSchema),
  policy_id: schema.maybe(
    schema.oneOf([
      schema.literal(null),
      schema.string({
        meta: {
          description: 'ID of the agent policy which the package policy will be added to.',
          deprecated: true,
        },
      }),
    ])
  ),
  policy_ids: schema.maybe(
    schema.arrayOf(
      schema.string({
        meta: {
          description: 'IDs of the agent policies that the package policy will be added to.',
        },
      }),
      {
        maxSize: MAX_REUSABLE_AGENT_POLICIES_PER_PACKAGE_POLICY,
      }
    )
  ),
  output_id: schema.maybe(schema.oneOf([schema.literal(null), schema.string()])),
  cloud_connector_id: schema.maybe(
    schema.nullable(
      schema.string({
        meta: {
          description: 'ID of the cloud connector associated with this package policy.',
        },
      })
    )
  ),
  cloud_connector_name: schema.maybe(
    schema.nullable(
      schema.string({
        minLength: 1,
        maxLength: 255,
        meta: {
          description: 'Transient field for cloud connector name during creation.',
        },
      })
    )
  ),
  enabled: schema.boolean(),
  is_managed: schema.maybe(schema.boolean()),
  package: schema.maybe(PackagePolicyPackageSchema),

  inputs: schema.arrayOf(schema.object(PackagePolicyInputsSchema), { maxSize: 1000 }),
  vars: schema.maybe(ConfigRecordSchema),
  var_group_selections: VarGroupSelectionsSchema,
  overrides: schema.maybe(
    schema.oneOf([
      schema.literal(null),
      schema.object(
        {
          inputs: schema.maybe(
            schema.recordOf(schema.string(), schema.any(), {
              validate: (val) => {
                if (
                  Object.keys(val).some(
                    (key) =>
                      key.match(/^compiled_inputs(\.)?/) || key.match(/^compiled_stream(\.)?/)
                  )
                ) {
                  return 'Overrides of compiled_inputs and compiled_stream are not allowed';
                }
              },
            })
          ),
        },
        {
          meta: {
            description:
              'Override settings that are defined in the package policy. The override option should be used only in unusual circumstances and not as a routine procedure.',
          },
        }
      ),
    ])
  ),
  supports_agentless: schema.maybe(
    schema.nullable(
      schema.boolean({
        defaultValue: false,
        meta: {
          description: 'Indicates whether the package policy belongs to an agentless agent policy.',
        },
      })
    )
  ),
  supports_cloud_connector: schema.maybe(
    schema.nullable(
      schema.boolean({
        defaultValue: false,
        meta: {
          description: 'Indicates whether the package policy supports cloud connectors.',
        },
      })
    )
  ),
  additional_datastreams_permissions: schema.maybe(
    schema.oneOf([
      schema.literal(null),
      schema.arrayOf(schema.string(), {
        validate: validateAdditionalDatastreamsPermissions,
        meta: {
          description: 'Additional data stream permissions that will be added to the agent policy.',
        },
        maxSize: 1000,
      }),
    ])
  ),
  package_agent_version_condition: schema.maybe(schema.string()),
  condition: schema.maybe(
    schema.nullable(
      schema.string({
        maxLength: 10000,
        meta: {
          description:
            'Agent condition expression to evaluate whether to apply this integration to its inputs.',
        },
      })
    )
  ),
  // Only available for agentless integration policies.
  // On standard package policies this field is rejected by server-side validation.
  global_data_tags: schema.maybe(
    schema.oneOf([
      schema.literal(null),
      schema.arrayOf(
        schema.object({
          name: schema.string({
            meta: { description: 'The name of the custom field. Cannot contain spaces.' },
          }),
          value: schema.oneOf([schema.string(), schema.number()], {
            meta: { description: 'The value of the custom field.' },
          }),
        }),
        { maxSize: 100 }
      ),
    ])
  ),
};

export const NewPackagePolicySchema = schema.object(
  {
    ...PackagePolicyBaseSchema,
    id: schema.maybe(schema.string()),
    force: schema.maybe(schema.boolean()),
  },
  { meta: { id: 'new_package_policy' } }
);

const CreatePackagePolicyProps = {
  ...PackagePolicyBaseSchema,
  enabled: schema.maybe(schema.boolean()),
  package: schema.maybe(PackagePolicyPackageSchema),
  inputs: schema.arrayOf(
    schema.object({
      ...PackagePolicyInputsSchema,
      streams: schema.maybe(
        schema.arrayOf(schema.object(PackagePolicyStreamsSchema), { maxSize: 1000 })
      ),
    }),
    { maxSize: 1000 }
  ),
  spaceIds: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
};

export const CreatePackagePolicyRequestBodySchema = schema.object(
  {
    ...CreatePackagePolicyProps,
    id: schema.maybe(
      schema.string({
        meta: {
          description: 'Package policy unique identifier',
        },
      })
    ),
    create_dataset_templates: schema.maybe(
      schema.boolean({
        meta: {
          description:
            'When true, install dedicated index templates for streams with a custom data_stream.dataset. Defaults to true for input packages, false for integration packages.',
        },
      })
    ),
    force: schema.maybe(
      schema.boolean({
        meta: {
          description:
            'Force package policy creation even if the package is not verified, or if the agent policy is managed.',
        },
      })
    ),
    // supports_agentless is deprecated for package policy creation in favor of agentless policies API
    supports_agentless: schema.maybe(
      schema.nullable(
        schema.boolean({
          defaultValue: false,
          meta: {
            description:
              'Indicates whether the package policy belongs to an agentless agent policy. Deprecated in favor of the Fleet agentless policies API.',
            deprecated: true,
          },
        })
      )
    ),
  },
  { meta: { id: 'create_package_policy_request' } }
);

export const SimplifiedVarsSchema = schema.recordOf(
  schema.string(),
  schema.nullable(
    schema.oneOf([
      schema.string(),
      schema.number(),
      schema.boolean(),
      schema.arrayOf(schema.string(), { maxSize: 100 }),
      schema.arrayOf(schema.number(), { maxSize: 100 }),
      // Secrets
      schema.object({
        id: schema.string(),
        isSecretRef: schema.boolean(),
      }),
    ])
  ),
  {
    meta: {
      description:
        'Input/stream level variable. Refer to the integration documentation for more information.',
    },
  }
);

export const SimplifiedPackagePolicyInputRecordSchema = schema.recordOf(
  schema.string({ maxLength: 1024 }),
  schema.object({
    enabled: schema.maybe(
      schema.boolean({
        meta: {
          description: 'Enable or disable that input. Defaults to `true` (enabled).',
        },
      })
    ),
    deprecated: schema.maybe(DeprecationInfoSchema),
    vars: schema.maybe(SimplifiedVarsSchema),
    condition: schema.maybe(
      schema.nullable(
        schema.string({
          maxLength: 10000,
          meta: {
            description: 'Agent condition expression to evaluate whether to apply this input.',
          },
        })
      )
    ),
    streams: schema.maybe(
      schema.recordOf(
        schema.string({ maxLength: 1024 }),
        schema.object({
          enabled: schema.maybe(
            schema.boolean({
              meta: {
                description: 'Enable or disable that stream. Defaults to `true` (enabled).',
              },
            })
          ),
          vars: schema.maybe(SimplifiedVarsSchema),
          var_group_selections: VarGroupSelectionsSchema,
          deprecated: schema.maybe(DeprecationInfoSchema),
          condition: schema.maybe(
            schema.nullable(
              schema.string({
                maxLength: 10000,
                meta: {
                  description:
                    'Agent condition expression to evaluate whether to apply this stream.',
                },
              })
            )
          ),
        }),
        {
          meta: {
            description:
              'Input streams. Refer to the integration documentation to know which streams are available.',
          },
        }
      )
    ),
  }),
  {
    meta: {
      description:
        'Package policy inputs. Refer to the integration documentation to know which inputs are available.',
    },
  }
);

export const SimplifiedPackagePolicyInputsSchema = schema.maybe(
  SimplifiedPackagePolicyInputRecordSchema
);

const VALIDATE_DATASTREAMS_PERMISSION_REGEX =
  /^(logs)|(metrics)|(traces)|(synthetics)|(profiles)-(.*)$/;

function validateAdditionalDatastreamsPermissions(values: string[]) {
  for (const val of values) {
    if (!val.match(VALIDATE_DATASTREAMS_PERMISSION_REGEX)) {
      return `${val} is not a valid datastream permissions, it should match logs|metrics|traces|synthetics|profiles)-*`;
    }
  }
}

export const SimplifiedPackagePolicyBaseSchema = schema.object(
  {
    id: schema.maybe(
      schema.string({
        meta: {
          description: 'Policy unique identifier.',
        },
      })
    ),
    name: schema.string({
      meta: {
        description: 'Unique name for the policy.',
      },
    }),
    description: schema.maybe(
      schema.string({
        meta: {
          description: 'Policy description.',
        },
      })
    ),
    namespace: schema.maybe(
      schema.string({
        meta: {
          description:
            'Policy namespace. When not specified, it inherits the agent policy namespace.',
        },
      })
    ),
    output_id: schema.maybe(schema.oneOf([schema.literal(null), schema.string()])),
    vars: schema.maybe(SimplifiedVarsSchema),
    var_group_selections: VarGroupSelectionsSchema,
    inputs: SimplifiedPackagePolicyInputsSchema,
    supports_agentless: schema.maybe(
      schema.nullable(
        schema.boolean({
          defaultValue: false,
          meta: {
            description:
              'Indicates whether the package policy belongs to an agentless agent policy.',
          },
        })
      )
    ),
    additional_datastreams_permissions: schema.maybe(
      schema.oneOf([
        schema.literal(null),
        schema.arrayOf(schema.string(), {
          validate: validateAdditionalDatastreamsPermissions,
          meta: {
            description:
              'Additional data stream permissions that will be added to the agent policy.',
          },
          maxSize: 100,
        }),
      ])
    ),
    condition: schema.maybe(
      schema.nullable(
        schema.string({
          maxLength: 10000,
          meta: {
            description:
              'Agent condition expression to evaluate whether to apply this integration to its inputs.',
          },
        })
      )
    ),
  },
  { meta: { id: 'simplified_package_policy_base' } }
);

export const SimplifiedPackagePolicyPreconfiguredSchema = SimplifiedPackagePolicyBaseSchema.extends(
  {
    id: schema.string(),
    package: schema.object({
      name: schema.string(),
    }),
  },
  { meta: { id: 'simplified_package_policy_preconfigured' } }
);

export const SimplifiedCreatePackagePolicyRequestBodySchema =
  SimplifiedPackagePolicyBaseSchema.extends(
    {
      policy_id: schema.maybe(
        schema.oneOf([schema.literal(null), schema.string()], {
          meta: {
            description: 'Deprecated. Use policy_ids instead.',
            deprecated: true,
          },
        })
      ),
      policy_ids: schema.maybe(
        schema.arrayOf(schema.string(), {
          meta: {
            description: 'IDs of the agent policies that the package policy will be added to.',
          },
          maxSize: MAX_REUSABLE_AGENT_POLICIES_PER_PACKAGE_POLICY,
        })
      ),
      force: schema.maybe(
        schema.boolean({
          meta: {
            description:
              'Force package policy creation even if the package is not verified, or if the agent policy is managed.',
          },
        })
      ),
      package: PackagePolicyPackageSchema,
      // supports_agentless is deprecated for package policy creation in favor of agentless policies API
      supports_agentless: schema.maybe(
        schema.nullable(
          schema.boolean({
            defaultValue: false,
            meta: {
              description:
                'Indicates whether the package policy belongs to an agentless agent policy. Deprecated in favor of the Fleet agentless policies API.',
              deprecated: true,
            },
          })
        )
      ),
      create_dataset_templates: schema.maybe(
        schema.boolean({
          meta: {
            description:
              'When true, install dedicated index templates for streams with a custom data_stream.dataset. Defaults to true for input packages, false for integration packages.',
          },
        })
      ),
    },
    { meta: { id: 'simplified_create_package_policy_request' } }
  );

export const UpdatePackagePolicyRequestBodySchema = schema.object(
  {
    ...CreatePackagePolicyProps,
    name: schema.maybe(schema.string()),
    inputs: schema.maybe(
      schema.arrayOf(
        schema.object({
          ...PackagePolicyInputsSchema,
          streams: schema.maybe(
            schema.arrayOf(schema.object(PackagePolicyStreamsSchema), { maxSize: 1000 })
          ),
        }),
        { maxSize: 1000 }
      )
    ),
    version: schema.maybe(schema.string()),
    force: schema.maybe(schema.boolean()),
  },
  { meta: { id: 'update_package_policy_request' } }
);

export const UpdatePackagePolicySchema = schema.object(
  {
    ...PackagePolicyBaseSchema,
    version: schema.maybe(schema.string()),
  },
  { meta: { id: 'update_package_policy' } }
);

export const PackagePolicySchema = schema.object(
  {
    ...PackagePolicyBaseSchema,
    id: schema.string({
      meta: {
        description: 'Package policy unique identifier.',
      },
    }),
    version: schema.maybe(
      schema.string({
        meta: {
          description: 'Package policy ES version.',
        },
      })
    ),
    revision: schema.number({
      meta: {
        description: 'Package policy revision.',
      },
    }),
    updated_at: schema.string(),
    updated_by: schema.string(),
    created_at: schema.string(),
    created_by: schema.string(),
    elasticsearch: schema
      .maybe(
        schema.object({
          privileges: schema.maybe(
            schema.object({
              cluster: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
            })
          ),
        })
      )
      .extendsDeep({
        unknowns: 'allow',
      }),
    inputs: schema.arrayOf(
      schema.object({
        ...PackagePolicyInputsSchema,
        compiled_input: schema.maybe(schema.any()),
      }),
      { maxSize: 100 }
    ),
    secret_references: schema.maybe(
      schema.arrayOf(
        schema.object({
          id: schema.string(),
        }),
        { maxSize: 1000 }
      )
    ),
  },
  { meta: { id: 'package_policy' } }
);

/**
 * Snapshot of the package policy SO schema as of model version 10.22.0.
 * Permissive on enabled, inputs, and package so the SO layer can store
 * internal shapes (e.g. compiled_input, minimal fixtures). Based on
 * NewPackagePolicySchema rather than PackagePolicySchema — this is intentional
 * to preserve the schema hash; do not modify.
 */
export const PackagePolicySchemaV22 = NewPackagePolicySchema.extends(
  {
    enabled: schema.maybe(schema.boolean()),
    inputs: schema.maybe(schema.arrayOf(schema.any(), { maxSize: 1000 })),
    package: schema.maybe(schema.any()),
    global_data_tags: undefined,
    condition: undefined,
  },
  { unknowns: 'ignore' }
);

/**
 * Snapshot of the package policy SO schema as of model version 10.23.0.
 * Adds `global_data_tags` — excluded from V22 to preserve its hash.
 * Do not modify.
 */
export const PackagePolicySchemaV23 = PackagePolicySchemaV22.extends(
  {
    global_data_tags: NewPackagePolicySchema.getPropSchemas().global_data_tags,
  },
  { unknowns: 'ignore' }
);

/**
 * Snapshot of the package policy SO schema as of model version 10.24.0.
 * Re-introduces the `condition` field at the integration level — V22/V23 excluded it
 * to preserve their hashes when `condition` was added to PackagePolicyBaseSchema.
 * Do not modify.
 */
export const PackagePolicySchemaV24 = PackagePolicySchemaV23.extends(
  {
    condition: NewPackagePolicySchema.getPropSchemas().condition,
  },
  { unknowns: 'ignore' }
);

/**
 * Snapshot of the package policy SO schema as of model version 10.25.0.
 * Re-bases on PackagePolicySchema (the full stored shape) rather than the
 * create-API schema used by V22–V24, ensuring all indexed mapping fields are
 * covered. V22–V24 remain frozen.
 */
export const PackagePolicySchemaV25 = PackagePolicySchema.extends(
  {
    // id is the SO document ID — not stored in SO attributes.
    id: schema.maybe(schema.string({ maxLength: 255 })),
    // Internal SO mapping fields absent from the public API schema.
    bump_agent_policy_revision: schema.maybe(schema.boolean()),
    // May be absent in SOs created before the field was introduced.
    latest_revision: schema.maybe(schema.boolean()),
  },
  { unknowns: 'ignore' }
);

export const PackagePolicyResponseSchema = PackagePolicySchema.extends(
  {
    vars: schema.maybe(
      schema.oneOf([ConfigRecordSchema, schema.maybe(SimplifiedVarsSchema)], {
        meta: {
          description: 'Package level variable.',
        },
      })
    ),
    inputs: schema.oneOf(
      [
        schema.arrayOf(
          schema.object({
            ...PackagePolicyInputsSchema,
            compiled_input: schema.maybe(schema.any()),
          }),
          { maxSize: 100 }
        ),
        SimplifiedPackagePolicyInputsSchema,
      ],
      {
        meta: {
          description: 'Package policy inputs.',
        },
      }
    ),
    spaceIds: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
    agents: schema.maybe(schema.number()),
  },
  { meta: { id: 'package_policy_response' } }
);

export const OrphanedPackagePoliciesResponseSchema = schema.object(
  {
    items: schema.arrayOf(PackagePolicyResponseSchema, { maxSize: 10000 }),
    total: schema.number(),
  },
  { meta: { id: 'orphaned_package_policies_response' } }
);

export const DryRunPackagePolicySchema = PackagePolicySchema.extends(
  {
    id: schema.maybe(schema.string()),
    force: schema.maybe(schema.boolean()),
    revision: schema.maybe(schema.number()),
    updated_at: schema.maybe(schema.string()),
    updated_by: schema.maybe(schema.string()),
    created_at: schema.maybe(schema.string()),
    created_by: schema.maybe(schema.string()),
    errors: schema.maybe(
      schema.arrayOf(
        schema.object({
          message: schema.string(),
          key: schema.maybe(schema.string()),
        }),
        { maxSize: 10 }
      )
    ),
    missingVars: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
  },
  {
    unknowns: 'allow',
    meta: { id: 'dry_run_package_policy' },
  }
);

export const PackagePolicyStatusResponseSchema = schema.object(
  {
    id: schema.string(),
    success: schema.boolean(),
    name: schema.maybe(schema.string()),
    statusCode: schema.maybe(schema.number()),
    body: schema.maybe(schema.object({ message: schema.string() })),
  },
  { meta: { id: 'package_policy_status_response' } }
);
