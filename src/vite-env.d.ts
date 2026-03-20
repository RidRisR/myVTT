/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_PORT: string
  readonly VITE_PROXY_MODE: string
  readonly VITE_PREVIEW_BRANCH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
