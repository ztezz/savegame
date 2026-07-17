interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

const API_ORIGIN = 'https://api.luugame.fun';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404 || request.method !== 'GET') return assetResponse;

      const acceptsHtml = request.headers.get('accept')?.includes('text/html');
      return acceptsHtml
        ? env.ASSETS.fetch(new Request(new URL('/index.html', url), request))
        : assetResponse;
    }

    const upstreamUrl = new URL(`${url.pathname}${url.search}`, API_ORIGIN);
    const headers = new Headers(request.headers);
    headers.delete('cf-connecting-ip');
    headers.delete('cf-ipcountry');
    headers.delete('cf-ray');
    headers.delete('x-forwarded-for');

    return fetch(new Request(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    }));
  },
};
