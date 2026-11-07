'use client';

import { useSearchParams } from 'next/navigation';
import React, {
  useCallback,
  useContext, useEffect,
  useState
} from 'react';
import { Spinner } from 'react-bootstrap';
import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Row from 'react-bootstrap/Row';
import Table from 'react-bootstrap/Table';

import LoadingSpinner from '@/components/loadingSpinner/loadingSpinner';
import {
  EventItem, GetRadioEventsApi, GetTalkgroupEventsApi
} from '@/types/api/events';
import {
  PatchRadioApi
} from '@/types/api/radios';
import {
  PatchTalkgroupApi
} from '@/types/api/talkgroups';
import {
  dateTimeToTimeStr, dateToStr, datetimePartitionToTimestamp
} from '@/utils/common/dateAndFile';
import { getLogger } from '@/utils/common/logger';
import {
  AddAlertContext, LoggedInUserContext
} from '@/utils/frontend/clientContexts';
import {
  buildFilterItemsFunc,
  buildSortItemsFunc,
  getItemName,
  useRadios, useTalkgroups
} from '@/utils/frontend/talkgroups';
import { typeFetch } from '@/utils/frontend/typeFetch';

const logger = getLogger('eventsPage');

type IdTypes = 'radio' | 'talkgroup';

type EventItemDisplay = EventItem & {
  type: 'event';
};

enum LoadingStates {
  NOT_STARTED,
  IN_PROGRESS,
  DONE
}

const eventFilters = {
  GRANT: 'Grant',
  LOCATION: 'Location',
  AFFILIATION: 'Affiliation',
  REGISTRATION: 'Registration',
  ACKNOWLEDGE: 'Acknowledge',
  DEREGISTRATION: 'Deregistration',
  DATA_GRANT: 'Data Grant',
} as const;

function useEvents(): [
  LoadingStates,
  string,
  EventItemDisplay[],
  (type: IdTypes, id: string, reset?: boolean) => void,
  number | null
] {
  const addAlert = useContext(AddAlertContext);

  // States for loading information
  const [
    loadingEvents,
    setLoadingEvents,
  ] = useState<LoadingStates>(LoadingStates.NOT_STARTED);
  const [
    queryState,
    setQueryState,
  ] = useState('QUEUED');

  // Events storage
  const [
    events,
    setEvents,
  ] = useState<EventItemDisplay[]>([]);

  // Storage for the keys needed for the next API call
  const [
    startTime,
    setStartTime,
  ] = useState<number | null>(null);

  const loadEvents = useCallback(async (type: IdTypes, id: string, reset?: boolean) => {
    const localStartTime = reset || startTime === null ? null : startTime;
    if (reset) {
      setEvents([]);
      setStartTime(null);
    }

    setQueryState('QUEUED');
    setLoadingEvents(LoadingStates.IN_PROGRESS);

    try {
      async function getEventsApi(query: GetTalkgroupEventsApi['query'] = {}) {
        if (type === 'talkgroup') {
          return await typeFetch<GetTalkgroupEventsApi>({
            path: '/api/v2/events/talkgroup/{id}/',
            method: 'GET',
            params: {
              id: Number(id),
            },
            query,
          });
        } else {
          return await typeFetch<GetRadioEventsApi>({
            path: '/api/v2/events/radioid/{id}/',
            method: 'GET',
            params: {
              id: Number(id),
            },
            query,
          });
        }
      }

      let code, results;
      [
        code,
        results,
      ] = await getEventsApi({
        endTime: localStartTime === null ? Date.now() : localStartTime,
      });

      // Handle initial failures
      if (
        code !== 200 ||
      !results ||
      !('queryId' in results) ||
      !('endTime' in results)
      ) {
        throw new Error(`Failed to start the events query code ${code}, ${results}`);
      }
      const queryId = results.queryId;
      const endTime = results.endTime;

      // Loop until the query finishes or fails
      while (
        code === 200 &&
      results &&
      !('events' in results)
      ) {
        await new Promise(res => setTimeout(res, 2000));
        [
          code,
          results,
        ] = await getEventsApi({
          queryId,
          endTime,
        });

        if (results && 'status' in results) {
          setQueryState(results.status);
        }
      }

      // Handle failure
      if (code !== 200 || !results || !('events' in results)) {
        throw new Error(`Failed to get events, code ${code}, ${results}`);
      }

      // Save the results
      setLoadingEvents(LoadingStates.DONE);
      setQueryState('DONE');
      setStartTime(results.startTime);
      setEvents(current => [
        ...current,
        ...results.events.map(e => ({
          ...e,
          type: 'event',
        })) as typeof events,
      ]);
    } catch (e) {
      logger.error('Failed to load events', e);
      addAlert('danger', 'Failed to get events');
      setQueryState('FAILED');
      setLoadingEvents(LoadingStates.DONE);
    }
  }, [
    startTime,
    addAlert,
  ]);

  return [
    loadingEvents,
    queryState,
    events,
    loadEvents,
    startTime,
  ];
}

export default function EventsPage() {
  // Contexts
  const addAlert = useContext(AddAlertContext);
  const user = useContext(LoggedInUserContext);

  // Names for IDs
  const {
    talkgroups,
    renameTalkgroup,
  } = useTalkgroups(true);
  const {
    radios,
    renameRadio,
  } = useRadios();

  // Filters for the talkgroup and radio select
  const [
    tgFilter,
    setTgFilter,
  ] = useState('');
  const [
    radioFilter,
    setRadioFilter,
  ] = useState('');

  // Current ID and type
  const [
    type,
    setType,
  ] = useState<IdTypes>('talkgroup');
  const [
    id,
    setId,
  ] = useState<string>('');
  const searchParams = useSearchParams();

  // The events handler function
  const [
    loadingState,
    queryState,
    events,
    loadEvents,
    startTime,
  ] = useEvents();

  // State for the renaming input
  const [
    newName,
    setNewName,
  ] = useState('');

  // Used to allow the types of events to be selected
  const [
    excludeItems,
    setExcludeItems,
  ] = useState<(keyof typeof eventFilters)[]>([]);

  const currentName = type === 'radio'
    ? getItemName(radios, id)
    : getItemName(talkgroups, id);
  const currentRawName = type === 'radio'
    ? radios[id]?.Name
    : talkgroups[id]?.Name;

  // Change an entity's name
  const [
    newNameLoad,
    setNewNameLoad,
  ] = useState(false);
  const saveNewName = useCallback(async () => {
    setNewNameLoad(true);
    try {
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
        throw new Error(`Code: ${code}, ${result}`);
      }

      if (type === 'radio') {
        renameRadio(id, newName);
      } else {
        renameTalkgroup(id, newName);
      }
      addAlert('success', 'Saved new name');
    } catch (e) {
      logger.error('Failed to change name', e);
      addAlert('danger', 'Failed to save new name');
    }
    setNewNameLoad(false);
  }, [
    newName,
    id,
    type,
    addAlert,
    renameRadio,
    renameTalkgroup,
  ]);

  // Change the entity being displayed
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
    loadEvents(newType, newId, true);
  }, [
    searchParams,
    type,
    id,
    loadEvents,
  ]);

  // Parse the query string parameters on the first run
  useEffect(() => {
    if (searchParams.get('tg') !== null) {
      changePage('talkgroup', searchParams.get('tg') || '');
    } else if (searchParams.get('radioId') !== null) {
      changePage('radio', searchParams.get('radioId') || '');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Set the value of the renaming input when state changes
  useEffect(() => {
    setNewName(type === 'radio'
      ? radios[id]?.Name || ''
      : talkgroups[id]?.Name || '');
  }, [
    radios,
    talkgroups,
    id,
    type,
  ]);

  const eventsThrough = startTime === null
    ? null
    : dateTimeToTimeStr(startTime);

  return <>
    <Row className='justify-content-center mb-5'>
      <Col md={4}>
        <h3>Talkgroups</h3>
        {Object.keys(talkgroups).length === 0 && <LoadingSpinner />}
        {Object.keys(talkgroups).length > 0 && <>
          <Form.Control
            type='text'
            placeholder='Search talkgroups'
            value={tgFilter}
            onChange={e => setTgFilter(e.target.value)}
          />
          <div style={{
            height: '200px',
            overflowY: 'scroll',
          }}>
            <Table>
              <tbody>
                {Object.keys(talkgroups)
                  .filter(buildFilterItemsFunc(talkgroups, tgFilter))
                  .sort(buildSortItemsFunc(talkgroups))
                  .map(tg => <tr
                    key={tg}
                    onClick={() => changePage('talkgroup', tg)}
                    className={type === 'talkgroup' && id === tg ? 'table-secondary' : ''}
                    style={{ cursor: 'pointer', }}
                  >
                    <td>{getItemName(talkgroups, tg, true)}</td>
                  </tr>)
                }
              </tbody>
            </Table>
          </div>
        </>}
      </Col>
      <Col md={4}>
        <h3>Radios</h3>
        {Object.keys(radios).length === 0 && <LoadingSpinner />}
        {Object.keys(radios).length > 0 && <>
          <Form.Control
            type='text'
            placeholder='Search radios'
            value={radioFilter}
            onChange={e => setRadioFilter(e.target.value)}
          />
          <div style={{
            height: '200px',
            overflowY: 'scroll',
          }}>
            <Table>
              <tbody>
                {Object.keys(radios)
                  .filter(buildFilterItemsFunc(radios, radioFilter))
                  .sort(buildSortItemsFunc(radios))
                  .map(radio => <tr
                    key={radio}
                    onClick={() => changePage('radio', radio)}
                    className={type === 'radio' && id === radio ? 'table-secondary' : ''}
                    style={{ cursor: 'pointer', }}
                  >
                    <td>{getItemName(radios, radio, true)}</td>
                  </tr>)
                }
              </tbody>
            </Table>
          </div>
        </>}
      </Col>
    </Row>

    {id !== '' && <h2 className='text-center'>{currentName}</h2>}

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
          disabled={newName === currentRawName || newNameLoad}
          onClick={saveNewName}
        >{newNameLoad ? <Spinner /> : 'Change Name'}</Button>
      </InputGroup>
    </Col>}

    {id !== '' && <>
      <Row className='justify-content-center mb-2'>
        <Col md={6}>
          <h3 className='text-center'>Events To Show</h3>

          {(Object.keys(eventFilters) as (keyof typeof eventFilters)[])
            .map((key, idx) => <Form.Check
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
      </Row>

      <Table
        responsive={true}
      >
        <thead>
          <tr>
            <th>Time</th>
            <th>Event</th>
            <th>System</th>
            <th>Source</th>
            <th>Talkgroup</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 && loadingState !== LoadingStates.IN_PROGRESS && <tr>
            <th colSpan={6} className='text-center'>No Events Found</th>
          </tr>}
          {events.map((v, i) => {
            if (
              excludeItems.includes(v.event as keyof typeof eventFilters)
            ) {
              return;
            }

            const details: string[] = [];
            if (v.opcode !== undefined) {
              details.push(`Opcode: ${v.opcode}`);
            }
            if (v.priority !== undefined) {
              details.push(`Priority: ${v.priority}`);
            }
            if (v.freq !== undefined) {
              details.push(`Freq: ${v.freq}`);
            }
            if (v.encrypted) {
              details.push('Encrypted');
            }
            if (v.emergency) {
              details.push('Emergency');
            }

            return <tr
              key={i}
              className='align-middle'
            >
              <td>{dateToStr(new Date(datetimePartitionToTimestamp(v.datetime)))}</td>
              <td>{v.event}</td>
              <td>{v.system}</td>
              <td>{v.source}</td>
              <td>{v.talkgroup || '-'}</td>
              <td>{details.join(', ')}</td>
            </tr>;
          })}
          {eventsThrough !== null && <tr>
            <td colSpan={6} className='text-center'>Events through {eventsThrough} checked</td>
          </tr>}
          <tr>
            <th colSpan={6} className='text-center'>
              {loadingState === LoadingStates.IN_PROGRESS && id !== '' && <>
                <LoadingSpinner />
                <h4 className='text-center'>Query is {queryState}</h4>
              </>}
              {loadingState !== LoadingStates.IN_PROGRESS && <Button
                variant='success'
                onClick={() => loadEvents(type, id)}
              >Load Older Events</Button>}
            </th>
          </tr>
        </tbody>
      </Table>
    </>}
  </>;
}
