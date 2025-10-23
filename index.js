const express = require('express');
const fetch = require('node-fetch'); // Ou axios, etc.
const https = require('https'); // Para ignorar SSL

const app = express();
app.use(express.json());

// Configuração para ignorar SSL para requisições de saída (para o Proxmox)
const agent = new https.Agent({
  rejectUnauthorized: false // ATENÇÃO: ISSO DESABILITA A VALIDAÇÃO SSL. USE COM CAUTELA.
});

// CORS Headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.post('/proxmox-proxy', async (req, res) => {
  const { proxmox_url, api_key_id, api_key_secret, username, password, path, method, body } = req.body;

  if (!proxmox_url || !path || !method) {
    return res.status(400).json({ error: 'Missing required parameters: proxmox_url, path, method' });
  }

  let proxmoxHeaders = {
    'Content-Type': 'application/json',
  };
  let proxmoxFetchOptions = {
    method: method,
    headers: proxmoxHeaders,
    body: body ? JSON.stringify(body) : undefined,
    agent: agent, // Usar o agente que ignora SSL
  };

  let targetUrl = `${proxmox_url}/api2/json${path}`;

  try {
    if (api_key_id && api_key_secret) {
      proxmoxHeaders['Authorization'] = `PVEAPIToken ${api_key_id}=${api_key_secret}`;
    } else if (username && password) {
      // 1. Obter ticket de autenticação
      const loginResponse = await fetch(`${proxmox_url}/api2/json/access/ticket`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
        agent: agent,
      });

      if (!loginResponse.ok) {
        const errorText = await loginResponse.text();
        return res.status(200).json({
          success: false,
          message: `Falha ao obter ticket de autenticação Proxmox: ${loginResponse.status} - ${errorText.substring(0, 100)}...`,
        });
      }

      const loginData = await loginResponse.json();
      const ticket = loginData.data.ticket;
      const csrfToken = loginData.data.CSRFPreventionToken;

      proxmoxHeaders['CSRFPreventionToken'] = csrfToken;
      proxmoxHeaders['Cookie'] = `PVEAuthCookie=${ticket}`;
    } else {
      return res.status(400).json({ success: false, message: 'No valid authentication method provided.' });
    }

    const proxmoxResponse = await fetch(targetUrl, proxmoxFetchOptions);
    const proxmoxResponseText = await proxmoxResponse.text();

    if (!proxmoxResponse.ok) {
      return res.status(200).json({
        success: false,
        message: `Falha na requisição Proxmox: ${proxmoxResponse.status} - ${proxmoxResponseText.substring(0, 100)}...`,
        details: proxmoxResponseText,
      });
    }

    const proxmoxData = JSON.parse(proxmoxResponseText);

    return res.status(200).json({
      success: true,
      message: 'Requisição Proxmox processada com sucesso!',
      data: proxmoxData,
    });

  } catch (error) {
    console.error('External Proxmox Proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`External Proxmox Proxy listening on port ${PORT}`);
});
