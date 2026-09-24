/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_JEV_PROVIDER?: string;
  readonly VITE_TYPESAFE_API_KEY?: string;
  readonly VITE_OPENROUTER_API_KEY?: string;
  readonly VITE_AI_GATEWAY_API_KEY?: string;
  readonly VITE_CLOUDFLARE_API_TOKEN?: string;
  readonly VITE_CLOUDFLARE_ACCOUNT_ID?: string;
}
