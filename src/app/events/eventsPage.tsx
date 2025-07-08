'use client';

import { useSearchParams } from 'next/navigation';
import React, {
  useCallback,
  useContext, useEffect,
  useState
} from 'react';
import { Form } from 'react-bootstrap';
import Table from 'react-bootstrap/Table';

import LoadingSpinner from '@/components/loadingSpinner/loadingSpinner';
import {
  FullEventItem, GetRadioEventsApi, GetTalkgroupEventsApi
} from '@/types/api/events';
import {
  FullFileObject, GetAllFilesApi
} from '@/types/api/files';
import { GetAllTalkgroupsApi } from '@/types/api/talkgroups';
import { dateToStr } from '@/utils/common/dateAndFile';
import { AddAlertContext } from '@/utils/frontend/clientContexts';
import { typeFetch } from '@/utils/frontend/typeFetch';

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

  const [
    type,
    setType,
  ] = useState<'talkgroup' | 'radio'>('talkgroup');
  const [
    id,
    setId,
  ] = useState<string>('');

  const parseTalkgroup = useCallback((tgId: number | string) => {
    if (tgId === '') {
      return '';
    }

    const tgIdString = tgId.toString();
    const tgName = typeof talkgroups[tgIdString] === 'undefined'
      ? `T${tgId}`
      : talkgroups[tgIdString].name;
    if (type === 'talkgroup' && tgIdString === id) {
      return <>Talkgroup {tgName}</>;
    }
    return <>Talkgroup <a href={`/events/?tg=${tgId}`}>{tgName}</a></>;
  }, [
    talkgroups,
    id,
    type,
  ]);
  const parseRadioId = useCallback((radioId: number | string) => {
    if (radioId === '') {
      return '';
    }

    if (type === 'radio' && id === radioId.toString()) {
      return <>Radio {radioId}</>;
    }

    return <>Radio <a href={`/events/?radioId=${radioId}`}>{radioId}</a></>;
  }, [
    id,
    type,
  ]);

  const searchParams = useSearchParams();
  const [
    allEvents,
    setAllEvents,
  ] = useState<((FullEventItem & {
    type: 'event';
  }) | (FullFileObject & {
    type: 'file';
  }))[]>([]);
  useEffect(() => { // Events
    (async () => {
      if (allEvents.some(v => v.type === 'event')) {
        return;
      }

      if (searchParams.get('tg') === null && searchParams.get('radioId') === null) {
        return;
      }

      let code, results;
      if (searchParams.get('tg') !== null) {
        [
          code,
          results,
        ] = await typeFetch<GetTalkgroupEventsApi>({
          path: '/api/v2/events/talkgroup/{id}/',
          method: 'GET',
          params: {
            id: Number(searchParams.get('tg')),
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
            id: Number(searchParams.get('radioId')),
          },
        });
      }
      if (code !== 200 || !results || !('events' in results)) {
        console.log(code, results);
        addAlert('danger', 'Failed to get events');
        return;
      }
      setAllEvents(current => {
        if (current.some(v => v.type === 'event')) {
          return current;
        }

        return [
          ...current,
          ...(results.events.filter(e => e.event !== 'call').map(e => ({
            ...e,
            type: 'event',
          })) as typeof allEvents),
        ].sort((a, b) => {
          const aVal = a.type === 'file'
            ? (a.StartTime || 0) * 1000
            : a.timestamp;
          const bVal = b.type === 'file'
            ? (b.StartTime || 0) * 1000
            : b.timestamp;

          return aVal >= bVal ? -1 : 1;
        });
      });
    })();
  }, [
    searchParams,
    addAlert,
  ]);
  useEffect(() => { // Files
    (async () => {
      if (allEvents.some(v => v.type === 'file')) {
        return;
      }

      if (searchParams.get('tg') === null && searchParams.get('radioId') === null) {
        return;
      }

      let code;
      let results;
      if (searchParams.get('tg') !== null) {
        [
          code,
          results,
        ] = await typeFetch<GetAllFilesApi>({
          path: '/api/v2/files/',
          method: 'GET',
          query: {
            tg: [ Number(searchParams.get('tg')), ],
          },
        });
      } else {
        [
          code,
          results,
        ] = await typeFetch<GetAllFilesApi>({
          path: '/api/v2/files/',
          method: 'GET',
          query: {
            radioId: searchParams.get('radioId') || '',
          },
        });
      }

      if (code !== 200 || !results || !('files' in results)) {
        console.log(code, results);
        addAlert('danger', 'Failed to get events');
        return;
      }
      setAllEvents(current => {
        if (current.some(v => v.type === 'file')) {
          return current;
        }

        return [
          ...current,
          ...(results.files.map(f => ({
            ...f,
            type: 'file',
          })) as typeof allEvents),
        ].sort((a, b) => {
          const aVal = a.type === 'file'
            ? (a.StartTime || 0) * 1000
            : a.timestamp;
          const bVal = b.type === 'file'
            ? (b.StartTime || 0) * 1000
            : b.timestamp;

          return aVal >= bVal ? -1 : 1;
        });
      });
    })();
  }, [
    searchParams,
    addAlert,
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

  useEffect(() => {
    console.log('Events:', allEvents);
  }, [ allEvents, ]);

  return <>
    {Object.keys(talkgroups).length > 0 && <Form.Select
      value={type === 'talkgroup' ? id : 'radio'}
      onChange={e => {
        window.location = `/events?tg=${e.target.value}` as string & Location;
      }}
    >
      <option disabled value='radio'>Select Talkgroup</option>
      {Object.keys(talkgroups).sort((a, b) => {
        return talkgroups[a].selectName.localeCompare(talkgroups[b].selectName);
      })
        .map(tg => <option
          key={tg}
          value={tg}
        >{talkgroups[tg].selectName}</option>)}
    </Form.Select>}

    {allEvents.length === 0 && id !== '' && <LoadingSpinner />}

    {allEvents.length > 0 && <Table
      responsive={true}
    >
      <thead>
        <tr>
          <th></th>
          <th>Event</th>
          <th>Tower</th>
          <th>{type === 'radio' ? 'Talkgroup' : 'Radios'}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {allEvents.map((v, i) => {
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
                  ...type === 'radio' ? [ parseTalkgroup(v.Talkgroup), ] : [],
                  ...v.Sources?.map(s => parseRadioId(s || '')) || [],
                ].map((v, idx) => <React.Fragment
                  key={idx}
                >
                  {idx > 0 && <br />}
                  {v}
                </React.Fragment>)}
              </td>
              <td><audio controls>
                <source src={`/${v.Key}`} />
              </audio></td>
            </React.Fragment>}
          </tr>;
        })}
      </tbody>
    </Table>}
  </>;
}
