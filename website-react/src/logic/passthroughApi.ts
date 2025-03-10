const externalHostname = 'https://cofrn.org';

export async function passthroughGet(req: Request) {
  const url = new URL(req.url);
  const prodReq = await fetch(`${externalHostname}${url.pathname}${url.search}`, {
    headers: {
      Cookie: req.headers.get('cookie') || '',
    },
  });
  const respJson = await prodReq.json();
  return new Response(JSON.stringify(respJson), {
    headers: {
      'Set-Cookie': prodReq.headers.get('set-cookie') || '',
    },
  });
}

export async function passthroughPost(req: Request) {
  const url = new URL(req.url);
  const prodReq = await fetch(`${externalHostname}${url.pathname}${url.search}`, {
    headers: {
      Cookie: req.headers.get('cookie') || '',
    },
    method: 'POST',
    body: req.body,
  });
  const respJson = await prodReq.json();
  return new Response(JSON.stringify(respJson), {
    headers: {
      'Set-Cookie': prodReq.headers.get('set-cookie') || '',
    },
  });
}