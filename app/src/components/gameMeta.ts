import { AudioLines, Flame, Hammer, Star, Worm, type LucideIcon } from 'lucide-react';
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
  {
    id: 'whack',
    name: '打地鼠',
    line: '转头移动准星，点头敲地鼠',
    time: '60 秒或敲中 25 个',
    who: '喜欢眼疾手快',
    icon: Hammer,
  },
  {
    id: 'candle',
    name: '吹蜡烛',
    line: '张嘴吹气，吹灭一排蜡烛',
    time: '60 秒内吹完 5 支',
    who: '想练嘴部控制',
    icon: Flame,
  },
];
