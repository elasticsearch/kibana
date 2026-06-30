/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiPanel, EuiIcon, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { ConnectorIcon } from '@kbn/search-shared-ui';
import { SearchEmptyPrompt } from '@kbn/search-shared-ui';
import { SERVERLESS_ES_CONNECTORS_ID } from '@kbn/deeplinks-search/constants';
import { DecorativeHorizontalStepper } from '@kbn/search-connectors';
import { BACK_LABEL, COMING_SOON_LABEL } from '../../../../common/i18n_string';
import { useKibanaServices } from '../../hooks/use_kibana';
import { useConnectorTypes } from '../../hooks/api/use_connector_types';

export const ElasticManagedConnectorsEmptyPrompt: React.FC = () => {
  const connectorTypes = useConnectorTypes();
  const connectorExamples = connectorTypes.filter((connector) =>
    ['Gmail', 'Sharepoint Online', 'Jira Cloud', 'Dropbox'].includes(connector.name)
  );

  const {
    application: { navigateToApp },
  } = useKibanaServices();

  return (
    <SearchEmptyPrompt
      backButton={{
        label: BACK_LABEL,
        onClickBack: () => navigateToApp(SERVERLESS_ES_CONNECTORS_ID),
      }}
      icon="plugs"
      title={i18n.translate('xpack.serverlessSearch.elasticManagedConnectorEmpty.title', {
        defaultMessage: 'Elastic managed connectors',
      })}
      description={i18n.translate(
        'xpack.serverlessSearch.elasticManagedConnectorEmpty.description',
        {
          defaultMessage:
            "We're actively developing Elastic managed connectors, that won't require any self-managed infrastructure. You'll be able to handle all configuration in the UI. This will simplify syncing your data into a serverless Elasticsearch project. This new workflow will have two steps:",
        }
      )}
      isComingSoon
      comingSoonLabel={COMING_SOON_LABEL}
      body={
        <EuiFlexGroup
          alignItems="stretch"
          justifyContent="center"
          direction="column"
          gutterSize="s"
        >
          <EuiFlexItem>
            <EuiPanel color="subdued">
              <EuiFlexItem grow={false}>
                <DecorativeHorizontalStepper stepCount={2} />
              </EuiFlexItem>
              <EuiFlexGroup>
                <EuiFlexItem>
                  <EuiFlexGroup justifyContent="flexStart" alignItems="center" direction="column">
                    <EuiFlexItem grow={false}>
                      <EuiFlexGroup
                        justifyContent="center"
                        alignItems="center"
                        direction="row"
                        gutterSize="s"
                      >
                        {connectorExamples.map((connector, index) => (
                          <React.Fragment key={connector.serviceType}>
                            {index === Math.floor(connectorExamples.length / 2) && (
                              <EuiFlexItem grow={false}>
                                <EuiIcon
                                  color="primary"
                                  size="l"
                                  type="documents"
                                  aria-hidden={true}
                                />
                              </EuiFlexItem>
                            )}
                            <EuiFlexItem grow={false}>
                              <ConnectorIcon
                                name={connector.name}
                                serviceType={connector.serviceType}
                                iconPath={connector.iconPath}
                                showTooltip
                              />
                            </EuiFlexItem>
                          </React.Fragment>
                        ))}
                      </EuiFlexGroup>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiText>
                        <p>
                          {i18n.translate(
                            'xpack.serverlessSearch.elasticManagedConnectorEmpty.guideOneDescription',
                            {
                              defaultMessage:
                                "Choose from over 30 third-party data sources you'd like to sync",
                            }
                          )}
                        </p>
                      </EuiText>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiFlexGroup justifyContent="flexStart" alignItems="center" direction="column">
                    <EuiFlexItem grow={false}>
                      <EuiFlexGroup
                        gutterSize="s"
                        direction="row"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <EuiFlexItem>
                          <EuiIcon color="primary" size="l" type="plugs" aria-hidden={true} />
                        </EuiFlexItem>
                        <EuiFlexItem>
                          <EuiIcon color="primary" size="l" type="logoElastic" aria-hidden={true} />
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiText>
                        <p>
                          {i18n.translate(
                            'xpack.serverlessSearch.elasticManagedConnectorEmpty.guideThreeDescription',
                            {
                              defaultMessage:
                                'Enter access and connection details for your data source and run your first sync using the Kibana UI',
                            }
                          )}
                        </p>
                      </EuiText>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPanel>
          </EuiFlexItem>
        </EuiFlexGroup>
      }
    />
  );
};
