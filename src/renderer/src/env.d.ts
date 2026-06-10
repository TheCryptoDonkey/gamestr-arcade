import type { Game } from '../../shared/types'

declare global {
  interface Window {
    arcade: {
      listGames(): Promise<Game[]>
      launch(id: string): Promise<void>
      onReturn(cb: () => void): void
    }
  }
}

export {}
