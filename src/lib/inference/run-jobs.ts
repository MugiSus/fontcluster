import { Channel, convertFileSrc, invoke } from '@tauri-apps/api/core';
import { releaseProxy, transfer, wrap, type Remote } from 'comlink';
import type { FontclipWorker } from './fontclip.worker';
import type { AlgorithmConfig, RunProcessingOptions } from '@/types/session';

interface InferenceMessage {
  runId: string;
  requestId: number;
  modelPath: string;
  input: number[];
}

type InferenceReply =
  | { status: 'success'; value: number[] }
  | { status: 'error'; value: string };

/**
 * Job-scoped IPC adapter, without session/progress state. Rust requests each
 * batch and owns all transitions and persistence. Comlink owns Worker RPC;
 * Tauri Channel owns ordered delivery. No component listens for inference.
 */
export async function runJobsWithWasm(
  algorithm: Partial<AlgorithmConfig>,
  options: RunProcessingOptions,
): Promise<string> {
  let worker: Worker | undefined;
  let remote: Remote<FontclipWorker> | undefined;
  let active: Pick<InferenceMessage, 'runId' | 'requestId'> | undefined;
  let workerError: string | undefined;
  const inference = new Channel<InferenceMessage>();
  const respond = (
    request: Pick<InferenceMessage, 'runId' | 'requestId'>,
    reply: InferenceReply,
  ) => invoke('complete_inference', { ...request, reply });

  inference.onmessage = async (request) => {
    active = { runId: request.runId, requestId: request.requestId };
    try {
      if (!worker) {
        worker = new Worker(new URL('./fontclip.worker.ts', import.meta.url), {
          type: 'module',
          name: 'fontclip-inference',
        });
        worker.onerror = (event) => {
          workerError = event.message || 'FontCLIP Worker failed';
          if (active) {
            void respond(active, { status: 'error', value: workerError }).catch(
              console.error,
            );
          }
        };
        remote = wrap<FontclipWorker>(worker);
      }
      if (workerError) throw new Error(workerError);
      const input = Float32Array.from(request.input);
      const output = await remote!.infer(
        convertFileSrc(request.modelPath),
        transfer(input, [input.buffer]),
      );
      await respond(request, { status: 'success', value: Array.from(output) });
    } catch (error) {
      await respond(request, {
        status: 'error',
        value: error instanceof Error ? error.message : String(error),
      }).catch(console.error);
    } finally {
      if (active?.requestId === request.requestId) active = undefined;
    }
  };

  try {
    return await invoke<string>('run_jobs', {
      algorithm,
      ...options,
      inference,
    });
  } finally {
    // A queued channel payload can arrive after run_jobs has settled.
    inference.onmessage = () => {};
    active = undefined;
    remote?.[releaseProxy]();
    worker?.terminate();
  }
}
