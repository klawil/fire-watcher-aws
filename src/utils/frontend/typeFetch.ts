import { Api } from 'ts-oas';

type TypeFetchApi<T extends Api> = Pick<T, 'path' | 'method' | 'responses'> & Partial<Pick<T, 'params' | 'query' | 'body'>>;
type TypeFetchApiInput<T extends Api> = Omit<TypeFetchApi<T>, 'responses'>;
type TypeFetchResponse<
  T extends Api
> = [ keyof T['responses'], T['responses'][keyof T['responses']] | null ];

export async function typeFetch<T extends Api>({
  path,
  method,
  params = undefined,
  query = undefined,
  body = undefined,
}: TypeFetchApiInput<T>): Promise<TypeFetchResponse<T>> {
  // Fill in the path params
  let apiPath = path;
  if (typeof params !== 'undefined') {
    Object.keys(params).forEach(key => {
      if (typeof params[String(key)] !== 'undefined') {
        apiPath = apiPath.replaceAll(`{${String(key)}}`, `${String(params[key])}`);
      }
    });
  }

  // Add the search params
  const searchParams = Object.keys(query || {});
  if (searchParams.length > 0 && query) {
    const searchStr = new URLSearchParams();
    searchParams
      .filter(key => typeof query[key] !== 'undefined')
      .forEach(key => {
        let value = query[key];
        if (!Array.isArray(value)) {
          value = [ value, ];
        }

        value.forEach((v: unknown) => searchStr.append(key, String(v)));
      });
    apiPath += `?${searchStr.toString()}`;
  }

  // Set up the request options
  const requestOptions: RequestInit = {
    method,
  };
  if (typeof body !== 'undefined') {
    requestOptions.body = JSON.stringify(body);
  }

  // Execute the request
  console.log('Fetching API', apiPath);
  const fetchResponse = await fetch(apiPath, requestOptions);
  let responseBody: T['responses'][keyof T['responses']] | null = null;
  try {
    responseBody = await fetchResponse.json();
  } catch (e) {
    console.error('Possible error fetching API', e);
  }

  return [
    fetchResponse.status,
    responseBody,
  ];
}
