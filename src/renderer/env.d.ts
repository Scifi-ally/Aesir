/// <reference types="vite/client" />
import type { DevHubApi } from '../preload/index'

declare global {
  interface Window {
    devhub: DevHubApi
  }
}

export {}
