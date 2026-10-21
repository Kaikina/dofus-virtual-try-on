import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type { Landmark } from "../domain/pose";

const BASE = import.meta.env.BASE_URL;

/** Thin wrapper around MediaPipe Face Landmarker, loaded from our own domain (no third-party request). */
export class FaceTracker {
  private constructor(private landmarker: FaceLandmarker) {}

  static async create(): Promise<FaceTracker> {
    const fileset = await FilesetResolver.forVisionTasks(`${BASE}mediapipe/wasm`);
    const options = (delegate: "GPU" | "CPU") => ({
      baseOptions: { modelAssetPath: `${BASE}mediapipe/face_landmarker.task`, delegate },
      runningMode: "VIDEO" as const,
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
    try {
      return new FaceTracker(await FaceLandmarker.createFromOptions(fileset, options("GPU")));
    } catch {
      return new FaceTracker(await FaceLandmarker.createFromOptions(fileset, options("CPU")));
    }
  }

  /** Landmarks of the most prominent face, or null when no face is visible. */
  detect(video: HTMLVideoElement, timestampMs: number): Landmark[] | null {
    const result = this.landmarker.detectForVideo(video, timestampMs);
    return result.faceLandmarks[0] ?? null;
  }

  static get ovalEdges(): { start: number; end: number }[] {
    return FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;
  }
}
