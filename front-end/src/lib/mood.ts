export function scaleColor(value: number, max: number): string {
  const hue = ((value - 1) / (max - 1)) * 120 // 1 -> red (0deg), max -> green (120deg)
  return `hsl(${hue}, 70%, 50%)`
}

export function moodColor(value: number): string {
  return scaleColor(value, 10)
}

// Purple (poor sleep) → teal (great sleep) — distinct from mood/energy palettes
export function sleepColor(value: number): string {
  const hue = 270 - ((value - 1) / 9) * 90 // 270deg (purple) → 180deg (teal)
  return `hsl(${hue}, 65%, 50%)`
}

// Blue (low energy) → amber (high energy)
export function energyColor(value: number): string {
  const hue = 210 - ((value - 1) / 9) * 170 // 1 -> blue (210deg), 10 -> amber (40deg)
  return `hsl(${hue}, 75%, 48%)`
}
