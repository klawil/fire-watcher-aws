const changeDomains = [
  'www.cofrn.org',
  'fire.klawil.net',
];

const targetDomain = 'cofrn.org';

function getURLSearchParamsString(querystring) {
  var str = [];

  for (var param in querystring) {
    var query = querystring[param];
    var multiValue = query.multiValue;

    if (multiValue) {
      str.push(multiValue.map(item => param + '=' + item.value).join('&'));
    } else if (query.value === '') {
      str.push(param);
    } else {
      str.push(param + '=' + query.value);
    }
  }

  return str.join('&');
}

function handler(event) { // eslint-disable-line @typescript-eslint/no-unused-vars
  const request = event.request;
  let hasRedirect = false;
  let redirectUriBase = `https://${targetDomain}`;

  // Ignore the 2 old APIs
  if (
    request.uri.includes('/api/infra') ||
    request.uri.includes('/api/events')
  ) {
    return request;
  }

  // Redirect fire.klawil.net and www.cofrn.org
  if (
    typeof request.headers !== 'undefined' &&
    typeof request.headers.host !== 'undefined' &&
    typeof request.headers.host.value !== 'undefined'
  ) {
    const reqHost = request.headers.host.value;
    request.headers['x-forwarded-host'] = { value: reqHost, };
    if (!changeDomains.includes(reqHost)) {
      redirectUriBase = `https://${reqHost}`;
    } else if (reqHost !== targetDomain) {
      hasRedirect = true;
    }
  }

  // Make sure that index.html is not used
  if (request.uri.includes('index.html')) {
    hasRedirect = true;
    request.uri = request.uri.replace('index.html', '');
  }

  // Make sure an HTML URI is not used
  if (request.uri.endsWith('.html')) {
    hasRedirect = true;
    request.uri = request.uri.replace('.html', '/');
  }

  // Redirect to the correct URL
  if (hasRedirect) {
    let searchString = '';
    if (Object.keys(request.querystring).length > 0) {
      searchString = `?${getURLSearchParamsString(request.querystring)}`;
    }

    return {
      statusCode: 302,
      statusDescription: 'Found',
      headers: {
        location: {
          value: `${redirectUriBase}${request.uri}${searchString}`,
        },
      },
    };
  }

  const uri = request.uri;
  if (!uri.includes('/api/')) {
    if (uri.endsWith('/')) {
      request.uri += 'index.html';
    } else if (!uri.includes('.')) {
      request.uri += '/index.html';
    }
  }
  return request;
}
