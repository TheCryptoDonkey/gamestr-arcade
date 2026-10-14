import { fileURLToPath } from 'node:url'
import { definitionPreview } from '../tools/game-definition-preview.ts'

const games = await definitionPreview(fileURLToPath(new URL('..', import.meta.url)))
console.log(`Validated ${games.length} portable review definitions and ${games.length * 4} phone/tablet layouts.`)
