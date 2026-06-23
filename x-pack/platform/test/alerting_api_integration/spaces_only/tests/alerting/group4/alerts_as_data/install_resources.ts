/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { alertFieldMap, ecsFieldMap, legacyAlertFieldMap } from '@kbn/alerts-as-data-utils';
import { mappingFromFieldMap } from '@kbn/alerting-plugin/common';
import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../../../common/ftr_provider_context';

export default function createAlertsAsDataInstallResourcesTest({ getService }: FtrProviderContext) {
  const es = getService('es');
  const retry = getService('retry');
  const frameworkMappings = mappingFromFieldMap(alertFieldMap, 'strict');
  const legacyAlertMappings = mappingFromFieldMap(legacyAlertFieldMap, 'strict');
  const ecsMappings = mappingFromFieldMap(ecsFieldMap, 'strict');

  describe('install alerts as data resources', () => {
    it('should install common alerts as data resources on startup', async () => {
      const ilmPolicyName = '.alerts-ilm-policy';
      const frameworkComponentTemplateName = '.alerts-framework-mappings';
      const legacyComponentTemplateName = '.alerts-legacy-alert-mappings';
      const ecsComponentTemplateName = '.alerts-ecs-mappings';

      await retry.try(async () => {
        const commonIlmPolicy = await es.ilm.getLifecycle({
          name: ilmPolicyName,
        });

        expect(commonIlmPolicy[ilmPolicyName].policy).to.eql({
          _meta: {
            managed: true,
          },
          phases: {
            hot: {
              min_age: '0ms',
              actions: {
                rollover: {
                  max_age: '30d',
                  max_primary_shard_size: '50gb',
                },
              },
            },
          },
        });
      });

      const { component_templates: componentTemplates1 } = await es.cluster.getComponentTemplate({
        name: frameworkComponentTemplateName,
      });

      expect(componentTemplates1.length).to.eql(1);
      const frameworkComponentTemplate = componentTemplates1[0];

      expect(frameworkComponentTemplate.name).to.eql(frameworkComponentTemplateName);
      expect(frameworkComponentTemplate.component_template.template.mappings).to.eql(
        frameworkMappings
      );
      expect(frameworkComponentTemplate.component_template.template.settings).to.eql({
        index: {
          number_of_shards: 1,
          mapping: {
            total_fields: {
              limit: 1500,
            },
          },
        },
      });

      const { component_templates: componentTemplates2 } = await es.cluster.getComponentTemplate({
        name: legacyComponentTemplateName,
      });

      expect(componentTemplates2.length).to.eql(1);
      const legacyComponentTemplate = componentTemplates2[0];

      expect(legacyComponentTemplate.name).to.eql(legacyComponentTemplateName);
      expect(legacyComponentTemplate.component_template.template.mappings).to.eql(
        legacyAlertMappings
      );
      expect(legacyComponentTemplate.component_template.template.settings).to.eql({
        index: {
          number_of_shards: 1,
          mapping: {
            total_fields: {
              limit: 1500,
            },
          },
        },
      });

      const { component_templates: componentTemplates3 } = await es.cluster.getComponentTemplate({
        name: ecsComponentTemplateName,
      });

      expect(componentTemplates3.length).to.eql(1);
      const ecsComponentTemplate = componentTemplates3[0];

      expect(ecsComponentTemplate.name).to.eql(ecsComponentTemplateName);
      expect(ecsComponentTemplate.component_template.template.mappings).to.eql(ecsMappings);
      expect(ecsComponentTemplate.component_template.template.settings).to.eql({
        index: {
          number_of_shards: 1,
          mapping: {
            total_fields: {
              limit: 2500,
            },
          },
        },
      });
    });

    it('should install context specific alerts as data resources on startup', async () => {
      const componentTemplateName = '.alerts-test.patternfiring.alerts-mappings';
      const indexTemplateName = '.alerts-test.patternfiring.alerts-default-index-template';
      const indexName = '.internal.alerts-test.patternfiring.alerts-default-000001';
      const contextSpecificMappings = {
        patternIndex: {
          type: 'long',
        },
        instancePattern: {
          type: 'boolean',
        },
      };

      await retry.try(async () => {
        const { component_templates: componentTemplates } = await es.cluster.getComponentTemplate({
          name: componentTemplateName,
        });
        expect(componentTemplates.length).to.eql(1);
        const contextComponentTemplate = componentTemplates[0];
        expect(contextComponentTemplate.name).to.eql(componentTemplateName);
        expect(contextComponentTemplate.component_template.template.mappings).to.eql({
          dynamic: 'strict',
          properties: contextSpecificMappings,
        });
        expect(contextComponentTemplate.component_template.template.settings).to.eql({});
      });

      await retry.try(async () => {
        const { index_templates: indexTemplates } = await es.indices.getIndexTemplate({
          name: indexTemplateName,
        });
        expect(indexTemplates.length).to.eql(1);
        const contextIndexTemplate = indexTemplates[0];
        expect(contextIndexTemplate.name).to.eql(indexTemplateName);
        expect(contextIndexTemplate.index_template.index_patterns).to.eql([
          '.internal.alerts-test.patternfiring.alerts-default-*',
          '.reindexed-v8-internal.alerts-test.patternfiring.alerts-default-*',
        ]);

        expect(
          contextIndexTemplate.index_template.composed_of.includes(
            '.alerts-test.patternfiring.alerts-mappings'
          )
        );
        expect(
          contextIndexTemplate.index_template.composed_of.includes('.alerts-framework-mappings')
        );

        expect(contextIndexTemplate.index_template.template!.mappings?.dynamic).to.eql(false);
        expect(contextIndexTemplate.index_template.template!.mappings?._meta?.managed).to.eql(true);
        expect(contextIndexTemplate.index_template.template!.mappings?._meta?.namespace).to.eql(
          'default'
        );
        expect(
          contextIndexTemplate.index_template.template!.mappings?._meta?.kibana?.version
        ).to.be.a('string');
        expect(contextIndexTemplate.index_template.template!.settings).to.eql({
          index: {
            lifecycle: {
              name: '.alerts-ilm-policy',
              rollover_alias: '.alerts-test.patternfiring.alerts-default',
            },
            mapping: {
              ignore_malformed: 'true',
              total_fields: {
                limit: '2800',
                ignore_dynamic_beyond_limit: 'true',
              },
            },
            hidden: 'true',
            auto_expand_replicas: '0-1',
          },
        });
      });

      await retry.try(async () => {
        const contextIndex = await es.indices.get({
          index: indexName,
        });
        expect(contextIndex[indexName].aliases).to.eql({
          '.alerts-test.patternfiring.alerts-default': {
            is_write_index: true,
            is_hidden: true,
          },
        });
        expect(contextIndex[indexName].mappings?._meta?.managed).to.eql(true);
        expect(contextIndex[indexName].mappings?._meta?.namespace).to.eql('default');
        expect(contextIndex[indexName].mappings?._meta?.kibana?.version).to.be.a('string');
        expect(contextIndex[indexName].mappings?.dynamic).to.eql('false');
        expect(contextIndex[indexName].mappings?.properties).to.eql({
          ...contextSpecificMappings,
          ...frameworkMappings.properties,
        });

        expect(contextIndex[indexName].settings?.index?.lifecycle).to.eql({
          name: '.alerts-ilm-policy',
          rollover_alias: '.alerts-test.patternfiring.alerts-default',
        });

        expect(contextIndex[indexName].settings?.index?.mapping).to.eql({
          ignore_malformed: 'true',
          total_fields: {
            limit: '2800',
            ignore_dynamic_beyond_limit: 'true',
          },
        });

        expect(contextIndex[indexName].settings?.index?.hidden).to.eql('true');
        expect(contextIndex[indexName].settings?.index?.number_of_shards).to.eql(1);
        expect(contextIndex[indexName].settings?.index?.auto_expand_replicas).to.eql('0-1');
        expect(contextIndex[indexName].settings?.index?.provided_name).to.eql(
          '.internal.alerts-test.patternfiring.alerts-default-000001'
        );
      });
    });
  });
}
