/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// codeql[js/kibana/unbounded-array-in-schema] Arrays validate plugin feature configs from registerKibanaFeature/registerElasticsearchFeature, not user HTTP input
import { schema } from '@kbn/config-schema';

import { difference } from 'lodash';
import type { Capabilities as UICapabilities } from '@kbn/core/server';
import type { KibanaFeatureConfig } from '../common';
import type { FeatureKibanaPrivileges, ElasticsearchFeatureConfig } from '.';
import type { AlertingKibanaPrivilege } from '../common/alerting_kibana_privilege';

// Each feature gets its own property on the UICapabilities object,
// but that object has a few built-in properties which should not be overwritten.
const prohibitedFeatureIds: Set<keyof UICapabilities> = new Set([
  'catalogue',
  'management',
  'navLinks',
]);

const featurePrivilegePartRegex = /^[a-zA-Z0-9_-]+$/;
const subFeaturePrivilegePartRegex = /^[a-zA-Z0-9_-]+$/;
const managementSectionIdRegex = /^[a-zA-Z0-9_-]+$/;
const reservedFeaturePrrivilegePartRegex = /^(?!reserved_)[a-zA-Z0-9_-]+$/;
export const uiCapabilitiesRegex = /^[a-zA-Z0-9:_-]+$/;

const validLicenseSchema = schema.oneOf([
  schema.literal('basic'),
  schema.literal('standard'),
  schema.literal('gold'),
  schema.literal('platinum'),
  schema.literal('enterprise'),
  schema.literal('trial'),
]);
// sub-feature privileges are only available with a `gold` license or better, so restricting sub-feature privileges
// for `gold` or below doesn't make a whole lot of sense.
const validSubFeaturePrivilegeLicensesSchema = schema.oneOf([
  schema.literal('platinum'),
  schema.literal('enterprise'),
  schema.literal('gold'),
  schema.literal('trial'),
]);

const listOfCapabilitiesSchema = schema.arrayOf(
  schema.string({
    validate(key: string) {
      if (!uiCapabilitiesRegex.test(key)) {
        return `Does not satisfy regexp ${uiCapabilitiesRegex.toString()}`;
      }
    },
  })
);
const managementSchema = schema.recordOf(
  schema.string({
    validate(key: string) {
      if (!managementSectionIdRegex.test(key)) {
        return `Does not satisfy regexp ${managementSectionIdRegex.toString()}`;
      }
    },
  }),
  listOfCapabilitiesSchema
);
const catalogueSchema = listOfCapabilitiesSchema;
const alertingSchema = schema.arrayOf(
  schema.object({
    ruleTypeId: schema.string(),
    consumers: schema.arrayOf(schema.string(), { minSize: 1 }),
  })
);

const alertingRuleSchemaSpec = {
  all: schema.maybe(alertingSchema),
  enable: schema.maybe(alertingSchema),
  manual_run: schema.maybe(alertingSchema),
  manage_rule_settings: schema.maybe(alertingSchema),
  mute_alerts: schema.maybe(alertingSchema),
  read: schema.maybe(alertingSchema),
};

const casesSchema = schema.arrayOf(schema.string());

const appCategorySchema = schema.object({
  id: schema.string(),
  label: schema.string(),
  ariaLabel: schema.maybe(schema.string()),
  euiIconType: schema.maybe(schema.string()),
  order: schema.maybe(schema.number()),
});

const casesSchemaObject = schema.maybe(
  schema.object({
    all: schema.maybe(casesSchema),
    create: schema.maybe(casesSchema),
    read: schema.maybe(casesSchema),
    update: schema.maybe(casesSchema),
    delete: schema.maybe(casesSchema),
    push: schema.maybe(casesSchema),
    settings: schema.maybe(casesSchema),
    createComment: schema.maybe(casesSchema),
    reopenCase: schema.maybe(casesSchema),
    assign: schema.maybe(casesSchema),
    manageTemplates: schema.maybe(casesSchema),
  })
);

const kibanaPrivilegeSchema = schema.object({
  excludeFromBasePrivileges: schema.maybe(schema.boolean()),
  requireAllSpaces: schema.maybe(schema.boolean()),
  disabled: schema.maybe(schema.boolean()),
  management: schema.maybe(managementSchema),
  catalogue: schema.maybe(catalogueSchema),
  api: schema.maybe(schema.arrayOf(schema.string())),
  app: schema.maybe(schema.arrayOf(schema.string())),
  alerting: schema.maybe(
    schema.object({
      rule: schema.maybe(schema.object(alertingRuleSchemaSpec)),
      alert: schema.maybe(
        schema.object({
          all: schema.maybe(alertingSchema),
          read: schema.maybe(alertingSchema),
        })
      ),
    })
  ),
  cases: casesSchemaObject,
  alerts: schema.maybe(
    schema.object({
      read: schema.maybe(schema.boolean()),
    })
  ),
  savedObject: schema.object({
    all: schema.arrayOf(schema.string()),
    read: schema.arrayOf(schema.string()),
  }),
  ui: listOfCapabilitiesSchema,
  replacedBy: schema.maybe(
    schema.oneOf([
      schema.arrayOf(
        schema.object({ feature: schema.string(), privileges: schema.arrayOf(schema.string()) })
      ),
      schema.object({
        minimal: schema.arrayOf(
          schema.object({ feature: schema.string(), privileges: schema.arrayOf(schema.string()) })
        ),
        default: schema.arrayOf(
          schema.object({ feature: schema.string(), privileges: schema.arrayOf(schema.string()) })
        ),
      }),
    ])
  ),
});

const kibanaIndependentSubFeaturePrivilegeSchema = schema.object({
  id: schema.string({
    validate(key: string) {
      if (!subFeaturePrivilegePartRegex.test(key)) {
        return `Does not satisfy regexp ${subFeaturePrivilegePartRegex.toString()}`;
      }
    },
  }),
  name: schema.string(),
  excludeFromBasePrivileges: schema.maybe(schema.boolean()),
  includeIn: schema.oneOf([schema.literal('all'), schema.literal('read'), schema.literal('none')]),
  minimumLicense: schema.maybe(validSubFeaturePrivilegeLicensesSchema),
  management: schema.maybe(managementSchema),
  catalogue: schema.maybe(catalogueSchema),
  alerting: schema.maybe(
    schema.object({
      rule: schema.maybe(schema.object(alertingRuleSchemaSpec)),
      alert: schema.maybe(
        schema.object({
          all: schema.maybe(alertingSchema),
          read: schema.maybe(alertingSchema),
        })
      ),
    })
  ),
  cases: casesSchemaObject,
  alerts: schema.maybe(
    schema.object({
      read: schema.maybe(schema.boolean()),
    })
  ),
  api: schema.maybe(schema.arrayOf(schema.string())),
  app: schema.maybe(schema.arrayOf(schema.string())),
  savedObject: schema.object({
    all: schema.arrayOf(schema.string()),
    read: schema.arrayOf(schema.string()),
  }),
  ui: listOfCapabilitiesSchema,
  replacedBy: schema.maybe(
    schema.arrayOf(
      schema.object({ feature: schema.string(), privileges: schema.arrayOf(schema.string()) })
    )
  ),
});

const kibanaMutuallyExclusiveSubFeaturePrivilegeSchema =
  kibanaIndependentSubFeaturePrivilegeSchema.extends({
    minimumLicense: schema.never(),
  });

const kibanaSubFeatureSchema = schema.object({
  name: schema.string(),
  requireAllSpaces: schema.maybe(schema.boolean()),
  privilegesTooltip: schema.maybe(schema.string()),
  description: schema.maybe(schema.string()),
  privilegeGroups: schema.maybe(
    schema.arrayOf(
      schema.oneOf([
        schema.object({
          groupType: schema.literal('mutually_exclusive'),
          privileges: schema.maybe(
            schema.arrayOf(kibanaMutuallyExclusiveSubFeaturePrivilegeSchema, { minSize: 1 })
          ),
        }),
        schema.object({
          groupType: schema.literal('independent'),
          privileges: schema.maybe(
            schema.arrayOf(kibanaIndependentSubFeaturePrivilegeSchema, { minSize: 1 })
          ),
        }),
      ])
    )
  ),
});

// NOTE: This schema intentionally omits the `composedOf` property to discourage consumers from using
// them during feature registration. This is because these properties should only be set via configuration overrides.
const kibanaFeatureSchema = schema.object({
  id: schema.string({
    validate(value: string) {
      if (!featurePrivilegePartRegex.test(value)) {
        return `Does not satisfy regexp ${featurePrivilegePartRegex.toString()}`;
      }
      if (prohibitedFeatureIds.has(value)) {
        return `[${value}] is not allowed`;
      }
    },
  }),
  name: schema.string(),
  category: appCategorySchema,
  // The hidden flag is only supported for explicit configuration for features with reserved privileges.
  // All other usages are via configuration overrides.
  hidden: schema.maybe(schema.boolean()),
  description: schema.maybe(schema.string()),
  order: schema.maybe(schema.number()),
  excludeFromBasePrivileges: schema.maybe(schema.boolean()),
  minimumLicense: schema.maybe(validLicenseSchema),
  app: schema.arrayOf(schema.string()),
  management: schema.maybe(managementSchema),
  catalogue: schema.maybe(catalogueSchema),
  alerting: schema.maybe(alertingSchema),
  cases: schema.maybe(casesSchema),
  privileges: schema.oneOf([
    schema.literal(null),
    schema.object({
      all: schema.maybe(kibanaPrivilegeSchema),
      read: schema.maybe(kibanaPrivilegeSchema),
    }),
  ]),
  subFeatures: schema.maybe(
    schema.conditional(
      schema.siblingRef('privileges'),
      null,
      // allows an empty array only
      schema.arrayOf(schema.never(), { maxSize: 0 }),
      schema.arrayOf(kibanaSubFeatureSchema)
    )
  ),
  privilegesTooltip: schema.maybe(schema.string()),
  reserved: schema.maybe(
    schema.object({
      description: schema.string(),
      privileges: schema.arrayOf(
        schema.object({
          id: schema.string({
            validate(value: string) {
              if (!reservedFeaturePrrivilegePartRegex.test(value)) {
                return `Does not satisfy regexp ${reservedFeaturePrrivilegePartRegex.toString()}`;
              }
            },
          }),
          privilege: kibanaPrivilegeSchema,
        })
      ),
    })
  ),
  deprecated: schema.maybe(
    schema.object({
      notice: schema.string(),
      replacedBy: schema.maybe(schema.arrayOf(schema.string())),
    })
  ),
});

const elasticsearchPrivilegeSchema = schema.object({
  ui: schema.arrayOf(schema.string()),
  requiredClusterPrivileges: schema.maybe(schema.arrayOf(schema.string())),
  requiredIndexPrivileges: schema.maybe(
    schema.recordOf(schema.string(), schema.arrayOf(schema.string()))
  ),
  requiredRoles: schema.maybe(schema.arrayOf(schema.string())),
});

const elasticsearchFeatureSchema = schema.object({
  id: schema.string({
    validate(value: string) {
      if (!featurePrivilegePartRegex.test(value)) {
        return `Does not satisfy regexp ${featurePrivilegePartRegex.toString()}`;
      }
      if (prohibitedFeatureIds.has(value)) {
        return `[${value}] is not allowed`;
      }
    },
  }),
  management: schema.maybe(managementSchema),
  catalogue: schema.maybe(catalogueSchema),
  privileges: schema.arrayOf(elasticsearchPrivilegeSchema),
});

export function validateKibanaFeature(feature: KibanaFeatureConfig) {
  kibanaFeatureSchema.validate(feature);

  // The `hidden` attribute is ONLY permitted for features with reserved privileges, AND without normal privileges.
  // The original intent of the hidden flag was to support serverless configuration overrides. There is now (>=9.0) an additional,
  // maybe temporary use case for the legacy reporting authorization mode, which registers as a reserved privilege.
  const { hidden, privileges, reserved } = feature;
  if (hidden && (privileges !== null || typeof reserved === 'undefined')) {
    throw new Error(`Feature ${feature.id} cannot be hidden.`);
  }

  // the following validation can't be enforced by the Joi schema, since it'd require us looking "up" the object graph for the list of valid value, which they explicitly forbid.
  const { app = [], management = {}, catalogue = [], alerting = [], cases = [] } = feature;

  const unseenApps = new Set(app);

  const managementSets = Object.entries(management).map((entry) => [
    entry[0],
    new Set(entry[1]),
  ]) as Array<[string, Set<string>]>;

  const unseenManagement = new Map<string, Set<string>>(managementSets);

  const unseenCatalogue = new Set(catalogue);

  const alertingMap = new Map(
    alerting.map(({ ruleTypeId, consumers }) => [ruleTypeId, new Set(consumers)])
  );

  const unseenAlertingRyleTypeIds = new Set(alertingMap.keys());
  const unseenAlertingConsumers = new Set(
    alerting.flatMap(({ consumers }) => Array.from(consumers.values()))
  );

  const unseenCasesTypes = new Set(cases);

  function validateAppEntry(privilegeId: string, entry: readonly string[] = []) {
    entry.forEach((privilegeApp) => unseenApps.delete(privilegeApp));

    const unknownAppEntries = difference(entry, app);
    if (unknownAppEntries.length > 0) {
      throw new Error(
        `Feature privilege ${
          feature.id
        }.${privilegeId} has unknown app entries: ${unknownAppEntries.join(', ')}`
      );
    }
  }

  function validateCatalogueEntry(privilegeId: string, entry: readonly string[] = []) {
    entry.forEach((privilegeCatalogue) => unseenCatalogue.delete(privilegeCatalogue));

    const unknownCatalogueEntries = difference(entry || [], catalogue);
    if (unknownCatalogueEntries.length > 0) {
      throw new Error(
        `Feature privilege ${
          feature.id
        }.${privilegeId} has unknown catalogue entries: ${unknownCatalogueEntries.join(', ')}`
      );
    }
  }

  function validateAlertingEntry(privilegeId: string, entry: FeatureKibanaPrivileges['alerting']) {
    const seenRuleTypeIds = new Set<string>();
    const seenConsumers = new Set<string>();

    const validateAlertingPrivilege = (alertingPrivilege?: AlertingKibanaPrivilege) => {
      for (const { ruleTypeId, consumers } of alertingPrivilege ?? []) {
        if (!alertingMap.has(ruleTypeId)) {
          throw new Error(
            `Feature privilege ${feature.id}.${privilegeId} has unknown ruleTypeId: ${ruleTypeId}`
          );
        }

        const alertingMapConsumers = alertingMap.get(ruleTypeId)!;

        for (const consumer of consumers) {
          if (!alertingMapConsumers.has(consumer)) {
            throw new Error(
              `Feature privilege ${feature.id}.${privilegeId}.${ruleTypeId} has unknown consumer: ${consumer}`
            );
          }

          seenConsumers.add(consumer);
        }

        seenRuleTypeIds.add(ruleTypeId);
      }
    };

    Object.values(entry?.rule ?? {}).forEach(validateAlertingPrivilege);
    Object.values(entry?.alert ?? {}).forEach(validateAlertingPrivilege);

    seenRuleTypeIds.forEach((ruleTypeId: string) => unseenAlertingRyleTypeIds.delete(ruleTypeId));
    seenConsumers.forEach((consumer: string) => unseenAlertingConsumers.delete(consumer));
  }

  function validateCasesEntry(privilegeId: string, entry: FeatureKibanaPrivileges['cases']) {
    const all = entry?.all ?? [];
    const read = entry?.read ?? [];

    all.forEach((privilegeCasesTypes) => unseenCasesTypes.delete(privilegeCasesTypes));
    read.forEach((privilegeCasesTypes) => unseenCasesTypes.delete(privilegeCasesTypes));

    const unknownCasesEntries = difference([...all, ...read], cases);
    if (unknownCasesEntries.length > 0) {
      throw new Error(
        `Feature privilege ${
          feature.id
        }.${privilegeId} has unknown cases entries: ${unknownCasesEntries.join(', ')}`
      );
    }
  }

  function validateManagementEntry(
    privilegeId: string,
    managementEntry: Record<string, readonly string[]> = {}
  ) {
    Object.entries(managementEntry).forEach(([managementSectionId, managementSectionEntry]) => {
      if (unseenManagement.has(managementSectionId)) {
        managementSectionEntry.forEach((entry) => {
          unseenManagement.get(managementSectionId)!.delete(entry);
          if (unseenManagement.get(managementSectionId)?.size === 0) {
            unseenManagement.delete(managementSectionId);
          }
        });
      }
      if (!management[managementSectionId]) {
        throw new Error(
          `Feature privilege ${feature.id}.${privilegeId} has unknown management section: ${managementSectionId}`
        );
      }

      const unknownSectionEntries = difference(
        managementSectionEntry,
        management[managementSectionId]
      );

      if (unknownSectionEntries.length > 0) {
        throw new Error(
          `Feature privilege ${
            feature.id
          }.${privilegeId} has unknown management entries for section ${managementSectionId}: ${unknownSectionEntries.join(
            ', '
          )}`
        );
      }
    });
  }

  const privilegeEntries: Array<[string, FeatureKibanaPrivileges]> = [];
  if (feature.privileges) {
    privilegeEntries.push(...Object.entries(feature.privileges));
  }
  if (feature.reserved) {
    feature.reserved.privileges.forEach((reservedPrivilege) => {
      privilegeEntries.push([reservedPrivilege.id, reservedPrivilege.privilege]);
    });
  }

  if (privilegeEntries.length === 0) {
    return;
  }

  privilegeEntries.forEach(([privilegeId, privilegeDefinition]) => {
    if (!privilegeDefinition) {
      throw new Error('Privilege definition may not be null or undefined');
    }

    validateAppEntry(privilegeId, privilegeDefinition.app);

    validateCatalogueEntry(privilegeId, privilegeDefinition.catalogue);

    validateManagementEntry(privilegeId, privilegeDefinition.management);
    validateAlertingEntry(privilegeId, privilegeDefinition.alerting);
    validateCasesEntry(privilegeId, privilegeDefinition.cases);
  });

  const subFeatureEntries = feature.subFeatures ?? [];
  subFeatureEntries.forEach((subFeature) => {
    subFeature.privilegeGroups.forEach((subFeaturePrivilegeGroup) => {
      subFeaturePrivilegeGroup.privileges.forEach((subFeaturePrivilege) => {
        validateAppEntry(subFeaturePrivilege.id, subFeaturePrivilege.app);
        validateCatalogueEntry(subFeaturePrivilege.id, subFeaturePrivilege.catalogue);
        validateManagementEntry(subFeaturePrivilege.id, subFeaturePrivilege.management);
        validateAlertingEntry(subFeaturePrivilege.id, subFeaturePrivilege.alerting);
        validateCasesEntry(subFeaturePrivilege.id, subFeaturePrivilege.cases);
      });
    });
  });

  if (unseenApps.size > 0) {
    throw new Error(
      `Feature ${
        feature.id
      } specifies app entries which are not granted to any privileges: ${Array.from(
        unseenApps.values()
      ).join(',')}`
    );
  }

  if (unseenCatalogue.size > 0) {
    throw new Error(
      `Feature ${
        feature.id
      } specifies catalogue entries which are not granted to any privileges: ${Array.from(
        unseenCatalogue.values()
      ).join(',')}`
    );
  }

  if (unseenManagement.size > 0) {
    const ungrantedManagement = Array.from(unseenManagement.entries()).reduce((acc, entry) => {
      const values = Array.from(entry[1].values()).map(
        (managementPage) => `${entry[0]}.${managementPage}`
      );
      acc.push(...values);
      return acc;
    }, [] as string[]);

    throw new Error(
      `Feature ${
        feature.id
      } specifies management entries which are not granted to any privileges: ${ungrantedManagement.join(
        ','
      )}`
    );
  }

  if (unseenAlertingRyleTypeIds.size > 0) {
    throw new Error(
      `Feature ${
        feature.id
      } specifies alerting rule types which are not granted to any privileges: ${Array.from(
        unseenAlertingRyleTypeIds.keys()
      ).join(',')}`
    );
  }

  if (unseenAlertingConsumers.size > 0) {
    throw new Error(
      `Feature ${
        feature.id
      } specifies alerting consumers which are not granted to any privileges: ${Array.from(
        unseenAlertingConsumers.keys()
      ).join(',')}`
    );
  }

  if (unseenCasesTypes.size > 0) {
    throw new Error(
      `Feature ${
        feature.id
      } specifies cases entries which are not granted to any privileges: ${Array.from(
        unseenCasesTypes.values()
      ).join(',')}`
    );
  }
}

export function validateElasticsearchFeature(feature: ElasticsearchFeatureConfig) {
  elasticsearchFeatureSchema.validate(feature);
  // the following validation can't be enforced by the Joi schema without a very convoluted and verbose definition
  const { privileges } = feature;
  privileges.forEach((privilege, index) => {
    const {
      requiredClusterPrivileges = [],
      requiredIndexPrivileges = [],
      requiredRoles = [],
    } = privilege;

    if (
      requiredClusterPrivileges.length === 0 &&
      requiredIndexPrivileges.length === 0 &&
      requiredRoles.length === 0
    ) {
      throw new Error(
        `Feature ${feature.id} has a privilege definition at index ${index} without any privileges defined.`
      );
    }
  });
}
