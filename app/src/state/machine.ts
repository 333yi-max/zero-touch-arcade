export type Screen = 'start' | 'calibration' | 'game' | 'result';

/** 输入来源：真实摄像头，或浏览器内的虚拟玩家。 */
export type Mode = 'camera' | 'demo';

export type AppEvent =
  | { type: 'choose_camera' }
  | { type: 'choose_demo' }
  | { type: 'start_calibration' }
  | { type: 'calibration_finished' }
  | { type: 'calibration_skipped' }
  | { type: 'game_finished'; score: number }
  | { type: 'replay' }
  | { type: 'home' };

export interface AppState {
  screen: Screen;
  mode: Mode;
  score: number;
  /** 本机存过校准值。由 App 从 localStorage 读一次带进来，next() 自己不碰浏览器 API。 */
  calibrated: boolean;
}

export const initialState: AppState = {
  screen: 'start',
  mode: 'camera',
  score: 0,
  calibrated: false,
};

/**
 * start → calibration → game → result
 *
 * 校准过的人「开始体验」直接进游戏，重新校准走 start_calibration；
 * 演示模式（虚拟玩家）从首页的演示入口进，量程永远是引擎默认值。
 * calibration_skipped 是「跳过，使用默认值」：进摄像头模式，但不写盘。
 */
export function next(state: AppState, event: AppEvent): AppState {
  switch (event.type) {
    case 'choose_camera':
      return {
        ...state,
        screen: state.calibrated ? 'game' : 'calibration',
        mode: 'camera',
        score: 0,
      };
    case 'choose_demo':
      return { ...state, screen: 'game', mode: 'demo', score: 0 };
    case 'start_calibration':
      return { ...state, screen: 'calibration', mode: 'camera' };
    case 'calibration_finished':
      return { ...state, screen: 'game', mode: 'camera', score: 0, calibrated: true };
    case 'calibration_skipped':
      return { ...state, screen: 'game', mode: 'camera', score: 0 };
    case 'game_finished':
      return { ...state, screen: 'result', score: event.score };
    case 'replay':
      return { ...state, screen: 'game', score: 0 };
    case 'home':
      return { ...state, screen: 'start' };
  }
}
