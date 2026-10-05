import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin');
  const allowedOrigins = (Deno.env.get('PORTAL_ALLOWED_ORIGINS') || 'http://127.0.0.1:5500,http://localhost:5500')
    .split(',').map((value) => value.trim()).filter(Boolean);
  const headers = {
    ...corsHeaders,
    ...(origin && allowedOrigins.includes(origin) ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {}),
  };
  const respond = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers });

  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (origin && !allowedOrigins.includes(origin)) return respond({ error: 'This site is not allowed to call the invite function.' }, 403);
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return respond({ error: 'Sign in as the trainer first.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const portalUrl = Deno.env.get('PORTAL_SITE_URL');
  if (!supabaseUrl || !publishableKey || !serviceRoleKey || !portalUrl) {
    return respond({ error: 'The invite function is not configured yet.' }, 500);
  }

  try {
    const authClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authorization.slice('Bearer '.length);
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return respond({ error: 'Your session is invalid. Sign in again.' }, 401);

    const { data: profile, error: profileError } = await authClient
      .from('profiles').select('role').eq('id', authData.user.id).maybeSingle();
    if (profileError || profile?.role !== 'trainer') return respond({ error: 'Only the trainer can invite clients.' }, 403);

    const payload = await request.json();
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const displayName = typeof payload.display_name === 'string' ? payload.display_name.trim() : '';
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return respond({ error: 'Enter a valid email address.' }, 400);
    }
    if (displayName.length > 120) return respond({ error: 'The name is too long.' }, 400);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const inviteRedirect = new URL(portalUrl);
    inviteRedirect.searchParams.set('invite', '1');
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { display_name: displayName },
      redirectTo: inviteRedirect.toString(),
    });

    if (error) {
      const duplicate = /already|registered|exists/i.test(error.message);
      return respond({ error: duplicate ? 'An account for this email already exists.' : 'The invitation could not be sent.' }, duplicate ? 409 : 400);
    }

    return respond({ invited: true, user_id: data.user.id });
  } catch (error) {
    console.error('Client invitation failed:', error);
    return respond({ error: 'The invitation could not be sent. Try again later.' }, 500);
  }
});
