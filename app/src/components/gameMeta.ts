import { AudioLines, Star, Worm, type LucideIcon } from 'lucide-react';
import type { GameId } from '../state/machine';

export interface GameMeta {
  id: GameId;
  name: string;
  line: string;
  time: string;
  who: string;
  icon: LucideIcon;
}

export const GAMES: readonly GameMeta[] = [
  {
    id: 'star',
    name: '接星星',
    line: '转头移动挡板，接住落下的星星',
    time: '漏 5 颗星结束',
    who: '第一次玩首选',
    icon: Star,
  },
  {
    id: 'rhythm',
    name: '节奏点头',
    line: '跟着节拍点头',
    time: '16 拍 · 约 20 秒',
    who: '喜欢音乐节奏',
    icon: AudioLines,
  },
  {
    id: 'snake',
    name: '霓虹贪吃蛇',
    line: '转头控制小蛇，吃光球连击得分',
    time: '90 秒一局',
    who: '想挑战反应力',
    icon: Worm,
  },
];
