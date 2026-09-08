/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import {
  SAMPLE_V1_TEMPLATE_ID,
  SAMPLE_V2_TEMPLATE_ID,
  createAlertingV2RuleTemplateSO,
  createRuleTemplateSO,
  deleteRuleTemplateByESQuery,
  findRuleTemplates,
} from '../../../../common/lib/rule_template';
import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { Superuser } from '../../../scenarios';

export default (ftrProvider: FtrProviderContext): void => {
  const supertestWithoutAuth = ftrProvider.getService('supertestWithoutAuth');

  describe('find_rule_templates', () => {
    afterEach(async () => {
      await deleteRuleTemplateByESQuery(ftrProvider);
    });

    it('returns v1 templates and excludes alerting v2 engine templates', async () => {
      await createRuleTemplateSO(ftrProvider);
      await createAlertingV2RuleTemplateSO(ftrProvider);

      const response = await findRuleTemplates({
        supertest: supertestWithoutAuth,
        query: { per_page: 100 },
        auth: { user: Superuser, space: null },
      });

      expect(response.status).to.eql(200);

      const ids = response.body.data.map((template: { id: string }) => template.id);
      expect(ids).to.contain(SAMPLE_V1_TEMPLATE_ID);
      expect(ids).not.to.contain(SAMPLE_V2_TEMPLATE_ID);
    });
  });
};
