import type { Category, NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { RawFrame } from './types';

/**
 * FaceMesh 468 点里本项目用到的几个索引。
 * 左右指被摄者自己的左右，不是画面左右。
 */
export const FACE_POINTS = {
  noseTip: 1,
  cheekLeft: 234,
  cheekRight: 454,
  eyeOuterLeft: 33,
  eyeOuterRight: 263,
  forehead: 10,
  chin: 152,
} as const;

const EPS = 1e-6;

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midX(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return (a.x + b.x) / 2;
}

function midY(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return (a.y + b.y) / 2;
}

function score(categories: readonly Category[] | undefined, name: string): number {
  if (!categories) return 0;
  for (const category of categories) {
    if (category.categoryName === name) return category.score;
  }
  return 0;
}

/** blendshape 名固定是这三个，取不到就当 0。 */
export function readBlendshapes(categories: readonly Category[] | undefined): {
  blinkL: number;
  blinkR: number;
  jaw: number;
} {
  return {
    blinkL: score(categories, 'eyeBlinkLeft'),
    blinkR: score(categories, 'eyeBlinkRight'),
    jaw: score(categories, 'jawOpen'),
  };
}

function absent(t: number): RawFrame {
  return { t, yaw: 0, pitch: 0, blinkL: 0, blinkR: 0, jaw: 0, present: false };
}

/**
 * 关键点 + blendshape → RawFrame。
 *
 * yaw 用鼻尖相对双眼外角中点的横向偏移，除以瞳距；
 * pitch 用鼻尖相对双颊中点的纵向偏移，除以额头到下巴的脸高。
 * 分母都是脸上的度量，所以人离摄像头远近不影响量纲，
 * 结果落在引擎期望的 0.08–0.22 尺度上。
 */
export function landmarksToFrame(
  landmarks: readonly NormalizedLandmark[] | undefined,
  categories: readonly Category[] | undefined,
  t: number,
): RawFrame {
  const point = (index: number): NormalizedLandmark | undefined => landmarks?.[index];

  const nose = point(FACE_POINTS.noseTip);
  const cheekL = point(FACE_POINTS.cheekLeft);
  const cheekR = point(FACE_POINTS.cheekRight);
  const eyeL = point(FACE_POINTS.eyeOuterLeft);
  const eyeR = point(FACE_POINTS.eyeOuterRight);
  const forehead = point(FACE_POINTS.forehead);
  const chin = point(FACE_POINTS.chin);

  if (!nose || !cheekL || !cheekR || !eyeL || !eyeR || !forehead || !chin) {
    return absent(t);
  }

  const eyeSpan = Math.max(EPS, dist(eyeL, eyeR));
  const faceSpan = Math.max(EPS, dist(forehead, chin));
  const yaw = (nose.x - midX(eyeL, eyeR)) / eyeSpan;
  const pitch = (nose.y - midY(cheekL, cheekR)) / faceSpan;

  if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) {
    return absent(t);
  }

  const shapes = readBlendshapes(categories);
  return {
    t,
    yaw,
    pitch,
    blinkL: shapes.blinkL,
    blinkR: shapes.blinkR,
    jaw: shapes.jaw,
    present: true,
  };
}
