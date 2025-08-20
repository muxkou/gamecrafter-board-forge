import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { auto_runner, AutoRunnerOptions, AutoRunnerSummary } from './auto_runner';
import type { Event } from '../types';

interface WorkerPayload {
  options: AutoRunnerOptions;
}

if (!isMainThread) {
  const { options } = workerData as WorkerPayload;
  auto_runner(options).then(result => {
    parentPort?.postMessage(result);
  });
}

export interface ParallelAutoRunnerOptions extends AutoRunnerOptions {
  parallelism?: number;
}

export async function parallel_auto_runner(opts: ParallelAutoRunnerOptions): Promise<AutoRunnerSummary> {
  const { parallelism = 1, ...rest } = opts;
  if (parallelism <= 1) {
    return auto_runner(rest);
  }
  const workers = Math.min(parallelism, rest.episodes);
  const batch = Math.ceil(rest.episodes / workers);
  const promises: Promise<AutoRunnerSummary>[] = [];
  let remaining = rest.episodes;
  for (let i = 0; i < workers && remaining > 0; i++) {
    const ep = Math.min(batch, remaining);
    remaining -= ep;
    const wOpts: AutoRunnerOptions = { ...rest, episodes: ep };
    const worker = new Worker(new URL('./parallel_auto_runner.ts', import.meta.url), {
      workerData: { options: wOpts },
      execArgv: ['--loader', 'ts-node/esm']
    });
    promises.push(new Promise((resolve, reject) => {
      worker.once('message', (msg) => resolve(msg as AutoRunnerSummary));
      worker.once('error', reject);
      worker.once('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker stopped with code ${code}`));
      });
    }));
  }
  const results = await Promise.all(promises);
  const summary: AutoRunnerSummary = {
    episodes: 0,
    steps: 0,
    ties: 0,
    wins: 0,
    losses: 0,
    no_action: 0,
    violations: 0,
    action_hits: {},
    branch_hits: {},
  } as AutoRunnerSummary;
  const trajectories: Event[][] = [];
  for (const r of results) {
    summary.episodes += r.episodes;
    summary.steps += r.steps;
    summary.ties += r.ties;
    summary.wins += r.wins;
    summary.losses += r.losses;
    summary.no_action += r.no_action;
    summary.violations += r.violations;
    for (const [k, v] of Object.entries(r.action_hits)) {
      summary.action_hits[k] = (summary.action_hits[k] || 0) + v;
    }
    for (const [k, v] of Object.entries(r.branch_hits)) {
      summary.branch_hits[k] = (summary.branch_hits[k] || 0) + v;
    }
    if (r.trajectories) trajectories.push(...r.trajectories);
  }
  if (trajectories.length) (summary as any).trajectories = trajectories;
  return summary;
}
