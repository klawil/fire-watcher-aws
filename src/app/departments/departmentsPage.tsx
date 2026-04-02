'use client';

import React, {
  useCallback, useContext, useEffect, useState
} from 'react';
import Button from 'react-bootstrap/Button';
import Table from 'react-bootstrap/Table';

import DepartmentSettingsModal from '@/components/departmentSettings/DepartmentSettingsModal';
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
  const filteredDepartments = departments?.filter(dept => {
    if (userPerms.isDistrictAdmin) {
      return true; // District admins see all
    }
    // Department admins see only their departments
    return userPerms.adminDepartments.includes(dept.id as UserDepartment);
  }) ?? [];

  const handleEditClick = useCallback((dept: Department) => {
    setSelectedDepartment(dept);
  }, []);

  const handleModalClose = useCallback(() => {
    setSelectedDepartment(null);
  }, []);

  const handleUpdate = useCallback(() => {
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
      setSelectedDepartment(null);
      addAlert('success', 'Department updated successfully');
    })();
  }, [ addAlert, ]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!departments || filteredDepartments.length === 0) {
    return <h1 className='text-center'>No departments found</h1>;
  }

  return <>
    <Table responsive={true} striped bordered>
      <thead>
        <tr>
          <th>Department Name</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {filteredDepartments.map(dept => {
          return <tr key={dept.id}>
            <td>{dept.name || dept.id}</td>
            <td>
              <Button
                variant='primary'
                size='sm'
                onClick={() => handleEditClick(dept)}
              >
                Edit
              </Button>
            </td>
          </tr>;
        })}
      </tbody>
    </Table>

    {selectedDepartment && <DepartmentSettingsModal
      department={selectedDepartment}
      onClose={handleModalClose}
      onUpdate={handleUpdate}
    />}
  </>;
}
