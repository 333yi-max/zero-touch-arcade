import type { Mode } from '../state/machine';
import Button from './Button';
import TopBar from './TopBar';

interface ResultScreenProps {
  score: number;
  mode: Mode;
  onReplay: () => void;
  onHome: () => void;
}

export default function ResultScreen({ score, mode, onReplay, onHome }: ResultScreenProps) {
  return (
    <div className="flex flex-col gap-6">
      <TopBar title="这一局" onBack={onHome} />

      <section
        aria-label="本局得分"
        className="flex flex-col items-center gap-2 rounded-card border-2 border-edge bg-card p-8"
      >
        <p className="text-lg text-dim">{mode === 'demo' ? '虚拟玩家得分（占位）' : '你的得分（占位）'}</p>
        <p className="text-7xl font-black text-accent">{score}</p>
        <p className="text-lg text-dim">接入玩法后这里显示星星数与连击</p>
      </section>

      <section
        aria-label="分享卡预览"
        className="flex flex-col gap-3 rounded-card border-2 border-dashed border-edge p-8 text-center"
      >
        <p className="text-2xl font-bold">分享卡占位</p>
        <p className="text-lg text-dim">
          一张图带走成绩和一句话。中文不乱码需要自带字体子集，放到分享卡那一步再做。
        </p>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={onReplay}>再玩一次</Button>
        <Button variant="secondary" onClick={onHome}>
          回到首页
        </Button>
      </div>
    </div>
  );
}
