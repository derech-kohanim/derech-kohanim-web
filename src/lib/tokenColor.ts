/**
 * Reads a design token at runtime. The map libraries need a concrete colour string, and this
 * is the only way to give them one without copying a value out of the token file.
 */
export function tokenColor(name: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--color-${name}`)
    .trim();
  return `hsl(${value})`;
}
