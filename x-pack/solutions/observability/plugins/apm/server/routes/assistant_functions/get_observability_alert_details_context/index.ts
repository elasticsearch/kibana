/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type {
  AlertDetailsContextualInsight,
  AlertDetailsContextualInsightsHandler,
} from '@kbn/observability-plugin/server/services';
import moment from 'moment';
import { isEmpty } from 'lodash';
import { SERVICE_NAME, SPAN_DESTINATION_SERVICE_RESOURCE } from '../../../../common/es_fields/apm';
import { getApmAlertsClient } from '../../../lib/helpers/get_apm_alerts_client';
import { getApmEventClient } from '../../../lib/helpers/get_apm_event_client';
import { getMlClient } from '../../../lib/helpers/get_ml_client';
import { getRandomSampler } from '../../../lib/helpers/get_random_sampler';
import { getApmServiceSummary } from '../get_apm_service_summary';
import type { APMDownstreamDependency } from '../get_apm_downstream_dependencies';
import { getApmDownstreamDependencies } from '../get_apm_downstream_dependencies';
import { getLogRateAnalysisForAlert } from '../get_log_rate_analysis_for_alert';
import type { LogCategory } from '../get_log_categories';
import { getLogCategories } from '../get_log_categories';
import { getAnomalies } from '../get_apm_service_summary/get_anomalies';
import { getServiceNameFromSignals } from './get_service_name_from_signals';
import { getContainerIdFromSignals } from './get_container_id_from_signals';
import { getExitSpanChangePoints, getServiceChangePoints } from '../get_changepoints';
import type { APMRouteHandlerResources } from '../../apm_routes/register_apm_server_routes';
import type { APMCore } from '../../typings';
import { getApmErrors } from './get_apm_errors';

export const getAlertDetailsContextHandler = (
  apmCore: APMCore,
  resourcePlugins: APMRouteHandlerResources['plugins'],
  logger: Logger
): AlertDetailsContextualInsightsHandler => {
  return async (requestContext, query) => {
    const resources = {
      core: apmCore,
      getApmIndices: async () => {
        const coreContext = await requestContext.core;
        return resourcePlugins.apmDataAccess.setup.getApmIndices(coreContext.savedObjects.client);
      },
      request: requestContext.request,
      params: { query: { _inspect: false } },
      plugins: resourcePlugins,
      context: {
        core: requestContext.core,
        licensing: requestContext.licensing,
        alerting: resourcePlugins.alerting!.start().then((startContract) => {
          return {
            getRulesClient() {
              return startContract.getRulesClientWithRequest(requestContext.request);
            },
          };
        }),
        rac: resourcePlugins.ruleRegistry.start().then((startContract) => {
          return {
            getAlertsClient() {
              return startContract.getRacClientWithRequest(requestContext.request);
            },
          };
        }),
      },
    };

    const coreStart = await apmCore.start();
    const [
      apmEventClient,
      annotationsClient,
      apmAlertsClient,
      coreContext,
      mlClient,
      randomSampler,
    ] = await Promise.all([
      getApmEventClient(resources),
      resourcePlugins.observability.setup.getScopedAnnotationsClient(
        resources.context,
        requestContext.request
      ),
      getApmAlertsClient(resources),
      requestContext.core,
      getMlClient(resources),
      getRandomSampler({
        coreStart,
        probability: 1,
        request: requestContext.request,
      }),
    ]);
    const esClient = coreContext.elasticsearch.client.asCurrentUser;
    const logSourcesService = await (
      await resourcePlugins.logsDataAccess.start()
    ).services.logSourcesServiceFactory.getScopedLogSourcesService(requestContext.request);

    const alertStartedAt = query.alert_started_at;
    const serviceEnvironment = query['service.environment'];
    const hostName = query['host.name'];
    const kubernetesPodName = query['kubernetes.pod.name'];

    const [serviceName, containerId] = await Promise.all([
      getServiceNameFromSignals({
        query,
        esClient,
        logSourcesService,
        apmEventClient,
      }),
      getContainerIdFromSignals({
        query,
        esClient,
        coreContext,
        logSourcesService,
        apmEventClient,
      }),
    ]);

    const downstreamDependenciesPromise = serviceName
      ? getApmDownstreamDependencies({
          apmEventClient,
          arguments: {
            serviceName,
            serviceEnvironment,
            start: moment(alertStartedAt).subtract(24, 'hours').toISOString(),
            end: alertStartedAt,
          },
          randomSampler,
        })
      : undefined;

    const dataFetchers: Array<() => Promise<AlertDetailsContextualInsight>> = [];

    const hasEntityFilters = !!(serviceName || hostName || containerId || kubernetesPodName);

    // service summary
    if (serviceName) {
      dataFetchers.push(async () => {
        const serviceSummary = await getApmServiceSummary({
          apmEventClient,
          annotationsClient,
          esClient,
          apmAlertsClient,
          mlClient,
          logger,
          arguments: {
            'service.name': serviceName,
            'service.environment': serviceEnvironment,
            start: moment(alertStartedAt).subtract(5, 'minute').toISOString(),
            end: alertStartedAt,
          },
        });

        return {
          key: 'serviceSummary',
          description: `Metadata for the service "${serviceName}" that produced the alert. The alert might be caused by an issue in the service itself or one of its dependencies.`,
          data: serviceSummary,
        };
      });
    }

    // downstream dependencies
    if (serviceName) {
      dataFetchers.push(async () => {
        const downstreamDependencies = await downstreamDependenciesPromise;
        return {
          key: 'downstreamDependencies',
          description: `Downstream dependencies from the service "${serviceName}". Problems in these services can negatively affect the performance of "${serviceName}"`,
          data: downstreamDependencies,
        };
      });
    }

    if (hasEntityFilters) {
      // log rate analysis
      dataFetchers.push(async () => {
        const { logRateAnalysisType, significantItems } = await getLogRateAnalysisForAlert({
          esClient,
          logSourcesService,
          arguments: {
            alertStartedAt: moment(alertStartedAt).toISOString(),
            alertRuleParameterTimeSize: query.alert_rule_parameter_time_size
              ? parseInt(query.alert_rule_parameter_time_size, 10)
              : undefined,
            alertRuleParameterTimeUnit: query.alert_rule_parameter_time_unit,
            entities: {
              'service.name': serviceName,
              'host.name': hostName,
              'container.id': containerId,
              'kubernetes.pod.name': kubernetesPodName,
            },
          },
        });

        if (logRateAnalysisType !== 'spike' || significantItems.length === 0) {
          return {
            key: 'logRateAnalysis',
            description:
              'Log rate analysis did not identify any significant metadata or log patterns.',
            data: [],
          };
        }

        return {
          key: 'logRateAnalysis',
          description: `Statistically significant log metadata and log message patterns occurring in the lookback period before the alert was triggered.`,
          data: significantItems,
        };
      });

      // log categories
      dataFetchers.push(async () => {
        const downstreamDependencies = await downstreamDependenciesPromise;
        const { logCategories, entities } = await getLogCategories({
          apmEventClient,
          esClient,
          logSourcesService,
          arguments: {
            start: moment(alertStartedAt).subtract(15, 'minute').toISOString(),
            end: alertStartedAt,
            entities: {
              'service.name': serviceName,
              'host.name': hostName,
              'container.id': containerId,
              'kubernetes.pod.name': kubernetesPodName,
            },
          },
        });

        const entitiesAsString = entities.map(({ key, value }) => `${key}:${value}`).join(', ');

        return {
          key: 'logCategories',
          description: `Log events occurring up to 15 minutes before the alert was triggered. Filtered by the entities: ${entitiesAsString}`,
          data: logCategoriesWithDownstreamServiceName(logCategories, downstreamDependencies),
        };
      });
    }

    // apm errors
    if (serviceName) {
      dataFetchers.push(async () => {
        const apmErrors = await getApmErrors({
          apmEventClient,
          start: moment(alertStartedAt).subtract(15, 'minute').toISOString(),
          end: alertStartedAt,
          serviceName,
          serviceEnvironment,
        });

        const downstreamDependencies = await downstreamDependenciesPromise;
        const errorsWithDownstreamServiceName = getApmErrorsWithDownstreamServiceName(
          apmErrors,
          downstreamDependencies
        );

        return {
          key: 'apmErrors',
          description: `Exceptions (errors) thrown by the service "${serviceName}". If an error contains a downstream service name this could be a possible root cause. If relevant please describe what the error means and what it could be caused by.`,
          data: errorsWithDownstreamServiceName,
        };
      });
    }

    // exit span change points
    dataFetchers.push(async () => {
      const exitSpanChangePoints = await getExitSpanChangePoints({
        apmEventClient,
        start: moment(alertStartedAt).subtract(6, 'hours').toISOString(),
        end: alertStartedAt,
        serviceName,
        serviceEnvironment,
      });

      return {
        key: 'exitSpanChangePoints',
        description: `Significant change points for the dependencies of "${serviceName}". Use this to spot dips or spikes in throughput, latency and failure rate for downstream dependencies`,
        data: exitSpanChangePoints,
      };
    });

    // service change points
    dataFetchers.push(async () => {
      const serviceChangePoints = await getServiceChangePoints({
        apmEventClient,
        start: moment(alertStartedAt).subtract(6, 'hours').toISOString(),
        end: alertStartedAt,
        serviceName,
        serviceEnvironment,
        transactionType: query['transaction.type'],
        transactionName: query['transaction.name'],
      });

      return {
        key: 'serviceChangePoints',
        description: `Significant change points for "${serviceName}". Use this to spot dips and spikes in throughput, latency and failure rate`,
        data: serviceChangePoints,
      };
    });

    // Anomalies
    dataFetchers.push(async () => {
      const anomalies = await getAnomalies({
        start: moment(alertStartedAt).subtract(1, 'hour').valueOf(),
        end: moment(alertStartedAt).valueOf(),
        environment: serviceEnvironment,
        mlClient,
        logger,
      });

      return {
        key: 'anomalies',
        description: `Anomalies for services running in the environment "${serviceEnvironment}". Anomalies are detected using machine learning and can help you spot unusual patterns in your data.`,
        data: anomalies,
      };
    });

    const items = await Promise.all(
      dataFetchers.map(async (dataFetcher) => {
        try {
          return await dataFetcher();
        } catch (error) {
          logger.error('Error while fetching observability alert details context', { error });
          return;
        }
      })
    );

    return items.filter((item) => item && !isEmpty(item.data)) as AlertDetailsContextualInsight[];
  };
};

function getApmErrorsWithDownstreamServiceName(
  apmErrors?: Awaited<ReturnType<typeof getApmErrors>>,
  downstreamDependencies?: Awaited<ReturnType<typeof getApmDownstreamDependencies>>
) {
  return apmErrors?.map(({ name, lastSeen, occurrences, downstreamServiceResource }) => {
    const downstreamServiceName = downstreamDependencies?.find(
      (dependency) => dependency['span.destination.service.resource'] === downstreamServiceResource
    )?.['service.name'];

    return {
      message: name,
      lastSeen: new Date(lastSeen).toISOString(),
      occurrences,
      downstream: {
        [SPAN_DESTINATION_SERVICE_RESOURCE]: downstreamServiceResource,
        [SERVICE_NAME]: downstreamServiceName,
      },
    };
  });
}

function logCategoriesWithDownstreamServiceName(
  logCategories?: LogCategory[],
  downstreamDependencies?: APMDownstreamDependency[]
) {
  return logCategories?.map(
    ({ errorCategory, docCount, sampleMessage, downstreamServiceResource }) => {
      const downstreamServiceName = downstreamDependencies?.find(
        (dependency) =>
          dependency['span.destination.service.resource'] === downstreamServiceResource
      )?.['service.name'];

      return {
        errorCategory,
        docCount,
        sampleMessage,
        downstream: {
          [SPAN_DESTINATION_SERVICE_RESOURCE]: downstreamServiceResource,
          [SERVICE_NAME]: downstreamServiceName,
        },
      };
    }
  );
}
