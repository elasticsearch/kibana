/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PropsWithChildren } from 'react';
import React, { useMemo, useEffect, useState } from 'react';
import {
  EuiPanel,
  EuiSpacer,
  EuiTitle,
  EuiDescriptionList,
  useEuiTheme,
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiLoadingSpinner,
  euiFontSize,
  EuiTextColor,
  EuiText,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import type { PolicyFromES } from '@kbn/index-lifecycle-management-common-shared';
import {
  IndexMode,
  type TemplateListItem as IndexTemplate,
  type SimulateIndexTemplateResponse,
} from '@kbn/index-management-shared-types';

import {
  formatDataRetention,
  indexModeLabels,
  getPhaseDescriptions,
  type PhaseDescription,
  type IlmPolicyFetcher,
  type SimulatedTemplateFetcher,
} from '../../../../utils';

interface PhasesInfoProps {
  ilmPhases: PhaseDescription[] | null;
  isLoadingIlmPolicy?: boolean;
  hasErrorLoadingIlmPolicy?: boolean;
}

const PhasesInfo = ({
  ilmPhases,
  isLoadingIlmPolicy = false,
  hasErrorLoadingIlmPolicy = false,
}: PhasesInfoProps) => {
  if (isLoadingIlmPolicy) {
    return (
      <EuiFlexItem grow={false}>
        <EuiLoadingSpinner size="s" />
      </EuiFlexItem>
    );
  }

  if (hasErrorLoadingIlmPolicy) {
    return (
      <EuiFlexItem grow={false}>
        <EuiTextColor color="warning">
          {i18n.translate(
            'xpack.createClassicStreamFlyout.nameAndConfirmStep.ilmPolicyErrorDescription',
            {
              defaultMessage:
                'There was an error while loading the ILM policy phases. Try again later.',
            }
          )}
        </EuiTextColor>
      </EuiFlexItem>
    );
  }

  if (ilmPhases && ilmPhases.length > 0) {
    return (
      <EuiFlexItem grow={false}>
        <EuiFlexGroup gutterSize="s" alignItems="center" direction="row" responsive={false} wrap>
          {ilmPhases.map((phase, idx) => (
            <EuiFlexItem key={idx} grow={false}>
              <EuiHealth textSize="xs" color={phase.color}>
                <EuiTextColor color="subdued">{phase.description}</EuiTextColor>
              </EuiHealth>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      </EuiFlexItem>
    );
  }

  return null;
};

const LookupRetentionNotApplied = () => (
  <EuiFlexGroup direction="column" gutterSize="xs" data-test-subj="lookupRetentionNotApplied">
    <EuiFlexItem grow={false}>
      {i18n.translate(
        'xpack.createClassicStreamFlyout.nameAndConfirmStep.lookupRetentionNotAppliedLabel',
        {
          defaultMessage: 'Not applied to lookup index mode',
        }
      )}
    </EuiFlexItem>
    <EuiFlexItem grow={false}>
      <EuiTextColor color="subdued">
        {i18n.translate(
          'xpack.createClassicStreamFlyout.nameAndConfirmStep.lookupRetentionNotAppliedDescription',
          {
            defaultMessage:
              'Index lifecycle management and data stream lifecycle skip indices with the lookup index mode.',
          }
        )}
      </EuiTextColor>
    </EuiFlexItem>
  </EuiFlexGroup>
);

interface RetentionDetailsProps {
  ilmPolicyName: string;
}

const RetentionDetails = ({
  ilmPolicyName,
  children,
}: PropsWithChildren<RetentionDetailsProps>) => (
  <EuiFlexGroup direction="column" gutterSize="xs" alignItems="flexStart">
    <EuiFlexItem grow={false}>
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>{ilmPolicyName}</EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color="hollow">
            {i18n.translate('xpack.createClassicStreamFlyout.nameAndConfirmStep.ilmBadgeLabel', {
              defaultMessage: 'ILM',
            })}
          </EuiBadge>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlexItem>
    {children}
  </EuiFlexGroup>
);

interface ConfirmTemplateDetailsSectionProps {
  template: IndexTemplate;
  getIlmPolicy?: IlmPolicyFetcher;
  getSimulatedTemplate?: SimulatedTemplateFetcher;
}

const useStyles = () => {
  const euiThemeContext = useEuiTheme();
  const { euiTheme } = euiThemeContext;

  return {
    panel: css`
      padding: ${euiTheme.size.l};
      border-top: ${euiTheme.border.thin};
    `,
    descriptionList: css`
      row-gap: 16px;
      column-gap: 16px;

      .euiDescriptionList__title {
        white-space: nowrap;
        ${euiFontSize(euiThemeContext, 'xs')}
      }

      .euiDescriptionList__description {
        ${euiFontSize(euiThemeContext, 'xs')}
      }
    `,
  };
};

export const ConfirmTemplateDetailsSection = ({
  template,
  getIlmPolicy,
  getSimulatedTemplate,
}: ConfirmTemplateDetailsSectionProps) => {
  const styles = useStyles();
  const { euiTheme } = useEuiTheme();

  const [ilmPolicy, setIlmPolicy] = useState<PolicyFromES | null>(null);
  const [isLoadingIlmPolicy, setIsLoadingIlmPolicy] = useState(false);
  const [hasErrorLoadingIlmPolicy, setHasErrorLoadingIlmPolicy] = useState(false);

  const [simulatedTemplate, setSimulatedTemplate] = useState<SimulateIndexTemplateResponse | null>(
    null
  );
  const [isLoadingSimulatedTemplate, setIsLoadingSimulatedTemplate] = useState(false);
  const [hasErrorLoadingSimulatedTemplate, setHasErrorLoadingSimulatedTemplate] = useState(false);

  // Derive ILM policy name from simulated template settings
  const ilmPolicyName = simulatedTemplate?.template?.settings?.index?.lifecycle?.name;
  // ILM and data stream lifecycle are both skipped for lookup indices, so the policy is never applied
  const isLookupMode = simulatedTemplate?.template?.settings?.index?.mode === IndexMode.lookup;
  const hasDataStreamLifecycle = simulatedTemplate?.template?.lifecycle?.enabled === true;

  const phaseColors = useMemo(
    () => ({
      hot: euiTheme.colors.severity.risk,
      warm: euiTheme.colors.severity.warning,
      cold: euiTheme.colors.severity.neutral,
      frozen: euiTheme.colors.vis.euiColorVis3,
    }),
    [euiTheme]
  );

  // Fetch simulated template data when getSimulatedTemplate is available
  useEffect(() => {
    if (!getSimulatedTemplate) {
      setSimulatedTemplate(null);
      return;
    }

    const abortController = new AbortController();
    setIsLoadingSimulatedTemplate(true);
    setHasErrorLoadingSimulatedTemplate(false);

    getSimulatedTemplate(template.name, abortController.signal)
      .then((data) => {
        if (!abortController.signal.aborted && data) {
          setSimulatedTemplate(data);
        }
      })
      .catch((error) => {
        if (!abortController.signal.aborted) {
          setSimulatedTemplate(null);
          setHasErrorLoadingSimulatedTemplate(true);
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsLoadingSimulatedTemplate(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [getSimulatedTemplate, template.name]);

  // Fetch ILM policy details when policy name is available (skipped for lookup mode, where it is not applied)
  useEffect(() => {
    if (!ilmPolicyName || !getIlmPolicy || isLookupMode) {
      setIlmPolicy(null);
      return;
    }

    const abortController = new AbortController();
    setIsLoadingIlmPolicy(true);
    setHasErrorLoadingIlmPolicy(false);

    getIlmPolicy(ilmPolicyName, abortController.signal)
      .then((policy) => {
        if (!abortController.signal.aborted && policy) {
          setIlmPolicy(policy);
        }
      })
      .catch((error) => {
        if (!abortController.signal.aborted) {
          setIlmPolicy(null);
          setHasErrorLoadingIlmPolicy(true);
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsLoadingIlmPolicy(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [ilmPolicyName, getIlmPolicy, isLookupMode]);

  const ilmPhases = useMemo(() => {
    if (!ilmPolicy) {
      return null;
    }
    return getPhaseDescriptions(ilmPolicy.policy.phases, phaseColors);
  }, [ilmPolicy, phaseColors]);

  const templateDetails = useMemo(() => {
    const componentTemplates = template.composedOf ?? [];

    const items: Array<{ title: string; description: NonNullable<React.ReactNode> }> = [];

    // Show loading state while fetching simulated template
    if (isLoadingSimulatedTemplate) {
      return [
        {
          title: i18n.translate('xpack.createClassicStreamFlyout.nameAndConfirmStep.loadingLabel', {
            defaultMessage: 'Loading…',
          }),
          description: <EuiLoadingSpinner size="s" />,
        },
      ];
    }

    // Version
    if (template.version !== undefined) {
      items.push({
        title: i18n.translate('xpack.createClassicStreamFlyout.nameAndConfirmStep.versionLabel', {
          defaultMessage: 'Version',
        }),
        description: String(template.version),
      });
    }

    // Index mode and retention are only shown when simulated template data is available
    if (simulatedTemplate) {
      const simulatedSettings = simulatedTemplate.template?.settings;
      const indexMode = simulatedSettings?.index?.mode ?? 'standard';

      // Index mode (from simulated template settings)
      items.push({
        title: i18n.translate('xpack.createClassicStreamFlyout.nameAndConfirmStep.indexModeLabel', {
          defaultMessage: 'Index mode',
        }),
        description: indexModeLabels[indexMode as keyof typeof indexModeLabels],
      });

      // Retention - ILM policy or data stream lifecycle from original template
      if (isLookupMode) {
        // Lifecycle is configured but never applied to lookup indices
        if (ilmPolicyName || hasDataStreamLifecycle || formatDataRetention(template)) {
          items.push({
            title: i18n.translate(
              'xpack.createClassicStreamFlyout.nameAndConfirmStep.retentionLabel',
              {
                defaultMessage: 'Retention',
              }
            ),
            description: <LookupRetentionNotApplied />,
          });
        }
      } else if (ilmPolicyName) {
        // Show ILM policy retention with phases
        items.push({
          title: i18n.translate(
            'xpack.createClassicStreamFlyout.nameAndConfirmStep.retentionLabel',
            {
              defaultMessage: 'Retention',
            }
          ),
          description: (
            <RetentionDetails ilmPolicyName={ilmPolicyName}>
              <PhasesInfo
                ilmPhases={ilmPhases}
                isLoadingIlmPolicy={isLoadingIlmPolicy}
                hasErrorLoadingIlmPolicy={hasErrorLoadingIlmPolicy}
              />
            </RetentionDetails>
          ),
        });
      } else {
        // Fall back to data stream lifecycle from original template
        const dataRetention = formatDataRetention(template);
        if (dataRetention) {
          items.push({
            title: i18n.translate(
              'xpack.createClassicStreamFlyout.nameAndConfirmStep.retentionLabel',
              {
                defaultMessage: 'Retention',
              }
            ),
            description: dataRetention,
          });
        }
      }
    }

    // Component templates
    if (componentTemplates.length > 0) {
      items.push({
        title: i18n.translate(
          'xpack.createClassicStreamFlyout.nameAndConfirmStep.componentTemplatesLabel',
          { defaultMessage: 'Component templates' }
        ),
        description: (
          <EuiFlexGroup direction="column" gutterSize="xs">
            {componentTemplates.map((ct, idx) => (
              <EuiFlexItem key={idx}>{ct}</EuiFlexItem>
            ))}
          </EuiFlexGroup>
        ),
      });
    }

    return items;
  }, [
    template,
    simulatedTemplate,
    isLoadingSimulatedTemplate,
    ilmPolicyName,
    isLookupMode,
    hasDataStreamLifecycle,
    ilmPhases,
    isLoadingIlmPolicy,
    hasErrorLoadingIlmPolicy,
  ]);

  return (
    <EuiPanel hasBorder={false} hasShadow={false} paddingSize="none" css={styles.panel}>
      <EuiTitle size="xxs">
        <h4>
          <FormattedMessage
            id="xpack.createClassicStreamFlyout.nameAndConfirmStep.confirmTitle"
            defaultMessage="Confirm index template details"
          />
        </h4>
      </EuiTitle>
      <EuiSpacer size="m" />

      {hasErrorLoadingSimulatedTemplate && (
        <>
          <EuiText color="warning" size="xs">
            {i18n.translate(
              'xpack.createClassicStreamFlyout.nameAndConfirmStep.simulatedTemplateErrorDescription',
              {
                defaultMessage:
                  'There was an error while loading index mode and data retention info. Try again later.',
              }
            )}
          </EuiText>
          <EuiSpacer size="m" />
        </>
      )}

      <EuiDescriptionList
        listItems={templateDetails}
        type="column"
        columnWidths={[1, 3]}
        compressed
        data-test-subj="templateDetails"
        css={styles.descriptionList}
      />
    </EuiPanel>
  );
};
