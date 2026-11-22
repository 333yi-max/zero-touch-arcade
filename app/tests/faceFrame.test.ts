import type { Category, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { describe, expect, it } from 'vitest';
import { FACE_POINTS, landmarksToFrame, readBlendshapes } from '../src/input/faceFrame';

const COUNT = 478;

function point(x: number, y: number): NormalizedLandmark {
  return { x, y, z: 0, visibility: 1 };
}

type Placements = Partial<Record<keyof typeof FACE_POINTS, [number, number]>>;

/** 只摆本项目用到的 7 个点，其余填占位，长度和真实 FaceLandmarker 一致。 */
function face(placed: Placements): NormalizedLandmark[] {
  const lm = Array.from({ length: COUNT }, () => point(0.5, 0.5));
  for (const key of Object.keys(placed) as (keyof typeof FACE_POINTS)[]) {
    const [x, y] = placed[key] as [number, number];
    lm[FACE_POINTS[key]] = point(x, y);
  }
  return lm;
}

const NEUTRAL: Placements = {
  noseTip: [0.5, 0.55],
  cheekLeft: [0.63, 0.55],
  cheekRight: [0.37, 0.55],
  eyeOuterLeft: [0.62, 0.4],
  eyeOuterRight: [0.38, 0.4],
  forehead: [0.5, 0.2],
  chin: [0.5, 0.9],
};

const cat = (categoryName: string, score: number): Category => ({
  categoryName,
  score,
  index: 0,
});

describe('landmarksToFrame', () => {
  it('正对镜头：yaw 和 pitch 都接近 0', () => {
    const f = landmarksToFrame(face(NEUTRAL), undefined, 1000);
    expect(f.present).toBe(true);
    expect(Math.abs(f.yaw)).toBeLessThan(1e-9);
    expect(Math.abs(f.pitch)).toBeLessThan(1e-9);
  });

  it('被摄者向左转头：鼻尖越过眼线中点，yaw 为正', () => {
    const f = landmarksToFrame(face({ ...NEUTRAL, noseTip: [0.66, 0.55] }), undefined, 1);
    expect(f.yaw).toBeGreaterThan(0.3);
  });

  it('被摄者向右转头：yaw 为负', () => {
    const f = landmarksToFrame(face({ ...NEUTRAL, noseTip: [0.34, 0.55] }), undefined, 1);
    expect(f.yaw).toBeLessThan(-0.3);
  });

  it('低头 pitch 为正、抬头为负，和引擎的点头判据同向', () => {
    const down = landmarksToFrame(face({ ...NEUTRAL, noseTip: [0.5, 0.68] }), undefined, 1);
    const up = landmarksToFrame(face({ ...NEUTRAL, noseTip: [0.5, 0.42] }), undefined, 1);
    expect(down.pitch).toBeGreaterThan(0.18);
    expect(up.pitch).toBeLessThan(-0.18);
  });

  it('人离摄像头远近只改变比例，不改变 yaw 和 pitch', () => {
    const near = face(NEUTRAL);
    const far = near.map((p) => point(p.x * 0.4, p.y * 0.4));
    const turned = face({ ...NEUTRAL, noseTip: [0.66, 0.55], cheekLeft: [0.63, 0.55] });
    const a = landmarksToFrame(turned, undefined, 1);
    const b = landmarksToFrame(
      turned.map((p) => point(p.x * 0.4, p.y * 0.4)),
      undefined,
      1,
    );
    expect(a.yaw).toBeCloseTo(b.yaw, 10);
    expect(a.pitch).toBeCloseTo(b.pitch, 10);
    expect(near.length).toBe(COUNT);
    expect(far.length).toBe(COUNT);
  });

  it('blendshape 名按 eyeBlinkLeft/eyeBlinkRight/jawOpen 映射到 blinkL/blinkR/jaw', () => {
    const shapes = [
      cat('browDownLeft', 0.9),
      cat('eyeBlinkLeft', 0.72),
      cat('eyeBlinkRight', 0.61),
      cat('jawOpen', 0.44),
    ];
    const f = landmarksToFrame(face(NEUTRAL), shapes, 1);
    expect(f.blinkL).toBe(0.72);
    expect(f.blinkR).toBe(0.61);
    expect(f.jaw).toBe(0.44);
    expect(readBlendshapes(shapes).blinkL).toBe(0.72);
  });

  it('blendshape 缺名字时按 0 处理，不会误触发', () => {
    const f = landmarksToFrame(face(NEUTRAL), [cat('mouthSmileLeft', 0.8)], 1);
    expect(f.blinkL).toBe(0);
    expect(f.blinkR).toBe(0);
    expect(f.jaw).toBe(0);
  });

  it('没有脸或点数不够时 present 为 false，数值全部归零', () => {
    const short = face(NEUTRAL).slice(0, 400);
    for (const input of [undefined, [], short]) {
      const f = landmarksToFrame(input, [cat('jawOpen', 0.9)], 7);
      expect(f.present).toBe(false);
      expect(f.yaw).toBe(0);
      expect(f.pitch).toBe(0);
      expect(f.blinkL).toBe(0);
      expect(f.jaw).toBe(0);
      expect(f.t).toBe(7);
    }
  });

  it('双眼外角重合也不会算出 Infinity', () => {
    const f = landmarksToFrame(
      face({ ...NEUTRAL, eyeOuterLeft: [0.5, 0.4], eyeOuterRight: [0.5, 0.4], noseTip: [0.66, 0.55] }),
      undefined,
      1,
    );
    expect(f.present).toBe(true);
    expect(Number.isFinite(f.yaw)).toBe(true);
  });
});
