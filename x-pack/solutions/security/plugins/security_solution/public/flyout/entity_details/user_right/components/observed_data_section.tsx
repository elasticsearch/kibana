/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiAccordion,
  EuiLoadingSpinner,
  EuiTitle,
  useEuiFontSize,
  useEuiTheme,
} from '@elastic/eui';

import React, { memo, useMemo } from 'react';
import { css } from '@emotion/react';
import { FormattedMessage } from '@kbn/i18n-react';
import { useEntityStoreEuidApi } from '@kbn/entity-store/public';
import { useInstalledSecurityJobNameById } from '../../../../common/components/ml/hooks/use_installed_security_jobs';
import { ONE_WEEK_IN_HOURS } from '../../shared/constants';
import { ObservedEntity } from '../../shared/components/observed_entity';
import { useObservedUserItems } from '../hooks/use_observed_user_items';
import { FormattedRelativePreferenceDate } from '../../../../common/components/formatted_date';
import { InspectButton, InspectButtonContainer } from '../../../../common/components/inspect';
import { buildAnomaliesTableInfluencersFilterQuery } from '../../../../common/components/ml/anomaly/anomaly_table_euid';
import { useAnomaliesTableData } from '../../../../common/components/ml/anomaly/use_anomalies_table_data';
import { useGlobalTime } from '../../../../common/containers/use_global_time';
import { getCriteriaFromUsersType } from '../../../../common/components/ml/criteria/get_criteria_from_users_type';
import { UsersType } from '../../../../explore/users/store/model';
import type { ObservedUserData } from '../content';
import type { IdentityFields } from '../../../document_details/shared/utils';
import type { EntityStoreRecord } from '../../shared/hooks/use_entity_from_store';

export const ObservedDataSection = memo(
  ({
    userName,
    identityFields,
    entityRecord,
    observedUser,
    contextID,
    scopeId,
    queryId,
  }: {
    userName: string;
    identityFields: IdentityFields;
    entityRecord?: EntityStoreRecord | null;
    observedUser: ObservedUserData;
    contextID: string;
    scopeId: string;
    queryId: string;
  }) => {
    const { euiTheme } = useEuiTheme();
    const xsFontSize = useEuiFontSize('xxs').fontSize;

    const buttonContent = (
      <EuiTitle size="xs">
        <h3>
          <FormattedMessage
            id="xpack.securitySolution.flyout.entityDetails.observedDataTitle"
            defaultMessage="Observed attributes"
          />
        </h3>
      </EuiTitle>
    );

    const extraAction = (
      <>
        <span
          css={css`
            margin-right: ${euiTheme.size.s};
          `}
        >
          <InspectButton
            queryId={queryId}
            title={
              <FormattedMessage
                id="xpack.securitySolution.flyout.entityDetails.observedDataInspectTitle"
                defaultMessage="Observed attributes"
              />
            }
          />
        </span>
        {observedUser.lastSeen.date && (
          <span
            css={css`
              font-size: ${xsFontSize};
            `}
          >
            <FormattedMessage
              id="xpack.securitySolution.flyout.entityDetails.observedEntityUpdatedTime"
              defaultMessage="Updated {time}"
              values={{
                time: (
                  <FormattedRelativePreferenceDate
                    value={observedUser.lastSeen.date}
                    dateFormat="MMM D, YYYY"
                    relativeThresholdInHrs={ONE_WEEK_IN_HOURS}
                  />
                ),
              }}
            />
          </span>
        )}
      </>
    );

    return (
      <InspectButtonContainer>
        <EuiAccordion
          initialIsOpen={true}
          id="observedEntity-accordion"
          data-test-subj="observedEntity-accordion"
          buttonProps={{
            'data-test-subj': 'observedEntity-accordion-button',
            css: css`
              color: ${euiTheme.colors.primary};
            `,
          }}
          buttonContent={buttonContent}
          extraAction={extraAction}
          css={css`
            .euiAccordion__optionalAction {
              margin-left: auto;
            }
          `}
        >
          {observedUser.isLoading ? (
            <EuiLoadingSpinner data-test-subj="observedDataSectionLoadingSpinner" />
          ) : (
            <ObservedDataSectionContent
              userName={userName}
              identityFields={identityFields}
              entityRecord={entityRecord}
              observedUser={observedUser}
              contextID={contextID}
              scopeId={scopeId}
              queryId={queryId}
            />
          )}
        </EuiAccordion>
      </InspectButtonContainer>
    );
  }
);
ObservedDataSection.displayName = 'ObservedDataSection';

const ObservedDataSectionContent = memo(
  ({
    userName,
    identityFields,
    entityRecord,
    observedUser,
    contextID,
    scopeId,
    queryId,
  }: {
    userName: string;
    identityFields: IdentityFields;
    entityRecord?: EntityStoreRecord | null;
    observedUser: ObservedUserData;
    contextID: string;
    scopeId: string;
    queryId: string;
  }) => {
    const { to, from, isInitializing } = useGlobalTime();

    const { jobNameById } = useInstalledSecurityJobNameById();
    const jobIds = useMemo(() => Object.keys(jobNameById), [jobNameById]);
    const euidApi = useEntityStoreEuidApi();
    const euid = euidApi?.euid;
    const [isLoadingAnomaliesData, anomaliesData] = useAnomaliesTableData({
      criteriaFields: getCriteriaFromUsersType({
        type: UsersType.details,
        userName,
        entityRecord,
        identityFields,
        euid,
      }),
      filterQuery: buildAnomaliesTableInfluencersFilterQuery({
        euid,
        entityType: 'user',
        entityRecord,
        isScopedToEntity: true,
        identityFields,
        fallbackDisplayName: userName,
      }),
      startDate: from,
      endDate: to,
      skip: isInitializing,
      jobIds,
      aggregationInterval: 'auto',
    });

    const observedUserWithAnomalies = useMemo(
      () => ({
        ...observedUser,
        entityId: observedUser.entityRecord?.entity?.id,
        anomalies: {
          isLoading: isLoadingAnomaliesData,
          anomalies: anomaliesData,
          jobNameById,
        },
      }),
      [observedUser, isLoadingAnomaliesData, anomaliesData, jobNameById]
    );
    const observedFields = useObservedUserItems(observedUserWithAnomalies);

    return (
      <ObservedEntity
        observedData={observedUserWithAnomalies}
        contextID={contextID}
        scopeId={scopeId}
        observedFields={observedFields}
      />
    );
  }
);
ObservedDataSectionContent.displayName = 'ObservedDataSectionContent';
