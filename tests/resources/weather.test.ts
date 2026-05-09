import {
  describe, expect, it, vi
} from 'vitest';

vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

import fetch from 'node-fetch';

import { PutObjectCommand } from '../../__mocks__/@aws-sdk/client-s3';

import { main } from '@/resources/weather';

describe('resources/weather', () => {
  it('Fetches data sources and uploads weather json', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({ features: [] }),
      } as any)
      .mockResolvedValueOnce({
        json: async () => ({ features: [] }),
      } as any)
      .mockResolvedValueOnce({
        json: async () => ({ features: [] }),
      } as any)
      .mockResolvedValueOnce({
        text: async () => '<table><td><center><strong>A 1</strong></center></td></table>',
      } as any)
      .mockResolvedValueOnce({
        json: async () => ({ features: [] }),
      } as any)
      .mockResolvedValueOnce({
        text: async () => '<script>var _pageData = "[1,6,0,12,0,13,0]";</script>',
      } as any);

    await expect(main()).resolves.toBeUndefined();
    expect(PutObjectCommand).toHaveBeenCalledTimes(1);
  });
});
