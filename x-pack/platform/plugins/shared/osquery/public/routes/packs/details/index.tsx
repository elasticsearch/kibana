/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButtonEmpty,
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiDescriptionList,
  EuiDescriptionListTitle,
  EuiDescriptionListDescription,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import type { UseEuiTheme } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import React, { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { useKibana, useRouterNavigate } from '../../../common/lib/kibana';
import { WithHeaderLayout, fullWidthContentCss } from '../../../components/layouts';
import { usePack } from '../../../packs/use_pack';
import { useCopyPack } from '../../../packs/use_copy_pack';
import { useIsExperimentalFeatureEnabled } from '../../../common/experimental_features_context';
import { PackQueriesStatusTable } from '../../../packs/pack_queries_status_table';
import { useBreadcrumbs } from '../../../common/hooks/use_breadcrumbs';
import { useAgentPolicyAgentIds } from '../../../agents/use_agent_policy_agent_ids';
import { AgentPoliciesPopover } from '../../../packs/packs_table';

const dividerCss = ({ euiTheme }: UseEuiTheme) => ({
  width: 0,
  height: '100%',
  borderLeft: euiTheme.border.thin,
});

const PackDetailsPageComponent = () => {
  const permissions = useKibana().services.application.capabilities.osquery;
  const queryHistoryRework = useIsExperimentalFeatureEnabled('queryHistoryRework');
  const { packId } = useParams<{ packId: string }>();
  const packsListProps = useRouterNavigate('packs');
  const editQueryLinkProps = useRouterNavigate(`packs/${packId}/edit`);

  const { data } = usePack({ packId });
  const copyPackMutation = useCopyPack({ packId });

  const handleDuplicateClick = useCallback(
    () => copyPackMutation.mutateAsync(),
    [copyPackMutation]
  );

  const { data: agentIds } = useAgentPolicyAgentIds({
    agentPolicyId: data?.policy_ids?.[0],
    skip: !data,
  });

  useBreadcrumbs('pack_details', { packName: data?.name ?? '' });

  const queriesArray = useMemo(
    () =>
      (data?.queries && Object.entries(data.queries).map(([id, query]) => ({ ...query, id }))) ??
      [],
    [data]
  );

  const packSchedule = useMemo(
    () =>
      data?.schedule_type
        ? {
            schedule_type: data.schedule_type,
            interval: data.interval,
            rrule_schedule: data.rrule_schedule,
          }
        : undefined,
    [data?.schedule_type, data?.interval, data?.rrule_schedule]
  );

  const backLink = useMemo(
    () => (
      <EuiButtonEmpty iconType="chevronSingleLeft" {...packsListProps} flush="left" size="xs">
        <FormattedMessage
          id="xpack.osquery.packDetails.viewAllPackListTitle"
          defaultMessage="View all packs"
        />
      </EuiButtonEmpty>
    ),
    [packsListProps]
  );

  const LeftColumn = useMemo(
    () => (
      <EuiFlexGroup alignItems="flexStart" direction="column" gutterSize="m">
        <EuiFlexItem>{backLink}</EuiFlexItem>
        <EuiFlexItem>
          <EuiText>
            <h1>
              <FormattedMessage
                id="xpack.osquery.packDetails.pageTitle"
                defaultMessage="{queryName} details"
                // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
                values={{
                  queryName: data?.name,
                }}
              />
            </h1>
          </EuiText>
        </EuiFlexItem>
        {data?.description && (
          <EuiFlexItem>
            <EuiSpacer size="s" />
            <EuiText color="subdued" size="s">
              {data.description}
            </EuiText>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    ),
    [backLink, data?.description, data?.name]
  );

  const RightColumn = useMemo(
    () => (
      <EuiFlexGroup justifyContent="flexEnd" direction="row">
        <EuiFlexItem grow={false} key="agents_failed_count">
          {/* eslint-disable-next-line react-perf/jsx-no-new-object-as-prop */}
          <EuiDescriptionList compressed textStyle="reverse" style={{ textAlign: 'right' }}>
            <EuiDescriptionListTitle className="eui-textNoWrap">
              <FormattedMessage
                id="xpack.osquery.packDetailsPage.kpis.policiesLabelText"
                defaultMessage="Policies"
              />
            </EuiDescriptionListTitle>
            <EuiDescriptionListDescription className="eui-textNoWrap">
              <AgentPoliciesPopover agentPolicyIds={data?.policy_ids} />
            </EuiDescriptionListDescription>
          </EuiDescriptionList>
        </EuiFlexItem>
        {queryHistoryRework && (
          <>
            <EuiFlexItem grow={false} key="agents_failed_count_divider">
              <div css={dividerCss} />
            </EuiFlexItem>
            {permissions.writePacks && (
              <EuiFlexItem grow={false} key="duplicate_button">
                <EuiButton
                  data-test-subj="duplicate-pack-button"
                  onClick={handleDuplicateClick}
                  iconType="copy"
                  isLoading={copyPackMutation.isLoading}
                >
                  <FormattedMessage
                    id="xpack.osquery.packDetailsPage.duplicatePackButtonLabel"
                    defaultMessage="Duplicate"
                  />
                </EuiButton>
              </EuiFlexItem>
            )}
          </>
        )}
        <EuiFlexItem grow={false} key="edit_button">
          <EuiButton
            data-test-subj="edit-pack-button"
            fill
            {...editQueryLinkProps}
            iconType="pencil"
            isDisabled={!permissions.writePacks}
          >
            <FormattedMessage
              id="xpack.osquery.packDetailsPage.editQueryButtonLabel"
              defaultMessage="Edit"
            />
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    ),
    [
      queryHistoryRework,
      data?.policy_ids,
      copyPackMutation.isLoading,
      editQueryLinkProps,
      handleDuplicateClick,
      permissions,
    ]
  );

  if (queryHistoryRework) {
    return (
      <div css={fullWidthContentCss}>
        <EuiSpacer size="l" />
        {backLink}
        <EuiSpacer size="m" />
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiText>
              <h1>
                <FormattedMessage
                  id="xpack.osquery.packDetails.pageTitle"
                  defaultMessage="{queryName} details"
                  // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
                  values={{
                    queryName: data?.name,
                  }}
                />
              </h1>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>{RightColumn}</EuiFlexItem>
        </EuiFlexGroup>
        {data?.description && (
          <>
            <EuiSpacer size="s" />
            <EuiText color="subdued" size="s">
              {data.description}
            </EuiText>
          </>
        )}
        <EuiSpacer size="l" />
        {data && (
          <PackQueriesStatusTable
            agentIds={agentIds}
            packName={data.name}
            data={queriesArray}
            packSchedule={packSchedule}
          />
        )}
      </div>
    );
  }

  return (
    <WithHeaderLayout leftColumn={LeftColumn} rightColumn={RightColumn} rightColumnGrow={false}>
      {data && (
        <PackQueriesStatusTable agentIds={agentIds} packName={data.name} data={queriesArray} />
      )}
    </WithHeaderLayout>
  );
};

export const PackDetailsPage = React.memo(PackDetailsPageComponent);
