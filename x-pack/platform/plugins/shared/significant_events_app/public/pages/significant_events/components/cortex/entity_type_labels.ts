/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { CortexEntityType, CortexPageStatus, CortexStatusFilter } from './types';

export const getCortexEntityTypeSingularLabel = (entityType: CortexEntityType): string => {
  switch (entityType) {
    case 'integration':
      return i18n.translate(
        'xpack.significantEventsApp.cortex.entityType.integrationSingularLabel',
        {
          defaultMessage: 'Integration',
        }
      );
    case 'service':
      return i18n.translate('xpack.significantEventsApp.cortex.entityType.serviceSingularLabel', {
        defaultMessage: 'Service',
      });
    case 'alert':
      return i18n.translate('xpack.significantEventsApp.cortex.entityType.alertSingularLabel', {
        defaultMessage: 'Alert',
      });
    case 'runbook':
      return i18n.translate('xpack.significantEventsApp.cortex.entityType.runbookSingularLabel', {
        defaultMessage: 'Runbook',
      });
    case 'query':
      return i18n.translate('xpack.significantEventsApp.cortex.entityType.querySingularLabel', {
        defaultMessage: 'Query',
      });
    case 'dashboard':
      return i18n.translate('xpack.significantEventsApp.cortex.entityType.dashboardSingularLabel', {
        defaultMessage: 'Dashboard',
      });
    case 'postmortem':
      return i18n.translate(
        'xpack.significantEventsApp.cortex.entityType.postmortemSingularLabel',
        {
          defaultMessage: 'Postmortem',
        }
      );
    case 'topic':
      return i18n.translate('xpack.significantEventsApp.cortex.entityType.topicSingularLabel', {
        defaultMessage: 'Topic',
      });
    case 'glossary':
      return i18n.translate('xpack.significantEventsApp.cortex.entityType.glossarySingularLabel', {
        defaultMessage: 'Glossary',
      });
  }
};

export const getCortexEntityTypeLabel = (entityType: CortexEntityType): string => {
  switch (entityType) {
    case 'integration':
      return i18n.translate('xpack.significantEventsApp.cortex.entityType.integrationLabel', {
        defaultMessage: 'Integrations',
      });
    case 'service':
      return i18n.translate('xpack.significantEventsApp.cortex.entityType.serviceLabel', {
        defaultMessage: 'Services',
      });
    case 'alert':
      return i18n.translate('xpack.significantEventsApp.cortex.entityType.alertLabel', {
        defaultMessage: 'Alerts',
      });
    case 'runbook':
      return i18n.translate('xpack.significantEventsApp.cortex.entityType.runbookLabel', {
        defaultMessage: 'Runbooks',
      });
    case 'query':
      return i18n.translate('xpack.significantEventsApp.cortex.entityType.queryLabel', {
        defaultMessage: 'Queries',
      });
    case 'dashboard':
      return i18n.translate('xpack.significantEventsApp.cortex.entityType.dashboardLabel', {
        defaultMessage: 'Dashboards',
      });
    case 'postmortem':
      return i18n.translate('xpack.significantEventsApp.cortex.entityType.postmortemLabel', {
        defaultMessage: 'Postmortems',
      });
    case 'topic':
      return i18n.translate('xpack.significantEventsApp.cortex.entityType.topicLabel', {
        defaultMessage: 'Topics',
      });
    case 'glossary':
      return i18n.translate('xpack.significantEventsApp.cortex.entityType.glossaryLabel', {
        defaultMessage: 'Glossary',
      });
  }
};

export const getCortexStatusLabel = (status: CortexPageStatus): string => {
  switch (status) {
    case 'established':
      return i18n.translate('xpack.significantEventsApp.cortex.status.establishedLabel', {
        defaultMessage: 'Established',
      });
    case 'tentative':
      return i18n.translate('xpack.significantEventsApp.cortex.status.tentativeLabel', {
        defaultMessage: 'Tentative',
      });
    case 'archived':
      return i18n.translate('xpack.significantEventsApp.cortex.status.archivedLabel', {
        defaultMessage: 'Archived',
      });
  }
};

export const getCortexStatusFilterLabel = (filter: CortexStatusFilter): string => {
  if (filter === 'all') {
    return i18n.translate('xpack.significantEventsApp.cortex.statusFilter.allLabel', {
      defaultMessage: 'All',
    });
  }
  return getCortexStatusLabel(filter);
};
