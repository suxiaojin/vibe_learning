import Redis from "ioredis";
import type { Redis as RedisClient } from "ioredis";

type GlobalWithRedis = typeof globalThis & {
  __vibeRedisClient?: RedisClient;
};

const redisUrl = process.env.REDIS_URL?.trim() || "";

export function isRedisConfigured() {
  return Boolean(redisUrl) && process.env.REDIS_DISABLED !== "true";
}

export function getRedisClient() {
  if (!isRedisConfigured()) {
    return null;
  }

  const globalForRedis = globalThis as GlobalWithRedis;
  if (!globalForRedis.__vibeRedisClient) {
    const client = new Redis(redisUrl, {
      connectTimeout: getNumberEnv("REDIS_CONNECT_TIMEOUT_MS", 1500),
      maxRetriesPerRequest: getNumberEnv("REDIS_MAX_RETRIES_PER_REQUEST", 1),
      retryStrategy(times) {
        return Math.min(times * 200, 2000);
      }
    });

    client.on("error", (error) => {
      console.warn(`Redis connection error: ${error.message}`);
    });

    globalForRedis.__vibeRedisClient = client;
  }

  return globalForRedis.__vibeRedisClient;
}

export async function disconnectRedis() {
  const globalForRedis = globalThis as GlobalWithRedis;
  const client = globalForRedis.__vibeRedisClient;
  if (!client) {
    return;
  }

  delete globalForRedis.__vibeRedisClient;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}

function getNumberEnv(name: string, defaultValue: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : defaultValue;
}
