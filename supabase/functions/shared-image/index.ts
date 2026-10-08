import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function containsImagePath(value: unknown, path: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsImagePath(item, path))
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.storage_path === path || Object.values(record).some((item) => containsImagePath(item, path))
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  let payload: { token?: unknown; path?: unknown }
  try {
    payload = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid request.' }, 400)
  }
  const token = typeof payload.token === 'string' ? payload.token : ''
  const path = typeof payload.path === 'string' ? payload.path : ''
  if (!/^[a-f0-9]{64}$/i.test(token) || !path || path.includes('..') || path.startsWith('/')) {
    return jsonResponse({ error: 'Image not available.' }, 404)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Supabase storage signing environment variables are missing.')
    return jsonResponse({ error: 'Image service unavailable.' }, 500)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: content, error: contentError } = await admin.rpc('get_shared_content', { share_token: token })
  if (contentError) {
    console.error('Could not validate shared image link:', contentError.message)
    return jsonResponse({ error: 'Image not available.' }, 404)
  }
  if (!content || !containsImagePath(content, path)) return jsonResponse({ error: 'Image not available.' }, 404)

  const { data, error } = await admin.storage.from('question-images').createSignedUrl(path, 300)
  if (error) {
    console.error('Could not sign a shared image URL:', error.message)
    return jsonResponse({ error: 'Image not available.' }, 404)
  }
  return jsonResponse({ signedUrl: data.signedUrl }, 200)
})
