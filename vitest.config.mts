import nextEnv from "@next/env";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const { loadEnvConfig } = nextEnv;

// Next skips .env.local when NODE_ENV is "test", so load it as a non-test run for the
// integration tests that talk to the development Neon database.
// Next's types mark NODE_ENV read-only, hence the plain record view of process.env.
const env = process.env as Record<string, string | undefined>;
const previousNodeEnv = env.NODE_ENV;
env.NODE_ENV = "development";
const { parsedEnv } = loadEnvConfig(process.cwd());
if (previousNodeEnv === undefined) delete env.NODE_ENV;
else env.NODE_ENV = previousNodeEnv;

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: { ...(parsedEnv as Record<string, string> | undefined) },
  },
});
