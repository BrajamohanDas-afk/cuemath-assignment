import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1).default("file:./prisma/dev.db"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  ALLOW_EXTERNAL_LLM: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  APP_API_TOKEN: z.string().min(16).optional(),
  APP_BASE_URL: z.string().url().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    ALLOW_EXTERNAL_LLM: process.env.ALLOW_EXTERNAL_LLM,
    APP_API_TOKEN: process.env.APP_API_TOKEN,
    APP_BASE_URL: process.env.APP_BASE_URL,
  });

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${formatted}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function getSafeRuntimeConfig() {
  const env = getEnv();
  return {
    nodeEnv: env.NODE_ENV,
    appBaseUrl: env.APP_BASE_URL ?? null,
    externalLlmEnabled: env.ALLOW_EXTERNAL_LLM,
    apiTokenRequired: Boolean(env.APP_API_TOKEN),
  };
}
