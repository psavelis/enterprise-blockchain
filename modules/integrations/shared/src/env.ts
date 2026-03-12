export function getRequiredEnv(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getOptionalEnv(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return env[name];
}

export function getNumberEnv(
  name: string,
  fallback?: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const value = env[name];
  if (!value) {
    if (fallback === undefined) {
      throw new Error(`Missing required numeric environment variable: ${name}`);
    }

    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric environment variable: ${name}`);
  }

  return parsed;
}
