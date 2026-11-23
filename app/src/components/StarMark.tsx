/** 四角星线框：启动页与品牌区块共用的符号。 */
export function StarMark({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="text-accent drop-shadow-[0_0_12px_rgba(255,214,10,0.35)]"
    >
      <path
        d="M32 3 C34.2 22 42 29.8 61 32 C42 34.2 34.2 42 32 61 C29.8 42 22 34.2 3 32 C22 29.8 29.8 22 32 3 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
