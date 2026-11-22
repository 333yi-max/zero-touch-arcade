import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type {
  FaceLandmarkerOptions,
  FaceLandmarkerResult,
  NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { landmarksToFrame } from './faceFrame';
import type { InputSource, RawFrame } from './types';

export type CameraErrorCode = 'insecure' | 'denied' | 'no-device' | 'busy' | 'model';

const MESSAGES: Record<CameraErrorCode, string> = {
  insecure: '这个页面不是安全连接，浏览器不肯打开摄像头。',
  denied: '你拒绝了摄像头授权。',
  'no-device': '没找到可用的摄像头设备。',
  busy: '摄像头被其他程序占用了，先关掉再试。',
  model: '手势模型加载失败，可能是 wasm 或模型文件没就位。',
};

export class CameraError extends Error {
  readonly code: CameraErrorCode;

  constructor(code: CameraErrorCode) {
    super(MESSAGES[code]);
    this.name = 'CameraError';
    this.code = code;
  }
}

function classify(error: unknown): CameraErrorCode {
  const name = error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'denied';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'SecurityError':
      return 'busy';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
    default:
      return 'no-device';
  }
}

const DETECT_INTERVAL_MS = 33;

/**
 * BASE_URL 在项目里是 './'，MediaPipe 是把文件名直接拼在 wasm 目录后面的，
 * 所以必须保证尾斜杠；再对 document.baseURI 取绝对地址，子路径部署才不会 404。
 */
function asset(relative: string): string {
  const base = import.meta.env.BASE_URL;
  const dir = base.endsWith('/') ? base : `${base}/`;
  return new URL(`${dir}${relative}`, document.baseURI).href;
}

function options(delegate: 'GPU' | 'CPU'): FaceLandmarkerOptions {
  return {
    baseOptions: {
      modelAssetPath: asset('models/face_landmarker.task'),
      delegate,
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
}

function release(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

/**
 * 真实摄像头输入源：getUserMedia + FaceLandmarker，产出 RawFrame。
 * 画面只在浏览器里处理，没有任何网络上传。
 */
export class CameraSource implements InputSource {
  /** 给叠加层画关键点用，不参与引擎计算。 */
  landmarks: NormalizedLandmark[] | null = null;
  delegate: 'GPU' | 'CPU' | null = null;

  private frameCb: ((frame: RawFrame) => void) | null = null;
  private rafId: number | null = null;
  private landmarker: FaceLandmarker | null = null;
  private stream: MediaStream | null = null;
  private running = false;
  /** start/stop 各推进一代；异步启动完成后发现代次变了就自我作废，避免 StrictMode 留下僵尸循环。 */
  private generation = 0;
  private disposed = false;
  private lastDetectAt = 0;
  private lastSampleTime = -1;
  private lastTimestamp = 0;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onError?: (error: CameraError) => void,
  ) {}

  onFrame(cb: (frame: RawFrame) => void): void {
    this.frameCb = cb;
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (!window.isSecureContext || navigator.mediaDevices?.getUserMedia === undefined) {
      throw new CameraError('insecure');
    }

    const generation = ++this.generation;
    const landmarker = this.landmarker ?? (await this.createLandmarker());
    if (generation !== this.generation || this.disposed) {
      if (!this.disposed) landmarker.close();
      return;
    }
    this.landmarker = landmarker;

    let stream: MediaStream;
    try {
      stream = await this.acquire();
    } catch (error) {
      if (generation === this.generation) {
        throw error instanceof CameraError ? error : new CameraError(classify(error));
      }
      return;
    }

    if (generation !== this.generation || this.disposed) {
      release(stream);
      return;
    }
    this.stream = stream;
    this.video.srcObject = stream;
    this.lastSampleTime = -1;

    try {
      await this.attach();
    } catch (error) {
      this.closeCamera();
      throw error instanceof CameraError ? error : new CameraError('busy');
    }
    if (generation !== this.generation || this.disposed) {
      this.abandon(stream);
      return;
    }

    this.running = true;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.schedule();
  }

  stop(): void {
    this.generation++;
    this.running = false;
    this.cancelLoop();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.closeCamera();
    this.landmarks = null;
  }

  /** 离开摄像头页时释放 wasm 上下文。 */
  dispose(): void {
    this.stop();
    this.disposed = true;
    this.landmarker?.close();
    this.landmarker = null;
    this.delegate = null;
  }

  private async createLandmarker(): Promise<FaceLandmarker> {
    const fileset = await FilesetResolver.forVisionTasks(asset('wasm/'));
    try {
      const gpu = await FaceLandmarker.createFromOptions(fileset, options('GPU'));
      this.delegate = 'GPU';
      return gpu;
    } catch {
      const cpu = await FaceLandmarker.createFromOptions(fileset, options('CPU'));
      this.delegate = 'CPU';
      return cpu;
    }
  }

  private async acquire(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
    } catch (error) {
      throw new CameraError(classify(error));
    }
  }

  /** 必须等 loadedmetadata 再 play，否则首帧的 videoWidth 还是 0。 */
  private async attach(): Promise<void> {
    if (this.video.readyState < 2) {
      await new Promise<void>((resolve, reject) => {
        this.video.addEventListener('loadedmetadata', () => resolve(), { once: true });
        this.video.addEventListener(
          'error',
          () => reject(new CameraError('busy')),
          { once: true },
        );
      });
    }
    try {
      await this.video.play();
    } catch (error) {
      throw new CameraError(classify(error));
    }
  }

  private closeCamera(): void {
    if (this.stream) {
      release(this.stream);
      this.stream = null;
    }
    this.video.srcObject = null;
  }

  /** 被更新一代 start 顶掉时，只回收自己这条流，不碰新代的画面。 */
  private abandon(stream: MediaStream): void {
    release(stream);
    if (this.stream === stream) this.stream = null;
  }

  /** 切到后台就真的关掉摄像头轨道和 RAF，指示灯灭；回到前台再续上。 */
  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.cancelLoop();
      this.closeCamera();
      return;
    }
    if (!this.running) return;
    this.acquire()
      .then(async (stream) => {
        if (!this.running || this.disposed) {
          release(stream);
          return;
        }
        this.stream = stream;
        this.video.srcObject = stream;
        this.lastSampleTime = -1;
        await this.attach();
        this.schedule();
      })
      .catch((error: unknown) => {
        this.onError?.(error instanceof CameraError ? error : new CameraError(classify(error)));
      });
  };

  private schedule(): void {
    if (this.rafId === null) this.rafId = requestAnimationFrame(this.tick);
  }

  private cancelLoop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private tick = (): void => {
    this.rafId = null;
    if (!this.running || document.hidden) return;
    this.rafId = requestAnimationFrame(this.tick);

    const landmarker = this.landmarker;
    if (!landmarker) return;

    const now = performance.now();
    if (now - this.lastDetectAt < DETECT_INTERVAL_MS) return;

    const video = this.video;
    if (video.readyState < 2 || video.videoWidth === 0) return;
    // 同一帧重复检测只是白烧算力，时间戳还会撞车
    if (video.currentTime === this.lastSampleTime) return;

    this.lastDetectAt = now;
    this.lastSampleTime = video.currentTime;
    const timestamp = Math.max(now, this.lastTimestamp + 1);
    this.lastTimestamp = timestamp;

    let result: FaceLandmarkerResult;
    try {
      result = landmarker.detectForVideo(video, timestamp);
    } catch {
      return;
    }

    const landmarks = result.faceLandmarks[0];
    this.landmarks = landmarks ?? null;
    this.frameCb?.(landmarksToFrame(landmarks, result.faceBlendshapes[0]?.categories, timestamp));
  };
}
