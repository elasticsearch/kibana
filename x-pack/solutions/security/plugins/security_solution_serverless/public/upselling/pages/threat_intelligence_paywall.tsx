/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiEmptyPrompt, EuiIcon } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { ProductFeatureKeyType } from '@kbn/security-solution-features';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import { getProductTypeByPLI } from '../hooks/use_product_type_by_pli';

const ThreatIntelligencePaywall: React.FC<{ requiredPLI: ProductFeatureKeyType }> = React.memo(
  function PaywallComponent({ requiredPLI }) {
    const productTypeRequired = getProductTypeByPLI(requiredPLI);

    return (
      <KibanaPageTemplate restrictWidth={false} contentBorder={false} grow={true}>
        <KibanaPageTemplate.Section>
          <EuiEmptyPrompt
            icon={<EuiIcon type="logoSecurity" size="xl" aria-hidden={true} />}
            color="subdued"
            title={
              <h2>
                <FormattedMessage
                  id="xpack.securitySolutionServerless.threatIntelligence.paywall.title"
                  defaultMessage="Do more with Security!"
                />
              </h2>
            }
            body={
              <p>
                <FormattedMessage
                  id="xpack.securitySolutionServerless.threatIntelligence.paywall.body"
                  defaultMessage="Upgrade your license to {productTypeRequired} to use threat intelligence."
                  values={{ productTypeRequired }}
                />
              </p>
            }
          />
        </KibanaPageTemplate.Section>
      </KibanaPageTemplate>
    );
  }
);

ThreatIntelligencePaywall.displayName = 'ThreatIntelligencePaywall';

// eslint-disable-next-line import/no-default-export
export { ThreatIntelligencePaywall as default };
