import type { SignLanguagePackId } from "@mara/shared";
import * as ort from "onnxruntime-web";
import { fetchModelBytes } from "@/lib/modelCache";
import { defaultOrtWasmPaths } from "@/lib/ort";
import { listVocabulary } from "./GlossToSpeech";
import { SIGN_LABELS_URL, SIGN_ONNX_URL, probeSignClassifierAssets } from "./signAssets";
import type { LandmarkFrame, SignClassifier, SignClassifierResult } from "./types";
import { CLASSIFIER_MISSING_REASON, SEQUENCE_FRAMES } from "./types";
import { APP_NAME } from "@/app/brand";

function flattenSequence(sequence: LandmarkFrame[]): Float32Array {
  const window = sequence.slice(-SEQUENCE_FRAMES);
  const features = 21 * 3 * 2;
  const data = new Float32Array(SEQUENCE_FRAMES * features);
  for (let t = 0; t < SEQUENCE_FRAMES; t += 1) {
    const frame = window[t] ?? window[window.length - 1];
    const offset = t * features;
    const left = frame?.hands[0];
    const right = frame?.hands[1] ?? frame?.hands[0];
    writeHand(data, offset, left);
    writeHand(data, offset + 21 * 3, right);
  }
  return data;
}

function writeHand(target: Float32Array, offset: number, hand: number[] | undefined): void {
  if (!hand) {
    return;
  }
  for (let i = 0; i < 21; i += 1) {
    target[offset + i * 3] = hand[i * 3] ?? 0;
    target[offset + i * 3 + 1] = hand[i * 3 + 1] ?? 0;
    target[offset + i * 3 + 2] = hand[i * 3 + 2] ?? 0;
  }
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((value) => Math.exp(value - max));
  const sum = exps.reduce((total, value) => total + value, 0);
  return exps.map((value) => value / sum);
}

/**
 * Optional ONNX temporal classifier. Loads only when real weights are present.
 * Output contract: float logits [1, V] in labels.json order.
 */
export class OnnxSignClassifier implements SignClassifier {
  readonly id = "onnx-isolated-sign";
  private readonly packId: SignLanguagePackId;
  private session: ort.InferenceSession | null = null;
  private labels: string[] = [];

  constructor(packId: SignLanguagePackId) {
    this.packId = packId;
  }

  async load(): Promise<{ ok: true } | { ok: false; reason: string }> {
    const present = await probeSignClassifierAssets(this.packId);
    if (!present) {
      return {
        ok: false,
        reason: CLASSIFIER_MISSING_REASON,
      };
    }

    const labelsResponse = await fetch(SIGN_LABELS_URL[this.packId]);
    if (!labelsResponse.ok) {
      return {
        ok: false,
        reason: `Sign classifier labels are missing. ${APP_NAME} will not guess signs.`,
      };
    }
    const parsed = (await labelsResponse.json()) as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      return {
        ok: false,
        reason: `Sign classifier labels are invalid. ${APP_NAME} will not guess signs.`,
      };
    }
    const allowed = new Set(listVocabulary(this.packId).map((item) => item.gloss));
    this.labels = parsed.map((item) => String(item).toUpperCase()).filter((item) => allowed.has(item));
    if (this.labels.length === 0) {
      return {
        ok: false,
        reason: `Sign classifier labels do not match the closed vocabulary. ${APP_NAME} will not guess signs.`,
      };
    }

    ort.env.wasm.wasmPaths = defaultOrtWasmPaths();
    ort.env.wasm.numThreads = 1;
    try {
      const modelBytes = await fetchModelBytes(SIGN_ONNX_URL[this.packId]);
      this.session = await ort.InferenceSession.create(modelBytes, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
    } catch (error) {
      this.session = null;
      const detail = error instanceof Error ? error.message : "unknown error";
      return {
        ok: false,
        reason: `Sign classifier weights could not be loaded (${detail}). ${APP_NAME} will not guess signs.`,
      };
    }
    return { ok: true };
  }

  async predict(sequence: LandmarkFrame[]): Promise<SignClassifierResult | null> {
    if (!this.session || sequence.length < 8) {
      return null;
    }
    const inputName = this.session.inputNames[0];
    if (!inputName) {
      return null;
    }
    const data = flattenSequence(sequence);
    const tensor = new ort.Tensor("float32", data, [1, SEQUENCE_FRAMES, 126]);
    let output: Record<string, ort.Tensor> | null = null;
    try {
      output = await this.session.run({ [inputName]: tensor });
      const firstName = this.session.outputNames[0];
      if (!firstName) {
        return null;
      }
      const logits = Array.from(output[firstName].data as Float32Array);
      if (logits.length === 0) {
        return null;
      }
      const probabilities = softmax(logits);
      let bestIndex = 0;
      for (let i = 1; i < probabilities.length; i += 1) {
        if ((probabilities[i] ?? 0) > (probabilities[bestIndex] ?? 0)) {
          bestIndex = i;
        }
      }
      const gloss = this.labels[bestIndex];
      const confidence = probabilities[bestIndex] ?? 0;
      if (!gloss) {
        return null;
      }
      return { gloss, confidence };
    } finally {
      tensor.dispose();
      if (output) {
        for (const name of Object.keys(output)) {
          output[name]?.dispose();
        }
      }
    }
  }

  async dispose(): Promise<void> {
    await this.session?.release();
    this.session = null;
  }
}
