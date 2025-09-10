declare module '*.css';

// Typage des variables d'environnement utilisées côté serveur
declare namespace NodeJS {
  interface ProcessEnv {
    HOST?: string;
    PORT?: string;
    DEBUG_TILES?: string;

    // OM / endpoints
    OM_BASE_URL?: string;
    OM_STRICT_BASE?: string;
    LATEST_BASE_URL?: string;
    OM_FILE_URL?: string;
    OM_FILE_PATH?: string;

    // Rendu & options
    OPACITY?: string;
    WIND_CACHE_TTL_MS?: string;
    WIND_ARROW_STEP?: string;
    WIND_ARROW_MIN_ZOOM?: string;
    WIND_ARROW_MIN_SPEED?: string;
    WIND_ARROW_SCALE?: string;
    WIND_ARROW_ALPHA_MIN?: string;
    WIND_ARROW_ALPHA_MAX?: string;

    // Piscina
    PISCINA_MAX_THREADS?: string;
    PISCINA_MIN_THREADS?: string;
    PISCINA_CONCURRENCY?: string;
    PISCINA_IDLE_TIMEOUT?: string;
    WARMUP_POOL?: string;

    // Bench & metrics
    ENABLE_BENCH?: string;
    BENCH_CONCURRENCY?: string;
    METRICS?: string;
  }
}
