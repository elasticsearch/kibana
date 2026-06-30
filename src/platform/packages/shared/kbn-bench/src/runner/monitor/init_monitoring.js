/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const fs = require('fs');
const path = require('path');
const { PerformanceObserver, constants } = require('perf_hooks');

const MONITOR_KEY = '__KBN_BENCH_MONITOR';

(() => {
  const dir = process.env.KBN_BENCH_MONITOR_DIR;
  const interval = Number(process.env.KBN_BENCH_MONITOR_INTERVAL ?? 250);
  // If a previous monitor instance exists, stop it and detach its listeners
  if (global[MONITOR_KEY]) {
    global[MONITOR_KEY]?.stop();
    global[MONITOR_KEY] = undefined;
  }

  if (!dir) {
    return;
  }

  const pid = process.pid;
  const argv = process.argv;

  // measure cpuUsage at the start, as this file can be required in a process
  // that is already running
  const cpuStart = process.cpuUsage();

  const file = path.join(dir, String(pid) + '.ndjson');

  // open file stream for quicker writes, use 'w' to clear out file
  const stream = fs.createWriteStream(file, { flags: 'w' });

  let stopped = false;

  // the main process will write a stop file if monitoring needs to be completed
  const stopFile = path.join(dir, 'stop');

  // accumulate GC pause durations (milliseconds) by GC type since process start
  const gcDurations = {
    [constants.NODE_PERFORMANCE_GC_MAJOR]: 0,
    [constants.NODE_PERFORMANCE_GC_MINOR]: 0,
    [constants.NODE_PERFORMANCE_GC_INCREMENTAL]: 0,
    [constants.NODE_PERFORMANCE_GC_WEAKCB]: 0,
  };

  // Observe GC performance entries and accumulate durations by kind
  const gcObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      // entry.kind is one of the NODE_PERFORMANCE_GC_* constants; some Node versions use entry.detail.kind
      const kind = entry.detail && entry.detail.kind != null ? entry.detail.kind : entry.kind;

      if (gcDurations[kind] != null) {
        gcDurations[kind] += entry.duration;
      }
    }
  });

  gcObserver.observe({ entryTypes: ['gc'], buffered: true });

  function writeSample() {
    const now = Date.now();

    // CPU time used since process start (microseconds)
    const curCpuUsage = process.cpuUsage(cpuStart);
    const cpuUsage = (curCpuUsage.user || 0) + (curCpuUsage.system || 0);

    // Memory: report maximum resident set size since start
    const rssMax = process.resourceUsage().maxRSS * 1024; // kb to b

    const mem = process.memoryUsage();

    const rss = mem.rss;

    // Heap and native memory stats
    const heapUsed = mem.heapUsed;
    const heapTotal = mem.heapTotal;
    const external = mem.external;
    const arrayBuffers = mem.arrayBuffers;

    // GC pause time since start by kind (milliseconds)
    const gcMajor = gcDurations[constants.NODE_PERFORMANCE_GC_MAJOR] || 0;
    const gcMinor = gcDurations[constants.NODE_PERFORMANCE_GC_MINOR] || 0;
    const gcIncremental = gcDurations[constants.NODE_PERFORMANCE_GC_INCREMENTAL] || 0;
    const gcWeakCb = gcDurations[constants.NODE_PERFORMANCE_GC_WEAKCB] || 0;
    const gcTotal = gcMajor + gcMinor + gcIncremental + gcWeakCb;

    // append to stats file
    stream.write(
      JSON.stringify({
        pid,
        argv,
        time: now,
        cpuUsage: cpuUsage / 1000,
        rss: rss,
        rssMax: rssMax,
        heapUsed: heapUsed,
        heapTotal: heapTotal,
        external: external,
        arrayBuffers: arrayBuffers,
        heapUsage: heapUsed / heapTotal,
        gcMajor: gcMajor,
        gcMinor: gcMinor,
        gcIncremental: gcIncremental,
        gcWeakCb: gcWeakCb,
        gcTotal: gcTotal,
      }) + '\n'
    );
  }

  const timer = setInterval(() => {
    try {
      if (fs.existsSync(stopFile)) {
        stop();
        return;
      }
    } catch (_) {
      // ignore errors checking stop file
    }
    writeSample();
  }, interval).unref();

  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    stream.end();
    gcObserver.disconnect();
    process.off('exit', stop);
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }

  process.on('exit', stop);
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  global[MONITOR_KEY] = { stop };
})();
