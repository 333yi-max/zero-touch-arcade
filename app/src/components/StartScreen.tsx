import { useState } from 'react';
import Button from './Button';

interface StartScreenProps {
  /** 本机存过校准值：开始体验就直奔游戏，同时把「重新校准」摆出来 */
  hasCalibration: boolean;
  onStartCamera: () => void;
  onRecalibrate: () => void;
  onStartDemo: () => void;
}

export default function StartScreen({
  hasCalibration,
  onStartCamera,
  onRecalibrate,
  onStartDemo,
}: StartScreenProps) {
  const [notice, setNotice] = useState('');

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <p className="text-lg font-semibold text-accent">Hack4Good · 技术向善</p>
        <h1 className="text-5xl font-black leading-tight tracking-tight sm:text-7xl">
          零触控游乐场
        </h1>
        <p className="text-2xl text-dim sm:text-3xl">不用手，也能玩三分钟。</p>
        <p className="max-w-prose text-lg text-dim">
          给上肢障碍者、术后康复者、行动不便的长辈：只用头、眼睛和嘴，就能玩一局游戏。
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <Button
          onClick={onStartCamera}
          hint={hasCalibration ? '上次已校准 · 直接进入' : '需要摄像头 · 约 30 秒校准'}
        >
          开始体验
        </Button>
        {hasCalibration ? (
          <Button variant="secondary" onClick={onRecalibrate} hint="换个坐姿、换个人，重新量一遍">
            重新校准
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onStartDemo} hint="不用摄像头，看虚拟玩家怎么玩">
          演示模式
        </Button>
        <Button
          variant="secondary"
          onClick={() => setNotice('60 秒介绍视频还在制作中，上线后这里可以直接播放。')}
          hint="约 60 秒"
        >
          看 60 秒视频
        </Button>
      </div>

      <p role="status" aria-live="polite" className="min-h-6 text-lg font-semibold text-accent">
        {notice}
      </p>

      <section
        aria-label="使用前请知道"
        className="flex flex-col gap-2 rounded-card border-2 border-edge bg-card p-5 text-lg"
      >
        <h2 className="text-xl font-bold">使用前请知道</h2>
        <p className="text-dim">🔒 视频只在你的浏览器里处理，不会上传到任何服务器。</p>
        <p className="text-dim">🖥️ 建议使用 Chrome 或 Edge，并在弹出提示时允许使用摄像头。</p>
        <p className="text-dim">🖐️ 没有摄像头也没关系，选「演示模式」即可看完整个玩法。</p>
      </section>
    </div>
  );
}
