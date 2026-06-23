/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState } from 'react';

import { EuiButton, EuiButtonEmpty, EuiPageTemplate } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { docLinks } from '../../../common/doc_links';
import { useKibana } from '../../hooks/use_kibana';
import { isInferencePreferencesEnabled } from '../../feature_flag';

export const ElasticInferenceServiceModelsHeader = () => {
  const {
    services: { cloud, uiSettings },
  } = useKibana();

  const showManageRegions = isInferencePreferencesEnabled(uiSettings);

  const [billingUrl, setBillingUrl] = useState<string>();
  useEffect(() => {
    if (cloud?.isCloudEnabled && cloud?.getPrivilegedUrls) {
      cloud.getPrivilegedUrls().then((urls) => {
        if (urls.billingUrl) {
          setBillingUrl(urls.billingUrl);
        }
      });
    }
  }, [cloud]);

  return (
    <EuiPageTemplate.Header
      data-test-subj="eisModelsPageHeader"
      pageTitle={i18n.translate('xpack.searchInferenceEndpoints.eisModelsPage.header', {
        defaultMessage: 'Elastic Inference Service',
      })}
      description={i18n.translate('xpack.searchInferenceEndpoints.eisModelsPage.description', {
        defaultMessage: 'Manage models and endpoints for Elastic Inference Service',
      })}
      paddingSize="none"
      bottomBorder={true}
      rightSideItems={[
        ...(cloud?.isCloudEnabled && billingUrl
          ? [
              <EuiButton
                data-test-subj="searchInferenceEndpointsElasticInferenceServiceModelsHeaderViewCloudUsageButton"
                href={billingUrl}
                target="_blank"
                iconType="external"
                aria-label={i18n.translate(
                  'xpack.searchInferenceEndpoints.eisModelsPage.cloudUsage.ariaLabel',
                  {
                    defaultMessage: 'Click to go Cloud usage details',
                  }
                )}
              >
                {i18n.translate('xpack.searchInferenceEndpoints.eisModelsPage.cloudUsage.button', {
                  defaultMessage: 'View Cloud usage',
                })}
              </EuiButton>,
            ]
          : []),
        <EuiButtonEmpty
          iconType="documentation"
          aria-label={i18n.translate(
            'xpack.searchInferenceEndpoints.eisModelsPage.header.documentation.ariaLabel',
            {
              defaultMessage: 'Click to go Elastic Inference Service documentation',
            }
          )}
          href={docLinks.elasticInferenceService}
          iconSide="left"
          target="_blank"
          data-test-subj="eis_documentation"
        >
          {i18n.translate('xpack.searchInferenceEndpoints.eisModelsPage.documentationButton', {
            defaultMessage: 'Documentation',
          })}
        </EuiButtonEmpty>,
        ...(showManageRegions
          ? [
              <EuiButton
                data-test-subj="eisManageRegionsButton"
                iconType="plusInCircle"
                onClick={() => {}}
              >
                {i18n.translate(
                  'xpack.searchInferenceEndpoints.eisModelsPage.manageRegions.button',
                  { defaultMessage: 'Manage regions' }
                )}
              </EuiButton>,
            ]
          : []),
      ]}
    />
  );
};
