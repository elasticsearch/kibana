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
import { hostToCriteria } from '../../../../common/components/ml/criteria/host_to_criteria';
import { useGlobalTime } from '../../../../common/containers/use_global_time';
import { useInstalledSecurityJobNameById } from '../../../../common/components/ml/hooks/use_installed_security_jobs';
import type { ObservedEntityData } from '../../shared/components/observed_entity/types';
import { ONE_WEEK_IN_HOURS } from '../../shared/constants';
import { ObservedEntity } from '../../shared/components/observed_entity';
import { useObservedHostFields } from '../hooks/use_observed_host_fields';
import { FormattedRelativePreferenceDate } from '../../../../common/components/formatted_date';
import { InspectButton, InspectButtonContainer } from '../../../../common/components/inspect';
import type { HostItem } from '../../../../../common/search_strategy';
import { buildAnomaliesTableInfluencersFilterQuery } from '../../../../common/components/ml/anomaly/anomaly_table_euid';
import { useAnomaliesTableData } from '../../../../common/components/ml/anomaly/use_anomalies_table_data';
import type { IdentityFields } from '../../../document_details/shared/utils';
import type { EntityStoreRecord } from '../../shared/hooks/use_entity_from_store';

type ObservedHostData = Omit<ObservedEntityData<HostItem>, 'anomalies'> & {
  entityRecord?: EntityStoreRecord | null;
};

export const ObservedDataSection = memo(
  ({
    identityFields,
    entityRecord,
    observedHost,
    contextID,
    scopeId,
    queryId,
  }: {
    identityFields: IdentityFields;
    entityRecord?: EntityStoreRecord | null;
    observedHost: ObservedHostData;
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
        {observedHost.lastSeen.date && (
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
                    value={observedHost.lastSeen.date}
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
          {observedHost.isLoading ? (
            <EuiLoadingSpinner data-test-subj="observedDataSectionLoadingSpinner" />
          ) : (
            <ObservedDataSectionContent
              identityFields={identityFields}
              entityRecord={entityRecord}
              observedHost={observedHost}
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
    identityFields,
    entityRecord,
    observedHost,
    contextID,
    scopeId,
    queryId,
  }: {
    identityFields: IdentityFields;
    entityRecord?: EntityStoreRecord | null;
    observedHost: ObservedHostData;
    contextID: string;
    scopeId: string;
    queryId: string;
  }) => {
    const { to, from, isInitializing } = useGlobalTime();

    const { jobNameById } = useInstalledSecurityJobNameById();
    const jobIds = useMemo(() => Object.keys(jobNameById), [jobNameById]);
    const euidApi = useEntityStoreEuidApi();
    const euid = euidApi?.euid;
    const hostNameFallback = observedHost.details?.host?.name?.[0];
    const [isLoadingAnomaliesData, anomaliesData] = useAnomaliesTableData({
      criteriaFields: hostToCriteria({ hostItem: observedHost.details, entityRecord, euid }),
      filterQuery: buildAnomaliesTableInfluencersFilterQuery({
        euid,
        entityType: 'host',
        isScopedToEntity: true,
        identityFields,
        entityRecord,
        fallbackDisplayName: hostNameFallback,
      }),
      startDate: from,
      endDate: to,
      skip: isInitializing,
      jobIds,
      aggregationInterval: 'auto',
    });

    const observedHostWithAnomalies = useMemo(
      (): ObservedEntityData<HostItem> => ({
        ...observedHost,
        entityId: observedHost.entityRecord?.entity?.id,
        anomalies: {
          isLoading: isLoadingAnomaliesData,
          anomalies: anomaliesData,
          jobNameById,
        },
      }),
      [observedHost, isLoadingAnomaliesData, anomaliesData, jobNameById]
    );
    const observedFields = useObservedHostFields(observedHostWithAnomalies);

    return (
      <ObservedEntity
        observedData={observedHostWithAnomalies}
        contextID={contextID}
        scopeId={scopeId}
        observedFields={observedFields}
      />
    );
  }
);
ObservedDataSectionContent.displayName = 'ObservedDataSectionContent';
