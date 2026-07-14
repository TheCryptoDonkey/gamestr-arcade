/// <reference types="vite/client" />
import type { ArcadeConfig, Game, GamestrCatalogueResult, GamestrImportResult } from '../../shared/types'

declare global {
  interface Window {
    arcade: {
      getConfig(): Promise<ArcadeConfig>
      listGames(): Promise<Game[]>
      launch(id: string): Promise<void>
      back(): Promise<void>
      gamestrCatalogue(): Promise<GamestrCatalogueResult>
      gamestrImport(slug: string): Promise<GamestrImportResult>
      onReturn(cb: () => void): void
      onWebReady(cb: () => void): void
      onError(cb: (msg: string) => void): void
    }
  }
}

export {}
