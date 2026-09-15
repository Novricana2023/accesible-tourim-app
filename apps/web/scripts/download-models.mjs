import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, copyFile, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modelsDir = path.join(root, "public", "models");
const ortDest = path.join(root, "public", "ort");
const tessDest = path.join(root, "public", "tesseract");
const tessLangDest = path.join(tessDest, "lang");
const manifestPath = path.join(modelsDir, "manifest.json");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const target = path.join(modelsDir, manifest.file);

await mkdir(modelsDir, { recursive: true });
await mkdir(ortDest, { recursive: true });
await mkdir(tessLangDest, { recursive: true });

if (!(await fileExists(target)) || !(await hashMatches(target, manifest.sha256))) {
  console.log(`Downloading ${manifest.file} from ${manifest.sourceUrl}`);
  await download(manifest.sourceUrl, target);
  if (!(await hashMatches(target, manifest.sha256))) {
    throw new Error(`Checksum mismatch for ${manifest.file}.`);
  }
} else {
  console.log(`${manifest.file} is already present.`);
}

const ortSrcCandidates = [
  path.join(root, "node_modules", "onnxruntime-web", "dist"),
  path.join(root, "..", "..", "node_modules", "onnxruntime-web", "dist"),
];
let ortSrc = "";
for (const candidate of ortSrcCandidates) {
  if (await fileExists(candidate)) {
    ortSrc = candidate;
    break;
  }
}
if (ortSrc) {
  const files = await readdir(ortSrc);
  const needed = files.filter(
    (name) =>
      name.endsWith(".wasm") ||
      name.startsWith("ort-wasm") ||
      name.includes("jsep"),
  );
  for (const name of needed) {
    await copyFile(path.join(ortSrc, name), path.join(ortDest, name));
  }
  console.log(`Copied ${needed.length} ONNX Runtime files to public/ort.`);
} else {
  console.warn("onnxruntime-web is not installed yet. Run npm install, then npm run models.");
}

const tessJsDistCandidates = [
  path.join(root, "node_modules", "tesseract.js", "dist"),
  path.join(root, "..", "..", "node_modules", "tesseract.js", "dist"),
];
const tessCoreCandidates = [
  path.join(root, "node_modules", "tesseract.js-core"),
  path.join(root, "..", "..", "node_modules", "tesseract.js-core"),
];

let tessJsDist = "";
for (const candidate of tessJsDistCandidates) {
  if (await fileExists(candidate)) {
    tessJsDist = candidate;
    break;
  }
}
let tessCore = "";
for (const candidate of tessCoreCandidates) {
  if (await fileExists(candidate)) {
    tessCore = candidate;
    break;
  }
}

if (tessJsDist) {
  await copyFile(path.join(tessJsDist, "worker.min.js"), path.join(tessDest, "worker.min.js"));
  console.log("Copied tesseract.js worker.min.js to public/tesseract.");
} else {
  console.warn("tesseract.js is not installed yet. Run npm install, then npm run models.");
}

if (tessCore) {
  const files = await readdir(tessCore);
  const needed = files.filter(
    (name) => name.startsWith("tesseract-core") && (name.endsWith(".js") || name.endsWith(".wasm")),
  );
  for (const name of needed) {
    await copyFile(path.join(tessCore, name), path.join(tessDest, name));
  }
  console.log(`Copied ${needed.length} tesseract.js-core files to public/tesseract.`);
} else {
  console.warn("tesseract.js-core is not installed yet. Run npm install, then npm run models.");
}

const trainedData = path.join(tessLangDest, "eng.traineddata");
const tessdataUrls = [
  "https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@main/eng.traineddata",
  "https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata",
];
if (!(await fileExists(trainedData)) || (await fileSize(trainedData)) < 100_000) {
  let downloaded = false;
  for (const url of tessdataUrls) {
    try {
      console.log(`Downloading English tessdata_fast from ${url}`);
      await download(url, trainedData);
      if ((await fileSize(trainedData)) >= 100_000) {
        downloaded = true;
        break;
      }
    } catch (error) {
      console.warn(error instanceof Error ? error.message : String(error));
    }
  }
  if (!downloaded) {
    throw new Error("Could not download English Tesseract traineddata.");
  }
} else {
  console.log("eng.traineddata is already present.");
}

const mediapipeWasmDest = path.join(root, "public", "mediapipe", "wasm");
const mediapipeModelDest = path.join(root, "public", "models", "mediapipe");
await mkdir(mediapipeWasmDest, { recursive: true });
await mkdir(mediapipeModelDest, { recursive: true });
await mkdir(path.join(root, "public", "models", "sign-language"), { recursive: true });

const mediapipeWasmSrcCandidates = [
  path.join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm"),
  path.join(root, "..", "..", "node_modules", "@mediapipe", "tasks-vision", "wasm"),
];
let mediapipeWasmSrc = "";
for (const candidate of mediapipeWasmSrcCandidates) {
  if (await fileExists(candidate)) {
    mediapipeWasmSrc = candidate;
    break;
  }
}
if (mediapipeWasmSrc) {
  const files = await readdir(mediapipeWasmSrc);
  for (const name of files) {
    await copyFile(path.join(mediapipeWasmSrc, name), path.join(mediapipeWasmDest, name));
  }
  console.log(`Copied ${files.length} MediaPipe WASM files to public/mediapipe/wasm.`);
} else {
  console.warn("@mediapipe/tasks-vision is not installed yet. Run npm install, then npm run models.");
}

const handTask = path.join(mediapipeModelDest, "hand_landmarker.task");
const handTaskUrl =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
if (!(await fileExists(handTask)) || (await fileSize(handTask)) < 100_000) {
  try {
    console.log(`Downloading MediaPipe hand landmarker from ${handTaskUrl}`);
    await download(handTaskUrl, handTask);
  } catch (error) {
    console.warn(
      error instanceof Error
        ? error.message
        : "Could not download MediaPipe hand landmarker. Communicate will announce that hand tracking is unavailable.",
    );
  }
} else {
  console.log("hand_landmarker.task is already present.");
}

async function download(url, dest) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  const file = createWriteStream(dest);
  await finished(Readable.fromWeb(response.body).pipe(file));
}

async function hashMatches(file, expected) {
  try {
    const bytes = await readFile(file);
    const digest = createHash("sha256").update(bytes).digest("hex");
    return digest === expected;
  } catch {
    return false;
  }
}

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function fileSize(file) {
  try {
    const bytes = await readFile(file);
    return bytes.byteLength;
  } catch {
    return 0;
  }
}
