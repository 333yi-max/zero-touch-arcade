import { useState } from 'react';
import { bestOf, readBestScores, updateBest, writeBestScores } from '../game/bestScores';
import type { RhythmGameStats } from '../game/rhythmGame';
import { downloadShareCard } from '../game/shareCard';
import type { StarGameStats } from '../game/starGame';
import Button from './Button';

/** 两个游戏共用的结果数据：按 game 判别 stats 的字段。 */
export type GameResult =
  | { game: 'star'; stats: StarGameStats }
  | { game: 'rhythm'; stats: RhythmGameStats };

interface ResultCardProps {
  result: GameResult;
  onReplay: () => void;
  onSwitchGame: () => void;
  onHome: () => void;
}

export default function ResultCard({
  result,
  onReplay,
  onSwitchGame,
  onHome,
}: ResultCardProps) {
  const { game, stats } = result;
  // 挂载时记一次最佳：坏数据当没有，写不进也照常玩
  const [{ best, isNew }] = useState(() => {
    const scores = readBestScores();
    const prev = bestOf(scores, game);
    // 「新纪录」只在超过已有成绩时亮；第一次玩也要写盘
    const isNew = prev !== null && stats.score > prev;
    if (prev === null || stats.score > prev) {
      writeBestScores(updateBest(scores, game, stats.score));
    }
    return { best: prev !== null && prev >= stats.score ? prev : stats.score, isNew };
  });
  const [shareNotice, setShareNotice] = useState('');

  const share = async (): Promise<void> => {
    setShareNotice('');
    const ok = await downloadShareCard({ game, score: stats.score, date: new Date() });
    setShareNotice(ok ? '' : '分享卡没有生成成功，可以再试一次。');
  };

  const rating = game === 'rhythm' ? stats.rating : null;
  const accuracy = game === 'rhythm' ? Math.round(stats.accuracy * 100) : null;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-page">
      <div className="flex min-h-full items-center justify-center p-5">
    <section
      aria-label="本局结束"
      className="flex w-full max-w-md flex-col items-center gap-3 rounded-card border-2 border-edge bg-card p-6"
    >
      {rating ? (
        <p className="text-6xl font-black leading-none text-accent" aria-label={`评级 ${rating}`}>
          {rating}
        </p>
      ) : null}
      <h2 className="text-3xl font-black">{game === 'rhythm' ? '完成！' : '本局结束'}</h2>
      <p className="text-5xl font-black tabular-nums text-accent" aria-live="polite">
        得分 {stats.score}
      </p>

      <div className="flex flex-col items-center gap-1 text-lg text-dim">
        {game === 'star' ? (
          <p>
            接住 {stats.caught} / 共 {stats.total} · 漏掉 {stats.missed}
          </p>
        ) : (
          <p>
            准确率 {accuracy}% · 完美连击 {stats.maxCombo}
          </p>
        )}
        <p className="font-bold text-fg">
          {isNew ? '新纪录！' : '最佳'} {best}
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button onClick={onReplay} hint="点头或眨眼也可以">
          再玩一次
        </Button>
        <Button variant="secondary" onClick={onSwitchGame}>
          换个游戏
        </Button>
        <Button variant="secondary" onClick={share}>
          下载分享卡
        </Button>
        <Button variant="secondary" onClick={onHome}>
          回到首页
        </Button>
      </div>

      <p role="status" aria-live="polite" className="min-h-6 text-base font-semibold text-accent">
        {shareNotice}
      </p>
    </section>
      </div>
    </div>
  );
}
