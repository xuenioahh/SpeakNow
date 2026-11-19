// Select once per operation: an explicitly selected cloud provider never falls
// back to files (or to the other provider) when credentials are missing.
export function storageProvider(env = process.env) {
  if (/^(1|true|yes)$/i.test(env.FORCE_LOCAL_DATA || '')) return 'server-local';
  const selected = (env.SPEAKNOW_STORAGE_PROVIDER || '').trim().toLowerCase();
  if (selected && !['mongodb', 'supabase'].includes(selected)) {
    throw Object.assign(new Error('Invalid storage provider configuration.'), { status: 503, code: 'storage_configuration' });
  }
  if (selected) return selected;
  if (env.MONGODB_URI) return 'mongodb';
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return 'supabase';
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME || env.VERCEL_ENV === 'production') {
    throw Object.assign(new Error('Persistent storage must be configured.'), { status: 503, code: 'storage_configuration' });
  }
  return 'server-local';
}
export const hasRemoteStorage = () => storageProvider() !== 'server-local';
