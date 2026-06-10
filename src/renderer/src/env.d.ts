import type { ArcadeConfig, Game } from '../../shared/types'

declare global {
  interface Window {
    arcade: {
      getConfig(): Promise<ArcadeConfig>
      listGames(): Promise<Game[]>
      launch(id: string): Promise<void>
      back(): Promise<void>
      onReturn(cb: () => void): void
      onError(cb: (msg: string) => void): void
    }
  }
}

export {}
