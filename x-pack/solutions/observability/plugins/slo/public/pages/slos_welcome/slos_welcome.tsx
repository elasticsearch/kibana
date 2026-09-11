/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButton,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIllustration,
  EuiLink,
  EuiPageSection,
  EuiTitle,
} from '@elastic/eui';
import { monitoringLogs } from '@elastic/eui-illustrations';
import { i18n } from '@kbn/i18n';
import { useBreadcrumbs } from '@kbn/observability-shared-plugin/public';
import { paths, SLOS_PATH } from '@kbn/slo-shared-plugin/common/locators/paths';
import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { SloAppHeader } from '../../components/slo_app_header/slo_app_header';
import { SloOutdatedCallout } from '../../components/slo/slo_outdated_callout';
import { SloPermissionsCallout } from '../../components/slo/slo_permissions_callout';
import { SloTemplatesFlyout } from '../../components/slo/slo_templates/slo_templates_flyout';
import { useHasSlos } from '../../hooks/use_has_slos';
import { useKibana } from '../../hooks/use_kibana';
import { useLicense } from '../../hooks/use_license';
import { usePermissions } from '../../hooks/use_permissions';
import { usePluginContext } from '../../hooks/use_plugin_context';
import { LoadingState } from '../../components/loading_state';

const pageTitle = i18n.translate('xpack.slo.slosPage.', { defaultMessage: 'SLOs' });

export function SlosWelcomePage() {
  const {
    application: { navigateToUrl },
    http: { basePath },
    docLinks,
    serverless,
  } = useKibana().services;

  const { ObservabilityPageTemplate } = usePluginContext();
  const { data: permissions } = usePermissions();
  const { hasAtLeast } = useLicense();
  const hasRightLicense = hasAtLeast('platinum');
  const history = useHistory();
  const [isTemplatesFlyoutOpen, setIsTemplatesFlyoutOpen] = useState(false);

  const { hasSlos, isLoading } = useHasSlos();

  const isDisabled = !permissions?.hasAllWriteRequested;

  const hasSlosAndPermissions =
    !isLoading && hasSlos && hasRightLicense && permissions?.hasAllReadRequested === true;

  const handleClickCreateSlo = () => {
    navigateToUrl(basePath.prepend(paths.sloCreate));
  };

  const handleClickCreateFromTemplate = () => {
    setIsTemplatesFlyoutOpen(true);
  };

  useEffect(() => {
    if (hasSlosAndPermissions) {
      history.replace(SLOS_PATH);
    }
  }, [hasSlosAndPermissions, history]);

  useBreadcrumbs(
    [
      {
        href: basePath.prepend(paths.slos),
        text: i18n.translate('xpack.slo.breadcrumbs.slosLinkText', {
          defaultMessage: 'SLOs',
        }),
        deepLinkId: 'slo',
      },
    ],
    { serverless }
  );

  return (
    <ObservabilityPageTemplate
      data-test-subj="sloWelcomePage"
      pageSectionProps={{ paddingSize: 'none' }}
    >
      <SloAppHeader title={pageTitle} />
      <EuiPageSection paddingSize="l" restrictWidth={false}>
        {isLoading ? (
          <LoadingState dataTestSubj="sloWelcomePageLoading" />
        ) : (
          <>
            <SloOutdatedCallout />
            <SloPermissionsCallout />
            <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: '60vh' }}>
              <EuiFlexItem grow={false}>
                <EuiEmptyPrompt
                  icon={
                    <EuiIllustration
                      type={monitoringLogs}
                      alt=""
                      style={{ maxInlineSize: 240, marginInline: 'auto' }}
                    />
                  }
                  title={
                    <h2>
                      {i18n.translate('xpack.slo.sloList.welcomePrompt.title', {
                        defaultMessage: 'Track and deliver on your SLOs',
                      })}
                    </h2>
                  }
                  layout="horizontal"
                  color="plain"
                  body={
                    <>
                      <p>
                        {i18n.translate('xpack.slo.sloList.welcomePrompt.messageParagraph1', {
                          defaultMessage:
                            'Measure key metrics important to the business, such as service-level indicators and service-level objectives (SLIs/SLOs) to deliver on SLAs.',
                        })}
                      </p>
                      <p>
                        {i18n.translate('xpack.slo.sloList.welcomePrompt.messageParagraph2', {
                          defaultMessage:
                            'Easily report the uptime and reliability of your services to stakeholders with real-time insights.',
                        })}
                      </p>
                    </>
                  }
                  actions={
                    hasRightLicense ? (
                      <EuiFlexGroup gutterSize="s" alignItems="center">
                        <EuiFlexItem grow={false}>
                          <EuiButton
                            data-test-subj="o11ySloListWelcomePromptCreateSloButton"
                            fill
                            color="primary"
                            iconType="plusCircle"
                            onClick={handleClickCreateSlo}
                            disabled={isDisabled}
                          >
                            {i18n.translate('xpack.slo.sloList.welcomePrompt.buttonLabel', {
                              defaultMessage: 'Create SLO',
                            })}
                          </EuiButton>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiButton
                            data-test-subj="o11ySloListWelcomePromptCreateFromTemplateButton"
                            color="primary"
                            iconType="pagesSelect"
                            onClick={handleClickCreateFromTemplate}
                            disabled={isDisabled}
                          >
                            {i18n.translate(
                              'xpack.slo.sloList.welcomePrompt.createFromTemplateButtonLabel',
                              { defaultMessage: 'Create from template' }
                            )}
                          </EuiButton>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    ) : (
                      <EuiFlexGroup direction="column" gutterSize="s">
                        <EuiFlexItem grow={false}>
                          <EuiTitle size="xxs">
                            <span>
                              {i18n.translate(
                                'xpack.slo.sloList.welcomePrompt.needLicenseMessage',
                                {
                                  defaultMessage:
                                    'You need an Elastic Cloud subscription or Platinum license to use SLOs.',
                                }
                              )}
                            </span>
                          </EuiTitle>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiFlexGroup gutterSize="s" alignItems="center">
                            <EuiFlexItem grow={false}>
                              <EuiButton
                                fill
                                href="https://www.elastic.co/cloud/elasticsearch-service/signup"
                                target="_blank"
                                data-test-subj="sloWelcomePageSignupForCloudButton"
                              >
                                {i18n.translate('xpack.slo.sloList.welcomePrompt.signupForCloud', {
                                  defaultMessage: 'Sign up for Elastic Cloud',
                                })}
                              </EuiButton>
                            </EuiFlexItem>
                            <EuiFlexItem grow={false}>
                              <EuiButton
                                href="https://www.elastic.co/subscriptions"
                                target="_blank"
                                data-test-subj="sloWelcomePageSignupForLicenseButton"
                              >
                                {i18n.translate(
                                  'xpack.slo.sloList.welcomePrompt.signupForLicense',
                                  {
                                    defaultMessage: 'Sign up for license',
                                  }
                                )}
                              </EuiButton>
                            </EuiFlexItem>
                          </EuiFlexGroup>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    )
                  }
                  footer={
                    <>
                      <EuiTitle size="xxs">
                        <span>
                          {i18n.translate('xpack.slo.sloList.welcomePrompt.learnMore', {
                            defaultMessage: 'Want to learn more?',
                          })}
                        </span>
                      </EuiTitle>{' '}
                      <EuiLink
                        data-test-subj="o11ySloListWelcomePromptReadTheDocsLink"
                        href={docLinks.links.observability.slo}
                        target="_blank"
                      >
                        {i18n.translate('xpack.slo.sloList.welcomePrompt.learnMoreLink', {
                          defaultMessage: 'Read the docs',
                        })}
                      </EuiLink>
                    </>
                  }
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            {isTemplatesFlyoutOpen && (
              <SloTemplatesFlyout onClose={() => setIsTemplatesFlyoutOpen(false)} />
            )}
          </>
        )}
      </EuiPageSection>
    </ObservabilityPageTemplate>
  );
}
