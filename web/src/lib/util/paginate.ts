// Split an array into fixed-size chunks for the LaunchPad pager.
// Always yields at least one (possibly empty) page so the pager has a
// stable target to render even with zero cards.
export function chunk<T>(arr: readonly T[], size: number): T[][] {
  if (size <= 0) return [arr.slice()];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  if (out.length === 0) out.push([]);
  return out;
}
