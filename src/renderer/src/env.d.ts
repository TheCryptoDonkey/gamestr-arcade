import type { ArcadeConfig, Game } from '../../shared/types'

declare global {
  interface Window {
    arcade: {
      getConfig(): Promise<ArcadeConfig>
      listGames(): Promise<Game[]>
      launch(id: string): Promise<void>
      onReturn(cb: () => void): void
    }
  }
}

export {}
