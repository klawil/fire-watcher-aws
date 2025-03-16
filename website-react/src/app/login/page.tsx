'use client';

import { formatPhone } from "$/stringManipulation";
import CofrnLayout from "@/components/layout";
import { LocationContext, LoggedInUserContext } from "@/logic/clientContexts";
import { useCallback, useContext, useEffect, useState } from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import InputGroup from "react-bootstrap/InputGroup";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import { ApiUserAuthBody, ApiUserAuthResponse, ApiUserLoginBody, ApiUserLoginResult } from "$/userApi";

export default function Page() {
  const user = useContext(LoggedInUserContext);
  const loc = useContext(LocationContext);

  const [loginState, setLoginState] = useState<{
    phone?: string;
    authCode?: string;
    stage: 'phone' | 'code';
  }>({
    stage: 'phone',
  });

  const [errorFields, setErrorFields] = useState<string[]>([]);

  const handleRedirectAction = useCallback(() => {
    if (loc === null) return;

    // Check for the query string
    const urlParams = new URLSearchParams(loc.search);
    const destination = urlParams.get('redirectTo') || '/';
    window.location.assign(destination);
  }, [loc]);

  const [isCodeLoading, setIsCodeLoading] = useState(false);
  const getCode = useCallback(async () => {
    // Check for a valid phone number
    if (!loginState.phone || loginState.phone.length !== 10) {
      setErrorFields([ 'phone' ]);
      return;
    }

    setErrorFields([]);
    setIsCodeLoading(true);
    try {
      const apiBody: ApiUserLoginBody = {
        phone: loginState.phone,
      };
      const apiResult: ApiUserLoginResult = await fetch(`/api/user?action=login`, {
        method: 'POST',
        body: JSON.stringify(apiBody),
      }).then(r => r.json());

      if (!apiResult.success) {
        throw apiResult;
      }

      setLoginState(state => ({
        ...state,
        stage: 'code',
      }));
    } catch (e) {
      console.error(`Failed to get code for ${loginState}`, e);
      setErrorFields([ 'phone' ]);
    }
    setIsCodeLoading(false);
  }, [loginState]);

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
      const apiBody: ApiUserAuthBody = {
        code: loginState.authCode || '',
      };
      const apiResult: ApiUserAuthResponse = await fetch(`/api/user?action=auth`, {
        method: 'POST',
        body: JSON.stringify(apiBody),
      }).then(r => r.json());

      if (!apiResult.success) {
        throw apiResult;
      }

      handleRedirectAction();
    } catch (e) {
      console.error(`Failed to login with ${loginState}`, e);
      setErrorFields([ 'code' ]);
    }
    setIsLoginLoading(false);
  }, [loginState, handleRedirectAction]);

  useEffect(() => {
    if (user && user.isActive) {
      handleRedirectAction();
    }
  }, [user, handleRedirectAction]);

  return (<CofrnLayout
    pageConfig={{
      title: 'Login',
    }}
  >
    {user && user.isActive && <h1 className="text-center">You are already logged in</h1>}
    {user && !user.isActive && loc && <>
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
  </CofrnLayout>)
}
