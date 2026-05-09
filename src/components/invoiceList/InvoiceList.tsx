'use client';

import React, {
  useCallback, useEffect, useState
} from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Spinner from 'react-bootstrap/Spinner';
import Table from 'react-bootstrap/Table';
import { BsDownload } from 'react-icons/bs';

import MarkInvoicePaidModal from './MarkInvoicePaidModal';

import LoadingSpinner from '@/components/loadingSpinner/loadingSpinner';
import {
  Invoice, ListInvoicesApi
} from '@/types/api/invoices';
import { getLogger } from '@/utils/common/logger';
import { typeFetch } from '@/utils/frontend/typeFetch';

const logger = getLogger('InvoiceList');

interface InvoiceListProps {
  department: string;
  isDistrictAdmin: boolean;
}

const parseDateOnlyLocal = (dateStr: string): Date | null => {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return null;
  }

  const [
    year,
    month,
    day,
  ] = parts;

  return new Date(year, month - 1, day);
};

const formatDate = (dateStr?: string): string => {
  if (!dateStr) {
    return '-';
  }

  const date = parseDateOnlyLocal(dateStr);
  if (date === null) {
    return '-';
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const calculateDaysUntilDue = (dueDate?: string): number | null => {
  if (!dueDate) {
    return null;
  }

  const due = parseDateOnlyLocal(dueDate);
  if (due === null) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

const getRowClass = (invoice: Invoice): string => {
  if (invoice.paidDate) {
    return '';
  }

  const daysUntilDue = calculateDaysUntilDue(invoice.dueDate);
  if (daysUntilDue === null) {
    return '';
  }

  if (daysUntilDue < 0) {
    return 'table-danger';
  }

  if (daysUntilDue <= 7) {
    return 'table-warning';
  }

  return '';
};

export default function InvoiceList({
  department,
  isDistrictAdmin,
}: InvoiceListProps) {
  const [
    invoices,
    setInvoices,
  ] = useState<Invoice[]>([]);
  const [
    isLoading,
    setIsLoading,
  ] = useState(true);
  const [
    error,
    setError,
  ] = useState<string | null>(null);
  const [
    lastKey,
    setLastKey,
  ] = useState<string | null>(null);
  const [
    hasMore,
    setHasMore,
  ] = useState(false);
  const [
    markPaidModal,
    setMarkPaidModal,
  ] = useState<{ invoiceId: string; } | null>(null);

  const fetchInvoices = useCallback(async (pageLastKey?: string) => {
    if (!department) {
      setInvoices([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const query: ListInvoicesApi['query'] = {
        departments: department,
      };

      if (pageLastKey) {
        query.lastKey = pageLastKey;
      }

      const [
        code,
        apiResult,
      ] = await typeFetch<ListInvoicesApi>({
        path: '/api/v2/invoices/',
        method: 'GET',
        query,
      });

      if (
        code !== 200 ||
        apiResult === null ||
        'message' in apiResult
      ) {
        logger.error('Failed to fetch invoices', code, apiResult);
        setError('Failed to fetch invoices');
        return;
      }

      if (pageLastKey) {
        setInvoices(prev => [
          ...prev,
          ...apiResult.invoices,
        ]);
      } else {
        setInvoices(apiResult.invoices);
      }

      setLastKey(apiResult.lastItem);
      setHasMore(!!apiResult.lastItem);
    } catch (e) {
      logger.error('Error fetching invoices', e);
      setError('An error occurred while fetching invoices');
    } finally {
      setIsLoading(false);
    }
  }, [ department, ]);

  useEffect(() => {
    fetchInvoices();
  }, [ fetchInvoices, ]);

  const handleDownload = useCallback(async (invoiceId: string) => {
    try {
      const link = document.createElement('a');
      link.href = `/api/v2/invoices/${invoiceId}/`;
      link.download = `invoice-${invoiceId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      logger.error('Error downloading invoice', e);
      setError('Failed to download invoice');
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setLastKey(null);
    setHasMore(false);
    fetchInvoices();
  }, [ fetchInvoices, ]);

  return (
    <>
      {error &&
        <Alert variant='danger' onClose={() => setError(null)} dismissible>
          {error}
        </Alert>
      }

      {isLoading && invoices.length === 0 && <LoadingSpinner />}

      {!isLoading && invoices.length === 0 &&
        <div className='text-center text-muted py-4'>
          No invoices found
        </div>
      }

      {invoices.length > 0 &&
        <>
          <div className='table-responsive'>
            <Table hover striped>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Department</th>
                  <th>Period</th>
                  <th>Generated Date</th>
                  <th>Due Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(invoice => {
                  const rowClass = 'align-middle ' + getRowClass(invoice);
                  const daysUntilDue = calculateDaysUntilDue(invoice.dueDate);
                  const statusText = invoice.paidDate
                    ? `Paid on ${formatDate(invoice.paidDate)}`
                    : daysUntilDue === null
                      ? '-'
                      : daysUntilDue < 0
                        ? `Overdue (${Math.abs(daysUntilDue)} days)`
                        : daysUntilDue === 0
                          ? 'Due Today'
                          : `Due in ${daysUntilDue} days`;

                  return (
                    <tr key={invoice.id} className={rowClass}>
                      <td>{invoice.id}</td>
                      <td>{invoice.department}</td>
                      <td>
                        {formatDate(invoice.startDate)} – {formatDate(invoice.endDate)}
                      </td>
                      <td>{formatDate(invoice.generatedDate)}</td>
                      <td>{formatDate(invoice.dueDate)}</td>
                      <td>${invoice.total?.toFixed(2) || '0.00'}</td>
                      <td>{statusText}</td>
                      <td>
                        <div className='d-flex gap-2'>
                          <Button
                            variant='outline-primary'
                            size='sm'
                            onClick={() => handleDownload(invoice.id)}
                            title='Download PDF'
                            aria-label='Download invoice PDF'
                          >
                            <BsDownload />
                          </Button>
                          {isDistrictAdmin && !invoice.paidDate &&
                            <Button
                              variant='outline-success'
                              size='sm'
                              onClick={() => setMarkPaidModal({ invoiceId: invoice.id, })}
                              title='Mark as Paid'
                            >
                              Mark Paid
                            </Button>
                          }
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>

          {hasMore &&
            <div className='text-center mb-3'>
              <Button
                onClick={() => {
                  if (lastKey) {
                    fetchInvoices(lastKey);
                  }
                }}
                disabled={isLoading}
              >
                {isLoading
                  ? <>
                    <Spinner size='sm' className='me-2' />
                    Loading...
                  </>
                  : 'Load More'
                }
              </Button>
            </div>
          }
        </>
      }

      {markPaidModal &&
        <MarkInvoicePaidModal
          invoiceId={markPaidModal.invoiceId}
          onClose={() => setMarkPaidModal(null)}
          onSuccess={() => {
            setMarkPaidModal(null);
            handleRefresh();
          }}
        />
      }
    </>
  );
}
