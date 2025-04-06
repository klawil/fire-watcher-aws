import { Dispatch, SetStateAction, useCallback, useContext, useState } from "react";
import Form from "react-bootstrap/Form";
import InputGroup from "react-bootstrap/InputGroup";
import Col from "react-bootstrap/Col";
import Row from 'react-bootstrap/Row';
import Button from "react-bootstrap/Button";
import { AddAlertContext, LoggedInUserContext } from "@/logic/clientContexts";
import Table from "react-bootstrap/Table";
import styles from './userEdit.module.css';
import UserDepartmentRow from "../userDepartmentRow/userDepartmentRow";
import { UsersDispatchContext } from "@/logic/usersState";
import { formatPhone } from "@/logic/strings";
import { CreateUserApi, FrontendUserObject, PagingTalkgroup, pagingTalkgroups, UpdateUserApi, validDepartments } from "@/types/api/users";
import { typeFetch } from "@/logic/typeFetch";
import { departmentConfig, pagingTalkgroupConfig } from "@/types/backend/department";

interface CheckboxConfig {
	name: 'getTranscript' | 'getApiAlerts' | 'getDtrAlerts' | 'getVhfAlerts' | 'isDistrictAdmin';
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

type UpdateState = Partial<
  UpdateUserApi['body'] |
  CreateUserApi['body']
>;

function TextInput({
  setUpdateState,
  userKey,
  value,
  placeholder,
  invalidFields,
}: Readonly<{
  setUpdateState: (userDelta: Partial<UpdateState>) => void;
  userKey: keyof FrontendUserObject;
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
  setEditOpen,
}: Readonly<{
  user: FrontendUserObject | null;
  setEditOpen: Dispatch<SetStateAction<boolean>>;
}>) {
  const loggedInUser = useContext(LoggedInUserContext);
  const dispatch = useContext(UsersDispatchContext);
  const addAlert = useContext(AddAlertContext);

  const [updateState, setUpdateStateRaw] = useState<UpdateState>({});
  const setUpdateState = useCallback((userDelta: Partial<UpdateState>) => {
    (Object.keys(userDelta) as (keyof UpdateState)[]).forEach(key => {
      if (
        typeof userDelta[key] === 'undefined' ||
        userDelta[key] === user?.[key as keyof FrontendUserObject] ||
        (user && userDelta[key] === false && typeof user?.[key as keyof FrontendUserObject] === 'undefined')
      ) {
        setUpdateStateRaw((before) => ({
          ...before,
          [key]: undefined,
        }));
        return;
      }

      // if (key === 'phone') {
      //   userDelta[key] = userDelta[key].replace(/[^0-9]/g, '');
      // }
      setUpdateStateRaw((before) => ({
        ...before,
        [key]: userDelta[key] === false ? null : userDelta[key],
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
          ? state.talkgroups || []
          : (user?.talkgroups || [])
      ).filter(tg => tg !== conf.tg),
      ...(conf.add ? [ conf.tg ] : []),
    ];

    // Figure out if we have any changes
    let hasChanges = true;
    if (user !== null) {
      const newTgs = newTalkgroups.filter(tg => !(user.talkgroups || [])
        .includes(tg as PagingTalkgroup));
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
      talkgroups: newTalkgroups.length === 0 ? null : newTalkgroups,
    };
  }), [ user, ]);

  const userDepartments = validDepartments.filter(dep => user && user[dep]);
  const userDepartment = 'department' in updateState
    ? updateState.department
    : userDepartments[0];

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
  async function createUserApi(updates: CreateUserApi['body']): ReturnType<typeof typeFetch<CreateUserApi>> {
    if (user !== null) throw new Error(`Tried to create existing user`);

    const [ code, result ] = await typeFetch<CreateUserApi>({
      path: '/api/v2/users/',
      method: 'POST',
      body: updates,
    });

    return [ code, result ];
  }
  async function saveUserApi(updates: UpdateUserApi['body']): ReturnType<typeof typeFetch<UpdateUserApi>> {
    if (user === null) throw new Error(`Tried to update new user`);

    const [ code, result ] = await typeFetch<UpdateUserApi>({
      path: '/api/v2/users/{id}/',
      method: 'PATCH',
      params: {
        id: user.phone,
      },
      body: updates,
    });

    return [ code, result ];
  }

  async function saveUser() {
    if (!hasChanges) return;
    const phone = user === null ? ('phone' in updateState && updateState.phone) : user.phone;
    if (!phone) {
      setErrorFields([ 'phone' ]);
      return;
    }

    setIsSaving(true);
    setErrorFields([]);
    try {
      let code: keyof CreateUserApi['responses'] | keyof UpdateUserApi['responses'];
      let apiResult;
      if (user === null) {
        [ code, apiResult ] = await createUserApi(updateState as CreateUserApi['body']);
      } else {
        [ code, apiResult ] = await saveUserApi(updateState);
      }
      setUpdateStateRaw({});
      if (
        code !== 200 ||
        apiResult === null ||
        'message' in apiResult
      ) {
        console.error(code, apiResult, updateState);
        throw new Error(`Failed to create or save user`);
      }
      dispatch(user === null ? {
        action: 'AddUser',
        user: {
          ...apiResult,
        },
      } : {
        action: 'ReplaceUser',
        phone: user.phone,
        user: {
          ...apiResult,
        },
      });
      if (user === null) {
        setEditOpen(false);
      }
    } catch (e) {
      if (user === null) {
        addAlert('danger', `Error creating user`);
      } else {
        addAlert('danger', `Error saving changes to ${user.fName} ${user.lName}`);
      }
      console.error(`Error saving changes to ${user}: ${updateState}`, e);
    }
    setIsSaving(false);
  }

  const classList = [ 'row', 'px-4' ];
  if (user === null)
    classList.push('offset-xl-3');

  let checkedTalkgroups: PagingTalkgroup[] = [];
  if (typeof updateState.talkgroups !== 'undefined') {
    checkedTalkgroups = updateState.talkgroups || [];
  } else if (user !== null) {
    checkedTalkgroups = user.talkgroups || [];
  } else {
    checkedTalkgroups = (userDepartment && departmentConfig[userDepartment]?.defaultTalkgroups) || [];
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
          value={formatPhone(('phone' in updateState && updateState.phone) || '')}
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
                department: e.target.value as CreateUserApi['body']['department'],
              })}
              value={'department' in updateState ? updateState.department : ''}
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
              value={'callSign' in updateState ? updateState.callSign : ''}
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
                pagingPhone: e.target.value as FrontendUserObject['pagingPhone'],
              })}
              value={('pagingPhone' in updateState && updateState.pagingPhone) || user.pagingPhone || userDepartments[0] || ''}
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
        {pagingTalkgroups.map(tg => <Form.Check
          isInvalid={errorFields.includes('tg')}
          key={tg}
          type="switch"
          checked={checkedTalkgroups.includes(tg)}
          onChange={event => changeStateTg({
            add: event.target.checked,
            tg,
          })}
          label={pagingTalkgroupConfig[tg].partyBeingPaged}
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
                ? !!updateState[checkbox.name]
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
        className="p-2"
      >
        <Row>
          <Col xs={6} className="d-grid"><Button
            variant="success"
            disabled={!hasChanges || isSaving}
            onClick={saveUser}
          >{isSaving ? 'Saving...' : user === null ? 'Create' : 'Save'}</Button></Col>
          <Col xs={6} className="d-grid"><Button
            variant="warning"
            onClick={() => setUpdateStateRaw({})}
            disabled={!hasChanges}
          >Reset</Button></Col>
        </Row>
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