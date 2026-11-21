import { useState } from 'react';
import Button from './Button';
import TopBar from './TopBar';

interface CalibrationScreenProps {
  onBack: () => void;
  onFinish: () => void;
  onSkip: () => void;
}

const STEPS = [
  { title: '第 1 步 · 正对屏幕', detail: '把脸放在取景框中间，自然看镜头，保持 2 秒。' },
  { title: '第 2 步 · 慢慢向左转头', detail: '转到你觉得舒服的最大幅度就行，不用勉强。' },
  { title: '第 3 步 · 慢慢向右转头', detail: '系统用这两步算出你的活动范围，活动小也能玩。' },
];

export default function CalibrationScreen({ onBack, onFinish, onSkip }: CalibrationScreenProps) {
  const [index, setIndex] = useState(0);
  const isLast = index === STEPS.length - 1;
  const step = STEPS[index];

  return (
    <div className="flex flex-col gap-6">
      <TopBar title="30 秒校准" onBack={onBack} />

      <div
        role="progressbar"
        aria-label="校准进度"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={index + 1}
        aria-valuetext={`第 ${index + 1} 步，共 ${STEPS.length} 步`}
        className="flex flex-col gap-2"
      >
        <div className="flex gap-2">
          {STEPS.map((s, i) => (
            <span
              key={s.title}
              aria-hidden="true"
              className={`h-3 flex-1 rounded-full ${i <= index ? 'bg-accent' : 'bg-edge'}`}
            />
          ))}
        </div>
        <p className="text-lg font-semibold text-dim">
          第 {index + 1} / {STEPS.length} 步
        </p>
      </div>

      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-card border-2 border-dashed border-edge bg-card">
        <p className="px-6 text-center text-lg text-dim">
          摄像头预览位
          <br />
          <span className="text-base">（骨架阶段尚未接入摄像头）</span>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold">{step.title}</h2>
        <p className="text-lg text-dim">{step.detail}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          variant="secondary"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          上一步
        </Button>
        {isLast ? (
          <Button onClick={onFinish} hint="骨架阶段为占位，接入摄像头后由眨眼确认">
            完成校准
          </Button>
        ) : (
          <Button onClick={() => setIndex((i) => Math.min(STEPS.length - 1, i + 1))}>
            下一步
          </Button>
        )}
      </div>

      <Button variant="secondary" onClick={onSkip} hint="直接进入游戏，不需要摄像头">
        跳过（演示模式）
      </Button>
    </div>
  );
}
