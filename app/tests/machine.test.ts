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

  it('校准过：开始体验直接进选游戏页，不再花那 30 秒', () => {
    expect(next(calibrated, { type: 'choose_camera' })).toMatchObject({
      screen: 'select',
      mode: 'camera',
    });
  });

  it('重新校准是另一条入口，不受已存值影响', () => {
    expect(next(calibrated, { type: 'start_calibration' })).toMatchObject({
      screen: 'calibration',
      mode: 'camera',
    });
  });

  it('校准完成：进选游戏页并记下「已校准」', () => {
    const s = next({ ...initialState, screen: 'calibration' }, { type: 'calibration_finished' });
    expect(s).toMatchObject({ screen: 'select', mode: 'camera', calibrated: true });
  });

  it('跳过 = 用默认量程进摄像头模式，不是演示模式，也不算校准过', () => {
    const s = next({ ...initialState, screen: 'calibration' }, { type: 'calibration_skipped' });
    expect(s).toMatchObject({ screen: 'select', mode: 'camera', calibrated: false });
  });

  it('演示模式也先进选游戏页，量程模式是 demo', () => {
    expect(next(initialState, { type: 'choose_demo' })).toMatchObject({ screen: 'select', mode: 'demo' });
  });

  it('pick_game 进对应游戏并清零分数', () => {
    const s = next(
      { ...initialState, screen: 'select', mode: 'camera', score: 12 },
      { type: 'pick_game', game: 'rhythm' },
    );
    expect(s).toMatchObject({ screen: 'game', gameId: 'rhythm', score: 0 });
  });

  it('pick_game 保留输入模式', () => {
    const s = next({ ...initialState, screen: 'select', mode: 'demo' }, { type: 'pick_game', game: 'star' });
    expect(s).toMatchObject({ screen: 'game', gameId: 'star', mode: 'demo' });
  });

  it('结果卡「换个游戏」回选游戏页，输入模式不变', () => {
    const s = next({ ...initialState, screen: 'game', mode: 'camera', gameId: 'rhythm' }, { type: 'switch_game' });
    expect(s).toMatchObject({ screen: 'select', mode: 'camera' });
  });

  it('返回首页不清掉已校准标记', () => {
    const s = next({ ...calibrated, screen: 'game' }, { type: 'home' });
    expect(s).toMatchObject({ screen: 'start', calibrated: true });
  });

  it('开发日志是独立页，返回仍回首页', () => {
    const s = next(initialState, { type: 'open_devlog' });
    expect(s).toMatchObject({ screen: 'devlog' });
    expect(next(s, { type: 'home' })).toMatchObject({ screen: 'start' });
  });
});
