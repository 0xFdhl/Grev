#!/usr/bin/env node

import { performance } from 'node:perf_hooks';

function getOption(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
}

const url = getOption('--url', 'http://127.0.0.1:3100/');
const requests = Number(getOption('--requests', 5000));
const durationMs = Number(getOption('--duration-ms', 3000));
const timeoutMs = Number(getOption('--timeout-ms', 15000));

if (!Number.isInteger(requests) || requests < 1 || !Number.isInteger(durationMs) || durationMs < 1) {
  throw new Error('--requests dan --duration-ms harus bilangan bulat positif.');
}

const latencies = [];
const statusCounts = new Map();
let networkErrors = 0;
let httpErrors = 0;

function getTestIp(index) {
  return `198.51.${Math.floor(index / 256) % 256}.${index % 256}`;
}

async function sendRequest(index) {
  const scheduledAt = performance.now();
  const delay = (index * durationMs) / requests;

  await new Promise((resolve) => setTimeout(resolve, delay));

  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      headers: {
        'cache-control': 'no-cache',
        'user-agent': 'grev-load-test/1.0',
        'x-forwarded-for': getTestIp(index),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    response.body?.cancel();
    const status = response.status;
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    if (status >= 500) httpErrors += 1;
    latencies.push({
      requestMs: performance.now() - startedAt,
      queueMs: startedAt - scheduledAt,
    });
  } catch (_) {
    networkErrors += 1;
  }
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  return values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)];
}

const startedAt = performance.now();
await Promise.all(Array.from({ length: requests }, (_, index) => sendRequest(index)));
const elapsedMs = performance.now() - startedAt;
const requestLatencies = latencies.map((entry) => entry.requestMs).sort((a, b) => a - b);
const queueLatencies = latencies.map((entry) => entry.queueMs).sort((a, b) => a - b);

console.log(JSON.stringify({
  target: url,
  scheduledRequests: requests,
  responses: latencies.length,
  networkErrors,
  httpErrors,
  statusCounts: Object.fromEntries([...statusCounts].sort(([a], [b]) => a - b)),
  elapsedMs: Number(elapsedMs.toFixed(2)),
  requestsPerSecond: Number((latencies.length / (elapsedMs / 1000)).toFixed(2)),
  responseLatencyMs: {
    p50: Number(percentile(requestLatencies, 0.5).toFixed(2)),
    p95: Number(percentile(requestLatencies, 0.95).toFixed(2)),
    p99: Number(percentile(requestLatencies, 0.99).toFixed(2)),
    max: Number((requestLatencies.at(-1) || 0).toFixed(2)),
  },
  queueLatencyMs: {
    p95: Number(percentile(queueLatencies, 0.95).toFixed(2)),
    max: Number((queueLatencies.at(-1) || 0).toFixed(2)),
  },
}, null, 2));

process.exitCode = networkErrors > 0 || httpErrors > 0 ? 1 : 0;
