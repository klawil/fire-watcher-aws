'use client';

import {
  useCallback, useState
} from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';

import {
  Department, UpdateDepartmentApi
} from '@/types/api/departments';
import {
  PagingTalkgroup, pagingTalkgroups
} from '@/types/api/users';
import { pagingTalkgroupConfig } from '@/types/backend/department';
import { getLogger } from '@/utils/common/logger';
import { typeFetch } from '@/utils/frontend/typeFetch';

const logger = getLogger('DepartmentSettingsForm');

interface DepartmentSettingsFormProps {
  department: Department;
  onSuccess: () => void;
  onCancel: () => void;
}

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export default function DepartmentSettingsForm({
  department,
  onSuccess,
  onCancel,
}: DepartmentSettingsFormProps) {
  const [
    name,
    setName,
  ] = useState(department.name || '');
  const [
    selectedTalkgroups,
    setSelectedTalkgroups,
  ] = useState<Set<PagingTalkgroup>>(
    new Set(department.pagingTalkgroups || [])
  );
  const [
    invoiceEmails,
    setInvoiceEmails,
  ] = useState<string[]>(
    department.invoiceEmail || []
  );
  const [
    newEmail,
    setNewEmail,
  ] = useState('');
  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);
  const [
    errors,
    setErrors,
  ] = useState<{ [key: string]: string }>({});

  const handleTalkgroupToggle = useCallback((talkgroup: PagingTalkgroup) => {
    const newSelected = new Set(selectedTalkgroups);
    if (newSelected.has(talkgroup)) {
      newSelected.delete(talkgroup);
    } else {
      newSelected.add(talkgroup);
    }
    setSelectedTalkgroups(newSelected);
  }, [ selectedTalkgroups, ]);

  const handleAddEmail = useCallback(() => {
    const trimmedEmail = newEmail.trim();

    // Validate
    if (!trimmedEmail) {
      setErrors(prev => ({
        ...prev,
        email: 'Email cannot be empty',
      }));
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setErrors(prev => ({
        ...prev,
        email: 'Invalid email format',
      }));
      return;
    }

    if (invoiceEmails.includes(trimmedEmail)) {
      setErrors(prev => ({
        ...prev,
        email: 'Email already added',
      }));
      return;
    }

    setInvoiceEmails([
      ...invoiceEmails,
      trimmedEmail,
    ]);
    setNewEmail('');
    setErrors(prev => ({
      ...prev,
      email: '',
    }));
  }, [
    newEmail,
    invoiceEmails,
  ]);

  const handleRemoveEmail = useCallback((emailToRemove: string) => {
    setInvoiceEmails(invoiceEmails.filter(e => e !== emailToRemove));
  }, [ invoiceEmails, ]);

  const validateForm = useCallback((): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!name.trim()) {
      newErrors.name = 'Department name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [ name, ]);

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const updateBody: UpdateDepartmentApi['body'] = {
        name: name.trim(),
        pagingTalkgroups: Array.from(selectedTalkgroups),
        invoiceEmail: invoiceEmails,
      };

      const [
        code,
        apiResponse,
      ] = await typeFetch<UpdateDepartmentApi>({
        path: '/api/v2/departments/{id}/',
        method: 'PATCH',
        params: {
          id: department.id,
        },
        body: updateBody,
      });

      if (code !== 200 || apiResponse === null || 'message' in apiResponse) {
        throw {
          code,
          apiResponse,
        };
      }

      onSuccess();
    } catch (e) {
      logger.error(`Failed to update department ${department.id}`, e);
      const error = e as Record<string, unknown>;
      setErrors(prev => ({
        ...prev,
        submit: `Failed to update department: ${(error?.apiResponse as Record<string, string> | undefined)?.message || 'Unknown error'}`,
      }));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    name,
    selectedTalkgroups,
    invoiceEmails,
    department.id,
    validateForm,
    onSuccess,
  ]);

  return (
    <Form>
      {errors.submit && <Alert variant='danger'>{errors.submit}</Alert>}

      <Form.Group className='mb-3'>
        <Form.Label>Department Name</Form.Label>
        <Form.Control
          type='text'
          value={name}
          onChange={e => setName(e.target.value)}
          isInvalid={!!errors.name}
          disabled={isSubmitting}
        />
        {errors.name && <Form.Control.Feedback type='invalid'>{errors.name}</Form.Control.Feedback>}
      </Form.Group>

      <Form.Group className='mb-3'>
        <Form.Label>Paging Talkgroups</Form.Label>
        <div
          className='border rounded p-3'
        >
          {pagingTalkgroups.map(talkgroup => {
            return <Form.Check
              key={talkgroup}
              type='checkbox'
              id={`talkgroup-${talkgroup}`}
              label={`${pagingTalkgroupConfig[talkgroup].partyBeingPaged} (${talkgroup})`}
              checked={selectedTalkgroups.has(talkgroup)}
              onChange={() => handleTalkgroupToggle(talkgroup)}
              disabled={isSubmitting}
              className='mb-2'
            />;
          })}
        </div>
      </Form.Group>

      <Form.Group className='mb-3'>
        <Form.Label>Invoice Email Addresses</Form.Label>
        <div className='mb-2'>
          {invoiceEmails.map(email => {
            return <div
              key={email}
              className='d-flex justify-content-between align-items-center p-2 mb-2 border rounded'
            >
              <span>{email}</span>
              <Button
                variant='outline-danger'
                size='sm'
                onClick={() => handleRemoveEmail(email)}
                disabled={isSubmitting}
              >
                Remove
              </Button>
            </div>;
          })}
        </div>

        <div className='d-flex gap-2'>
          <Form.Control
            type='email'
            placeholder='Enter email address'
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyPress={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddEmail();
              }
            }}
            isInvalid={!!errors.email}
            disabled={isSubmitting}
          />
          <Button
            variant='outline-primary'
            onClick={handleAddEmail}
            disabled={isSubmitting || !newEmail.trim()}
          >
            Add
          </Button>
        </div>
        {errors.email && <Form.Text className='text-danger'>{errors.email}</Form.Text>}
      </Form.Group>

      <div className='d-flex gap-2 justify-content-end'>
        <Button
          variant='secondary'
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          variant='primary'
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting && <>
            <Spinner
              as='span'
              animation='border'
              size='sm'
              role='status'
              aria-hidden='true'
              className='me-2'
            />
          </>}
          Save Changes
        </Button>
      </div>
    </Form>
  );
}
