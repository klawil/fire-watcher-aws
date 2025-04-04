const targetDomain = 'cofrn.org';

function getURLSearchParamsString(querystring) {
  var str = [];

  for (var param in querystring) {
    var query = querystring[param];
    var multiValue = query.multiValue;

    if (multiValue) {
      str.push(multiValue.map((item) => param + '=' + item.value).join('&'));
    } else if (query.value === '') {
      str.push(param);
    } else {
      str.push(param + '=' + query.value);
    }
  }

  return str.join('&');
}

function handler(event) {
  const request = event.request;
  let hasRedirect = false;
  let redirectUriBase = `https://cofrn.org`;

  // // Redirect fire.klawil.net and www.cofrn.org
  // if (
  //   typeof request.headers !== 'undefined' &&
  //   typeof request.headers.host !== 'undefined' &&
  //   typeof request.headers.host.value !== 'undefined' &&
  //   request.headers.host.value !== targetDomain
  // ) {
  //   hasRedirect = true;
  // }

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
  if (uri.endsWith('/')) {
    request.uri += 'index.html';
  } else if (!uri.includes('.')) {
    request.uri += '/index.html';
  }
  return request;
}