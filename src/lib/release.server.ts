export function releaseIdentity(env: NodeJS.ProcessEnv = process.env) {
  const sha = env['COANTO_RELEASE_SHA']?.trim()
    || env['VERCEL_GIT_COMMIT_SHA']?.trim()
    || env['GITHUB_SHA']?.trim()
    || 'unknown';
  const environment = env['VERCEL_ENV']?.trim()
    || env['NODE_ENV']?.trim()
    || 'unknown';
  return {
    sha,
    shortSha: sha === 'unknown' ? 'unknown' : sha.slice(0, 12),
    environment,
  };
}
