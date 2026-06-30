/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const KIBANA_DISTRIBUTABLE_ARTIFACT = 'kibana-default.tar.zst';

export const BENCH_CONFIG_PATH =
  'src/platform/packages/shared/kbn-core-server-benchmarks/ci_warm_start_memory.benchmark.config.ts';

export const WORK_DIR = 'target/ci-warm-start-memory-bench';

export const REGRESSION_REPORT_PATH = `${WORK_DIR}/warm_start_memory_regression_report.json`;

export const LEFT_BUILD_DIR = `${WORK_DIR}/left`;

export const RIGHT_BUILD_DIR = `${WORK_DIR}/right`;

export const ANNOTATION_CONTEXT = 'warm-start-memory-bench';

export const EFFECTIVE_BUILD_ID_METADATA_KEY = 'kibana-effective-build-id';
