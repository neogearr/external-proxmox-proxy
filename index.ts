import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { proxmox_url, api_key_id, api_key_secret, username, password, path, method, body } = await req.json();

    if (!proxmox_url || !path || !method) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: proxmox_url, path, method' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const externalProxyUrl = "https://external-proxmox-proxy-5rzd2w0qi-neogearrs-projects.vercel.app/proxmox-proxy"; // URL do seu proxy externo
    
    // A função Edge agora chama o proxy externo
    const proxyResponse = await fetch(externalProxyUrl, {
      method: 'POST', // O proxy externo espera um POST
      headers: {
        'Content-Type': 'application/json',
        // Removido ...corsHeaders daqui, pois não são necessários para comunicação server-to-server
      },
      body: JSON.stringify({
        proxmox_url,
        api_key_id,
        api_key_secret,
        username,
        password,
        path,
        method,
        body,
      }),
    });

    const proxyResult = await proxyResponse.json();

    // Adicionar log para respostas não-OK do proxy externo
    if (!proxyResponse.ok) {
      console.error('External proxy returned non-OK status:', proxyResponse.status);
      console.error('External proxy response body:', proxyResult);
    }

    // Retornar o resultado do proxy externo diretamente
    return new Response(JSON.stringify(proxyResult), {
      status: proxyResponse.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    // Logar o objeto de erro completo para mais detalhes
    console.error('Proxmox Proxy Edge Function error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
