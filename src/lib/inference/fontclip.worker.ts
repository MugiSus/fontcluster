import { expose, transfer } from 'comlink';
import { env, InferenceSession, Tensor } from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

// This module is a browser adapter. Its session belongs to one job's Worker,
// which is terminated on completion, failure or cancellation by the IPC adapter.
// A single thread works in Tauri without requiring cross-origin isolation.
env.wasm.numThreads = 1;
env.wasm.wasmPaths = { wasm: wasmUrl };

let session: InferenceSession | undefined;

const fontclip = {
  async infer(modelUrl: string, input: Float32Array): Promise<Float32Array> {
    if (input.length !== 8 * 224 * 224) {
      throw new Error('FontCLIP input must have shape [8, 1, 224, 224]');
    }
    session ??= await InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
      freeDimensionOverrides: { batch_size: 8 },
    });
    const outputs = await session.run({
      gray_image: new Tensor('float32', input, [8, 1, 224, 224]),
    });
    try {
      const embedding = outputs['embedding'];
      if (
        !embedding ||
        embedding.type !== 'float32' ||
        embedding.dims.length !== 2 ||
        embedding.dims[0] !== 8 ||
        embedding.dims[1] !== 512 ||
        !(embedding.data instanceof Float32Array) ||
        !embedding.data.every(Number.isFinite)
      ) {
        throw new Error('Invalid FontCLIP embedding output');
      }
      const result = Float32Array.from(embedding.data);
      return transfer(result, [result.buffer]);
    } finally {
      Object.values(outputs).forEach((output) => output.dispose());
    }
  },
};

export type FontclipWorker = typeof fontclip;
expose(fontclip);
