import { useEffect, useRef } from 'react';
import { Timer, Users } from 'lucide-react';
import { createSpeaker, type Speaker } from '../calibration/speech';
import { readStoredSettings } from '../calibration/storage';
import type { GameId } from '../state/machine';
import { GAMES } from './gameMeta';
import Button from './Button';
import TopBar from './TopBar';

const ANNOUNCE = `四个游戏。${GAMES.map((g) => `${g.name}，${g.line}`).join('。')}。点卡片上的开始按钮选一个。`;

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

      <div className="animate-fade-in-up stagger-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GAMES.map((game) => (
          <article
            key={game.id}
            className="card-surface flex flex-col gap-3 rounded-card border border-edge p-5 shadow-card transition duration-200 ease-out-soft hover:border-accent/50 hover:bg-card-hi"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-accent/15 text-accent">
                <game.icon size={26} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <h3 className="text-2xl font-black tracking-[0.04em]">{game.name}</h3>
            </div>
            <p className="text-lg leading-snug text-dim">{game.line}</p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-base font-semibold text-dim">
              <span className="inline-flex items-center gap-1.5">
                <Timer size={16} aria-hidden="true" className="text-ring" />
                {game.time}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users size={16} aria-hidden="true" className="text-ring" />
                {game.who}
              </span>
            </div>
            <Button className="mt-auto" onClick={() => onPick(game.id)}>
              开始
            </Button>
          </article>
        ))}
      </div>

      <div className="animate-fade-in-up stagger-3 flex flex-wrap gap-4">
        <Button variant="secondary" onClick={announce} hint="把四个游戏再念一遍">
          再念一遍
        </Button>
        <Button variant="secondary" onClick={onBack}>
          返回首页
        </Button>
      </div>
    </div>
  );
}
