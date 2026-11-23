/** 统计资源条目里来自站外的数量：0 意味着页面没有和任何外部服务器通信。 */
export function countExternalResources(
  entries: readonly { name: string }[],
  baseOrigin: string,
): number {
  let count = 0;
  for (const entry of entries) {
    let origin: string;
    try {
      origin = new URL(entry.name, baseOrigin).origin;
    } catch {
      continue;
    }
    if (origin !== 'null' && origin !== baseOrigin) count += 1;
  }
  return count;
}
