import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark } from "../domain/pose";

const BASE = import.meta.env.BASE_URL;

/** Person segmentation mask: confidence (0..1) that each pixel belongs to the person, in image orientation. */
export interface PersonMask {
  width: number;
  height: number;
  data: Float32Array;
}

export interface BodyDetection {
  /** Normalised image landmarks (position on screen). */
  landmarks: Landmark[];
  /** Metric 3D landmarks centred on the hips: their depth is far steadier than the image landmarks' z. */
  worldLandmarks: Landmark[];
  mask: PersonMask | null;
}

/** MediaPipe Pose Landmarker with segmentation: shoulders and silhouette in one pass. Only created when a Cape is worn. */
export class BodyTracker {
  private constructor(private landmarker: PoseLandmarker) {}

  static async create(): Promise<BodyTracker> {
    const fileset = await FilesetResolver.forVisionTasks(`${BASE}mediapipe/wasm`);
    const options = (delegate: "GPU" | "CPU") => ({
      baseOptions: { modelAssetPath: `${BASE}mediapipe/pose_landmarker_lite.task`, delegate },
      runningMode: "VIDEO" as const,
      numPoses: 1,
      outputSegmentationMasks: true,
    });
    try {
      return new BodyTracker(await PoseLandmarker.createFromOptions(fileset, options("GPU")));
    } catch {
      return new BodyTracker(await PoseLandmarker.createFromOptions(fileset, options("CPU")));
    }
  }

  detect(video: HTMLVideoElement, timestampMs: number): BodyDetection | null {
    const result = this.landmarker.detectForVideo(video, timestampMs);
    try {
      const landmarks = result.landmarks[0];
      const worldLandmarks = result.worldLandmarks[0];
      if (!landmarks || !worldLandmarks) return null;
      const m = result.segmentationMasks?.[0];
      // The mask lives in MediaPipe's memory until the result is closed: copy it out
      const mask = m ? { width: m.width, height: m.height, data: new Float32Array(m.getAsFloat32Array()) } : null;
      return { landmarks, worldLandmarks, mask };
    } finally {
      result.close();
    }
  }
}
