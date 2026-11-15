import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MessageChannel } from 'node:worker_threads';
import { build } from 'vite';
import { expose } from 'comlink';
import { clearMocks, mockConvertFileSrc, mockIPC } from '@tauri-apps/api/mocks';

// Bundle the real TypeScript adapter with the project's existing Vite API.
// Tauri's own mocks and Comlink exercise delivery/RPC without a native app.
const directory = await mkdtemp(join(tmpdir(), 'fontcluster-inference-test-'));
const bundle = await build({
  configFile: false,
  logLevel: 'silent',
  ssr: { noExternal: true },
  build: {
    ssr: resolve('src/lib/inference/run-jobs.ts'),
    write: false,
    minify: false,
  },
});
const modulePath = join(directory, 'adapter.mjs');
await writeFile(modulePath, bundle.output.find((chunk) => chunk.isEntry).code);
const { runJobsWithWasm } = await import(pathToFileURL(modulePath));
const originalWindow = globalThis.window;
const originalWorker = globalThis.Worker;
globalThis.window = globalThis;
let created = 0;
let terminated = 0;
let infer = () => new Float32Array(4096);
const workers = new Set();
globalThis.Worker = class {
  constructor() {
    created++;
    const { port1, port2 } = new MessageChannel();
    expose({ infer: (...args) => infer(...args) }, port2);
    port1.terminate = () => {
      terminated++;
      port1.close();
      port2.close();
      workers.delete(port1);
    };
    workers.add(port1);
    return port1;
  }
};
const request = {
  runId: 'run-1',
  requestId: 1,
  modelPath: '/model.onnx',
  input: [0],
};

afterEach(() => {
  for (const worker of workers) worker.terminate();
  created = terminated = 0;
  clearMocks();
});
after(async () => {
  globalThis.window = originalWindow;
  globalThis.Worker = originalWorker;
  await rm(directory, { recursive: true, force: true });
});

for (const outcome of ['Success', 'Cancelled', 'rejected']) {
  test(`late channel delivery after ${outcome} cannot create a Worker`, async () => {
    let channel;
    mockIPC((command, args) => {
      assert.equal(command, 'run_jobs');
      channel = args.inference;
      if (outcome === 'rejected') throw new Error('job failed');
      return outcome;
    });
    mockConvertFileSrc('macos');
    const run = runJobsWithWasm({}, { runMode: 'fresh' });
    if (outcome === 'rejected') await assert.rejects(run, /job failed/);
    else assert.equal(await run, outcome);
    window.__TAURI_INTERNALS__.runCallback(channel.id, {
      index: 0,
      message: request,
    });
    window.__TAURI_INTERNALS__.runCallback(channel.id, { index: 1, end: true });
    assert.equal(created, 0);
    assert.equal(terminated, 0);
  });
}

for (const outcome of ['success', 'error', 'cancel']) {
  test(`active inference cleans up its Worker on ${outcome}`, async () => {
    let channel;
    const job = Promise.withResolvers();
    const replies = [];
    infer = () => {
      if (outcome === 'error') throw new Error('inference failed');
      if (outcome === 'cancel') return new Promise(() => {});
      return new Float32Array(4096);
    };
    mockIPC((command, args) => {
      if (command === 'run_jobs') {
        channel = args.inference;
        return job.promise;
      }
      assert.equal(command, 'complete_inference');
      replies.push(args.reply);
      job.resolve(args.reply.status === 'success' ? 'Success' : 'Failed');
    });
    mockConvertFileSrc('macos');
    const run = runJobsWithWasm({}, { runMode: 'fresh' });
    window.__TAURI_INTERNALS__.runCallback(channel.id, {
      index: 0,
      message: request,
    });
    if (outcome === 'cancel') job.resolve('Cancelled');
    assert.equal(
      await run,
      { success: 'Success', error: 'Failed', cancel: 'Cancelled' }[outcome],
    );
    assert.equal(created, 1);
    assert.equal(terminated, 1);
    assert.equal(replies.length, outcome === 'cancel' ? 0 : 1);
    if (outcome === 'error') assert.match(replies[0].value, /inference failed/);
    window.__TAURI_INTERNALS__.runCallback(channel.id, { index: 1, end: true });
  });
}
