/** Return a hero suitable for an <img>; video heroes keep the monogram fallback. */
export function stillImage(src?: string): string | undefined {
  if (!src || /\.(?:mp4|webm)(?:$|[?#])/i.test(src)) return undefined
  return src
}
