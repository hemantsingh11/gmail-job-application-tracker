declare namespace NodeJS {
  interface ProcessEnv {
    COSMOS_URI?: string;
    COSMOS_KEY?: string;
    COSMOS_DATABASE?: string;
    COSMOS_CONTAINER?: string;
    COSMOS_GMAIL_DATABASE?: string;
    COSMOS_GMAIL_CONTAINER?: string;
    COSMOS_JOBS_DATABASE?: string;
    COSMOS_JOBS_CONTAINER?: string;
    PORT?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GOOGLE_REDIRECT_URI?: string;
    GMAIL_CRON_SCHEDULE?: string;
    OPENAI_API_KEY?: string;
    EMAIL_CLASS_MODEL?: string;
    SESSION_SECRET?: string;
    SESSION_DURATION_DAYS?: string;
    KEY_VAULT_URI?: string;
    NODE_ENV?: string;
  }
}
