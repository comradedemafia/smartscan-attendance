import type * as FaceApi from "@vladmandic/face-api";

export const FACE_MATCH_THRESHOLD = 0.6;

const MODEL_URL = "/models";

let faceApiPromise: Promise<typeof FaceApi> | null = null;
let modelsPromise: Promise<void> | null = null;

export interface FaceVerificationResult {
  faceDetected: boolean;
  faceMatchDistance: number | null;
  gender: "male" | "female" | null;
  genderProbability: number | null;
  genderMatch: boolean | null;
}

export interface SelfieVerificationPayload extends FaceVerificationResult {
  dataUrl: string;
}

function getFaceApi(): Promise<typeof FaceApi> {
  if (!faceApiPromise) {
    faceApiPromise = import("@vladmandic/face-api");
  }
  return faceApiPromise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
    image.src = src;
  });
}

async function loadModels(faceapi: typeof FaceApi): Promise<void> {
  if (modelsPromise) return modelsPromise;

  modelsPromise = (async () => {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
    ]);
  })().catch((error) => {
    modelsPromise = null;
    throw error;
  });

  return modelsPromise;
}

export async function loadFaceVerificationModels(): Promise<void> {
  const faceapi = await getFaceApi();
  await loadModels(faceapi);
}

function expectedGenderFromProfile(gender: string | null | undefined): "male" | "female" | null {
  if (gender === "M") return "male";
  if (gender === "F") return "female";
  return null;
}

export async function verifySelfieAgainstAvatar(
  avatarUrl: string | null | undefined,
  selfie: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  profileGender: string | null | undefined,
): Promise<FaceVerificationResult> {
  if (!avatarUrl) throw new Error("AVATAR_MISSING");

  const faceapi = await getFaceApi();
  await loadModels(faceapi);

  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 416,
    scoreThreshold: 0.5,
  });

  const avatarImage = await loadImage(avatarUrl);
  const avatarFace = await faceapi
    .detectSingleFace(avatarImage, options)
    .withFaceLandmarks(true)
    .withFaceDescriptor();

  if (!avatarFace) throw new Error("AVATAR_FACE_NOT_FOUND");

  const selfieFaces = await faceapi
    .detectAllFaces(selfie, options)
    .withFaceLandmarks(true)
    .withFaceDescriptors()
    .withAgeAndGender();

  if (selfieFaces.length === 0) {
    return {
      faceDetected: false,
      faceMatchDistance: null,
      gender: null,
      genderProbability: null,
      genderMatch: null,
    };
  }

  if (selfieFaces.length > 1) throw new Error("MULTIPLE_FACES");

  const selfieFace = selfieFaces[0];
  const faceMatchDistance = faceapi.euclideanDistance(
    avatarFace.descriptor,
    selfieFace.descriptor,
  );
  const gender = selfieFace.gender as "male" | "female";
  const expectedGender = expectedGenderFromProfile(profileGender);

  return {
    faceDetected: true,
    faceMatchDistance,
    gender,
    genderProbability: selfieFace.genderProbability,
    genderMatch: expectedGender ? gender === expectedGender : null,
  };
}

export async function verifySelfieDataUrl(
  avatarUrl: string | null | undefined,
  selfieDataUrl: string,
  profileGender: string | null | undefined,
): Promise<FaceVerificationResult> {
  const image = await loadImage(selfieDataUrl);
  return verifySelfieAgainstAvatar(avatarUrl, image, profileGender);
}
