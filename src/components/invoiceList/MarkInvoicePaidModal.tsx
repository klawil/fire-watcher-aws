'use client';

import React, {
  useCallback, useState
} from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import Spinner from 'react-bootstrap/Spinner';

import { UpdateInvoiceApi } from '@/types/api/invoices';
import { getLogger } from '@/utils/common/logger';
import { typeFetch } from '@/utils/frontend/typeFetch';

const logger = getLogger('MarkInvoicePaidModal');

interface MarkInvoicePaidModalProps {
  invoiceId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function MarkInvoicePaidModal({
  invoiceId,
  onClose,
  onSuccess,
}: MarkInvoicePaidModalProps) {
  const [
    paidDate,
    setPaidDate,
  ] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);
  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    // Validate date
    if (!paidDate) {
      setError('Please select a payment date');
      return;
    }

    const paidDateObj = new Date(paidDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    paidDateObj.setHours(0, 0, 0, 0);

    if (paidDateObj > today) {
      setError('Payment date cannot be in the future');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const [
        code,
        apiResult,
      ] = await typeFetch<UpdateInvoiceApi>({
        path: '/api/v2/invoices/{id}/',
        method: 'PATCH',
        params: {
          id: invoiceId,
        },
        body: {
          paidDate,
        },
      });

      if (
        code !== 200 ||
        apiResult === null ||
        'message' in apiResult
      ) {
        logger.error('Failed to mark invoice as paid', code, apiResult);
        setError('Failed to mark invoice as paid');
        return;
      }

      onSuccess();
    } catch (e) {
      logger.error('Error marking invoice as paid', e);
      setError('An error occurred while marking the invoice as paid');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    paidDate,
    invoiceId,
    onSuccess,
  ]);

  return (
    <Modal show onHide={onClose} size='lg'>
      <Modal.Header closeButton>
        <Modal.Title>Mark Invoice as Paid</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {error &&
          <Alert variant='danger' onClose={() => setError(null)} dismissible>
            {error}
          </Alert>
        }

        <Form>
          <Form.Group className='mb-3'>
            <Form.Label>Payment Date</Form.Label>
            <Form.Control
              type='date'
              value={paidDate}
              onChange={e => setPaidDate(e.target.value)}
              disabled={isSubmitting}
              max={new Date().toISOString()
                .split('T')[0]}
            />
            <Form.Text className='text-muted'>
              Enter the date the invoice was paid
            </Form.Text>
          </Form.Group>
        </Form>
      </Modal.Body>

      <Modal.Footer>
        <Button
          variant='secondary'
          onClick={onClose}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          variant='primary'
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting
            ? <>
              <Spinner size='sm' className='me-2' />
              Saving...
            </>
            : 'Mark as Paid'
          }
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
