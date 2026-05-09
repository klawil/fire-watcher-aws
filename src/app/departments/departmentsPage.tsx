'use client';

import React, {
  useCallback, useContext, useEffect, useMemo, useState
} from 'react';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Nav from 'react-bootstrap/Nav';
import Row from 'react-bootstrap/Row';
import Tab from 'react-bootstrap/Tab';

import DepartmentSettingsForm from '@/components/departmentSettings/DepartmentSettingsForm';
import InvoiceList from '@/components/invoiceList/InvoiceList';
import LoadingSpinner from '@/components/loadingSpinner/loadingSpinner';
import {
  Department, ListDepartmentApi
} from '@/types/api/departments';
import {
  FrontendUserObject, UserDepartment
} from '@/types/api/users';
import { getLogger } from '@/utils/common/logger';
import { getUserPermissions } from '@/utils/common/user';
import {
  AddAlertContext, LoggedInUserContext
} from '@/utils/frontend/clientContexts';
import { typeFetch } from '@/utils/frontend/typeFetch';

const logger = getLogger('departmentsPage');

export default function DepartmentsPage() {
  const [
    isLoading,
    setIsLoading,
  ] = useState(false);
  const [
    departments,
    setDepartments,
  ] = useState<Department[] | null>(null);
  const [
    selectedDepartment,
    setSelectedDepartment,
  ] = useState<Department | null>(null);
  const [
    settingsFormVersion,
    setSettingsFormVersion,
  ] = useState(0);
  const loggedInUser = useContext(LoggedInUserContext);
  const addAlert = useContext(AddAlertContext);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const [
        code,
        apiResult,
      ] = await typeFetch<ListDepartmentApi>({
        path: '/api/v2/departments/',
        method: 'GET',
      });

      if (
        code !== 200 ||
        apiResult === null ||
        !Array.isArray(apiResult)
      ) {
        logger.error('Failed to get departments', code, apiResult);
        addAlert('danger', 'Failed to load departments');
        setIsLoading(false);
        return;
      }

      setDepartments(apiResult);
      setIsLoading(false);
    })();
  }, [ addAlert, ]);

  // Filter departments based on user permissions
  const userPerms = getUserPermissions(loggedInUser as FrontendUserObject);
  const filteredDepartments = useMemo(() => {
    return departments?.filter(dept => {
      if (userPerms.isDistrictAdmin) {
        return true; // District admins see all
      }
      // Department admins see only their departments
      return userPerms.adminDepartments.includes(dept.id as UserDepartment);
    }) ?? [];
  }, [
    departments,
    userPerms.adminDepartments,
    userPerms.isDistrictAdmin,
  ]);

  // Auto-select if only one department
  useEffect(() => {
    if (!selectedDepartment && filteredDepartments.length === 1) {
      setSelectedDepartment(filteredDepartments[0]);
    }
  }, [
    filteredDepartments,
    selectedDepartment,
  ]);

  const handleSettingsUpdate = useCallback(() => {
    // Refetch departments after update
    (async () => {
      const [
        code,
        apiResult,
      ] = await typeFetch<ListDepartmentApi>({
        path: '/api/v2/departments/',
        method: 'GET',
      });

      if (
        code !== 200 ||
        apiResult === null ||
        !Array.isArray(apiResult)
      ) {
        logger.error('Failed to refresh departments', code, apiResult);
        return;
      }

      setDepartments(apiResult);
      addAlert('success', 'Department updated successfully');
    })();
  }, [ addAlert, ]);

  const showDepartmentSelector = filteredDepartments.length > 1;

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!departments) {
    return <LoadingSpinner />;
  }

  if (filteredDepartments.length === 0) {
    return <h5 className='text-center text-muted'>No departments found</h5>;
  }

  return <>
    {showDepartmentSelector &&
      <Row className='mb-4'>
        <Col md={4}>
          <Form.Select
            value={selectedDepartment?.id || ''}
            onChange={e => {
              const dept = filteredDepartments.find(d => d.id === e.target.value);
              setSelectedDepartment(dept || null);
            }}
            aria-label='Select department'
          >
            <option value=''>Select a Department</option>
            {filteredDepartments.map(dept =>
              <option key={dept.id} value={dept.id}>
                {dept.name || dept.id}
              </option>)}
          </Form.Select>
        </Col>
      </Row>
    }

    {selectedDepartment &&
      <Tab.Container defaultActiveKey='invoices'>
        <Nav variant='tabs' className='mb-3'>
          <Nav.Item>
            <Nav.Link eventKey='invoices'>Invoices</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey='settings'>Settings</Nav.Link>
          </Nav.Item>
        </Nav>

        <Tab.Content>
          <Tab.Pane eventKey='invoices'>
            <InvoiceList
              department={selectedDepartment.id}
              isDistrictAdmin={userPerms.isDistrictAdmin}
            />
          </Tab.Pane>

          <Tab.Pane eventKey='settings'>
            <DepartmentSettingsForm
              key={`${selectedDepartment.id}-${settingsFormVersion}`}
              department={selectedDepartment}
              onSuccess={handleSettingsUpdate}
              onCancel={() => {
                setSettingsFormVersion(prev => prev + 1);
              }}
            />
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>
    }

    {!selectedDepartment && filteredDepartments.length > 0 && !showDepartmentSelector &&
      <div className='alert alert-info'>
        Selected: {filteredDepartments[0]?.name || filteredDepartments[0]?.id}
      </div>
    }
  </>;
}
