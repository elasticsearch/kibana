/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiButtonIcon,
  EuiCode,
  EuiConfirmModal,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { CoreStart, useService } from '@kbn/core-di-browser';
import { PluginStart } from '@kbn/core-di';
import { DASHBOARD_APP_LOCATOR } from '@kbn/deeplinks-analytics';
import type { DashboardStart } from '@kbn/dashboard-plugin/public';
import type { SharePluginStart } from '@kbn/share-plugin/public';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { MissingDashboard } from '@kbn/alerting-v2-rule-form';
import { useComposeDiscoverFlyout } from '../../../../hooks/use_compose_discover_flyout';
import { useUpdateRule } from '../../../../hooks/use_update_rule';
import { useRule } from '../../rule_context';
import { useDashboardArtifacts } from './use_dashboard_artifacts';

const getDashboardHref = ({
  dashboardId,
  share,
  httpBasePathPrepend,
}: {
  dashboardId: string;
  share: SharePluginStart;
  httpBasePathPrepend: (path: string) => string;
}) =>
  share.url.locators.get(DASHBOARD_APP_LOCATOR)?.getRedirectUrl({ dashboardId }) ??
  httpBasePathPrepend(`/app/dashboards#/view/${dashboardId}`);

interface DashboardRowActionsProps {
  dashboardId: string;
  dashboardTitle: string;
  href?: string;
  artifactId: string | undefined;
  isDeleting: boolean;
  onDelete: (artifactId: string) => void;
}

const DashboardRowActions = ({
  dashboardId,
  dashboardTitle,
  href,
  artifactId,
  isDeleting,
  onDelete,
}: DashboardRowActionsProps) => (
  <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
    {href ? (
      <EuiFlexItem grow={false}>
        <EuiButtonIcon
          iconType="external"
          color="text"
          href={href}
          target="_blank"
          aria-label={i18n.translate(
            'xpack.alertingV2.ruleDetails.artifacts.dashboards.openDashboardAriaLabel',
            {
              defaultMessage: 'Open dashboard {dashboardTitle}',
              values: { dashboardTitle },
            }
          )}
          data-test-subj={`ruleDashboardArtifactOpenLink-${dashboardId}`}
        />
      </EuiFlexItem>
    ) : null}
    {artifactId ? (
      <EuiFlexItem grow={false}>
        <EuiButtonIcon
          iconType="trash"
          color="danger"
          aria-label={i18n.translate(
            'xpack.alertingV2.ruleDetails.artifacts.dashboards.deleteAriaLabel',
            {
              defaultMessage: 'Remove dashboard {dashboardTitle}',
              values: { dashboardTitle },
            }
          )}
          data-test-subj={`ruleDashboardArtifactDeleteButton-${dashboardId}`}
          isDisabled={isDeleting}
          onClick={() => onDelete(artifactId)}
        />
      </EuiFlexItem>
    ) : null}
  </EuiFlexGroup>
);

const ResolvedDashboardRow = ({
  dashboardId,
  title,
  href,
  artifactId,
  isDeleting,
  onDelete,
}: {
  dashboardId: string;
  title: string;
  href: string;
  artifactId: string | undefined;
  isDeleting: boolean;
  onDelete: (artifactId: string) => void;
}) => (
  <EuiPanel hasBorder paddingSize="s" data-test-subj={`ruleDashboardArtifactRow-${dashboardId}`}>
    <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
      <EuiFlexItem grow>
        <EuiText size="s" data-test-subj={`ruleDashboardArtifactTitle-${dashboardId}`}>
          {title}
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <DashboardRowActions
          dashboardId={dashboardId}
          dashboardTitle={title}
          href={href}
          artifactId={artifactId}
          isDeleting={isDeleting}
          onDelete={onDelete}
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  </EuiPanel>
);

const MissingDashboardRow = ({
  missingDashboard,
  artifactId,
  isDeleting,
  onDelete,
}: {
  missingDashboard: MissingDashboard;
  artifactId: string | undefined;
  isDeleting: boolean;
  onDelete: (artifactId: string) => void;
}) => {
  const missingTitle = missingDashboard.notFound
    ? i18n.translate('xpack.alertingV2.ruleDetails.artifacts.dashboards.deletedBadge', {
        defaultMessage: 'Dashboard deleted',
      })
    : i18n.translate('xpack.alertingV2.ruleDetails.artifacts.dashboards.unavailableBadge', {
        defaultMessage: 'Dashboard unavailable',
      });

  return (
    <EuiPanel
      hasBorder
      paddingSize="s"
      data-test-subj={`ruleDashboardArtifactMissingRow-${missingDashboard.id}`}
    >
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiBadge color="warning" iconType="warning">
            {missingTitle}
          </EuiBadge>
        </EuiFlexItem>
        <EuiFlexItem grow>
          <EuiText size="s" color="subdued">
            <FormattedMessage
              id="xpack.alertingV2.ruleDetails.artifacts.dashboards.missingDashboardLabel"
              defaultMessage="Unknown dashboard"
            />{' '}
            <EuiCode>{missingDashboard.id}</EuiCode>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <DashboardRowActions
            dashboardId={missingDashboard.id}
            dashboardTitle={missingTitle}
            artifactId={artifactId}
            isDeleting={isDeleting}
            onDelete={onDelete}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};

const DashboardsSubsectionHeader = ({
  onAdd,
  isAddDisabled,
}: {
  onAdd: () => void;
  isAddDisabled: boolean;
}) => (
  <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
    <EuiFlexItem grow={false}>
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiIcon type="dashboardApp" size="m" aria-hidden={true} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="s">
            <strong>
              {i18n.translate('xpack.alertingV2.ruleDetails.artifacts.dashboards.title', {
                defaultMessage: 'Dashboards',
              })}
            </strong>
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlexItem>
    {!isAddDisabled ? (
      <EuiFlexItem grow={false}>
        <EuiToolTip
          content={i18n.translate(
            'xpack.alertingV2.ruleDetails.artifacts.dashboards.manageAriaLabel',
            {
              defaultMessage: 'Manage linked dashboards',
            }
          )}
          disableScreenReaderOutput
        >
          <EuiButtonIcon
            iconType="plusInCircle"
            color="text"
            aria-label={i18n.translate(
              'xpack.alertingV2.ruleDetails.artifacts.dashboards.manageAriaLabel',
              { defaultMessage: 'Manage linked dashboards' }
            )}
            data-test-subj="ruleDashboardArtifactsAddButton"
            onClick={onAdd}
          />
        </EuiToolTip>
      </EuiFlexItem>
    ) : null}
  </EuiFlexGroup>
);

export const DashboardArtifactsSection: React.FC = () => {
  const rule = useRule();
  const http = useService(CoreStart('http'));
  const share = useService(PluginStart('share')) as SharePluginStart;
  const dashboard = useService(PluginStart('dashboard'), { optional: true }) as
    | DashboardStart
    | undefined;
  const { flyout, openEditFlyout } = useComposeDiscoverFlyout();
  const { mutate: updateRule, isLoading: isDeleting } = useUpdateRule();
  const { dashboardArtifacts, resolved, missing, isLoading, isError, artifactIdByDashboardId } =
    useDashboardArtifacts(rule.artifacts, dashboard);

  const [artifactIdPendingDelete, setArtifactIdPendingDelete] = useState<string | null>(null);
  const confirmModalTitleId = useGeneratedHtmlId();
  const artifactsAccordionId = useGeneratedHtmlId({ prefix: 'ruleArtifactsSection' });

  const handleEdit = useCallback(() => {
    openEditFlyout(rule);
  }, [openEditFlyout, rule]);

  const handleDeleteRequest = useCallback((artifactId: string) => {
    setArtifactIdPendingDelete(artifactId);
  }, []);

  const handleDeleteCancel = useCallback(() => {
    setArtifactIdPendingDelete(null);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (!artifactIdPendingDelete) {
      return;
    }

    updateRule(
      {
        id: rule.id,
        payload: {
          artifacts: (rule.artifacts ?? []).filter(
            (artifact) => artifact.id !== artifactIdPendingDelete
          ),
        },
      },
      {
        onSettled: () => {
          setArtifactIdPendingDelete(null);
        },
      }
    );
  }, [artifactIdPendingDelete, rule.artifacts, rule.id, updateRule]);

  const dashboardLinks = useMemo(
    () =>
      resolved.map((entry) => ({
        ...entry,
        href: getDashboardHref({
          dashboardId: entry.id,
          share,
          httpBasePathPrepend: http.basePath.prepend.bind(http.basePath),
        }),
      })),
    [http.basePath, resolved, share]
  );

  const hasDashboardArtifacts = dashboardArtifacts.length > 0;

  return (
    <>
      <EuiAccordion
        id={artifactsAccordionId}
        data-test-subj="ruleArtifactsSection"
        buttonContent={
          <EuiText size="s">
            <strong>
              {i18n.translate('xpack.alertingV2.ruleDetails.artifacts.title', {
                defaultMessage: 'Artifacts',
              })}
            </strong>
          </EuiText>
        }
        paddingSize="m"
        initialIsOpen
      >
        <EuiPanel hasBorder paddingSize="m" data-test-subj="ruleDashboardArtifactsSection">
          <DashboardsSubsectionHeader onAdd={handleEdit} isAddDisabled={!dashboard} />
          <EuiSpacer size="m" />

          {!dashboard ? (
            <EuiText size="s" color="subdued" data-test-subj="ruleDashboardArtifactsUnavailable">
              {i18n.translate(
                'xpack.alertingV2.ruleDetails.artifacts.dashboards.unavailableService',
                {
                  defaultMessage: 'Dashboards are unavailable in this environment.',
                }
              )}
            </EuiText>
          ) : null}

          {dashboard && isLoading ? (
            <EuiLoadingSpinner size="m" data-test-subj="ruleDashboardArtifactsLoading" />
          ) : null}

          {dashboard && !isLoading && isError ? (
            <EuiEmptyPrompt
              color="danger"
              iconType="warning"
              data-test-subj="ruleDashboardArtifactsError"
              title={
                <h4>
                  {i18n.translate('xpack.alertingV2.ruleDetails.artifacts.dashboards.errorTitle', {
                    defaultMessage: 'Could not load dashboards',
                  })}
                </h4>
              }
              body={
                <EuiText size="s">
                  {i18n.translate('xpack.alertingV2.ruleDetails.artifacts.dashboards.errorBody', {
                    defaultMessage: 'Try refreshing the page.',
                  })}
                </EuiText>
              }
            />
          ) : null}

          {dashboard && !isLoading && !isError && !hasDashboardArtifacts ? (
            <EuiEmptyPrompt
              iconType="dashboardApp"
              data-test-subj="ruleDashboardArtifactsEmpty"
              title={
                <h4>
                  {i18n.translate('xpack.alertingV2.ruleDetails.artifacts.dashboards.emptyTitle', {
                    defaultMessage: 'No dashboards linked',
                  })}
                </h4>
              }
              body={
                <EuiText size="s">
                  {i18n.translate('xpack.alertingV2.ruleDetails.artifacts.dashboards.emptyBody', {
                    defaultMessage: 'Edit the rule to attach investigation dashboards.',
                  })}
                </EuiText>
              }
            />
          ) : null}

          {dashboard && !isLoading && !isError && hasDashboardArtifacts ? (
            <>
              {dashboardLinks.map((entry) => (
                <React.Fragment key={entry.id}>
                  <ResolvedDashboardRow
                    dashboardId={entry.id}
                    title={entry.title}
                    href={entry.href}
                    artifactId={artifactIdByDashboardId.get(entry.id)}
                    isDeleting={isDeleting}
                    onDelete={handleDeleteRequest}
                  />
                  <EuiSpacer size="s" />
                </React.Fragment>
              ))}
              {missing.map((missingDashboard) => (
                <React.Fragment key={missingDashboard.id}>
                  <MissingDashboardRow
                    missingDashboard={missingDashboard}
                    artifactId={artifactIdByDashboardId.get(missingDashboard.id)}
                    isDeleting={isDeleting}
                    onDelete={handleDeleteRequest}
                  />
                  <EuiSpacer size="s" />
                </React.Fragment>
              ))}
            </>
          ) : null}
        </EuiPanel>
      </EuiAccordion>

      {artifactIdPendingDelete ? (
        <EuiConfirmModal
          aria-labelledby={confirmModalTitleId}
          titleProps={{ id: confirmModalTitleId }}
          title={i18n.translate(
            'xpack.alertingV2.ruleDetails.artifacts.dashboards.deleteConfirmTitle',
            { defaultMessage: 'Remove linked dashboard' }
          )}
          onCancel={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
          cancelButtonText={i18n.translate(
            'xpack.alertingV2.ruleDetails.artifacts.dashboards.deleteConfirmCancel',
            { defaultMessage: 'Cancel' }
          )}
          confirmButtonText={i18n.translate(
            'xpack.alertingV2.ruleDetails.artifacts.dashboards.deleteConfirmConfirm',
            { defaultMessage: 'Remove' }
          )}
          buttonColor="danger"
          isLoading={isDeleting}
          data-test-subj="ruleDashboardArtifactDeleteConfirmModal"
        >
          {i18n.translate('xpack.alertingV2.ruleDetails.artifacts.dashboards.deleteConfirmBody', {
            defaultMessage:
              'Remove this dashboard from the rule? You can re-attach it by editing the rule.',
          })}
        </EuiConfirmModal>
      ) : null}

      {flyout}
    </>
  );
};
