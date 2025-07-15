'use client';

import { useSearchParams } from 'next/navigation';
import React, {
  useCallback,
  useContext, useEffect,
  useState
} from 'react';
import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Row from 'react-bootstrap/Row';
import Table from 'react-bootstrap/Table';

import LoadingSpinner from '@/components/loadingSpinner/loadingSpinner';
import {
  FileEventItem,
  FullEventItem, GetRadioEventsApi, GetTalkgroupEventsApi
} from '@/types/api/events';
import {
  GetAllRadiosApi, PatchRadioApi
} from '@/types/api/radios';
import {
  GetAllTalkgroupsApi, PatchTalkgroupApi
} from '@/types/api/talkgroups';
import { dateToStr } from '@/utils/common/dateAndFile';
import {
  AddAlertContext, LoggedInUserContext
} from '@/utils/frontend/clientContexts';
import { typeFetch } from '@/utils/frontend/typeFetch';

type IdTypes = 'radio' | 'talkgroup';

enum LoadingStates {
  NOT_STARTED,
  IN_PROGRESS,
  DONE
}

const eventFilters = {
  location: 'Location',
  on: 'Radio On',
  off: 'Radio Off',
  join: 'Join',
  recording: 'Recording',
} as const;

export default function EventsPage() {
  const addAlert = useContext(AddAlertContext);
  // Fetch the talkgroup information
  const [
    talkgroups,
    setTalkgroups,
  ] = useState<{
    [key: string]: {
      name: string;
      selectName: string;
    }
  }>({});
  useEffect(() => {
    (async () => {
      const [
        code,
        tgData,
      ] = await typeFetch<GetAllTalkgroupsApi>({
        path: '/api/v2/talkgroups/',
        method: 'GET',
      });

      if (
        code !== 200 ||
        tgData === null ||
        'message' in tgData
      ) {
        console.error('Failed to load talkgroup information', code, tgData);
        addAlert('danger', 'Failed to load talkgroup information');
        return;
      }

      setTalkgroups(tgData.talkgroups.reduce((
        agg: typeof talkgroups,
        item
      ) => {
        agg[item.ID.toString()] = {
          name: item.Name || item.ID.toString(),
          selectName: `${item.Name || `Talkgroup ID ${item.ID}`}`,
        };

        return agg;
      }, {}));
    })();
  }, [ addAlert, ]);

  // Fetch the radio ID information
  const [
    radioNames,
    setRadioNames,
  ] = useState<{ [key: string]: string }>({});
  const user = useContext(LoggedInUserContext);
  useEffect(() => {
    if (user === null || !user.isFinal || !user.isUser) {
      return;
    }

    (async () => {
      const [
        code,
        radioData,
      ] = await typeFetch<GetAllRadiosApi>({
        path: '/api/v2/radios/',
        method: 'GET',
      });

      if (code !== 200 || !radioData || !('radios' in radioData)) {
        console.log('Radio API Error', code, radioData);
        return;
      }

      setRadioNames(radioData.radios.reduce((agg: { [key: string]: string }, line) => {
        if (line.Name) {
          agg[line.RadioID] = line.Name;
        }
        return agg;
      }, {}));
    })();
  }, [ user, ]);

  const [
    type,
    setType,
  ] = useState<IdTypes>('talkgroup');
  const [
    id,
    setId,
  ] = useState<string>('');
  const searchParams = useSearchParams();

  const [
    newName,
    setNewName,
  ] = useState('');
  const saveNewName = useCallback(async () => {
    let code, result;
    if (type === 'radio') {
      [
        code,
        result,
      ] = await typeFetch<PatchRadioApi>({
        path: '/api/v2/radios/{id}/',
        method: 'PATCH',
        params: {
          id,
        },
        body: {
          name: newName === '' ? null : newName,
        },
      });
    } else {
      [
        code,
        result,
      ] = await typeFetch<PatchTalkgroupApi>({
        path: '/api/v2/talkgroups/{id}/',
        method: 'PATCH',
        params: {
          id: Number(id),
        },
        body: {
          name: newName === '' ? null : newName,
        },
      });
    }

    if (
      code !== 200 ||
      result === null ||
      'message' in result
    ) {
      addAlert('error', 'Failed to save new name');
      return;
    }

    if (type === 'radio') {
      setRadioNames(current => ({
        ...current,
        [id]: newName,
      }));
    } else {
      setTalkgroups(current => ({
        ...current,
        [id]: {
          ...current[id],
          name: newName,
        },
      }));
    }
  }, [
    newName,
    id,
    type,
    addAlert,
  ]);

  const changePage = useCallback((newType: IdTypes, newId: string) => {
    if (type === newType && id === newId) {
      return;
    }

    const newParams = new URLSearchParams(searchParams.toString());
    newParams.delete('tg');
    newParams.delete('radioId');
    if (newType === 'radio') {
      newParams.set('radioId', newId);
    } else {
      newParams.set('tg', newId);
    }
    window.history.pushState(null, '', `?${newParams.toString()}`);

    setId(newId);
    setType(newType);
    setAllEvents([]);
    setLoadingEvents(LoadingStates.NOT_STARTED);
    // setLoadingFiles(LoadingStates.NOT_STARTED);
  }, [
    searchParams,
    type,
    id,
  ]);

  const parseTalkgroup = useCallback((tgId: number | string) => {
    if (tgId === '') {
      return '';
    }

    const tgIdString = tgId.toString();
    const tgName = typeof talkgroups[tgIdString] === 'undefined'
      ? tgIdString
      : talkgroups[tgIdString].name;
    if (type === 'talkgroup' && tgIdString === id) {
      return <>Talkgroup {tgName}</>;
    }

    return <>Talkgroup <a href={`/events/?tg=${tgId}`} onClick={e => {
      e.preventDefault();
      changePage('talkgroup', tgIdString);
    }}>{tgName}</a></>;
  }, [
    talkgroups,
    id,
    type,
    changePage,
  ]);
  const parseRadioId = useCallback((radioId: number | string) => {
    if (radioId === '') {
      return '';
    }

    const radioIdStr = radioId.toString();
    const radioName = typeof radioNames[radioIdStr] !== 'undefined'
      ? `${radioNames[radioIdStr]} [ID ${radioIdStr}]`
      : radioIdStr;

    if (type === 'radio' && id === radioId.toString()) {
      return <>Radio {radioName}</>;
    }

    return <>Radio <a href={`/events/?radioId=${radioId}`} onClick={e => {
      e.preventDefault();
      changePage('radio', radioId.toString());
    }}>{radioName}</a></>;
  }, [
    id,
    type,
    changePage,
    radioNames,
  ]);

  const [
    allEvents,
    setAllEvents,
  ] = useState<((FullEventItem & {
    type: 'event';
  }) | (FileEventItem & {
    type: 'file';
  }))[]>([]);
  const [
    loadingEvents,
    setLoadingEvents,
  ] = useState<LoadingStates>(LoadingStates.NOT_STARTED);
  useEffect(() => {
    if (
      allEvents.length > 0 ||
      id === '' ||
      loadingEvents !== LoadingStates.NOT_STARTED
    ) {
      return;
    }
    (async () => {
      let code, results;
      setLoadingEvents(LoadingStates.IN_PROGRESS);
      if (type === 'talkgroup') {
        [
          code,
          results,
        ] = await typeFetch<GetTalkgroupEventsApi>({
          path: '/api/v2/events/talkgroup/{id}/',
          method: 'GET',
          params: {
            id: Number(id),
          },
        });
      } else {
        [
          code,
          results,
        ] = await typeFetch<GetRadioEventsApi>({
          path: '/api/v2/events/radioid/{id}/',
          method: 'GET',
          params: {
            id: Number(id),
          },
        });
      }
      if (code !== 200 || !results || !('events' in results)) {
        console.log(code, results);
        addAlert('danger', 'Failed to get events');
        setLoadingEvents(LoadingStates.DONE);
        return;
      }
      setAllEvents(current => {
        if (current.length > 0) {
          return current;
        }

        const newEvents = results.events.map(e => ({
          ...e,
          type: 'radioid' in e ? 'event' : 'file',
        })) as typeof allEvents;
        return newEvents.sort((a, b) => {
          const aVal = a.type === 'file'
            ? (a.StartTime || 0) * 1000
            : a.timestamp;
          const bVal = b.type === 'file'
            ? (b.StartTime || 0) * 1000
            : b.timestamp;

          return aVal >= bVal ? -1 : 1;
        });
      });
      setLoadingEvents(LoadingStates.DONE);
    })();
  }, [
    searchParams,
    addAlert,
    loadingEvents,
    allEvents,
    id,
    type,
  ]);

  useEffect(() => {
    if (searchParams.get('tg') !== null) {
      setType('talkgroup');
      setId(searchParams.get('tg') || '');
    } else if (searchParams.get('radioId') !== null) {
      setType('radio');
      setId(searchParams.get('radioId') || '');
    }
  }, [ searchParams, ]);

  const [
    excludeItems,
    setExcludeItems,
  ] = useState<(keyof typeof eventFilters)[]>([]);

  const isLoading = allEvents.length === 0 &&
    loadingEvents !== LoadingStates.DONE;

  useEffect(() => {
    setNewName(type === 'radio'
      ? radioNames[id] || ''
      : talkgroups[id]?.name || '');
  }, [
    radioNames,
    talkgroups,
    id,
    type,
  ]);

  const currentName = type === 'radio'
    ? radioNames[id]
    : talkgroups[id]?.name;

  return <>
    {Object.keys(talkgroups).length > 0 && <Row className='justify-content-center mb-5'>
      <Col md={6}>
        <Form.Select
          value={type === 'talkgroup' ? id : 'radio'}
          onChange={e => changePage('talkgroup', e.target.value)}
        >
          <option disabled value='radio'>Select Talkgroup</option>
          {Object.keys(talkgroups).sort((a, b) => {
            return talkgroups[a].selectName.localeCompare(talkgroups[b].selectName);
          })
            .map(tg => <option
              key={tg}
              value={tg}
            >{talkgroups[tg].selectName}</option>)}
        </Form.Select>
      </Col>
    </Row>}

    {id !== '' && <h2 className='text-center'>{type === 'radio' ? parseRadioId(id) : parseTalkgroup(id)}</h2>}

    {id !== '' && user?.canEditNames && <Col
      lg={{
        span: 4,
        offset: 4,
      }}
      md={{
        span: 6,
        offset: 3,
      }}
      className='mb-4'
    >
      <InputGroup>
        <Form.Control
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder='Change Name'
        />
        <Button
          variant='success'
          disabled={newName === currentName}
          onClick={saveNewName}
        >Change Name</Button>
      </InputGroup>
    </Col>}

    {isLoading && id !== '' && <LoadingSpinner />}

    {!isLoading && <Row className='justify-content-center mb-2'>
      <Col md={6}>
        <h3 className='text-center'>Events To Show</h3>

        {(Object.keys(eventFilters) as (keyof typeof eventFilters)[]).map((key, idx) => <Form.Check
          type='checkbox'
          key={idx}
          onChange={e => setExcludeItems(old => [
            ...old.filter(v => v !== key),
            ...e.target.checked ? [] : [ key, ],
          ])}
          checked={!excludeItems.includes(key)}
          label={eventFilters[key]}
        />)}
      </Col>
    </Row>}

    {!isLoading && <Table
      responsive={true}
    >
      <thead>
        <tr>
          <th></th>
          <th>Event</th>
          <th>Tower</th>
          <th>Talkgroups/Radios</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {allEvents.map((v, i) => {
          if (
            v.type === 'file' &&
            excludeItems.includes('recording')
          ) {
            return;
          }
          if (
            v.type === 'event' &&
            excludeItems.includes(v.event as keyof typeof eventFilters)
          ) {
            return;
          }

          return <tr
            key={i}
            className='align-middle'
          >
            {v.type === 'event' && <React.Fragment>
              <td>{dateToStr(new Date(v.timestamp))}</td>
              <td>{v.event}</td>
              <td>{v.tower}</td>
              <td>
                {[
                  parseTalkgroup(v.talkgroup),
                  parseRadioId(v.radioid),
                ].filter(v => v !== '').map((v, i) => <React.Fragment
                  key={i}
                >
                  {i > 0 && <br />}
                  {v}
                </React.Fragment>)}
              </td>
              <td></td>
            </React.Fragment>}

            {v.type === 'file' && <React.Fragment>
              <td>{dateToStr(new Date((v.StartTime || 0) * 1000))}</td>
              <td>recording</td>
              <td>{v.Tower}</td>
              <td>
                {[
                  ...type === 'radio' ? [ parseTalkgroup(v.Talkgroup || ''), ] : [],
                  ...v.Sources?.map(s => parseRadioId(s || '')) || [],
                ].map((v, idx) => <React.Fragment
                  key={idx}
                >
                  {idx > 0 && <br />}
                  {v}
                </React.Fragment>)}
              </td>
              <td><audio preload='none' controls>
                <source src={`/${v.Key}`} />
              </audio></td>
            </React.Fragment>}
          </tr>;
        })}
      </tbody>
    </Table>}
  </>;
}
