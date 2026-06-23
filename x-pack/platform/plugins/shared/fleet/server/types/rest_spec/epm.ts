/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

import {
  DeprecationInfoSchema,
  ExperimentalDataStreamFeaturesSchema,
} from '../models/package_policy';
import { OtelCollectorConfigSchema } from '../models';

export const GetCategoriesRequestSchema = {
  query: schema.object({
    prerelease: schema.maybe(
      schema.boolean({
        meta: { description: 'When true, include prerelease packages in the results' },
      })
    ),
    include_policy_templates: schema.maybe(
      schema.boolean({
        meta: { description: 'When true, include categories that only contain policy templates' },
      })
    ),
  }),
};

const CategorySummaryItemSchema = schema.object(
  {
    id: schema.string(),
    title: schema.string(),
    count: schema.number(),
    parent_id: schema.maybe(schema.string()),
    parent_title: schema.maybe(schema.string()),
  },
  { meta: { id: 'category_summary_item' } }
);

export const GetCategoriesResponseSchema = schema.object(
  { items: schema.arrayOf(CategorySummaryItemSchema, { maxSize: 10000 }) },
  { meta: { id: 'get_categories_response' } }
);

export const GetPackagesRequestSchema = {
  query: schema.object({
    category: schema.maybe(schema.string({ meta: { description: 'Filter packages by category' } })),
    prerelease: schema.maybe(
      schema.boolean({
        meta: { description: 'When true, include prerelease packages in the results' },
      })
    ),
    excludeInstallStatus: schema.maybe(
      schema.boolean({
        defaultValue: false,
        meta: { description: 'When true, exclude the install status from the response' },
      })
    ),
    withPackagePoliciesCount: schema.maybe(
      schema.boolean({
        defaultValue: false,
        meta: { description: 'When true, include the number of package policies per package' },
      })
    ),
  }),
};

export const KibanaAssetReferenceSchema = schema.object(
  {
    id: schema.string(),
    originId: schema.maybe(schema.string()),
    deferred: schema.maybe(schema.boolean()),
    type: schema.oneOf([
      schema.oneOf([
        schema.literal('dashboard'),
        schema.literal('lens'),
        schema.literal('visualization'),
        schema.literal('search'),
        schema.literal('index-pattern'),
        schema.literal('map'),
        schema.literal('ml-module'),
        schema.literal('security-rule'),
        schema.literal('csp-rule-template'),
        schema.literal('osquery-pack-asset'),
        schema.literal('osquery-saved-query'),
        schema.literal('tag'),
      ]),
      schema.string(),
    ]),
  },
  { meta: { id: 'kibana_asset_reference' } }
);

export const EsAssetReferenceSchema = schema.object(
  {
    id: schema.string(),
    type: schema.oneOf([
      schema.literal('index'),
      schema.literal('index_template'),
      schema.literal('component_template'),
      schema.literal('ingest_pipeline'),
      schema.literal('ilm_policy'),
      schema.literal('data_stream_ilm_policy'),
      schema.literal('transform'),
      schema.literal('ml_model'),
      schema.literal('knowledge_base'),
      schema.literal('esql_view'),
    ]),
    deferred: schema.maybe(schema.boolean()),
    version: schema.maybe(schema.string()),
    customDataStreamOriginDataset: schema.maybe(schema.string()),
    customDataStreamOriginType: schema.maybe(schema.string()),
  },
  { meta: { id: 'es_asset_reference' } }
);

export const InstallationInfoSchema = schema.object(
  {
    type: schema.string(),
    created_at: schema.maybe(schema.string()),
    updated_at: schema.maybe(schema.string()),
    namespaces: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
    installed_kibana: schema.arrayOf(KibanaAssetReferenceSchema, { maxSize: 10000 }),
    additional_spaces_installed_kibana: schema.maybe(
      schema.recordOf(schema.string(), schema.arrayOf(KibanaAssetReferenceSchema, { maxSize: 100 }))
    ),
    installed_es: schema.arrayOf(EsAssetReferenceSchema, { maxSize: 10000 }),
    name: schema.string(),
    version: schema.string(),
    install_status: schema.oneOf([
      schema.literal('installed'),
      schema.literal('installing'),
      schema.literal('install_failed'),
    ]),
    install_source: schema.oneOf([
      schema.literal('registry'),
      schema.literal('upload'),
      schema.literal('bundled'),
      schema.literal('custom'),
    ]),
    installed_kibana_space_id: schema.maybe(schema.string()),
    install_format_schema_version: schema.maybe(schema.string()),
    verification_status: schema.oneOf([
      schema.literal('unverified'),
      schema.literal('verified'),
      schema.literal('unknown'),
    ]),
    verification_key_id: schema.maybe(schema.oneOf([schema.string(), schema.literal(null)])),
    experimental_data_stream_features: schema.maybe(ExperimentalDataStreamFeaturesSchema),
    latest_install_failed_attempts: schema.maybe(
      schema.arrayOf(
        schema.object({
          created_at: schema.string(),
          target_version: schema.string(),
          error: schema.object({
            name: schema.string(),
            message: schema.string(),
            stack: schema.maybe(schema.string()),
          }),
        }),
        { maxSize: 10 }
      )
    ),
    latest_executed_state: schema.maybe(
      schema.object({
        name: schema.maybe(schema.string()),
        started_at: schema.maybe(schema.string()),
        error: schema.maybe(schema.string()),
      })
    ),
    previous_version: schema.maybe(schema.oneOf([schema.string(), schema.literal(null)])),
    rolled_back: schema.maybe(schema.boolean()),
    is_rollback_ttl_expired: schema.maybe(schema.boolean()),
  },
  { meta: { id: 'installation_info' } }
);

const PackageIconSchema = schema.object(
  {
    path: schema.maybe(schema.string()),
    src: schema.string(),
    title: schema.maybe(schema.string()),
    type: schema.maybe(schema.string()),
    size: schema.maybe(schema.string()),
    dark_mode: schema.maybe(schema.boolean()),
  },
  { meta: { id: 'package_icon' } }
);

export const PackageInfoSchema = schema
  .object(
    {
      status: schema.maybe(schema.string()),
      installationInfo: schema.maybe(InstallationInfoSchema),
      name: schema.string(),
      version: schema.string(),
      description: schema.maybe(schema.string()),
      title: schema.string(),
      icons: schema.maybe(schema.arrayOf(PackageIconSchema, { maxSize: 100 })),
      deprecated: schema.maybe(DeprecationInfoSchema),
      conditions: schema.maybe(
        schema.object({
          kibana: schema.maybe(schema.object({ version: schema.maybe(schema.string()) })),
          elastic: schema.maybe(
            schema.object({
              subscription: schema.maybe(schema.string()),
              capabilities: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 10 })),
            })
          ),
          deprecated: schema.maybe(DeprecationInfoSchema),
        })
      ),
      release: schema.maybe(
        schema.oneOf([schema.literal('ga'), schema.literal('beta'), schema.literal('experimental')])
      ),
      type: schema.maybe(
        schema.oneOf([
          schema.literal('integration'),
          schema.literal('input'),
          schema.literal('content'),
          schema.string(),
        ])
      ),
      path: schema.maybe(schema.string()),
      download: schema.maybe(schema.string()),
      internal: schema.maybe(schema.boolean()),
      data_streams: schema.maybe(
        schema.arrayOf(schema.recordOf(schema.string(), schema.any()), { maxSize: 1000 })
      ),
      policy_templates: schema.maybe(
        schema.arrayOf(schema.recordOf(schema.string(), schema.any()), { maxSize: 1000 })
      ),
      categories: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
      owner: schema.maybe(
        schema.object({
          github: schema.maybe(schema.string()),
          type: schema.maybe(
            schema.oneOf([
              schema.literal('elastic'),
              schema.literal('partner'),
              schema.literal('community'),
            ])
          ),
        })
      ),
      readme: schema.maybe(schema.string()),
      signature_path: schema.maybe(schema.string()),
      source: schema.maybe(
        schema.object({
          license: schema.string(),
        })
      ),
      format_version: schema.maybe(schema.string()),
      vars: schema.maybe(
        schema.arrayOf(schema.recordOf(schema.string(), schema.any()), { maxSize: 1000 })
      ),
      var_groups: schema.maybe(
        schema.arrayOf(
          schema.object({
            name: schema.string(),
            title: schema.string(),
            selector_title: schema.string(),
            description: schema.maybe(schema.string()),
            options: schema.arrayOf(
              schema
                .object({
                  name: schema.string(),
                  title: schema.string(),
                  description: schema.maybe(schema.string()),
                  vars: schema.arrayOf(schema.string(), { maxSize: 100 }),
                  hide_in_deployment_modes: schema.maybe(
                    schema.arrayOf(
                      schema.oneOf([schema.literal('default'), schema.literal('agentless')]),
                      { maxSize: 2 }
                    )
                  ),
                })
                .extendsDeep({ unknowns: 'allow' }),
              { maxSize: 100 }
            ),
          }),
          { maxSize: 100 }
        )
      ),
      latestVersion: schema.maybe(schema.string()),
      discovery: schema.maybe(
        schema.object({
          fields: schema.maybe(
            schema.arrayOf(schema.object({ name: schema.string() }), { maxSize: 100 })
          ),
          datasets: schema.maybe(
            schema.arrayOf(schema.object({ name: schema.string() }), { maxSize: 100 })
          ),
        })
      ),
    },
    { meta: { id: 'package_info' } }
  )
  // sometimes package list response contains extra properties, e.g. installed_kibana
  .extendsDeep({
    unknowns: 'allow',
  });

export const PackageListItemSchema = PackageInfoSchema.extends(
  {
    id: schema.string(),
    integration: schema.maybe(schema.string()),
  },
  { meta: { id: 'package_list_item' } }
);

export const GetPackagesResponseSchema = schema.object(
  { items: schema.arrayOf(PackageListItemSchema, { maxSize: 10000 }) },
  { meta: { id: 'get_packages_response' } }
);

export const InstalledPackageSchema = schema.object(
  {
    name: schema.string(),
    version: schema.string(),
    status: schema.string(),
    title: schema.maybe(schema.string()),
    description: schema.maybe(schema.string()),
    icons: schema.maybe(schema.arrayOf(PackageIconSchema, { maxSize: 100 })),
    dataStreams: schema.arrayOf(
      schema.object({
        name: schema.string(),
        title: schema.string(),
      }),
      { maxSize: 10000 }
    ),
  },
  { meta: { id: 'installed_package' } }
);

export const GetInstalledPackagesResponseSchema = schema.object(
  {
    items: schema.arrayOf(InstalledPackageSchema, { maxSize: 10000 }),
    total: schema.number(),
    searchAfter: schema.maybe(
      schema.arrayOf(
        schema.oneOf([
          schema.string(),
          schema.number(),
          schema.boolean(),
          schema.literal(null),
          schema.any(),
        ]),
        { maxSize: 2 }
      )
    ),
  },
  { meta: { id: 'get_installed_packages_response' } }
);

export const GetLimitedPackagesResponseSchema = schema.object(
  { items: schema.arrayOf(schema.string(), { maxSize: 10000 }) },
  { meta: { id: 'get_limited_packages_response' } }
);

export const GetStatsResponseSchema = schema.object(
  {
    response: schema.object({
      agent_policy_count: schema.number(),
      package_policy_count: schema.number(),
    }),
  },
  { meta: { id: 'get_stats_response' } }
);

export const GetInputsResponseSchema = schema.oneOf([
  schema.string(),
  schema.object(
    {
      inputs: schema.arrayOf(
        schema.object({
          id: schema.string(),
          type: schema.string(),
          streams: schema.maybe(
            schema.arrayOf(
              schema
                .object({
                  id: schema.string(),
                  data_stream: schema.object({
                    dataset: schema.string(),
                    type: schema.maybe(schema.string()),
                  }),
                })
                .extendsDeep({
                  unknowns: 'allow',
                }),
              { maxSize: 10000 }
            )
          ),
        }),
        { maxSize: 10000 }
      ),
      ...OtelCollectorConfigSchema,
    },
    { meta: { id: 'get_inputs_response' } }
  ),
]);

export const GetFileResponseSchema = schema.any();

export const PackageMetadataSchema = schema.object(
  { has_policies: schema.boolean() },
  { meta: { id: 'package_metadata' } }
);

export const GetPackageInfoSchema = PackageInfoSchema.extends(
  {
    assets: schema.recordOf(schema.string(), schema.maybe(schema.any())),
    notice: schema.maybe(schema.string()),
    licensePath: schema.maybe(schema.string()),
    keepPoliciesUpToDate: schema.maybe(schema.boolean()),
    license: schema.maybe(schema.string()),
    screenshots: schema.maybe(schema.arrayOf(PackageIconSchema, { maxSize: 100 })),
    elasticsearch: schema.maybe(schema.recordOf(schema.string(), schema.any())),
    agent: schema.maybe(
      schema.object({
        privileges: schema.maybe(
          schema.object({
            root: schema.maybe(schema.boolean()),
          })
        ),
      })
    ),
    asset_tags: schema.maybe(
      schema.arrayOf(
        schema.object({
          text: schema.string(),
          asset_types: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
          asset_ids: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 1000 })),
        }),
        { maxSize: 1000 }
      )
    ),
  },
  { meta: { id: 'get_package_info' } }
);

export const GetInfoResponseSchema = schema.object(
  {
    item: GetPackageInfoSchema,
    metadata: schema.maybe(PackageMetadataSchema),
  },
  { meta: { id: 'get_info_response' } }
);
export const GetKnowledgeBaseResponseSchema = schema.object(
  {
    package: schema.object({
      name: schema.string(),
    }),
    items: schema.arrayOf(
      schema.object({
        fileName: schema.string(),
        content: schema.string(),
        path: schema.string(),
        installed_at: schema.string(),
        version: schema.string(),
      }),
      { maxSize: 10000 }
    ),
  },
  { meta: { id: 'get_knowledge_base_response' } }
);

export const UpdatePackageResponseSchema = schema.object(
  { item: GetPackageInfoSchema },
  { meta: { id: 'update_package_response' } }
);

export const AssetReferenceSchema = schema.oneOf([
  KibanaAssetReferenceSchema,
  EsAssetReferenceSchema,
]);

export const InstallPackageResponseSchema = schema.object(
  {
    items: schema.arrayOf(AssetReferenceSchema, { maxSize: 10000 }),
    _meta: schema.object({
      install_source: schema.string(),
      name: schema.string(),
    }),
  },
  { meta: { id: 'install_package_response' } }
);

export const InstallKibanaAssetsResponseSchema = schema.object(
  { success: schema.boolean() },
  { meta: { id: 'install_kibana_assets_response' } }
);

export const DeletePackageDatastreamAssetsResponseSchema = schema.object(
  { success: schema.boolean() },
  { meta: { id: 'delete_package_datastream_assets_response' } }
);

export const BulkInstallPackagesResponseItemSchema = schema.oneOf([
  schema.object(
    {
      name: schema.string(),
      version: schema.string(),
      result: schema.object({
        assets: schema.maybe(schema.arrayOf(AssetReferenceSchema, { maxSize: 10000 })),
        status: schema.maybe(
          schema.oneOf([schema.literal('installed'), schema.literal('already_installed')])
        ),
        error: schema.maybe(schema.any()),
        installType: schema.string(),
        installSource: schema.maybe(schema.string()),
      }),
    },
    { meta: { id: 'bulk_install_packages_response_item_success' } }
  ),
  schema.object(
    {
      name: schema.string(),
      statusCode: schema.number(),
      error: schema.oneOf([schema.string(), schema.any()]),
    },
    { meta: { id: 'bulk_install_packages_response_item_error' } }
  ),
]);

export const BulkInstallPackagesFromRegistryResponseSchema = schema.object(
  { items: schema.arrayOf(BulkInstallPackagesResponseItemSchema, { maxSize: 10000 }) },
  { meta: { id: 'bulk_install_packages_from_registry_response' } }
);

export const BulkUpgradePackagesResponseSchema = schema.object(
  { taskId: schema.string() },
  { meta: { id: 'bulk_upgrade_packages_response' } }
);

export const BulkRollbackPackagesResponseSchema = schema.object(
  { taskId: schema.string() },
  { meta: { id: 'bulk_rollback_packages_response' } }
);

export const GetOneBulkOperationPackagesResponseSchema = schema.object(
  {
    status: schema.string(),
    error: schema.maybe(schema.object({ message: schema.string() })),
    results: schema.maybe(
      schema.arrayOf(
        schema.object({
          name: schema.string(),
          success: schema.boolean(),
          error: schema.maybe(schema.object({ message: schema.string() })),
        }),
        { maxSize: 10000 }
      )
    ),
  },
  { meta: { id: 'get_one_bulk_operation_packages_response' } }
);

export const DeletePackageResponseSchema = schema.object(
  { items: schema.arrayOf(AssetReferenceSchema, { maxSize: 10000 }) },
  { meta: { id: 'delete_package_response' } }
);

export const GetVerificationKeyIdResponseSchema = schema.object(
  { id: schema.oneOf([schema.string(), schema.literal(null)]) },
  { meta: { id: 'get_verification_key_id_response' } }
);

export const GetDataStreamsResponseSchema = schema.object(
  {
    items: schema.arrayOf(
      schema.object({
        name: schema.string(),
      }),
      { maxSize: 10000 }
    ),
  },
  { meta: { id: 'get_data_streams_response' } }
);

export const GetBulkAssetsResponseSchema = schema.object(
  {
    items: schema.arrayOf(
      schema.object({
        appLink: schema.maybe(schema.string()),
        id: schema.string(),
        type: schema.string(),
        updatedAt: schema.maybe(schema.string()),
        attributes: schema.object({
          service: schema.maybe(schema.string()),
          title: schema.maybe(schema.string()),
          description: schema.maybe(schema.string()),
        }),
      }),
      { maxSize: 10000 }
    ),
  },
  { meta: { id: 'get_bulk_assets_response' } }
);

export const ReauthorizeTransformResponseSchema = schema.arrayOf(
  schema.object({
    transformId: schema.string(),
    success: schema.boolean(),
    error: schema.oneOf([schema.literal(null), schema.any()]),
  }),
  { maxSize: 10000 }
);

export const RollbackPackageResponseSchema = schema.object(
  {
    version: schema.string(),
    success: schema.boolean(),
  },
  { meta: { id: 'rollback_package_response' } }
);

export const GetInstalledPackagesRequestSchema = {
  query: schema.object({
    dataStreamType: schema.maybe(
      schema.oneOf(
        [
          schema.literal('logs'),
          schema.literal('metrics'),
          schema.literal('traces'),
          schema.literal('synthetics'),
          schema.literal('profiles'),
        ],
        { meta: { description: 'Filter by data stream type' } }
      )
    ),
    showOnlyActiveDataStreams: schema.maybe(
      schema.boolean({
        meta: { description: 'When true, only return packages with active data streams' },
      })
    ),
    nameQuery: schema.maybe(schema.string({ meta: { description: 'Filter packages by name' } })),
    searchAfter: schema.maybe(
      schema.arrayOf(schema.oneOf([schema.string(), schema.number()]), {
        maxSize: 10,
        meta: { description: 'Sort values from the previous page for `search_after` pagination' },
      })
    ),
    perPage: schema.number({
      defaultValue: 15,
      meta: { description: 'Number of results per page' },
    }),
    sortOrder: schema.oneOf([schema.literal('asc'), schema.literal('desc')], {
      defaultValue: 'asc',
      meta: { description: 'Sort order, ascending or descending' },
    }),
  }),
};

export const GetDataStreamsRequestSchema = {
  query: schema.object({
    type: schema.maybe(
      schema.oneOf(
        [
          schema.literal('logs'),
          schema.literal('metrics'),
          schema.literal('traces'),
          schema.literal('synthetics'),
          schema.literal('profiles'),
        ],
        { meta: { description: 'Filter by data stream type' } }
      )
    ),
    datasetQuery: schema.maybe(
      schema.string({ meta: { description: 'Filter data streams by dataset name' } })
    ),
    sortOrder: schema.oneOf([schema.literal('asc'), schema.literal('desc')], {
      defaultValue: 'asc',
      meta: { description: 'Sort order, ascending or descending' },
    }),
    uncategorisedOnly: schema.boolean({
      defaultValue: false,
      meta: {
        description: 'When true, only return data streams that are not associated with a package',
      },
    }),
  }),
};

export const GetLimitedPackagesRequestSchema = {
  query: schema.object({
    prerelease: schema.maybe(
      schema.boolean({
        meta: { description: 'When true, include prerelease packages in the results' },
      })
    ),
  }),
};

export const GetFileRequestSchema = {
  params: schema.object({
    pkgName: schema.string({ meta: { description: 'Package name' } }),
    pkgVersion: schema.string({ meta: { description: 'Package version' } }),
    filePath: schema.string({ meta: { description: 'File path within the package' } }),
  }),
};

const PackageRequestParamsSchema = schema.object({
  pkgName: schema.string({ meta: { description: 'Package name' } }),
});

const PackageVersionRequestParamsSchema = schema.object({
  pkgName: schema.string({ meta: { description: 'Package name' } }),
  pkgVersion: schema.string({ meta: { description: 'Package version' } }),
});

const GetInfoQuerySchema = schema.object({
  ignoreUnverified: schema.maybe(
    schema.boolean({
      meta: {
        description: 'When true, returns the package even if the signature cannot be verified',
      },
    })
  ),
  prerelease: schema.maybe(
    schema.boolean({ meta: { description: 'When true, include prerelease versions' } })
  ),
  full: schema.maybe(
    schema.boolean({
      meta: { description: 'When true, return the full package info including assets' },
    })
  ),
  withMetadata: schema.boolean({
    defaultValue: false,
    meta: {
      description: 'When true, include package metadata such as whether it has package policies',
    },
  }),
});

export const GetInfoRequestSchema = {
  params: PackageVersionRequestParamsSchema,
  query: GetInfoQuerySchema,
};

export const GetInfoWithoutVersionRequestSchema = {
  params: PackageRequestParamsSchema,
  query: GetInfoQuerySchema,
};
export const GetKnowledgeBaseRequestSchema = {
  params: schema.object({
    pkgName: schema.string({ meta: { description: 'Package name' } }),
  }),
};

export const GetBulkAssetsRequestSchema = {
  body: schema.object(
    {
      assetIds: schema.arrayOf(schema.object({ id: schema.string(), type: schema.string() }), {
        maxSize: 10000,
      }),
    },
    { meta: { id: 'get_bulk_assets_request' } }
  ),
};

export const UpdatePackageRequestSchema = {
  params: PackageVersionRequestParamsSchema,
  body: schema.object(
    {
      keepPoliciesUpToDate: schema.maybe(schema.boolean()),
      namespace_customization_enabled_for: schema.maybe(
        schema.arrayOf(
          schema.string({
            validate: (v) => {
              if (!v.length) {
                return 'Must not be empty';
              }
              if (!/^[a-z0-9_]+$/.test(v)) {
                return 'Must only contain lowercase letters, numbers, and underscores';
              }
            },
          }),
          {
            maxSize: 100,
            meta: {
              description:
                'Namespaces for which namespace-level customization is enabled on this package.',
            },
          }
        )
      ),
    },
    { meta: { id: 'update_package_request' } }
  ),
};

export const UpdatePackageWithoutVersionRequestSchema = {
  params: PackageRequestParamsSchema,
  body: UpdatePackageRequestSchema.body,
};

export const BulkNamespaceCustomizationRequestSchema = {
  body: schema.object(
    {
      packages: schema.arrayOf(schema.string(), {
        minSize: 1,
        maxSize: 1000,
        meta: {
          description: 'Package names to apply the customization changes to.',
        },
      }),
      enable: schema.maybe(
        schema.arrayOf(
          schema.string({
            validate: (v) => {
              if (!v.length) {
                return 'Must not be empty';
              }
              if (!/^[a-z0-9_]+$/.test(v)) {
                return 'Must only contain lowercase letters, numbers, and underscores';
              }
            },
          }),
          {
            maxSize: 100,
            meta: {
              description:
                'Namespaces to enable namespace-level customization for on each package.',
            },
          }
        )
      ),
      disable: schema.maybe(
        schema.arrayOf(schema.string(), {
          maxSize: 100,
          meta: {
            description: 'Namespaces to disable namespace-level customization for on each package.',
          },
        })
      ),
    },
    { meta: { id: 'bulk_namespace_customization_request' } }
  ),
};

export const BulkNamespaceCustomizationResponseSchema = schema.object(
  {
    items: schema.arrayOf(
      schema.object({
        name: schema.string(),
        success: schema.boolean(),
        namespace_customization_enabled_for: schema.maybe(
          schema.arrayOf(schema.string(), {
            maxSize: 100,
            meta: {
              description:
                'The opt-in list on the package. Returned whenever the package is installed: the new list on success, or the unchanged list when the request is rejected (for example, because of a namespace-prefix restriction).',
            },
          })
        ),
        error: schema.maybe(schema.string()),
      }),
      { maxSize: 1000 }
    ),
  },
  { meta: { id: 'bulk_namespace_customization_response' } }
);

export const ReviewUpgradeRequestSchema = {
  params: schema.object({
    pkgName: schema.string({
      meta: { description: 'Package name to review upgrade for' },
    }),
  }),
  body: schema.object(
    {
      action: schema.oneOf([
        schema.literal('accept'),
        schema.literal('decline'),
        schema.literal('pending'),
      ]),
      target_version: schema.string(),
    },
    { meta: { id: 'review_upgrade_request' } }
  ),
};

export const ReviewUpgradeResponseSchema = schema.object(
  { success: schema.boolean() },
  { meta: { id: 'review_upgrade_response' } }
);

export const GetStatsRequestSchema = {
  params: schema.object({
    pkgName: schema.string({ meta: { description: 'Package name' } }),
  }),
};

export const GetDependenciesRequestSchema = {
  params: schema.object({
    pkgName: schema.string({ meta: { description: 'Package name' } }),
    pkgVersion: schema.string({ meta: { description: 'Package version' } }),
  }),
};

export const GetDependenciesResponseSchema = schema.object(
  {
    items: schema.arrayOf(
      schema.object({
        name: schema.string(),
        version: schema.string(),
        title: schema.string(),
      }),
      { maxSize: 1000 }
    ),
  },
  { meta: { id: 'get_dependencies_response' } }
);

export const InstallPackageFromRegistryRequestSchema = {
  params: PackageVersionRequestParamsSchema,
  query: schema.object({
    prerelease: schema.maybe(
      schema.boolean({ meta: { description: 'When true, allow installing prerelease versions' } })
    ),
    ignoreMappingUpdateErrors: schema.boolean({
      defaultValue: false,
      meta: { description: 'When true, ignore mapping update errors during installation' },
    }),
    skipDataStreamRollover: schema.boolean({
      defaultValue: false,
      meta: { description: 'When true, skip data stream rollover after installation' },
    }),
    skipDependencyCheck: schema.boolean({
      defaultValue: false,
      meta: {
        description: 'Skip dependency validation when installing a package with dependencies',
      },
    }),
  }),
  body: schema.nullable(
    schema.object(
      {
        force: schema.boolean({ defaultValue: false }),
        ignore_constraints: schema.boolean({ defaultValue: false }),
      },
      { meta: { id: 'install_package_from_registry_request' } }
    )
  ),
};

export const InstallPackageFromRegistryWithoutVersionRequestSchema = {
  params: PackageRequestParamsSchema,
  query: InstallPackageFromRegistryRequestSchema.query,
  body: InstallPackageFromRegistryRequestSchema.body,
};

export const ReauthorizeTransformRequestSchema = {
  params: schema.object({
    pkgName: schema.string({ meta: { description: 'Package name' } }),
    pkgVersion: schema.maybe(schema.string({ meta: { description: 'Package version' } })),
  }),
  query: schema.object({
    prerelease: schema.maybe(
      schema.boolean({ meta: { description: 'When true, allow prerelease versions' } })
    ),
  }),
  body: schema.object(
    {
      transforms: schema.arrayOf(schema.object({ transformId: schema.string() }), {
        maxSize: 1000,
      }),
    },
    { meta: { id: 'reauthorize_transform_request' } }
  ),
};

export const BulkInstallPackagesFromRegistryRequestSchema = {
  query: schema.object({
    prerelease: schema.maybe(
      schema.boolean({ meta: { description: 'When true, allow installing prerelease versions' } })
    ),
  }),
  body: schema.object(
    {
      packages: schema.arrayOf(
        schema.oneOf([
          schema.string(),
          schema.object({
            name: schema.string(),
            version: schema.string(),
            prerelease: schema.maybe(schema.boolean()),
          }),
        ]),
        { minSize: 1, maxSize: 1000 }
      ),
      force: schema.boolean({ defaultValue: false }),
    },
    { meta: { id: 'bulk_install_packages_from_registry_request' } }
  ),
};

export const GetOneBulkOperationPackagesRequestSchema = {
  params: schema.object({
    taskId: schema.string({
      meta: {
        description: 'Task ID of the bulk operation',
      },
    }),
  }),
};

export const BulkUpgradePackagesRequestSchema = {
  body: schema.object(
    {
      packages: schema.arrayOf(
        schema.object({
          name: schema.string(),
          version: schema.maybe(schema.string()),
        }),
        { minSize: 1, maxSize: 1000 }
      ),
      prerelease: schema.maybe(schema.boolean()),
      force: schema.boolean({ defaultValue: false }),
      upgrade_package_policies: schema.boolean({ defaultValue: false }),
    },
    { meta: { id: 'bulk_upgrade_packages_request' } }
  ),
};

export const BulkUninstallPackagesRequestSchema = {
  body: schema.object(
    {
      packages: schema.arrayOf(
        schema.object({
          name: schema.string(),
          version: schema.string(),
        }),
        { minSize: 1, maxSize: 1000 }
      ),
      force: schema.boolean({ defaultValue: false }),
    },
    { meta: { id: 'bulk_uninstall_packages_request' } }
  ),
};

export const BulkRollbackPackagesRequestSchema = {
  body: schema.object(
    {
      packages: schema.arrayOf(
        schema.object({
          name: schema.string({
            meta: {
              description: 'Package name to rollback',
            },
          }),
        }),
        { minSize: 1, maxSize: 1000 }
      ),
    },
    { meta: { id: 'bulk_rollback_packages_request' } }
  ),
};

export const InstallPackageByUploadRequestSchema = {
  query: schema.object({
    ignoreMappingUpdateErrors: schema.boolean({
      defaultValue: false,
      meta: { description: 'When true, ignore mapping update errors during installation' },
    }),
    skipDataStreamRollover: schema.boolean({
      defaultValue: false,
      meta: { description: 'When true, skip data stream rollover after installation' },
    }),
  }),
  body: schema.buffer(),
};

export const CreateCustomIntegrationRequestSchema = {
  body: schema.object(
    {
      integrationName: schema.string(),
      datasets: schema.arrayOf(
        schema.object({
          name: schema.string(),
          type: schema.oneOf([
            schema.literal('logs'),
            schema.literal('metrics'),
            schema.literal('traces'),
            schema.literal('synthetics'),
            schema.literal('profiles'),
          ]),
        }),
        { maxSize: 10 }
      ),
      force: schema.maybe(schema.boolean()),
    },
    { meta: { id: 'create_custom_integration_request' } }
  ),
};

export const DeletePackageRequestSchema = {
  params: PackageVersionRequestParamsSchema,
  query: schema.object({
    force: schema.maybe(
      schema.boolean({
        meta: {
          description: 'When true, delete the package even if it has active package policies',
        },
      })
    ),
  }),
};

export const DeletePackageWithoutVersionRequestSchema = {
  params: PackageRequestParamsSchema,
  query: DeletePackageRequestSchema.query,
};

export const InstallKibanaAssetsRequestSchema = {
  params: schema.object({
    pkgName: schema.string({ meta: { description: 'Package name' } }),
    pkgVersion: schema.string({ meta: { description: 'Package version' } }),
  }),
  body: schema.nullable(
    schema.object(
      {
        force: schema.maybe(schema.boolean()),
        space_ids: schema.maybe(
          schema.arrayOf(schema.string(), {
            minSize: 1,
            maxSize: 100,
            meta: {
              description:
                'When provided, assets are installed in the specified spaces instead of the current space.',
            },
          })
        ),
      },
      { meta: { id: 'install_kibana_assets_request' } }
    )
  ),
};

export const InstallRuleAssetsRequestSchema = {
  params: schema.object({
    pkgName: schema.string({ meta: { description: 'Package name' } }),
    pkgVersion: schema.string({ meta: { description: 'Package version' } }),
  }),
  body: schema.nullable(
    schema.object(
      {
        force: schema.maybe(schema.boolean()),
      },
      { meta: { id: 'install_rule_assets_request' } }
    )
  ),
};

export const DeleteKibanaAssetsRequestSchema = {
  params: schema.object({
    pkgName: schema.string({ meta: { description: 'Package name' } }),
    pkgVersion: schema.string({ meta: { description: 'Package version' } }),
  }),
};

export const DeletePackageDatastreamAssetsRequestSchema = {
  params: schema.object({
    pkgName: schema.string({ meta: { description: 'Package name' } }),
    pkgVersion: schema.string({ meta: { description: 'Package version' } }),
  }),
  query: schema.object({
    packagePolicyId: schema.string({ meta: { description: 'The ID of the package policy' } }),
  }),
};

export const GetInputsRequestSchema = {
  params: schema.object({
    pkgName: schema.string({ meta: { description: 'Package name' } }),
    pkgVersion: schema.string({ meta: { description: 'Package version' } }),
  }),
  query: schema.object({
    format: schema.oneOf([schema.literal('json'), schema.literal('yml'), schema.literal('yaml')], {
      defaultValue: 'json',
      meta: { description: 'Output format for the inputs template: json, yml, or yaml' },
    }),
    prerelease: schema.maybe(
      schema.boolean({ meta: { description: 'When true, allow prerelease versions' } })
    ),
    ignoreUnverified: schema.maybe(
      schema.boolean({
        meta: {
          description: 'When true, return inputs even if the package signature cannot be verified',
        },
      })
    ),
  }),
};

export const RollbackPackageRequestSchema = {
  params: schema.object({
    pkgName: schema.string({
      meta: { description: 'Package name to roll back' },
    }),
  }),
};
