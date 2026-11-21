export type Screen = 'start' | 'calibration' | 'game' | 'result';

/** 输入来源：真实摄像头，或浏览器内的虚拟玩家。 */
export type Mode = 'camera' | 'demo';

export type AppEvent =
  | { type: 'choose_camera' }
  | { type: 'choose_demo' }
  | { type: 'calibration_finished' }
  | { type: 'calibration_skipped' }
  | { type: 'game_finished'; score: number }
  | { type: 'replay' }
  | { type: 'home' };

export interface AppState {
  screen: Screen;
  mode: Mode;
  score: number;
}

export const initialState: AppState = { screen: 'start', mode: 'camera', score: 0 };

/**
 * start → calibration → game → result
 * 演示模式跳过校准（虚拟玩家的量程是固定的），校准页的「跳过」走同一条路。
 */
export function next(state: AppState, event: AppEvent): AppState {
  switch (event.type) {
    case 'choose_camera':
      return { ...state, screen: 'calibration', mode: 'camera' };
    case 'choose_demo':
      return { ...state, screen: 'game', mode: 'demo', score: 0 };
    case 'calibration_finished':
      return { ...state, screen: 'game', mode: 'camera', score: 0 };
    case 'calibration_skipped':
      return { ...state, screen: 'game', mode: 'demo', score: 0 };
    case 'game_finished':
      return { ...state, screen: 'result', score: event.score };
    case 'replay':
      return { ...state, screen: 'game', score: 0 };
    case 'home':
      return { ...state, screen: 'start' };
  }
}
