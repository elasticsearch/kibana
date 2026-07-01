/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useId, useState } from 'react';
import type { FC } from 'react';
import { EuiButtonEmpty, EuiPopover, EuiPopoverTitle, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useMlKibana } from '../../../../contexts/kibana';

interface Props {
  projectRouting: string | null;
}

function getProjectCountFromRouting(projectRouting: string, totalProjectCount: number): number {
  const projectsPart = projectRouting.split(':')[1];
  if (projectsPart === undefined || projectsPart === '*') {
    return totalProjectCount;
  }
  return projectsPart.split(',').filter((project) => project.length > 0).length;
}

export const ProjectScope: FC<Props> = ({ projectRouting }) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverTitleId = useId();
  const {
    services: { cps },
  } = useMlKibana();
  const cpsManager = cps?.cpsManager;

  if (!cpsManager || projectRouting == null) {
    return null;
  }

  const totalProjectCount = cpsManager.getTotalProjectCount();
  const projectCount = getProjectCountFromRouting(projectRouting, totalProjectCount);

  const button = (
    <EuiButtonEmpty
      size="s"
      data-test-subj="mlJobListProjectScopeButton"
      onClick={() => setIsPopoverOpen(!isPopoverOpen)}
    >
      {`${projectCount}/${totalProjectCount}`}
    </EuiButtonEmpty>
  );

  return (
    <EuiPopover
      button={button}
      isOpen={isPopoverOpen}
      closePopover={() => setIsPopoverOpen(false)}
      anchorPosition="downLeft"
      aria-labelledby={popoverTitleId}
    >
      <EuiPopoverTitle id={popoverTitleId}>
        {i18n.translate('xpack.ml.jobsList.projectScopeLabel', {
          defaultMessage: 'Project scope',
        })}
      </EuiPopoverTitle>
      <EuiText size="s" data-test-subj="mlJobListProjectScopeValue">
        {projectRouting}
      </EuiText>
    </EuiPopover>
  );
};
