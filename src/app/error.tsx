'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import Button from 'react-bootstrap/Button';

import CofrnLayout from '@/components/layout';
import { AddErrorApi } from '@/types/api/errors';
import { getLogger } from '@/utils/common/logger';
import { typeFetch } from '@/utils/frontend/typeFetch';

const logger = getLogger('error');

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    typeFetch<AddErrorApi>({
      path: '/api/v2/errors/',
      method: 'POST',
      body: {
        url: window.location.href,
        message: error.message,
        trace: error.stack || 'No Stack',
      },
    })
      .catch(e => logger.error('Error sending error', e));
    logger.error('Error', error);
  }, [ error, ]);

  return (
    <CofrnLayout
      pageConfig={{
        title: 'Send To William',
        requireAuth: false,
        requireAdmin: false,
        hasAudio: false,
        centerAll: true,
        fluid: true,
        containerClass: 'container-md',
      }}
    >
      <div>
        <h2>Screenshot this page and send it to William</h2>
        <h3><b>{ error.message }</b></h3>
        <Button
          variant='warning'
          onClick={() => reset()}
        >Try Again</Button>
      </div>
    </CofrnLayout>
  );
}
