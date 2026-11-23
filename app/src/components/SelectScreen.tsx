import { useEffect, useRef } from 'react';
import { AudioLines, Star, Worm, type LucideIcon } from 'lucide-react';
import { createSpeaker, type Speaker } from '../calibration/speech';
import { readStoredSettings } from '../calibration/storage';
import type { GameId } from '../state/machine';
import Button from './Button';
import TopBar from './TopBar';

const GAMES: { id: GameId; name: string; line: string; icon: LucideIcon }[] = [
  { id: 'star', name: '接星星', line: '转头移动挡板，接住落下的星星', icon: Star },
  { id: 'rhythm', name: '节奏点头', line: '跟着节拍点头', icon: AudioLines },
  { id: 'snake', name: '霓虹贪吃蛇', line: '转头控制小蛇，吃光球连击得分', icon: Worm },
];

const ANNOUNCE = `三个游戏。${GAMES.map((g) => `${g.name}，${g.line}`).join('。')}。点大按钮选一个。`;

interface SelectScreenProps {
  onPick: (game: GameId) => void;
  onBack: () => void;
}

export default function SelectScreen({ onPick, onBack }: SelectScreenProps) {
  const speakerRef = useRef<Speaker | null>(null);

  useEffect(() => {
    // 语音播报是可选增强：设置里关掉，或浏览器没有语音，都不影响选游戏
    if (!readStoredSettings().voice) return;
    const speaker = createSpeaker();
    speakerRef.current = speaker;
    speaker.speak(ANNOUNCE);
    return () => {
      speaker.cancel();
      speakerRef.current = null;
    };
  }, []);

  const announce = (): void => {
    if (speakerRef.current) speakerRef.current.speak(ANNOUNCE);
  };

  return (
    <div className="flex flex-col gap-8">
      <TopBar title="选个游戏" onBack={onBack} />
      <div className="animate-fade-in-up flex flex-col gap-3">
        <h2 className="text-3xl font-black">想玩哪个？</h2>
        <p className="text-lg text-dim">
          操作不了按钮也没关系，旁边的家人朋友点一下，就能把游戏交给你。
        </p>
      </div>

      <div className="animate-fade-in-up stagger-2 flex flex-col gap-5">
        {GAMES.map((game) => (
          <Button
            key={game.id}
            onClick={() => onPick(game.id)}
            hint={game.line}
            icon={<game.icon size={24} strokeWidth={2} />}
          >
            {game.name}
          </Button>
        ))}
      </div>

      <div className="animate-fade-in-up stagger-3 flex flex-wrap gap-4">
        <Button variant="secondary" onClick={announce} hint="把三个游戏再念一遍">
          再念一遍
        </Button>
        <Button variant="secondary" onClick={onBack}>
          返回首页
        </Button>
      </div>
    </div>
  );
}
