export function vercelHandler(handler) {
  return async function handleVercelRequest(req, res) {
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers || {})) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
      }

      const method = String(req.method || 'GET').toUpperCase();
      let body;
      if (!['GET', 'HEAD'].includes(method)) {
        if (req.body !== undefined) {
          body = Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
        } else {
          const chunks = [];
          for await (const chunk of req) chunks.push(Buffer.from(chunk));
          if (chunks.length) body = Buffer.concat(chunks);
        }
      }

      const protocol = String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
      const host = req.headers?.host || 'localhost';
      const request = new Request(new URL(req.url || '/', `${protocol}://${host}`), {
        method,
        headers,
        ...(body ? { body, duplex: 'half' } : {}),
      });
      const response = await handler(request);
      res.statusCode = response.status;
      const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : null;
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') res.setHeader(key, value);
      });
      if (cookies?.length) res.setHeader('set-cookie', cookies);
      else if (response.headers.has('set-cookie')) res.setHeader('set-cookie', response.headers.get('set-cookie'));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error('Gearhouse Vercel handler failed:', error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        res.end(JSON.stringify({ error: 'The request could not be completed.' }));
      } else {
        res.end();
      }
    }
  };
}
