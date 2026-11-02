import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXTAUTH_URL: z.url().optional(),
  NEXTAUTH_SECRET: z.string().min(16).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "must be 32 bytes as 64 hex characters")
    .optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  MICROSOFT_CLIENT_ID: z.string().min(1).optional(),
  MICROSOFT_CLIENT_SECRET: z.string().min(1).optional(),
  MICROSOFT_TENANT_ID: z.string().default("common"),
  INNGEST_EVENT_KEY: z.string().min(1).optional(),
  INNGEST_SIGNING_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z.url().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;
export type ConfigKey = keyof AppConfig;

let cached: AppConfig | undefined;

/** Parses and caches the environment. Throws a readable error on invalid values. */
export function getConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  if (source === process.env && cached) return cached;
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  if (source === process.env) cached = result.data;
  return result.data;
}

/** Returns a required value or throws naming the missing key (never the value). */
export function requireConfig<K extends ConfigKey>(
  key: K,
  source?: NodeJS.ProcessEnv,
): NonNullable<AppConfig[K]> {
  const value = getConfig(source)[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value as NonNullable<AppConfig[K]>;
}

/** Test helper: forget the cached config. */
export function resetConfigCache(): void {
  cached = undefined;
}
