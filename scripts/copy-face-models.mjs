import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const source = join(process.cwd(), "node_modules", "@vladmandic", "face-api", "model");
const target = join(process.cwd(), "public", "models");

const files = [
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model.bin",
  "face_landmark_68_tiny_model-weights_manifest.json",
  "face_landmark_68_tiny_model.bin",
  "face_recognition_model-weights_manifest.json",
  "face_recognition_model.bin",
  "age_gender_model-weights_manifest.json",
  "age_gender_model.bin",
];

if (!existsSync(source)) {
  console.warn("face-api model directory not found; skipping model copy.");
  process.exit(0);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

for (const file of files) {
  cpSync(join(source, file), join(target, file));
}

console.log(`Copied ${files.length} face-api model files to public/models`);
