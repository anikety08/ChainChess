/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVICE_URL?: string;
  readonly VITE_DEFAULT_CHAIN_ID?: string;
  readonly VITE_DEFAULT_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

