export function range(a: number, b?: number): number[] {
  if (b !== undefined) {
    return [...Array(b - a).keys()].map((i) => i + a);
  }
  return [...Array(a).keys()];
}
