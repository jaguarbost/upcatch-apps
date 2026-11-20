export function photoCrop(width: number, height: number, zoom: number, x: number, y: number) {
  const size = Math.min(width, height) / Math.max(1, Math.min(3, zoom))
  return {
    size,
    x: (width - size) * Math.max(0, Math.min(1, x)),
    y: (height - size) * Math.max(0, Math.min(1, y)),
  }
}
