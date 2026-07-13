import { describe, expect, it } from 'vitest'
import { stillImage } from '../src/renderer/src/ui/art'

describe('carousel artwork', () => {
  it('uses still-image heroes as tile art when a logo is absent', () => {
    expect(stillImage('media://local/game/hero.webp')).toBe('media://local/game/hero.webp')
    expect(stillImage('https://example.com/hero.jpg?rev=2')).toBe('https://example.com/hero.jpg?rev=2')
  })

  it('does not put video heroes in an img element', () => {
    expect(stillImage('media://local/game/hero.mp4')).toBeUndefined()
    expect(stillImage('https://example.com/hero.WEBM?v=1')).toBeUndefined()
    expect(stillImage()).toBeUndefined()
  })
})
