/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, ReactElement } from 'react';
import React, { useCallback, useMemo } from 'react';

import { EuiIcon, EuiFlexItem } from '@elastic/eui';
import type { DataView } from '@kbn/data-views-plugin/public';
import type { SavedSearch } from '@kbn/saved-search-plugin/public';
import type { RecognizeResult } from '@kbn/ml-common-types/modules';
import { ML_PAGES } from '@kbn/ml-common-types/locator_ml_pages';

import { LinkCard } from '../link_card';
import { useDataSource } from '../../contexts/ml';
import { useMlManagementLocator } from '../../contexts/kibana';
import { getUrlParams } from '../../jobs/new_job/utils/get_url_params';

interface Props {
  config: RecognizeResult;
  indexPattern: DataView;
  savedSearch: SavedSearch | null;
}

const getLogo = (config: RecognizeResult): ReactElement => {
  // If a logo is available, use that; otherwise display the id.
  // The logo should be a base64 encoded image or an EUI icon.
  if (config.logo && 'icon' in config.logo && config.logo.icon) {
    return <EuiIcon type={config.logo.icon} size="xl" aria-hidden />;
  }
  if (config.logo && 'src' in config.logo && typeof config.logo.src === 'string') {
    return <img alt="" src={config.logo.src} />;
  }
  return <h3 className="euiTitle euiTitle--small">{config.id}</h3>;
};

export const RecognizedResult: FC<Props> = ({ config, indexPattern, savedSearch }) => {
  const mlManagementLocator = useMlManagementLocator();
  const { projectRouting } = useDataSource();

  const getRecognizerUrlParams = useCallback(() => {
    const dataSourceParams = getUrlParams({
      dataView: indexPattern,
      savedSearch,
      projectRouting,
    });
    return `?id=${config.id}${dataSourceParams.replace(/^\?/, '&')}`;
  }, [config.id, indexPattern, projectRouting, savedSearch]);

  const navigateToCreateJobRecognizerPath = useCallback(async () => {
    if (!mlManagementLocator) {
      return;
    }

    await mlManagementLocator.navigate({
      sectionId: 'ml',
      appId: `anomaly_detection/${
        ML_PAGES.ANOMALY_DETECTION_CREATE_JOB_RECOGNIZER
      }${getRecognizerUrlParams()}`,
    });
  }, [getRecognizerUrlParams, mlManagementLocator]);

  const logo = useMemo(() => getLogo(config), [config]);

  return (
    <EuiFlexItem>
      <LinkCard
        data-test-subj={`mlRecognizerCard ${config.id}`}
        onClick={navigateToCreateJobRecognizerPath}
        title={config.title}
        description={config.description}
        icon={logo}
      />
    </EuiFlexItem>
  );
};
