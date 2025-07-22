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
import {
  dateTimeToTimeStr, dateToStr
} from '@/utils/common/dateAndFile';
import {
  AddAlertContext, LoggedInUserContext
} from '@/utils/frontend/clientContexts';
import { typeFetch } from '@/utils/frontend/typeFetch';

type IdTypes = 'radio' | 'talkgroup';

type EventItem = (FullEventItem & {
  type: 'event';
}) | (FileEventItem & {
  type: 'file';
});

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

function useEvents(): [
  LoadingStates,
  string,
  EventItem[],
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
  ] = useState<EventItem[]>([]);

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
      setLoadingEvents(LoadingStates.NOT_STARTED);
      addAlert('danger', 'Failed to start the events query');
      return;
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

    setLoadingEvents(LoadingStates.DONE);

    // Handle failure
    if (code !== 200 || !results || !('events' in results)) {
      console.log(code, results);
      addAlert('danger', 'Failed to get events');
      setQueryState('FAILED');
      return;
    }

    // Save the results
    setQueryState('DONE');
    setStartTime(results.startTime);
    setEvents(current => [
      ...current,
      ...results.events.map(e => ({
        ...e,
        type: 'radioid' in e ? 'event' : 'file',
      })) as typeof events,
    ]);
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
  const [
    talkgroups,
    setTalkgroups,
  ] = useState<{
    [key: string]: {
      name: string;
      selectName: string;
    }
  }>({});
  const [
    radioNames,
    setRadioNames,
  ] = useState<{ [key: string]: string }>({});

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

  // // State for the events/recordings associated with the entity
  // const [
  //   allEvents,
  //   setAllEvents,
  // ] = useState<((FullEventItem & {
  //   type: 'event';
  // }) | (FileEventItem & {
  //   type: 'file';
  // }))[]>([]);

  // // Used to control spinner state
  // const [
  //   loadingEvents,
  //   setLoadingEvents,
  // ] = useState<LoadingStates>(LoadingStates.NOT_STARTED);
  // const [
  //   eventsState,
  //   setEventsState,
  // ] = useState('QUEUED');

  // Used to allow the types of events to be selected
  const [
    excludeItems,
    setExcludeItems,
  ] = useState<(keyof typeof eventFilters)[]>([]);

  // const isLoading = allEvents.length === 0 &&
  //   loadingEvents !== LoadingStates.DONE;
  const currentName = type === 'radio'
    ? radioNames[id]
    : talkgroups[id]?.name;

  // Change an entity's name
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

  // Parse an ID into a name and link
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

  // Fetch the talkgroup names
  useEffect(() => {
    let useResult = true;
    (async () => {
      const [
        code,
        tgData,
      ] = await typeFetch<GetAllTalkgroupsApi>({
        path: '/api/v2/talkgroups/',
        method: 'GET',
      });

      if (!useResult) {
        return;
      }

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

    return () => {
      useResult = false;
    };
  }, [ addAlert, ]);

  // Fetch the radio ID information
  useEffect(() => {
    if (user === null || !user.isFinal || !user.isUser) {
      return;
    }

    let useResult = true;
    (async () => {
      const [
        code,
        radioData,
      ] = await typeFetch<GetAllRadiosApi>({
        path: '/api/v2/radios/',
        method: 'GET',
      });
      if (!useResult) {
        return;
      }

      if (code !== 200 || !radioData || !('radios' in radioData)) {
        console.log('Radio API Error', code, radioData);
        return;
      }

      setRadioNames(radioData.radios.reduce((agg: { [key: string]: string }, line) => {
        if (line.Name) {
          agg[line.RadioID] = `${line.Name} [${line.RadioID}]`;
        }
        return agg;
      }, {}));
    })();

    return () => {
      useResult = false;
    };
  }, [ user, ]);

  // // Load the events
  // useEffect(() => {
  //   if (
  //     allEvents.length > 0 ||
  //     id === ''
  //   ) {
  //     return;
  //   }

  //   let useResult = true;
  //   (async () => {
  //     let code, results;
  //     setLoadingEvents(LoadingStates.IN_PROGRESS);
  //     if (type === 'talkgroup') {
  //       [
  //         code,
  //         results,
  //       ] = await typeFetch<GetTalkgroupEventsApi>({
  //         path: '/api/v2/events/talkgroup/{id}/',
  //         method: 'GET',
  //         params: {
  //           id: Number(id),
  //         },
  //       });
  //     } else {
  //       [
  //         code,
  //         results,
  //       ] = await typeFetch<GetRadioEventsApi>({
  //         path: '/api/v2/events/radioid/{id}/',
  //         method: 'GET',
  //         params: {
  //           id: Number(id),
  //         },
  //       });
  //     }
  //     const queryId = results && 'queryId' in results
  //       ? results.queryId
  //       : null;
  //     const endTime = results && 'endTime' in results
  //       ? results.endTime
  //       : Date.now();
  //     while (
  //       useResult &&
  //       code === 200 &&
  //       queryId !== null &&
  //       results &&
  //       !('events' in results)
  //     ) {
  //       await new Promise(res => setTimeout(res, 5000));
  //       if (type === 'radio') {
  //         [
  //           code,
  //           results,
  //         ] = await typeFetch<GetRadioEventsApi>({
  //           path: '/api/v2/events/radioid/{id}/',
  //           method: 'GET',
  //           params: {
  //             id: Number(id),
  //           },
  //           query: {
  //             queryId,
  //             endTime,
  //           },
  //         });
  //       } else {
  //         [
  //           code,
  //           results,
  //         ] = await typeFetch<GetTalkgroupEventsApi>({
  //           path: '/api/v2/events/talkgroup/{id}/',
  //           method: 'GET',
  //           params: {
  //             id: Number(id),
  //           },
  //           query: {
  //             queryId,
  //             endTime,
  //           },
  //         });
  //         if (useResult && results && 'status' in results) {
  //           setEventsState(results.status);
  //         }
  //       }
  //     }
  //     if (!useResult) {
  //       return;
  //     }
  //     if (code !== 200 || !results || !('events' in results)) {
  //       console.log(code, results);
  //       addAlert('danger', 'Failed to get events');
  //       setLoadingEvents(LoadingStates.DONE);
  //       return;
  //     }
  //     setAllEvents(current => {
  //       if (current.length > 0) {
  //         return current;
  //       }

  //       const newEvents = results.events.map(e => ({
  //         ...e,
  //         type: 'radioid' in e ? 'event' : 'file',
  //       })) as typeof allEvents;
  //       return newEvents.sort((a, b) => {
  //         const aVal = a.type === 'file'
  //           ? (a.StartTime || 0) * 1000
  //           : a.timestamp;
  //         const bVal = b.type === 'file'
  //           ? (b.StartTime || 0) * 1000
  //           : b.timestamp;

  //         return aVal >= bVal ? -1 : 1;
  //       });
  //     });
  //     setLoadingEvents(LoadingStates.DONE);
  //   })();

  //   return () => {
  //     useResult = false;
  //   };
  // }, [
  //   searchParams,
  //   addAlert,
  //   loadingEvents,
  //   allEvents,
  //   id,
  //   type,
  // ]);

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
      ? radioNames[id] || ''
      : talkgroups[id]?.name || '');
  }, [
    radioNames,
    talkgroups,
    id,
    type,
  ]);

  const eventsThrough = startTime === null
    ? null
    : dateTimeToTimeStr(startTime);

  return <>
    {(Object.keys(talkgroups).length > 0 || Object.keys(radioNames).length > 0) && <Row className='justify-content-center mb-5'>
      <Col md={4}>
        <h3>Talkgroups</h3>
        {Object.keys(talkgroups).length === 0 && <LoadingSpinner />}
        {Object.keys(talkgroups).length && <>
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
                  .filter(tg => {
                    const filter = tgFilter.toLowerCase();
                    const nameMatch = talkgroups[tg].selectName
                      .toLowerCase()
                      .includes(filter);
                    if (filter !== '') {
                      if (
                        filter.match(/^[0-9]+$/) &&
                        !nameMatch &&
                        !tg.toString().includes(filter)
                      ) {
                        return false;
                      }

                      if (
                        !filter.match(/^[0-9]+$/) &&
                        !nameMatch
                      ) {
                        return false;
                      }
                    }
                    return true;
                  })
                  .sort((a, b) =>
                    talkgroups[a].selectName
                      .localeCompare(talkgroups[b].selectName))
                  .map(tg => <tr
                    key={tg}
                    onClick={() => changePage('talkgroup', tg)}
                    className={type === 'talkgroup' && id === tg ? 'table-secondary' : ''}
                    style={{ cursor: 'pointer', }}
                  >
                    <td>{talkgroups[tg].selectName}</td>
                  </tr>)
                }
              </tbody>
            </Table>
          </div>
        </>}
      </Col>
      <Col md={4}>
        <h3>Radios</h3>
        {Object.keys(radioNames).length === 0 && <LoadingSpinner />}
        {Object.keys(radioNames).length && <>
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
                {Object.keys(radioNames)
                  .filter(radio => {
                    const filter = radioFilter.toLowerCase();
                    const nameMatch = radioNames[radio]
                      .toLowerCase()
                      .includes(filter);
                    if (filter !== '') {
                      if (
                        filter.match(/^[0-9]+$/) &&
                      !nameMatch &&
                      !radio.toString().includes(filter)
                      ) {
                        return false;
                      }

                      if (
                        !filter.match(/^[0-9]+$/) &&
                      !nameMatch
                      ) {
                        return false;
                      }
                    }
                    return true;
                  })
                  .sort((a, b) =>
                    radioNames[a]
                      .localeCompare(radioNames[b]))
                  .map(radio => <tr
                    key={radio}
                    onClick={() => changePage('radio', radio)}
                    className={type === 'radio' && id === radio ? 'table-secondary' : ''}
                    style={{ cursor: 'pointer', }}
                  >
                    <td>{radioNames[radio]}</td>
                  </tr>)
                }
              </tbody>
            </Table>
          </div>
        </>}
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
            <th></th>
            <th>Event</th>
            <th>Tower</th>
            <th>Talkgroups/Radios</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 && loadingState !== LoadingStates.IN_PROGRESS && <tr>
            <th colSpan={5} className='text-center'>No Events Found</th>
          </tr>}
          {events.map((v, i) => {
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
          {eventsThrough !== null && <tr>
            <td colSpan={5} className='text-center'>Events through {eventsThrough} checked</td>
          </tr>}
          <tr>
            <th colSpan={5} className='text-center'>
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
