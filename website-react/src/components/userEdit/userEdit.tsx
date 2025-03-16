import { ApiUserUpdateBody, ApiUserUpdateResponse, UserObject, UserObjectBooleans } from "$/userApi";
import { useCallback, useContext, useState } from "react";
import Form from "react-bootstrap/Form";
import InputGroup from "react-bootstrap/InputGroup";
import Col from "react-bootstrap/Col";
import Row from 'react-bootstrap/Row';
import { defaultDepartment, departmentConfig, pagingConfig, PagingTalkgroup, pagingTalkgroupOrder, validDepartments } from "$/userConstants";
import Button from "react-bootstrap/Button";
import { LoggedInUserContext } from "@/logic/authContext";
import Table from "react-bootstrap/Table";
import styles from './userEdit.module.css';
import UserDepartmentRow from "../userDepartmentRow/userDepartmentRow";
import { UsersDispatchContext } from "@/logic/usersState";

interface CheckboxConfig {
	name: UserObjectBooleans & keyof ApiUserUpdateBody;
	label: string;
	districtAdmin?: boolean;
}

const userRoleCheckboxes: CheckboxConfig[] = [
	{
		name: 'isDistrictAdmin',
		label: 'District Admin',
		districtAdmin: true
	},
	{
		name: 'getTranscript',
		label: 'Get Transcripts',
	},
	{
		name: 'getApiAlerts',
		label: 'API Alerts',
		districtAdmin: true
	},
	{
		name: 'getVhfAlerts',
		label: 'VHF Alerts',
		districtAdmin: true
	},
	{
		name: 'getDtrAlerts',
		label: 'DTR Alerts',
		districtAdmin: true
	},
];

function TextInput({
  setUpdateState,
  userKey,
  value,
  placeholder,
  invalidFields,
}: Readonly<{
  setUpdateState: (userDelta: Partial<ApiUserUpdateBody>) => void;
  userKey: keyof UserObject;
  value: string;
  placeholder: string;
  invalidFields: string[];
}>) {
  return (<InputGroup className="p-2">
    <InputGroup.Text>{placeholder}</InputGroup.Text>
    <Form.Control
      type="text"
      value={value}
      isInvalid={invalidFields.includes(userKey)}
      onChange={(e) => setUpdateState({
        [userKey]: e.target.value,
      })}
    ></Form.Control>
  </InputGroup>)
}

export default function UserEdit({
  user,
}: Readonly<{
  user: UserObject | null;
}>) {
  const loggedInUser = useContext(LoggedInUserContext);
  const dispatch = useContext(UsersDispatchContext);

  const [updateState, setUpdateStateRaw] = useState<Partial<ApiUserUpdateBody>>({});
  const setUpdateState = useCallback((userDelta: Partial<ApiUserUpdateBody>) => {
    (Object.keys(userDelta) as (keyof ApiUserUpdateBody)[]).forEach(key => {
      if (
        typeof userDelta[key] === 'undefined' ||
        userDelta[key] === user?.[key as keyof UserObject] ||
        (user && userDelta[key] === false && typeof user?.[key as keyof UserObject] === 'undefined')
      ) {
        setUpdateStateRaw((before) => ({
          ...before,
          [key]: undefined,
        }));
        return;
      }

      setUpdateStateRaw((before) => ({
        ...before,
        [key]: userDelta[key],
      }));
    });
  }, [setUpdateStateRaw, user]);
  const changeStateTg = useCallback((conf: {
    add: boolean;
    tg: PagingTalkgroup;
  }) => setUpdateStateRaw(state => {
    const newTalkgroups = [
      ...(
        typeof state !== 'undefined' && typeof state.talkgroups !== 'undefined'
          ? state.talkgroups
          : (user?.talkgroups || [])
      ).filter(tg => tg !== conf.tg),
      ...(conf.add ? [ conf.tg ] : []),
    ];

    // Figure out if we have any changes
    let hasChanges = true;
    if (user !== null) {
      const newTgs = newTalkgroups.filter(tg => !(user.talkgroups || [])
        .includes(tg as typeof user.talkgroups[number]));
      const removedTgs = (user.talkgroups || []).filter(tg => !newTalkgroups.includes(tg));
      hasChanges = newTgs.length > 0 || removedTgs.length > 0;
    }

    if (!hasChanges) {
      return {
        ...state,
        talkgroups: undefined,
      };
    }

    return {
      ...state,
      talkgroups: newTalkgroups,
    };
  }), [ user, ]);

  const userDepartments = validDepartments.filter(dep => user && user[dep]);
  const userDepartment = typeof updateState.department === 'undefined'
    ? userDepartments[0] || defaultDepartment
    : updateState.department;

  const loggedInUserDepartments = validDepartments
    .filter(dep => loggedInUser?.isDistrictAdmin
      || (loggedInUser && loggedInUser[dep]?.active && loggedInUser[dep]?.admin)
    );

  const hasChanges = user === null ||
    (Object.keys(updateState) as (keyof typeof updateState)[])
      .filter(key => typeof updateState[key] !== 'undefined')
      .length > 0;

  const [isSaving, setIsSaving] = useState(false);
  const [errorFields, setErrorFields] = useState<string[]>([]);
  async function saveUser() {
    if (!hasChanges) return;
    const phone = user === null ? updateState.phone : user.phone.toString();
    if (typeof phone === 'undefined') {
      setErrorFields([ 'phone' ]);
      return;
    }

    setIsSaving(true);
    setErrorFields([]);
    const apiBody: ApiUserUpdateBody = {
      phone,
      ...updateState,
    };
    try {
      const apiResult: ApiUserUpdateResponse = await fetch(`/api/user?action=${user === null ? 'create' : 'update'}`, {
        method: 'POST',
        body: JSON.stringify(apiBody),
      }).then(r => r.json());
      if (apiResult.success) {
        if (typeof apiResult.user !== 'undefined') {
          dispatch(user === null ? {
            action: 'AddUser',
            user: {
              ...apiResult.user,
            },
          } : {
            action: 'ReplaceUser',
            phone: user.phone,
            user: {
              ...apiResult.user,
            },
          });
        }
        setUpdateStateRaw({});
      }
    } catch (e) {
      console.error(`Error saving changes to ${user}: ${updateState}`, e);
    }
    setIsSaving(false);
  }

  const classList = [ 'row', 'px-4' ];
  if (user === null)
    classList.push('offset-xl-3');

  let checkedTalkgroups: PagingTalkgroup[] = [];
  if (typeof updateState.talkgroups !== 'undefined') {
    checkedTalkgroups = updateState.talkgroups;
  } else if (user !== null) {
    checkedTalkgroups = user.talkgroups || [];
  } else {
    checkedTalkgroups = departmentConfig[userDepartment]?.defaultTalkgroups || [];
  }

  return (<Row>
    <Col xl={user === null ? {
      span: 6,
      offset: 3,
    } : 6} className="row px-4">
      <Col lg={{ span: 6, offset: 3 }} md={{ span: 8, offset: 2 }} xl={{ span: 8, offset: 2 }}>
        {user === null && <TextInput
          invalidFields={errorFields}
          userKey="phone"
          placeholder="Phone Number"
          value={updateState.phone || ''}
          setUpdateState={setUpdateState}
        />}
        <TextInput
          invalidFields={errorFields}
          userKey="fName"
          placeholder="First Name"
          value={updateState.fName || user?.fName || ''}
          setUpdateState={setUpdateState}
        />
        <TextInput
          invalidFields={errorFields}
          userKey="lName"
          placeholder="Last Name"
          value={updateState.lName || user?.lName || ''}
          setUpdateState={setUpdateState}
        />
        {user === null && <>
            <Form.Select
              isInvalid={errorFields.includes('department')}
              onChange={e => setUpdateState({
                department: e.target.value as ApiUserUpdateBody['department'],
              })}
              value={updateState.department || ''}
              className="p-2"
            >
              {loggedInUserDepartments.map(dep => (<option
                key={dep}
                value={dep}
              >{dep}</option>))}
            </Form.Select>
          <InputGroup className="p-2">
            <InputGroup.Text>Call Sign</InputGroup.Text>
            <Form.Control
              isInvalid={errorFields.includes('callSign')}
              type="text"
              value={updateState.callSign || ''}
              onChange={(e) => setUpdateState({
                callSign: e.target.value,
              })}
            ></Form.Control>
          </InputGroup>
        </>}
        {user !== null
          && loggedInUser?.isDistrictAdmin
          && userDepartments.length > 1
          && <InputGroup className="p-2">
            <InputGroup.Text>Paging Phone</InputGroup.Text>
            <Form.Select
              isInvalid={errorFields.includes('pagingPhone')}
              onChange={e => setUpdateState({
                pagingPhone: e.target.value as ApiUserUpdateBody['pagingPhone'],
              })}
              value={updateState.pagingPhone || user.pagingPhone || userDepartments[0] || ''}
            >
              {userDepartments.map(dep => (<option
                key={dep}
                value={dep}
              >{dep}</option>))}
              <option key="Default" value="">Default</option>
            </Form.Select>
          </InputGroup>
        }
      </Col>

      <Col lg={3} md={4} sm={5} xl={6}>
        <h6>Pages</h6>
        {pagingTalkgroupOrder.map(tg => <Form.Check
          isInvalid={errorFields.includes('tg')}
          key={tg}
          type="switch"
          checked={checkedTalkgroups.includes(tg)}
          onChange={event => changeStateTg({
            add: event.target.checked,
            tg,
          })}
          label={pagingConfig[tg].partyBeingPaged}
        />)}
      </Col>
      <Col lg={{span: 3, offset: 3}} md={{span: 4, offset: 2}} sm={{span: 5, offset: 1}} xl={{span: 6, offset: 0}}>
        <h6>Roles</h6>
        {userRoleCheckboxes
          .filter(box => !box.districtAdmin || loggedInUser?.isDistrictAdmin)
          .map(checkbox => (<Form.Check
            key={checkbox.name}
            isInvalid={errorFields.includes(checkbox.name)}
            type="switch"
            checked={
              typeof updateState[checkbox.name] !== 'undefined'
                ? updateState[checkbox.name]
                : user
                  ? !!user[checkbox.name]
                  : false
            }
            onChange={e => setUpdateState({
              [checkbox.name]: e.target.checked,
            })}
            label={checkbox.label}
          />))}
      </Col>
      <Col
        lg={{span: 6, offset: 3}}
        md={{span: 8, offset: 2}}
        className="p-2 row"
      >
        <Col sm={6}><Button
          variant="success"
          disabled={!hasChanges || isSaving}
          onClick={saveUser}
        >{isSaving ? 'Saving...' : user === null ? 'Create' : 'Save'}</Button></Col>
        <Col sm={6}><Button
          variant="warning"
          onClick={() => setUpdateStateRaw({})}
          disabled={!hasChanges}
        >Reset</Button></Col>
      </Col>
    </Col>
    {user !== null && <Col
      xl={{span: 6, offset: 0}}
      lg={{span: 10, offset: 1}}
      className="table-responsive"
    >
      <Table className={`mb-0 text-center ${styles.noBg}`}>
        <thead><tr>
          <th>Department</th>
          <th>Call Sign</th>
          <th>Admin</th>
          <th></th>
        </tr></thead>
        <tbody>
          {validDepartments
            .filter(dep => loggedInUserDepartments.includes(dep) || user[dep])
            .map(dep => (<UserDepartmentRow
              key={dep}
              user={user}
              dep={dep}
              loggedInUserDepartments={loggedInUserDepartments}
            />))}
        </tbody>
      </Table>
    </Col>}
  </Row>);
}