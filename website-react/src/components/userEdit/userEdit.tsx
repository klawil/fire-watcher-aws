import { ApiUserUpdateBody, UserObject, UserObjectBooleans } from "$/userApi";
import { useUser } from "@/logic/auth";
import { UserActions } from "@/types/users";
import { useCallback, useState } from "react";
import Form from "react-bootstrap/Form";
import InputGroup from "react-bootstrap/InputGroup";
import Col from "react-bootstrap/Col";
import Row from 'react-bootstrap/Row';
import { defaultDepartment, departmentConfig, pagingConfig, pagingTalkgroupOrder, validDepartments } from "$/userConstants";
import Button from "react-bootstrap/Button";

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
}: Readonly<{
  setUpdateState: (userDelta: Partial<ApiUserUpdateBody>) => void;
  userKey: keyof UserObject;
  value: string;
  placeholder: string;
}>) {
  return (<InputGroup className="p-2">
    <InputGroup.Text>{placeholder}</InputGroup.Text>
    <Form.Control
      type="text"
      value={value}
      onChange={(e) => setUpdateState({
        [userKey]: e.target.value,
      })}
    ></Form.Control>
  </InputGroup>)
}

export default function UserEdit({
  user,
  dispatch,
}: Readonly<{
  user: UserObject | null;
  dispatch: React.ActionDispatch<[action: UserActions]>;
}>) {
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
    tg: number;
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
      const newTgs = newTalkgroups.filter(tg => !(user.talkgroups || []).includes(tg as any));
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
  }), [
    user,
    setUpdateState,
  ]);

  const [isSaving, setIsSaving] = useState(false);

  const userDepartments = validDepartments.filter(dep => user && user[dep]);
  const userDepartment = typeof updateState.department === 'undefined'
    ? userDepartments[0] || defaultDepartment
    : updateState.department;

  const loggedInUser = useUser();
  const loggedInUserDepartments = validDepartments
    .filter(dep => loggedInUser?.isDistrictAdmin
      || (loggedInUser && loggedInUser[dep]?.active && loggedInUser[dep]?.admin)
    );

  console.log(updateState);
  const hasChanges = user === null ||
    (Object.keys(updateState) as (keyof typeof updateState)[])
      .filter(key => typeof updateState[key] !== 'undefined')
      .length > 0;

  function saveUser() {

  }

  const classList = [ 'row', 'px-4' ];
  if (user === null)
    classList.push('offset-xl-3');

  return (<Row>
    <Col xl={6} className="row px-4">
      <Col lg={{ span: 6, offset: 3 }} md={{ span: 8, offset: 2 }} xl={{ span: 8, offset: 2 }}>
        {user === null && <TextInput
          userKey="phone"
          placeholder="Phone Number"
          value={updateState.phone || ''}
          setUpdateState={setUpdateState}
        />}
        <TextInput
          userKey="fName"
          placeholder="First Name"
          value={updateState.fName || user?.fName || ''}
          setUpdateState={setUpdateState}
        />
        <TextInput
          userKey="lName"
          placeholder="Last Name"
          value={updateState.lName || user?.lName || ''}
          setUpdateState={setUpdateState}
        />
        {user === null && <>
            <Form.Select
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
          key={tg}
          type="switch"
          checked={
            typeof updateState.talkgroups !== 'undefined'
              ? updateState.talkgroups.includes(tg)
              : user && typeof user.talkgroups !== 'undefined'
                ? user.talkgroups.includes(tg)
                : departmentConfig[userDepartment]?.defaultTalkgroups.includes(tg)
          }
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
        className="d-grid p-2"
      ><Button
        variant="success"
        disabled={!hasChanges || isSaving}
        onClick={saveUser}
      >{isSaving ? 'Saving...' : user === null ? 'Create' : 'Save'}</Button></Col>
    </Col>
  </Row>);
}