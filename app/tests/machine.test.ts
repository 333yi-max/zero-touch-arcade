import { describe, expect, it } from 'vitest';
import { initialState, next, type AppState } from '../src/state/machine';

const calibrated: AppState = { ...initialState, calibrated: true };

describe('state/machine', () => {
  it('没校准过：开始体验进校准页', () => {
    expect(next(initialState, { type: 'choose_camera' })).toMatchObject({
      screen: 'calibration',
      mode: 'camera',
    });
  });

  it('校准过：开始体验直接进游戏，不再花那 30 秒', () => {
    expect(next(calibrated, { type: 'choose_camera' })).toMatchObject({
      screen: 'game',
      mode: 'camera',
    });
  });

  it('重新校准是另一条入口，不受已存值影响', () => {
    expect(next(calibrated, { type: 'start_calibration' })).toMatchObject({
      screen: 'calibration',
      mode: 'camera',
    });
  });

  it('校准完成：进摄像头模式并记下「已校准」', () => {
    const s = next({ ...initialState, screen: 'calibration' }, { type: 'calibration_finished' });
    expect(s).toMatchObject({ screen: 'game', mode: 'camera', calibrated: true });
  });

  it('跳过 = 用默认量程进摄像头模式，不是演示模式，也不算校准过', () => {
    const s = next({ ...initialState, screen: 'calibration' }, { type: 'calibration_skipped' });
    expect(s).toMatchObject({ screen: 'game', mode: 'camera', calibrated: false });
  });

  it('演示模式仍从首页进，且量程模式是 demo', () => {
    expect(next(initialState, { type: 'choose_demo' })).toMatchObject({ screen: 'game', mode: 'demo' });
  });

  it('再玩一次保持上次的输入模式', () => {
    const s = next({ ...initialState, screen: 'result', mode: 'camera', score: 12 }, { type: 'replay' });
    expect(s).toMatchObject({ screen: 'game', mode: 'camera', score: 0 });
  });

  it('返回首页不清掉已校准标记', () => {
    const s = next({ ...calibrated, screen: 'game' }, { type: 'home' });
    expect(s).toMatchObject({ screen: 'start', calibrated: true });
  });

  it('带分数结束', () => {
    expect(next({ ...initialState, screen: 'game' }, { type: 'game_finished', score: 7 })).toMatchObject({
      screen: 'result',
      score: 7,
    });
  });
});
