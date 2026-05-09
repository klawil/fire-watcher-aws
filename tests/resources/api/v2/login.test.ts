import {
  describe, expect, it, vi
} from 'vitest';

import {
  SecretsManagerClientMock
} from '../../../../__mocks__/@aws-sdk/client-secrets-manager';

import { generateApiEvent } from './_utils';

import { main } from '@/resources/api/v2/login';
import {
  typedGet, typedUpdate
} from '@/utils/backend/dynamoTyped';
import { verify } from 'jsonwebtoken';

vi.mock('jsonwebtoken', () => ({
  sign: vi.fn(() => 'jwt-token'),
  verify: vi.fn(),
}));

describe('resources/api/v2/login', () => {
  describe('GET', () => {
    it('Returns 400 for invalid id', async () => {
      const req = generateApiEvent({
        method: 'GET',
        path: '',
      });

      const res = await main(req);
      expect(res.statusCode).toBe(400);
    });

    it('Returns 400 when user is already authenticated', async () => {
      SecretsManagerClientMock.setResult('getSecretValue', {
        SecretString: 'my-secret',
      });
      vi.mocked(verify).mockReturnValue({
        phone: 5555555555,
      } as never);
      (vi.mocked(typedGet) as any).mockResolvedValue({
        Item: {
          phone: 5555555555,
          fName: 'Auth',
          lName: 'User',
          departments: [ { id: 'Baca', active: true }, ],
        },
      });

      const req = generateApiEvent({
        method: 'GET',
        path: '',
        withUser: true,
        pathParameters: {
          id: '5555551111',
        },
      });

      const res = await main(req);
      expect(res.statusCode).toBe(400);
    });

    it('Returns 200 for unknown user without revealing validity', async () => {
      (vi.mocked(typedGet) as any).mockResolvedValue({});

      const req = generateApiEvent({
        method: 'GET',
        path: '',
        pathParameters: {
          id: '5555551111',
        },
      });

      const res = await main(req);
      expect(res.statusCode).toBe(200);
    });

    it('Queues auth code for valid user', async () => {
      (vi.mocked(typedGet) as any).mockResolvedValue({
        Item: {
          phone: 5555551111,
          fName: 'A',
          lName: 'B',
          departments: [ { id: 'Baca', active: true } ],
        },
      });

      const req = generateApiEvent({
        method: 'GET',
        path: '',
        pathParameters: {
          id: '5555551111',
        },
      });

      const res = await main(req);
      expect(res.statusCode).toBe(200);
    });
  });

  describe('POST', () => {
    it('Returns 400 for bad code', async () => {
      (vi.mocked(typedGet) as any).mockResolvedValue({
        Item: {
          phone: 5555551111,
          fName: 'A',
          lName: 'B',
          departments: [ { id: 'Baca', active: true } ],
          code: '123456',
          codeExpiry: Date.now() - 10,
        },
      });
      const req = generateApiEvent({
        method: 'POST',
        path: '',
        pathParameters: {
          id: '5555551111',
        },
        body: JSON.stringify({
          code: '123456',
        }),
      });

      const res = await main(req);
      expect(res.statusCode).toBe(400);
    });

    it('Returns 400 when code format is invalid', async () => {
      const req = generateApiEvent({
        method: 'POST',
        path: '',
        pathParameters: {
          id: '5555551111',
        },
        body: JSON.stringify({
          code: 'ABCDEF',
        }),
      });

      const res = await main(req);
      expect(res.statusCode).toBe(400);
    });

    it('Returns 400 when user is already authenticated', async () => {
      SecretsManagerClientMock.setResult('getSecretValue', {
        SecretString: 'my-secret',
      });
      vi.mocked(verify).mockReturnValue({
        phone: 5555555555,
      } as never);
      (vi.mocked(typedGet) as any).mockResolvedValue({
        Item: {
          phone: 5555555555,
          fName: 'Auth',
          lName: 'User',
          departments: [ { id: 'Baca', active: true }, ],
        },
      });

      const req = generateApiEvent({
        method: 'POST',
        path: '',
        withUser: true,
        pathParameters: {
          id: '5555551111',
        },
        body: JSON.stringify({
          code: '123456',
        }),
      });

      const res = await main(req);
      expect(res.statusCode).toBe(400);
    });

    it('Returns 400 when login user is missing', async () => {
      (vi.mocked(typedGet) as any).mockResolvedValue({});

      const req = generateApiEvent({
        method: 'POST',
        path: '',
        pathParameters: {
          id: '5555551111',
        },
        body: JSON.stringify({
          code: '123456',
        }),
      });

      const res = await main(req);
      expect(res.statusCode).toBe(400);
      expect(res.body).toContain('code');
    });

    it('Returns 400 when submitted code does not match user code', async () => {
      (vi.mocked(typedGet) as any).mockResolvedValue({
        Item: {
          phone: 5555551111,
          fName: 'A',
          lName: 'B',
          departments: [ { id: 'Baca', active: true } ],
          code: '654321',
          codeExpiry: Date.now() + 60000,
        },
      });

      const req = generateApiEvent({
        method: 'POST',
        path: '',
        pathParameters: {
          id: '5555551111',
        },
        body: JSON.stringify({
          code: '123456',
        }),
      });

      const res = await main(req);
      expect(res.statusCode).toBe(400);
      expect(res.body).toContain('code');
    });

    it('Returns 200 and sets cookies for valid code', async () => {
      SecretsManagerClientMock.setResult('getSecretValue', {
        SecretString: 'my-secret',
      });
      (vi.mocked(typedGet) as any).mockResolvedValue({
        Item: {
          phone: 5555551111,
          fName: 'A',
          lName: 'B',
          departments: [ { id: 'Baca', active: true } ],
          code: '123456',
          codeExpiry: Date.now() + 60000,
        },
      });
      (vi.mocked(typedUpdate) as any).mockResolvedValue({});

      const req = generateApiEvent({
        method: 'POST',
        path: '',
        pathParameters: {
          id: '5555551111',
        },
        body: JSON.stringify({
          code: '123456',
        }),
      });

      const res = await main(req);
      expect(res.statusCode).toBe(200);
      expect(res.multiValueHeaders?.['Set-Cookie']?.length).toBe(2);
      expect(res.multiValueHeaders?.['Set-Cookie']?.[0]).toContain('cofrn-user=5555551111');
      expect(res.multiValueHeaders?.['Set-Cookie']?.[1]).toContain('cofrn-token=jwt-token');
    });
  });
});
