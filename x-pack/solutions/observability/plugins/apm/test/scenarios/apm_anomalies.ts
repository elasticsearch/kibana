/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * GOAL
 * ----
 * Produce APM data that, once APM anomaly-detection ML jobs are created and run,
 * surfaces anomaly badges in the APM UI that exercise the multi-detector /
 * multi-environment anomaly badge behaviour. Every service exists in MULTIPLE
 * ENVIRONMENTS (production + development), and each environment is anomalous at a
 * DIFFERENT time, so the "all environments" combined chart shows two distinct
 * anomaly clusters (each tagged with its environment in the tooltip):
 *
 *   1. Highest score ACROSS DETECTORS (latency vs throughput vs failure rate):
 *      `synth-anomaly-detectors` (production) gets a CRITICAL failure-rate
 *      anomaly together with only a MINOR latency bump in the same window. The
 *      badge must show the failure-rate (critical) score, not the latency one.
 *
 *   2. Highest score ACROSS ENVIRONMENTS (when env selector = "all"):
 *      every service has a CRITICAL anomaly in `production` (earlier sub-window)
 *      and a smaller MAJOR anomaly in `development` (later sub-window). Both
 *      render in the combined chart at different times, but the badge / open
 *      anomalies link must still surface the production (highest) score.
 *
 *   2b. Identical anomalies side by side (same value across environments):
 *      `synth-anomaly-side-by-side` gets the SAME critical latency spike in both
 *      `production` and `development`, optionally offset in time by
 *      `sideBySideOffsetMinutes`. In the combined "all environments" view this
 *      renders two identical anomalies next to each other, exercising the tooltip
 *      when side-by-side values are the same.
 *
 *   3. Detector coverage across environments:
 *      a dedicated service trips each detector (latency, throughput, failure
 *      rate) in both environments, critical in prod and major in dev.
 *
 *   4. All three detectors on ONE service, in BOTH environments, overlapping in
 *      time: `synth-anomaly-all-metrics` (production + development) trips latency,
 *      failure rate and throughput, each in its own sub-window at a DIFFERENT time
 *      but with intentional OVERLAPS and different intensities (failure rate ramps
 *      from major to critical). The two environments use shifted windows, so some
 *      anomalous times line up across environments and others do not. Some buckets
 *      are anomalous on two or three detectors at once, so the badge must surface
 *      the highest-scoring detector.
 *
 * ANOMALY WINDOWS
 * ---------------
 * The trailing `anomalyWindowHours` span is split into two non-overlapping
 * sub-windows so the two environments spike at different times:
 *   - production  -> earlier half of the span
 *   - development -> later half of the span (through the end of the range)
 * Everything before the span is flat baseline so ML can learn a normal model.
 *
 * APM ML DETECTORS (what each service is engineered to trip)
 * ---------------------------------------------------------
 * APM anomaly jobs run three detectors, all `by "transaction.type"` and
 * `partition_field_name="service.name"` (indices match
 * common/anomaly_detection/apm_ml_detectors.ts):
 *
 *   - index 0  high_mean(transaction_latency)       -> latency, HIGH only
 *   - index 1  mean(transaction_throughput)         -> throughput, EITHER way
 *   - index 2  high_mean(failed_transaction_rate)   -> failure rate, HIGH only
 *
 * Because latency and failure rate use `high_mean`, their anomalies must be
 * UPWARD deviations; throughput uses `mean`, so a large UP spike works too.
 * Detector -> service/environment mapping engineered below (critical in prod,
 * major in dev, at different times):
 *   - detector 2 (failure rate) + detector 0 (latency, minor)
 *       -> synth-anomaly-detectors / production (critical FR) + development (major FR)
 *   - detector 0 (latency)
 *       -> synth-anomaly-environments / production (critical) + development (major)
 *   - detector 1 (throughput)
 *       -> synth-anomaly-throughput / production (critical) + development (major)
 *   - detectors 0 + 1 + 2 (all three, overlapping in time)
 *       -> synth-anomaly-all-metrics / production + development (shifted windows)
 *
 * DATA SHAPE
 * ----------
 * - Type: APM transactions (traces-apm and metrics-apm indices).
 *   transaction.type=request so it matches the detectors above. The ML jobs read
 *   the aggregated transaction metrics (metrics-apm*), which synthtrace produces
 *   automatically via its transaction-metrics aggregators.
 * - A long flat BASELINE over the whole range lets ML learn a normal model, then
 *   two short ANOMALY SUB-WINDOWS at the end (default: last 2h split in half)
 *   inject the per-environment deviations.
 *
 * RUNNING (IMPORTANT: do NOT use --live)
 * --------------------------------------
 * This scenario relies on a historical baseline followed by trailing spikes, so
 * it must be ingested over a fixed past range. In `--live` mode every generated
 * bucket is in the anomaly window (anomalyStart is fixed at process start), so
 * there is no baseline and the elevated values are flat -> ML learns them as
 * "normal" and never flags an anomaly. Always run a fixed window, e.g.:
 *
 *   node scripts/synthtrace apm_anomalies --from=now-7d --to=now --clean
 *
 * A wider baseline (e.g. --from=now-7d) gives ML more normal history and makes
 * the trailing spikes stand out more. Note that a 1-hour range with the default
 * 2h anomaly window leaves no baseline; pick a range wider than the window.
 *
 * SCENARIO OPTS
 * -------------
 * --scenarioOpts.anomalyWindowHours=2       Trailing hours that are anomalous
 *                                           (split in half across the two envs).
 * --scenarioOpts.baselineRate=10            Transactions per minute during baseline.
 * --scenarioOpts.sideBySideOffsetMinutes=0  Time offset applied to the
 *                                           `synth-anomaly-side-by-side` service's
 *                                           development environment. Both envs get
 *                                           the SAME anomaly, so the combined view
 *                                           shows identical anomalies side by side
 *                                           (0 = exact same time bucket).
 *
 * VALIDATE + ML SETUP
 * -------------------
 * Ingesting data is not enough for the badges to appear: APM anomaly badges read
 * from ML anomaly-detection jobs. After ingesting, create APM ML jobs (APM >
 * Settings > Anomaly detection) for the `production` and `development`
 * environments and run their datafeeds over the ingested range, then check the
 * badges in the Service inventory, Service detail header and Service map popover.
 */

import type { ApmFields, Instance } from '@kbn/synthtrace-client';
import { apm } from '@kbn/synthtrace-client';
import type { Scenario } from '@kbn/synthtrace';
import { withClient } from '@kbn/synthtrace';

const TRANSACTION_NAME = 'GET /api/orders';

const PRODUCTION = 'production';
const DEVELOPMENT = 'development';

const BASELINE_DURATION = 150;
const BASELINE_FAIL_PROBABILITY = 0.03;

const DEFAULT_SCENARIO_OPTS = {
  anomalyWindowHours: 2,
  // 10 tx/min gives the transaction-metrics aggregations enough samples per
  // bucket for ML to build a stable baseline (2/min is too sparse and noisy).
  baselineRate: 10,
  // Time offset (in minutes) applied to the `synth-anomaly-side-by-side`
  // service's development environment relative to production. Both environments
  // get the SAME anomaly shape, so in the combined "all environments" view they
  // render as identical anomalies side by side, offset by this amount. Use `0`
  // to make them land on the exact same time bucket.
  sideBySideOffsetMinutes: 15,
};

type AnomalyPredicate = (timestamp: number) => boolean;

interface AllMetricsWindows {
  isLatencyAnomaly: AnomalyPredicate;
  latencyDuration: number;
  isFailureMajor: AnomalyPredicate;
  isFailureCritical: AnomalyPredicate;
  isThroughputAnomaly: AnomalyPredicate;
  throughputBurst: number;
}

const scenario: Scenario<ApmFields> = async (runOptions) => {
  const { anomalyWindowHours, baselineRate, sideBySideOffsetMinutes } = {
    ...DEFAULT_SCENARIO_OPTS,
    ...(runOptions.scenarioOpts || {}),
  };

  // Split the trailing anomaly span into two non-overlapping sub-windows so each
  // environment is anomalous at a DIFFERENT time. Production takes the earlier
  // half, development the later half (open-ended so it reaches the range end).
  // `--to now` means the range end is ~Date.now(), so anchoring off `now` keeps
  // the anomalous buckets inside whatever range the caller passes.
  const now = Date.now();
  const totalWindowMs = Number(anomalyWindowHours) * 60 * 60 * 1000;
  const productionWindowStart = now - totalWindowMs;
  const developmentWindowStart = now - totalWindowMs / 2;

  const isProductionAnomaly: AnomalyPredicate = (timestamp) =>
    timestamp >= productionWindowStart && timestamp < developmentWindowStart;
  const isDevelopmentAnomaly: AnomalyPredicate = (timestamp) => timestamp >= developmentWindowStart;

  // Same anomaly shape in BOTH environments, optionally offset in time by
  // `sideBySideOffsetMinutes`. Both windows sit in the earlier (production) half
  // of the span so they cluster together, producing identical anomalies side by
  // side in the combined "all environments" view. With an offset of `0` the two
  // environments land on the exact same time bucket.
  const sideBySideOffsetMs = Number(sideBySideOffsetMinutes) * 60 * 1000;
  const sideBySideWindowEnd = productionWindowStart + totalWindowMs / 2;
  const isSideBySideProductionAnomaly: AnomalyPredicate = (timestamp) =>
    timestamp >= productionWindowStart && timestamp < sideBySideWindowEnd;
  const isSideBySideDevelopmentAnomaly: AnomalyPredicate = (timestamp) =>
    timestamp >= productionWindowStart + sideBySideOffsetMs &&
    timestamp < sideBySideWindowEnd + sideBySideOffsetMs;

  // OVERLAPPING sub-windows over the anomaly span, used by the
  // `synth-anomaly-all-metrics` service so a single service trips ALL THREE
  // detectors (latency, failure rate, throughput) at different times but with
  // intentional overlaps. The service runs in BOTH environments with shifted
  // windows, so some anomalous buckets line up across `production` and
  // `development` (e.g. latency in [40%,60%)) while others do not. Boundaries are
  // fractions of the full span:
  //
  //   production            development
  //   --------------------  --------------------
  //   latency    [ 0%,60%)  latency    [40%,100%]
  //   failure    [30%,80%)  failure    [ 0%, 60%)
  //   throughput [50%,100%] throughput [20%, 70%)
  //
  // Within production: latency+failure overlap in [30%,60%), failure+throughput
  // in [50%,80%), all three in [50%,60%). Across environments the latency windows
  // overlap in [40%,60%), failure in [30%,60%), throughput in [50%,70%).
  const at = (fraction: number) => productionWindowStart + totalWindowMs * fraction;

  const allMetricsWindows: Record<string, AllMetricsWindows> = {
    [PRODUCTION]: {
      isLatencyAnomaly: (timestamp: number) => timestamp >= at(0) && timestamp < at(0.6),
      latencyDuration: 5000,
      isFailureMajor: (timestamp: number) => timestamp >= at(0.3) && timestamp < at(0.55),
      isFailureCritical: (timestamp: number) => timestamp >= at(0.55) && timestamp < at(0.8),
      isThroughputAnomaly: (timestamp: number) => timestamp >= at(0.5),
      throughputBurst: 15,
    },
    [DEVELOPMENT]: {
      isLatencyAnomaly: (timestamp: number) => timestamp >= at(0.4),
      latencyDuration: 1500,
      isFailureMajor: (timestamp: number) => timestamp >= at(0) && timestamp < at(0.3),
      isFailureCritical: (timestamp: number) => timestamp >= at(0.3) && timestamp < at(0.6),
      isThroughputAnomaly: (timestamp: number) => timestamp >= at(0.2) && timestamp < at(0.7),
      throughputBurst: 8,
    },
  };

  return {
    generate: ({ range, clients: { apmEsClient } }) => {
      const instanceFor = (name: string, environment: string) =>
        apm.service({ name, environment, agentName: 'go' }).instance(`instance-${environment}`);

      // Latency detector (index 0, high_mean). The anomaly window raises the
      // transaction duration; pass a critical (large) or major (smaller) spike.
      const latencyEvents = (
        instance: Instance,
        isAnomalous: AnomalyPredicate,
        anomalyDuration: number
      ) =>
        range
          .interval('1m')
          .rate(baselineRate)
          .generator((timestamp) =>
            instance
              .transaction({ transactionName: TRANSACTION_NAME })
              .timestamp(timestamp)
              .duration(isAnomalous(timestamp) ? anomalyDuration : BASELINE_DURATION)
              .success()
          );

      // Failure-rate detector (index 2, high_mean). The anomaly window raises
      // the share of failed transactions; `anomalyDuration` lets the same
      // service also nudge the latency detector (kept minor on purpose).
      const failureEvents = (
        instance: Instance,
        isAnomalous: AnomalyPredicate,
        {
          anomalyFailProbability,
          anomalyDuration,
        }: { anomalyFailProbability: number; anomalyDuration: number }
      ) =>
        range
          .interval('1m')
          .rate(baselineRate)
          .generator((timestamp) => {
            const inAnomaly = isAnomalous(timestamp);
            const failProbability = inAnomaly ? anomalyFailProbability : BASELINE_FAIL_PROBABILITY;
            const duration = inAnomaly ? anomalyDuration : BASELINE_DURATION;
            const tx = instance
              .transaction({ transactionName: TRANSACTION_NAME })
              .timestamp(timestamp)
              .duration(duration);
            return Math.random() < failProbability ? tx.failure() : tx.success();
          });

      // Throughput detector (index 1, mean). The anomaly window multiplies the
      // number of transactions per bucket by `anomalyBurst`.
      const throughputEvents = (
        instance: Instance,
        isAnomalous: AnomalyPredicate,
        anomalyBurst: number
      ) =>
        range
          .interval('1m')
          .rate(baselineRate)
          .generator((timestamp) => {
            const burst = isAnomalous(timestamp) ? anomalyBurst : 1;
            return Array.from({ length: burst }, () =>
              instance
                .transaction({ transactionName: TRANSACTION_NAME })
                .timestamp(timestamp)
                .duration(BASELINE_DURATION)
                .success()
            );
          });

      // 1) Multiple detectors, multiple environments at different times.
      //    Production trips detector 2 high_mean(failed_transaction_rate) hard
      //    (~95% fail) plus detector 0 high_mean(transaction_latency) lightly
      //    (150ms -> 250ms), so its surfaced score comes from failure rate.
      //    Development gets a MAJOR failure-rate anomaly (~70% fail) in the later
      //    sub-window so both render at different times, prod still highest.
      const detectorsEvents = [
        failureEvents(instanceFor('synth-anomaly-detectors', PRODUCTION), isProductionAnomaly, {
          anomalyFailProbability: 0.95,
          anomalyDuration: 250,
        }),
        failureEvents(instanceFor('synth-anomaly-detectors', DEVELOPMENT), isDevelopmentAnomaly, {
          anomalyFailProbability: 0.7,
          anomalyDuration: BASELINE_DURATION,
        }),
      ];

      // 2) Latency anomaly across environments at different times. CRITICAL
      //    latency spike in production (earlier), MAJOR bump in development
      //    (later).
      const environmentsEvents = [
        latencyEvents(
          instanceFor('synth-anomaly-environments', PRODUCTION),
          isProductionAnomaly,
          6000
        ),
        latencyEvents(
          instanceFor('synth-anomaly-environments', DEVELOPMENT),
          isDevelopmentAnomaly,
          1500
        ),
      ];

      // 2b) Same anomaly in BOTH environments, offset by
      //     `sideBySideOffsetMinutes`. A CRITICAL latency spike of identical
      //     magnitude in production and development, so the combined chart shows
      //     two identical anomalies side by side (exercises the multi-environment
      //     tooltip when the side-by-side values are the same).
      const sideBySideEvents = [
        latencyEvents(
          instanceFor('synth-anomaly-side-by-side', PRODUCTION),
          isSideBySideProductionAnomaly,
          6000
        ),
        latencyEvents(
          instanceFor('synth-anomaly-side-by-side', DEVELOPMENT),
          isSideBySideDevelopmentAnomaly,
          6000
        ),
      ];

      // 3) Throughput anomaly across environments at different times. A ~20x
      //    burst (CRITICAL) in production (earlier) and a ~8x burst (MAJOR) in
      //    development (later).
      const throughputEventsByEnv = [
        throughputEvents(
          instanceFor('synth-anomaly-throughput', PRODUCTION),
          isProductionAnomaly,
          20
        ),
        throughputEvents(
          instanceFor('synth-anomaly-throughput', DEVELOPMENT),
          isDevelopmentAnomaly,
          8
        ),
      ];

      // 4) A single service, in BOTH environments, that trips ALL THREE
      //    detectors at different (but partially overlapping) times with
      //    different intensities per metric. Each environment uses its own set of
      //    overlapping windows (see `allMetricsWindows`), so some anomalous
      //    buckets line up across environments and others do not. Within an
      //    environment, overlapping windows make some buckets anomalous on two or
      //    three detectors at once, exercising the highest-score-across-detectors
      //    behaviour, while the combined chart shows matching and non-matching
      //    anomaly times across environments.
      const allMetricsEvents = (instance: Instance, windows: AllMetricsWindows) =>
        range
          .interval('1m')
          .rate(baselineRate)
          .generator((timestamp) => {
            const duration = windows.isLatencyAnomaly(timestamp)
              ? windows.latencyDuration
              : BASELINE_DURATION;

            let failProbability = BASELINE_FAIL_PROBABILITY;
            if (windows.isFailureCritical(timestamp)) {
              failProbability = 0.9;
            } else if (windows.isFailureMajor(timestamp)) {
              failProbability = 0.6;
            }

            const burst = windows.isThroughputAnomaly(timestamp) ? windows.throughputBurst : 1;

            return Array.from({ length: burst }, () => {
              const tx = instance
                .transaction({ transactionName: TRANSACTION_NAME })
                .timestamp(timestamp)
                .duration(duration);
              return Math.random() < failProbability ? tx.failure() : tx.success();
            });
          });

      const allMetricsEventsByEnv = [
        allMetricsEvents(
          instanceFor('synth-anomaly-all-metrics', PRODUCTION),
          allMetricsWindows[PRODUCTION]
        ),
        allMetricsEvents(
          instanceFor('synth-anomaly-all-metrics', DEVELOPMENT),
          allMetricsWindows[DEVELOPMENT]
        ),
      ];

      return withClient(apmEsClient, [
        ...detectorsEvents,
        ...environmentsEvents,
        ...sideBySideEvents,
        ...throughputEventsByEnv,
        ...allMetricsEventsByEnv,
      ]);
    },
  };
};

export default scenario;
