/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import {
  EuiCard,
  EuiIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiTextColor,
  EuiSpacer,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { ProductFeatureKeyType } from '@kbn/security-solution-features';
import { useProductTypeByPLI } from '../../hooks/use_product_type_by_pli';

export const UPGRADE_PRODUCT_MESSAGE = (requiredProductType: string) =>
  i18n.translate(
    'xpack.securitySolutionServerless.upselling.automaticImport.upgradeProductMessage',
    {
      defaultMessage:
        'To turn on the Automatic Import feature, you must upgrade the product tier to {requiredProductType}',
      values: {
        requiredProductType,
      },
    }
  );
export const TIER_REQUIRED = (requiredProductType: string) =>
  i18n.translate('xpack.securitySolutionServerless.upselling.automaticImport.tierRequired', {
    defaultMessage: '{requiredProductType} tier required',
    values: {
      requiredProductType,
    },
  });
export const CONTACT_ADMINISTRATOR = i18n.translate(
  'xpack.securitySolutionServerless.upselling.automaticImport.contactAdministrator',
  {
    defaultMessage: 'Contact your administrator for assistance.',
  }
);

export interface IntegrationsAssistantProps {
  requiredPLI: ProductFeatureKeyType;
}
export const AutomaticImport = React.memo<IntegrationsAssistantProps>(({ requiredPLI }) => {
  const requiredProductType = useProductTypeByPLI(requiredPLI);
  return (
    <>
      <EuiSpacer size="m" />
      <EuiCard
        data-test-subj={'EnterpriseLicenseRequiredCard'}
        betaBadgeProps={{
          label: requiredProductType,
        }}
        isDisabled={true}
        icon={<EuiIcon size="xl" type="lock" aria-hidden={true} />}
        title={
          <h3>
            <strong>{TIER_REQUIRED(requiredProductType)}</strong>
          </h3>
        }
        description={false}
      >
        <EuiFlexGroup className="lockedCardDescription" direction="column" justifyContent="center">
          <EuiFlexItem>
            <EuiSpacer size="s" />
            <EuiText>
              <h4>
                <EuiTextColor color="subdued">
                  {UPGRADE_PRODUCT_MESSAGE(requiredProductType)}
                </EuiTextColor>
              </h4>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>{CONTACT_ADMINISTRATOR}</EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiCard>
    </>
  );
});
AutomaticImport.displayName = 'IntegrationsAssistant';
