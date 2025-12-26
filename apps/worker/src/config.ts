import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string(),

  // Supabase
  SUPABASE_URL: z.string(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // AI + OCR
  OPENAI_API_KEY: z.string(),
  GOOGLE_CLOUD_PROJECT_ID: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS_JSON: z.string().optional(),

  // FX
  FX_PROVIDER_BASE_URL: z.string().default('https://api.exchangerate.host'),
  FX_BASE_CURRENCY_DEFAULT: z.string().default('EUR'),

  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const config = envSchema.parse(process.env);

export const isProduction = config.NODE_ENV === 'production';
