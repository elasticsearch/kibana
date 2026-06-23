/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export * as testData from './constants';
export { ingestApmMetricsFixtures } from './setup/ingest_apm_metrics';
export {
  metricsServices,
  setupOtelNativeJavaMetrics,
  OTEL_NATIVE_JAVA_TEMPLATE_NAME,
} from './synthtrace/metrics_services';
export { awsLambda } from './synthtrace/aws_lambda';
