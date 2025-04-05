'use client';

import { formatPhone } from "@/common/stringManipulation";
import { AddAlertContext, LocationContext, LoggedInUserContext, RefreshLoggedInUserContext } from "@/logic/clientContexts";
import { useCallback, useContext, useEffect, useState } from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import InputGroup from "react-bootstrap/InputGroup";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import { GetLoginCodeApi, SubmitLoginCodeApi } from "@/types/api/apiv2/login";
import { typeFetch } from "@/logic/typeFetch";

export default function LoginPage() {
  const user = useContext(LoggedInUserContext);
  const loc = useContext(LocationContext);
  const reCheckUser = useContext(RefreshLoggedInUserContext);
  const addAlert = useContext(AddAlertContext);

  const [loginState, setLoginState] = useState<{
    phone?: string;
    authCode?: string;
    stage: 'phone' | 'code';
  }>({
    stage: 'phone',
  });

  const [errorFields, setErrorFields] = useState<string[]>([]);

  const handleRedirectAction = useCallback(async () => {
    if (loc === null) return;

    // Refresh the user
    await reCheckUser();

    // Check for the query string
    const urlParams = new URLSearchParams(loc.search);
    const destination = urlParams.get('redirectTo') || '/';
    window.location.assign(destination);
  }, [loc, reCheckUser]);

  const [isCodeLoading, setIsCodeLoading] = useState(false);
  const getCode = useCallback(async () => {
    // Check for a valid phone number
    if (
      !loginState.phone ||
      !/^[0-9]{10}$/.test(loginState.phone)
    ) {
      setErrorFields([ 'phone' ]);
      return;
    }

    setErrorFields([]);
    setIsCodeLoading(true);
    try {
      const apiParams: GetLoginCodeApi['params'] = {
        id: Number(loginState.phone),
      };
      const [ code, apiResult ] = await typeFetch<GetLoginCodeApi>({
        path: '/api/v2/login/{id}/',
        method: 'GET',
        params: apiParams,
      });
      if (
        code !== 200 ||
        apiResult === null ||
        (
          'message' in apiResult &&
          apiResult.message !== 'Success'
        )
      ) {
        throw { code, apiResult };
      }

      setLoginState(state => ({
        ...state,
        stage: 'code',
      }));
    } catch (e) {
      console.error(`Failed to get code for ${loginState}`, e);
      addAlert('danger', 'Failed to get a code for this user');
      setErrorFields([ 'phone' ]);
    }
    setIsCodeLoading(false);
  }, [loginState, addAlert]);

  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const submitCode = useCallback(async () => {
    // Validate the phone number and code
    const invalidFields: string[] = [];
    if (!loginState.phone || loginState.phone.length !== 10) {
      invalidFields.push('phone');
    }
    if (!loginState.authCode || loginState.authCode.length !== 6) {
      invalidFields.push('code');
    }
    if (invalidFields.length > 0) {
      setErrorFields(invalidFields);
      return;
    }

    setErrorFields([]);
    setIsLoginLoading(true);
    try {
      const apiParams: SubmitLoginCodeApi['params'] = {
        id: Number(loginState.phone),
      };
      const body: SubmitLoginCodeApi['body'] = {
        code: loginState.authCode || '',
      };
      const [ code, apiResult ] = await typeFetch<SubmitLoginCodeApi>({
        path: '/api/v2/login/{id}/',
        method: 'POST',
        params: apiParams,
        body,
      });
      if (
        code !== 200 ||
        apiResult === null ||
        'message' in apiResult
      ) {
        throw { code, apiResult };
      }

      handleRedirectAction();
    } catch (e) {
      console.error(`Failed to login with ${loginState}`, e);
      addAlert('danger', 'Authentication failed');
      setErrorFields([ 'code' ]);
    }
    setIsLoginLoading(false);
  }, [loginState, handleRedirectAction, addAlert]);

  useEffect(() => {
    if (user && user.isUser) {
      handleRedirectAction();
    }
  }, [user, handleRedirectAction]);

  return (<>
    {user && user.isUser && <h1 className="text-center">You are already logged in</h1>}
    {user && !user.isUser && loc && <>
      <Row className="justify-content-center my-3">
        <Col md={6}><InputGroup>
          <InputGroup.Text>Phone Number</InputGroup.Text>
          <Form.Control
            type="text"
            value={formatPhone(loginState.phone || '')}
            onChange={e => setLoginState(state => ({
              ...state,
              phone: e.target.value.replace(/[^0-9]/g, ''),
            }))}
            onKeyUp={e => {
              if (e.key === 'Enter') {
                getCode();
              }
            }}
            isInvalid={errorFields.includes('phone')}
          />
        </InputGroup></Col>
      </Row>
      {loginState.stage === 'code' && <Row className="justify-content-center my-3">
        <Col md={6}><InputGroup>
          <InputGroup.Text>Authentication Code</InputGroup.Text>
          <Form.Control
            type="text"
            value={loginState.authCode || ''}
            onChange={e => setLoginState(state => ({
              ...state,
              authCode: e.target.value.replace(/[^0-9]/g, ''),
            }))}
            onKeyUp={e => {
              if (e.key === 'Enter') {
                submitCode();
              }
            }}
            isInvalid={errorFields.includes('code')}
          />
        </InputGroup></Col>
      </Row>}
      <Row className="justify-content-center my-3">
        <Col as={Row} md={6}>
          {loginState.stage === 'phone' && <Col className="d-grid">
            <Button
              variant="success"
              onClick={getCode}
              disabled={isCodeLoading}
            >{isLoginLoading && <Spinner size="sm" />} Request Code</Button>
          </Col>}
          {loginState.stage === 'code' && <>
            <Col className="d-grid" xs={6}>
              <Button
                variant="success"
                onClick={submitCode}
                disabled={isLoginLoading}
              >{isLoginLoading && <Spinner size="sm" />} Submit Code</Button>
            </Col>
            <Col className="d-grid" xs={6}>
              <Button
                variant="warning"
                onClick={getCode}
                disabled={isCodeLoading}
              >{isCodeLoading && <Spinner size="sm" />} Get New Code</Button>
            </Col>
          </>}
        </Col>
      </Row>
    </>}
  </>)
}
