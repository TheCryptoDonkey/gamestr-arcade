/// <reference types="vite/client" />
import type { ArcadeConfig, DesktopGameId, Game, GamestrCatalogueResult, GamestrImportResult, LocalGameSettings } from '../../shared/types'

declare global {
  interface Window {
    arcade: {
      startPlayerPairing(): Promise<import('../../shared/phone-signing').PhoneInvitation>
      confirmPlayerPairing(): Promise<void>
      endPlayerSession(): Promise<void>
      onPlayerState(cb: (state: import('../../shared/conference-player').PlayerState) => void): void
      phoneInput(snapshot: import("../../shared/phone-input").PhoneSnapshot): void
      onPhoneProfile(cb: (spec: unknown)=>void): void
      readonly gamepadDiagnostics: boolean
      getConfig(): Promise<ArcadeConfig>
      listGames(): Promise<Game[]>
      launch(id: string): Promise<boolean>
      install(id: string): Promise<Game>
      localGames(): Promise<LocalGameSettings>
      downloadPallasite(): Promise<Game[]>
      linkWindowsGame(id: DesktopGameId): Promise<Game[] | null>
      back(): Promise<void>
      markReady(): Promise<boolean>
      gamestrCatalogue(): Promise<GamestrCatalogueResult>
      gamestrImport(slug: string): Promise<GamestrImportResult>
      onReturn(cb: () => void): void
      onWebReady(cb: () => void): void
      onError(cb: (msg: string) => void): void
    }
  }
}

export {}
