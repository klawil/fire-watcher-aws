import {
  describe, expect, it, vi
} from 'vitest';

import { SecretsManagerClientMock } from '../../__mocks__/@aws-sdk/client-secrets-manager';

import {
  getAuthCookie,
  main
} from '@/resources/importAladTec';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('resources/importAladTec', () => {
  it('Extracts auth cookie from login response', async () => {
    vi.mocked(SecretsManagerClientMock.send).mockResolvedValue({
      SecretString: JSON.stringify({
        username: 'user',
        password: 'pass',
      }),
    });
    fetchMock.mockResolvedValueOnce({
      headers: {
        getSetCookie: () => [ 'ems9646s=auth-cookie; Path=/', ],
      },
    });

    await expect(getAuthCookie()).resolves.toBe('auth-cookie');
  });

  it('Runs main without throwing for mocked responses', async () => {
    vi.mocked(SecretsManagerClientMock.send).mockResolvedValue({
      SecretString: JSON.stringify({
        username: 'user',
        password: 'pass',
      }),
    });
    fetchMock
      .mockResolvedValueOnce({
        headers: {
          getSetCookie: () => [ 'ems9646s=auth-cookie; Path=/', ],
        },
      })
      .mockResolvedValueOnce({
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        json: async () => ({ rows: [], }),
      });

    await expect(main()).resolves.toBeUndefined();
  });
});
