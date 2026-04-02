'use client';

import React, { useCallback } from 'react';
import Modal from 'react-bootstrap/Modal';

import DepartmentSettingsForm from '@/components/departmentSettings/DepartmentSettingsForm';
import { Department } from '@/types/api/departments';

interface DepartmentSettingsModalProps {
  department: Department;
  onClose: () => void;
  onUpdate: () => void;
}

export default function DepartmentSettingsModal({
  department,
  onClose,
  onUpdate,
}: DepartmentSettingsModalProps) {
  const handleSuccess = useCallback(() => {
    onUpdate();
    onClose();
  }, [
    onUpdate,
    onClose,
  ]);

  return (
    <Modal
      show={true}
      onHide={onClose}
      size='lg'
      centered
    >
      <Modal.Header closeButton>
        <Modal.Title>Edit Department: {department.name || department.id}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <DepartmentSettingsForm
          department={department}
          onSuccess={handleSuccess}
          onCancel={onClose}
        />
      </Modal.Body>
    </Modal>
  );
}
