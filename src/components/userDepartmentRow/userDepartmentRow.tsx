import {
  useCallback, useContext, useState
} from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';
import {
  BsArrowCounterclockwise, BsSave, BsTrash
} from 'react-icons/bs';

import {
  CreateUserDepartmentApi, DeleteUserDepartmentApi, FrontendUserObject, UpdateUserDepartmentApi,
  UserDepartment
} from '@/types/api/users';
import { AddAlertContext } from '@/utils/frontend/clientContexts';
import { typeFetch } from '@/utils/frontend/typeFetch';
import { UsersDispatchContext } from '@/utils/frontend/usersState';

const baseCallSign: {
  [key in UserDepartment]: string;
} = {
  Baca: 'BG-XX',
  Crestone: '1XX',
  NSCAD: '9XX',
  PageOnly: '',
  Saguache: '7XX',
};

export default function UserDepartmentRow({
  user,
  dep,
  loggedInUserDepartments,
}: Readonly<{
  user: FrontendUserObject;
  dep: UserDepartment;
  loggedInUserDepartments: UserDepartment[];
}>) {
  const dispatch = useContext(UsersDispatchContext);
  const [
    changes,
    setChangesRaw,
  ] = useState<UpdateUserDepartmentApi['body']>({});
  const setChanges = useCallback((vals: UpdateUserDepartmentApi['body']) => {
    setChangesRaw(oldValue => {
      const newValue = {
        ...oldValue,
        ...vals,
      };

      (Object.keys(newValue) as (keyof typeof newValue)[]).forEach(key => {
        if (
          typeof user[dep]?.[key] === typeof newValue[key] &&
          (
            typeof user[dep]?.[key] === 'undefined' ||
            user[dep][key] === newValue[key]
          )
        ) {
          delete newValue[key];
        }

        if (typeof user[dep]?.[key] === 'undefined' && newValue[key] === false) {
          delete newValue[key];
        }

        if (newValue[key] === false) {
          newValue[key as 'admin' | 'active'] = null;
        }
      });

      if (
        typeof newValue.callSign !== 'undefined' &&
        newValue.callSign !== '' &&
        !user[dep]?.active &&
        !newValue.active
      ) {
        newValue.active = true;
      }

      return newValue;
    });
  }, [
    dep,
    user,
  ]);
  const addAlert = useContext(AddAlertContext);

  const hasChanges = (Object.keys(changes || {}) as (keyof typeof changes)[])
    .filter(key => typeof changes?.[key] !== 'undefined' && changes[key] !== '')
    .length > 0;

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);
  const [
    errorFields,
    setErrorFields,
  ] = useState<string[]>([]);
  async function saveChanges() {
    if (!hasChanges) {
      return;
    }

    const apiParams: UpdateUserDepartmentApi['params'] = {
      id: user.phone,
      department: dep,
    };
    const apiBody: UpdateUserDepartmentApi['body'] = {
      ...changes,
    };

    setIsSaving(true);
    setErrorFields([]);
    try {
      let code;
      let apiResult;
      if (!user[dep]) {
        [
          code,
          apiResult,
        ] = await typeFetch<CreateUserDepartmentApi>({
          path: '/api/v2/users/{id}/{department}/',
          method: 'POST',
          params: apiParams,
          body: apiBody,
        });
      } else {
        [
          code,
          apiResult,
        ] = await typeFetch<UpdateUserDepartmentApi>({
          path: '/api/v2/users/{id}/{department}/',
          method: 'PATCH',
          params: apiParams,
          body: apiBody,
        });
      }
      if (
        code !== 200 ||
        apiResult === null
      ) {
        throw {
          code, apiResult,
        };
      }
      if ('errors' in apiResult) {
        setErrorFields(apiResult.errors);
        throw {
          code, apiResult,
        };
      } else if ('message' in apiResult) {
        throw {
          code, apiResult,
        };
      } else {
        dispatch({
          action: 'UpdateUser',
          phone: user.phone,
          user: {
            [dep]: {
              ...apiResult[dep] || {},
            },
          },
        });
        setChangesRaw({});
      }
    } catch (e) {
      addAlert('danger', `Error saving department ${dep} for ${user.fName} ${user.lName}`);
      console.error(`Error saving department ${dep} for ${user} (${changes})`, e);
    }
    setIsSaving(false);
  }

  const [
    isDeleting,
    setIsDeleting,
  ] = useState(false);
  async function deleteDepartment() {
    if (!user[dep]) {
      return;
    }

    setIsDeleting(true);
    try {
      const apiParams: DeleteUserDepartmentApi['params'] = {
        id: user.phone,
        department: dep,
      };
      const [
        code,
        apiResult,
      ] = await typeFetch<DeleteUserDepartmentApi>({
        path: '/api/v2/users/{id}/{department}/',
        method: 'DELETE',
        params: apiParams,
      });
      if (
        code !== 200 ||
        apiResult === null ||
        'message' in apiResult
      ) {
        throw {
          code, apiResult,
        };
      }

      dispatch({
        action: 'UpdateUser',
        phone: user.phone,
        user: {
          [dep]: undefined,
        },
      });
    } catch (e) {
      addAlert('danger', `Error deleting department ${dep} for ${user.fName} ${user.lName}`);
      console.error(`Error deleting department ${dep} for ${user}`, e);
    }
    setIsDeleting(false);
  }

  return <tr className='align-middle'>
    <td className='text-center ps-3'><Form.Check
      type='switch'
      isInvalid={errorFields.includes('active')}
      checked={
        typeof changes?.active !== 'undefined'
          ? changes.active || false
          : !!user[dep]?.active
      }
      label={dep}
      onChange={e => setChanges({
        active: e.target.checked,
      })}
    /></td>
    <td className='ps-3'>
      <Form.Control
        type='text'
        isInvalid={errorFields.includes('callSign')}
        value={
          typeof changes?.callSign !== 'undefined'
            ? changes.callSign
            : user[dep]?.callSign || ''
        }
        onChange={e => setChanges({
          callSign: e.target.value.toUpperCase(),
        })}
        placeholder={baseCallSign[dep]}
        disabled={!loggedInUserDepartments.includes(dep)}
        style={{
          width: '85px',
        }}
      />
    </td>
    <td><Form.Check
      type='switch'
      checked={
        typeof changes?.admin !== 'undefined'
          ? changes.admin || false
          : !!user[dep]?.admin
      }
      onChange={e => setChanges({
        admin: e.target.checked,
      })}
      isInvalid={errorFields.includes('admin')}
      disabled={!loggedInUserDepartments.includes(dep)}
    /></td>
    <td>
      <Button
        variant='success'
        className='m-1'
        disabled={!hasChanges || isSaving}
        onClick={saveChanges}
      >{isSaving ? <Spinner size='sm' /> : <BsSave />}</Button>
      {typeof user[dep] !== 'undefined' && <Button
        variant='danger'
        className='m-1'
        disabled={!loggedInUserDepartments.includes(dep)}
        onClick={deleteDepartment}
      >{isDeleting ? <Spinner size='sm' /> : <BsTrash />}</Button>}
      {hasChanges && <Button
        variant='warning'
        className='m-1'
        onClick={() => setChangesRaw({})}
      ><BsArrowCounterclockwise /></Button>}
    </td>
  </tr>;
}
