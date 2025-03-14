import { ApiUserUpdateGroupBody, ApiUserUpdateResponse, UserObject } from "$/userApi";
import { UserDepartment } from "$/userConstants";
import { UsersDispatchContext } from "@/logic/usersState";
import { useCallback, useContext, useState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";

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
  user: UserObject;
  dep: UserDepartment;
  loggedInUserDepartments: UserDepartment[];
}>) {
  const dispatch = useContext(UsersDispatchContext);
  const [changes, setChangesRaw] = useState<Partial<UserObject[UserDepartment]>>({});
  const setChanges = useCallback((vals: Partial<UserObject[UserDepartment]>) => {
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
      });

      return newValue;
    })
  }, [setChangesRaw]);

  const hasChanges = (Object.keys(changes || {}) as (keyof typeof changes)[])
    .filter(key => typeof changes?.[key] !== 'undefined' && changes[key] !== '')
    .length > 0;

  const [isSaving, setIsSaving] = useState(false);
  const [errorFields, setErrorFields] = useState<string[]>([]);
  async function saveChanges() {
    if (!hasChanges) return;

    const apiBody: ApiUserUpdateGroupBody = {
      phone: user.phone.toString(),
      department: dep,
      ...changes,
    };

    setIsSaving(true);
    setErrorFields([]);
    try {
      const apiResult: ApiUserUpdateResponse = await fetch(`/api/user?action=updateGroup`, {
        method: 'POST',
        body: JSON.stringify(apiBody),
      }).then(r => r.json());

      if (apiResult.success) {
        dispatch({
          action: 'UpdateUser',
          phone: user.phone,
          user: {
            [dep]: {
              ...(user[dep] || {}),
              ...changes,
            },
          },
        });
        setChangesRaw({});
      } else if (apiResult.errors) {
        setErrorFields(apiResult.errors);
      }
    } catch (e) {
      console.error(`Error saving department ${dep} for ${user} (${changes})`, e);
    }
    setIsSaving(false);
  }

  const [isDeleting, setIsDeleting] = useState(false);
  async function deleteDepartment() {
    if (!user[dep]) return;

    setIsDeleting(true);
    try {
      const apiBody: ApiUserUpdateGroupBody = {
        phone: user.phone.toString(),
        department: dep,
      };

      const apiResult: ApiUserUpdateResponse = await fetch(`/api/user?action=delete`, {
        method: 'POST',
        body: JSON.stringify(apiBody),
      }).then(r => r.json());
      if (apiResult.success) {
        dispatch({
          action: 'UpdateUser',
          phone: user.phone,
          user: {
            [dep]: undefined,
          },
        });
      } else {
        throw apiResult;
      }
    } catch (e) {
      console.error(`Error deleting department ${dep} for ${user}`, e);
    }
    setIsDeleting(false);
  }

  return (<tr className="align-middle">
    <td className="text-center ps-3"><Form.Check
      type="switch"
      isInvalid={errorFields.includes('active')}
      checked={
        typeof changes?.active !== 'undefined'
          ? changes.active
          : !!user[dep]?.active
      }
      label={dep}
      onChange={e => setChanges({
        active: e.target.checked,
      })}
    /></td>
    <td className="ps-3">
      <Form.Control
        type="text"
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
          maxWidth: '85px',
        }}
      />
    </td>
    <td><Form.Check
      type="switch"
      checked={
        typeof changes?.admin !== 'undefined'
          ? changes.admin
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
        variant="success"
        className="m-1"
        disabled={!hasChanges || isSaving}
        onClick={saveChanges}
      >{isSaving ? 'Saving...' : 'Save'}</Button>
      {typeof user[dep] !== 'undefined' && <Button
        variant="danger"
        className="m-1"
        disabled={!loggedInUserDepartments.includes(dep)}
        onClick={deleteDepartment}
      >{isDeleting ? 'Deleting' : 'Delete'}</Button>}
    </td>
  </tr>);
}