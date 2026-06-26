/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiSkeletonText,
  EuiText,
  useEuiFontSize,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { getOr } from 'lodash/fp';
import { i18n } from '@kbn/i18n';
import { MISCONFIGURATION_INSIGHT_USER_ENTITY_OVERVIEW } from '@kbn/cloud-security-posture-common/utils/ui_metrics';
import { useHasMisconfigurations } from '@kbn/cloud-security-posture/src/hooks/use_has_misconfigurations';
import { useEntityStoreEuidApi } from '@kbn/entity-store/public';
import { buildEuidCspPreviewOptions } from '../../../../cloud_security_posture/utils/build_euid_csp_preview_options';
import { useNonClosedAlerts } from '../../../../cloud_security_posture/hooks/use_non_closed_alerts';
import { useNavigateToUserDetails } from '../../../../flyout/entity_details/user_right/hooks/use_navigate_to_user_details';
import type { RiskSeverity } from '../../../../../common/search_strategy';
import { buildUserNamesFilter } from '../../../../../common/search_strategy';
import type { UserEntity } from '../../../../../common/api/entity_analytics';
import type { ESQuery } from '../../../../../common/typed_json';
import { getRiskFromEntityRecord } from '../../../../flyout/entity_details/shared/entity_store_risk_utils';
import { PreferenceFormattedDateFromPrimitive } from '../../../../common/components/formatted_date';
import type { DescriptionList } from '../../../../../common/utility_types';
import type { IdentityFields } from '../../../../flyout/document_details/shared/utils';
import {
  getField,
  isRiskSeverity,
  mergeLegacyIdentityWhenStoreEntityMissing,
  normalizeRiskLevel,
} from '../../../../flyout/document_details/shared/utils';
import {
  noopCellActionRenderer,
  type CellActionRenderer,
} from '../../../shared/components/cell_actions';
import { EntityType } from '../../../../../common/entity_analytics/types';
import { getEmptyTagValue } from '../../../../common/components/empty_value';
import { DescriptionListStyled } from '../../../../common/components/page';
import { OverviewDescriptionList } from '../../../../common/components/overview_description_list';
import { RiskScoreLevel } from '../../../../entity_analytics/components/severity/common';
import { useGlobalTime } from '../../../../common/containers/use_global_time';
import { useRiskScore } from '../../../../entity_analytics/api/hooks/use_risk_score';
import {
  LAST_SEEN,
  USER_DOMAIN,
  USER_RISK_LEVEL,
} from '../../../../overview/components/user_overview/translations';
import {
  ENTITIES_USER_OVERVIEW_ALERT_COUNT_TEST_ID,
  ENTITIES_USER_OVERVIEW_DOMAIN_TEST_ID,
  ENTITIES_USER_OVERVIEW_LAST_SEEN_TEST_ID,
  ENTITIES_USER_OVERVIEW_LINK_TEST_ID,
  ENTITIES_USER_OVERVIEW_LOADING_TEST_ID,
  ENTITIES_USER_OVERVIEW_MISCONFIGURATIONS_TEST_ID,
  ENTITIES_USER_OVERVIEW_RISK_LEVEL_TEST_ID,
  ENTITIES_USER_OVERVIEW_TEST_ID,
} from './test_ids';
import { RiskScoreDocTooltip } from '../../../../overview/components/common';
import { MisconfigurationsInsight } from './misconfiguration_insight';
import { AlertCountInsight } from './alert_count_insight';
import { PreviewLink } from '../../../../flyout/shared/components/preview_link';
import { DETECTION_RESPONSE_ALERTS_BY_STATUS_ID } from '../../../../overview/components/detection_response/alerts_by_status/types';

const USER_ICON = 'user';
const USER_ENTITY_OVERVIEW_ID = 'user-entity-overview';
const CSP_INSIGHTS_TAB_ID = 'csp_insights';
const MISCONFIGURATIONS_TAB_ID = 'misconfigurationTabId';
const ALERTS_TAB_ID = 'alertsTabId';

export interface UserEntityOverviewProps {
  userName: string;

  /**
   * These identity fields for the user are wrong and need to be fixed
   */
  identityFields?: Record<string, string>;
  /**
   * When provided (e.g. from parent EntitiesOverview), use this record for risk/display
   * so Overview section uses the same entity store data used to decide visibility.
   */
  entityRecord?: UserEntity | null;
  /**
   * Scope id used by cell actions and preview link.
   */
  scopeId?: string;
  /**
   * Renderer for cell actions on field values. Falls back to a no-op when not provided.
   */
  renderCellActions?: CellActionRenderer;
  /**
   * When true, renders the user name as a preview link and the alert/misconfig chips
   * as clickable counts. Set by the legacy expandable flyout host. Flyout v2 and Discover
   * leave this off so everything renders as plain text.
   */
  enableEntityLinks?: boolean;
}

export const USER_PREVIEW_BANNER = {
  title: i18n.translate('xpack.securitySolution.flyout.document.user.userPreviewTitle', {
    defaultMessage: 'Preview user details',
  }),
  backgroundColor: 'warning',
  textColor: 'warning',
};

/**
 * User preview content for the entities preview in right flyout. It contains ip addresses and risk level
 */
export const UserEntityOverview: React.FC<UserEntityOverviewProps> = ({
  userName,
  identityFields,
  entityRecord,
  scopeId = '',
  renderCellActions = noopCellActionRenderer,
  enableEntityLinks = false,
}) => {
  const { from, to } = useGlobalTime();
  const euidApi = useEntityStoreEuidApi();

  const timerange = useMemo(
    () => ({
      from,
      to,
    }),
    [from, to]
  );

  const userIdentityFields = useMemo(() => {
    const legacyFields =
      userName != null && userName !== '' ? { 'user.name': userName } : ({} as IdentityFields);
    return mergeLegacyIdentityWhenStoreEntityMissing(identityFields ?? {}, legacyFields);
  }, [userName, identityFields]);

  const riskScoreFilterQuery = useMemo(
    () => (userName ? (buildUserNamesFilter([userName]) as ESQuery) : undefined),
    [userName]
  );

  const riskFromEntityRecord = useMemo(
    () => (entityRecord != null ? getRiskFromEntityRecord(entityRecord) : null),
    [entityRecord]
  );

  const { data: userRisk, loading: isRiskScoreLoading } = useRiskScore({
    filterQuery: riskScoreFilterQuery,
    riskEntity: EntityType.user,
    skip: true,
    timerange,
  });
  const userRiskFromSearch = userRisk && userRisk.length > 0 ? userRisk[0] : undefined;

  const userRiskData = useMemo(() => {
    if (entityRecord) {
      const riskFromRecord = getRiskFromEntityRecord(entityRecord);
      if (riskFromRecord != null) {
        return {
          user: {
            name: userName,
            risk: {
              calculated_level: riskFromRecord.calculated_level ?? 'Unknown',
              calculated_score: riskFromRecord.calculated_score,
              calculated_score_norm: riskFromRecord.calculated_score_norm,
            },
          },
        };
      }
    }
    return userRiskFromSearch;
  }, [entityRecord, userName, userRiskFromSearch]);

  const isRiskScoreExist = !!userRiskData?.user?.risk;
  const isAuthorized = true;

  const userCspIdentityDoc = entityRecord ?? userIdentityFields;
  const { hasMisconfigurationFindings } = useHasMisconfigurations(
    buildEuidCspPreviewOptions('user', userCspIdentityDoc, euidApi, {
      legacyIdentityFields: userIdentityFields,
    })
  );
  const { hasNonClosedAlerts } = useNonClosedAlerts({
    entityRecord,
    identityFields: userIdentityFields,
    entityType: EntityType.user,
    to,
    from,
    queryId: USER_ENTITY_OVERVIEW_ID,
  });

  const openDetailsPanel = useNavigateToUserDetails({
    userName,
    identityFields: userIdentityFields,
    entityId: entityRecord?.entity?.id,
    scopeId,
    isRiskScoreExist,
    hasMisconfigurationFindings,
    hasNonClosedAlerts,
    isPreviewMode: true, // setting to true to always open a new user flyout
    contextID: 'UserEntityOverview',
  });
  type UserDetailsPath = Parameters<typeof openDetailsPanel>[0];

  const userDetailsForDomain = entityRecord;
  const userDomainValue = useMemo(
    () => getField(getOr([], 'user.domain', userDetailsForDomain)),
    [userDetailsForDomain]
  );
  const userDomain: DescriptionList[] = useMemo(
    () => [
      {
        title: USER_DOMAIN,
        description: userDomainValue
          ? renderCellActions({
              field: 'user.domain',
              value: userDomainValue,
              scopeId,
              children: <>{userDomainValue}</>,
            }) ?? getEmptyTagValue()
          : getEmptyTagValue(),
      },
    ],
    [userDomainValue, renderCellActions, scopeId]
  );

  const userLastSeen: DescriptionList[] = useMemo(
    () => [
      {
        title: LAST_SEEN,
        description:
          userName != null && userName !== '' ? (
            entityRecord?.entity?.lifecycle?.last_activity ? (
              <PreferenceFormattedDateFromPrimitive
                value={entityRecord.entity.lifecycle.last_activity}
              />
            ) : (
              getEmptyTagValue()
            )
          ) : (
            getEmptyTagValue()
          ),
      },
    ],
    [userName, entityRecord?.entity?.lifecycle?.last_activity]
  );

  const { euiTheme } = useEuiTheme();
  const xsFontSize = useEuiFontSize('xs').fontSize;

  const isLoading = riskFromEntityRecord == null && isRiskScoreLoading;

  const [userRiskLevel] = useMemo(() => {
    const level = userRiskData?.user?.risk?.calculated_level;
    const severity = level != null ? normalizeRiskLevel(level) ?? (level as RiskSeverity) : null;
    return [
      {
        title: (
          <EuiFlexGroup alignItems="flexEnd" gutterSize="none" responsive={false}>
            <EuiFlexItem grow={false}>{USER_RISK_LEVEL}</EuiFlexItem>
            <EuiFlexItem grow={false}>
              <RiskScoreDocTooltip />
            </EuiFlexItem>
          </EuiFlexGroup>
        ),
        description: (
          <>
            {severity && isRiskSeverity(severity) ? (
              <RiskScoreLevel severity={severity} />
            ) : userRiskData?.user?.risk != null ? (
              <RiskScoreLevel severity="Unknown" />
            ) : (
              getEmptyTagValue()
            )}
          </>
        ),
      },
    ];
  }, [userRiskData]);

  const displayName = entityRecord?.entity?.name ?? userName;

  return (
    <EuiFlexGroup
      direction="column"
      gutterSize="m"
      responsive={false}
      data-test-subj={ENTITIES_USER_OVERVIEW_TEST_ID}
    >
      <EuiFlexItem>
        <EuiFlexGroup gutterSize="s" responsive={false} alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiIcon type={USER_ICON} aria-hidden={true} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            {enableEntityLinks ? (
              <PreviewLink
                field="user.name"
                value={displayName}
                entityId={entityRecord?.entity?.id}
                scopeId={scopeId}
                data-test-subj={ENTITIES_USER_OVERVIEW_LINK_TEST_ID}
              >
                <EuiText
                  css={css`
                    font-size: ${xsFontSize};
                    font-weight: ${euiTheme.font.weight.bold};
                  `}
                >
                  {displayName}
                </EuiText>
              </PreviewLink>
            ) : (
              <EuiText
                data-test-subj={ENTITIES_USER_OVERVIEW_LINK_TEST_ID}
                css={css`
                  font-size: ${xsFontSize};
                  font-weight: ${euiTheme.font.weight.bold};
                `}
              >
                {displayName}
              </EuiText>
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem>
        {isLoading ? (
          <EuiSkeletonText
            contentAriaLabel={i18n.translate(
              'xpack.securitySolution.flyout.document.insights.entities.userLoadingAriaLabel',
              { defaultMessage: 'user overview' }
            )}
            data-test-subj={ENTITIES_USER_OVERVIEW_LOADING_TEST_ID}
          />
        ) : (
          <EuiFlexGroup responsive={false}>
            <EuiFlexItem>
              <OverviewDescriptionList
                dataTestSubj={ENTITIES_USER_OVERVIEW_DOMAIN_TEST_ID}
                descriptionList={userDomain}
              />
            </EuiFlexItem>
            <EuiFlexItem>
              {isAuthorized ? (
                <DescriptionListStyled
                  data-test-subj={ENTITIES_USER_OVERVIEW_RISK_LEVEL_TEST_ID}
                  listItems={[userRiskLevel]}
                />
              ) : (
                <OverviewDescriptionList
                  dataTestSubj={ENTITIES_USER_OVERVIEW_LAST_SEEN_TEST_ID}
                  descriptionList={userLastSeen}
                />
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
        )}
      </EuiFlexItem>
      <AlertCountInsight
        entityRecord={entityRecord}
        identityFields={userIdentityFields}
        entityType={EntityType.user}
        queryId={`${DETECTION_RESPONSE_ALERTS_BY_STATUS_ID}-${USER_ENTITY_OVERVIEW_ID}`}
        onShowAlertCountDetails={
          enableEntityLinks
            ? () =>
                openDetailsPanel({
                  tab: CSP_INSIGHTS_TAB_ID,
                  subTab: ALERTS_TAB_ID,
                } as UserDetailsPath)
            : undefined
        }
        data-test-subj={ENTITIES_USER_OVERVIEW_ALERT_COUNT_TEST_ID}
      />
      <MisconfigurationsInsight
        identityFields={userIdentityFields}
        onShowMisconfigurationsDetails={
          enableEntityLinks
            ? () =>
                openDetailsPanel({
                  tab: CSP_INSIGHTS_TAB_ID,
                  subTab: MISCONFIGURATIONS_TAB_ID,
                } as UserDetailsPath)
            : undefined
        }
        data-test-subj={ENTITIES_USER_OVERVIEW_MISCONFIGURATIONS_TEST_ID}
        telemetryKey={MISCONFIGURATION_INSIGHT_USER_ENTITY_OVERVIEW}
      />
    </EuiFlexGroup>
  );
};
