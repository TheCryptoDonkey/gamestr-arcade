import { encode, toSvg } from '@forgesworn/qr'

/**
 * Build a scalable SVG QR for `data`, trying medium then low error correction
 * (low holds more, so a long URL still fits). Returns null if it can't encode.
 * The 1-module margin sits inside the card's white padding, which supplies most
 * of the quiet zone.
 */
export function qrSvg(data: string): string | null {
  for (const ecc of ['M', 'L'] as const) {
    try {
      return toSvg(encode(data, { ecc, mode: 'byte' }), { margin: 1 })
    } catch {
      /* data too large at this level → try the next */
    }
  }
  return null
}
