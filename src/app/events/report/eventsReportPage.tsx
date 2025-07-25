'use client';

import React, {
  useCallback,
  useContext, useEffect, useState
} from 'react';
import {
  Button,
  Col, Form, Row,
  Table
} from 'react-bootstrap';

import LoadingSpinner from '@/components/loadingSpinner/loadingSpinner';
import {
  EventQueryResultRow, QueryEventsApi,
  validEventGroupKeys,
  validEventTypes
} from '@/types/api/events';
import { getLogger } from '@/utils/common/logger';
import { AddAlertContext } from '@/utils/frontend/clientContexts';
import {
  getItemLink,
  useRadios, useTalkgroups
} from '@/utils/frontend/talkgroups';
import { typeFetch } from '@/utils/frontend/typeFetch';

const logger = getLogger('eventsReportPage');

const groupKeysOrder = validEventGroupKeys.sort((a, b) => a.localeCompare(b));

const numberFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

export default function EventsReportPage() {
  const addAlert = useContext(AddAlertContext);

  const {
    talkgroups,
  } = useTalkgroups(true);
  const {
    radios,
  } = useRadios();

  const [
    columnKeys,
    setColumnKeys,
  ] = useState<NonNullable<QueryEventsApi['query']['groupBy']>>([]);
  function addColumn(key: typeof groupByKeys[number]) {
    setColumnKeys([ key, ]);
  }
  function removeColumn(key: typeof groupByKeys[number]) {
    setColumnKeys(current => [ ...current, ].filter(k => k !== key));
  }

  const [
    groupByKeys,
    setGroupByKeys,
  ] = useState<NonNullable<QueryEventsApi['query']['groupBy']>>([]);
  function addGroupBy(key: typeof groupByKeys[number]) {
    console.log('Add group by', key);
    setGroupByKeys(current => {
      logger.log('Current group by', current);
      const newVal = [ ...current, ];
      if (!newVal.includes(key)) {
        newVal.push(key);
      }

      return newVal;
    });
  }
  function removeGroupBy(key: typeof groupByKeys[number]) {
    setGroupByKeys(current => [ ...current, ].filter(k => k !== key));
    setColumnKeys(current => [ ...current, ].filter(k => k !== key));
  }

  const [
    eventTypes,
    setEventTypes,
  ] = useState<NonNullable<QueryEventsApi['query']['events']>>([ ...validEventTypes, ]);
  function addEventType(key: typeof eventTypes[number]) {
    setEventTypes(current => {
      const newVal = [ ...current, ];
      if (!newVal.includes(key)) {
        newVal.push(key);
      }

      return newVal;
    });
  }
  function removeEventType(key: typeof eventTypes[number]) {
    setEventTypes(current => [ ...current, ].filter(k => k !== key));
  }

  const [
    timeframe,
    setTimeframe,
  ] = useState<NonNullable<QueryEventsApi['query']['timeframe']>>('week');

  const [
    sortColumn,
    setSortColumnRaw,
  ] = useState<string>('num');
  const [
    sortDir,
    setSortDir,
  ] = useState<boolean>(true);
  const setSortColumn = useCallback((col: string) => {
    if (sortColumn === col) {
      setSortDir(!sortDir);
    } else {
      setSortColumnRaw(col);
      setSortDir(true);
    }
  }, [
    sortColumn,
    sortDir,
  ]);

  const [
    queryState,
    setQueryState,
  ] = useState<string>('');
  const [
    queryLoading,
    setQueryLoading,
  ] = useState<boolean>(false);

  const [
    startTime,
    setStartTime,
  ] = useState<number | null>(null);
  const [
    endTime,
    setEndTime,
  ] = useState<number | null>(null);

  const [
    data,
    setData,
  ] = useState<EventQueryResultRow[]>([]);

  const runQuery = useCallback(async () => {
    if (groupByKeys.length === 0) {
      addAlert('danger', 'Must select some attributes');
      return;
    }

    setData([]);
    setSortColumn('num');
    setSortDir(true);
    setQueryLoading(true);
    const queryParameters: QueryEventsApi['query'] = {
      groupBy: groupByKeys,
      timeframe,
    };
    if (eventTypes.length > 0 && eventTypes.length < validEventTypes.length) {
      queryParameters.events = eventTypes;
    }

    const [
      initCode,
      queryInit,
    ] = await typeFetch<QueryEventsApi>({
      path: '/api/v2/events/',
      method: 'GET',
      query: queryParameters,
    });

    if (
      initCode !== 200 ||
      !queryInit ||
      !('queryId' in queryInit)
    ) {
      logger.error('Failed to start query', initCode, queryInit);
      addAlert('danger', 'Failed to start query');
      setQueryLoading(false);
      return;
    }

    const queryId = queryInit.queryId;
    setStartTime(queryInit.startTime);
    setEndTime(queryInit.endTime);

    let code, results;
    do {
      await new Promise(res => setTimeout(res, 5000));

      [
        code,
        results,
      ] = await typeFetch<QueryEventsApi>({
        path: '/api/v2/events/',
        method: 'GET',
        query: {
          queryId,
        },
      });

      if (results && 'status' in results) {
        setQueryState(results.status);
      }
    } while (code === 200 && results && !('rows' in results));
    if (
      code !== 200 ||
      !results ||
      !('rows' in results)
    ) {
      addAlert('danger', 'Failed to finish query');
      logger.error('Failed to finish query', code, results);
      setQueryLoading(false);
      return;
    }

    setData(results.rows);
    setQueryLoading(false);
  }, [
    addAlert,
    groupByKeys,
    timeframe,
    eventTypes,
    setSortColumn,
  ]);

  const allColumnValues = columnKeys.length > 0 && data.length > 0
    ? data
      .map(v => v[columnKeys[0]] || '')
      .filter((v, i, a) => a.indexOf(v) === i && v !== '')
      .sort((a, b) => a.localeCompare(b))
    : [];

  const [
    rows,
    setRows,
  ] = useState<(EventQueryResultRow & {
    [key: string]: number;
  })[]>([]);
  useEffect(() => {
    setRows(columnKeys.length === 0
      ? data as typeof rows
      : data.reduce((agg: typeof rows, row) => {
        const columnKey = columnKeys[0];
        const rowKeys = groupByKeys.filter(key => !columnKeys.includes(key));
        const columnValue = row[columnKey] || '';

        const tableRow = agg.find(v => !rowKeys.some(key => v[key] !== row[key]));
        if (!tableRow) {
          const newRow: typeof rows[number] = {
            num: row.num,
          };
          rowKeys.forEach(key => newRow[key] = row[key]);
          newRow[columnValue] = row.num;
          agg.push(newRow);
        } else {
          tableRow[columnValue] = row.num;
          tableRow.num += row.num;
        }

        return agg;
      }, []));
  }, [
    data,
    columnKeys,
    groupByKeys,
  ]);

  const [
    idsToNames,
    setIdsToNames,
  ] = useState<boolean>(false);
  const [
    showCounts,
    setShowCounts,
  ] = useState<boolean>(false);

  return <>
    <Row className='justify-content-center mb-5'>
      <Col md={3}>
        <h3>Attributes</h3>
        {groupKeysOrder
          .map(key => <React.Fragment key={key}>
            <Form.Check
              type='checkbox'
              onChange={e => e.target.checked
                ? addGroupBy(key)
                : removeGroupBy(key)
              }
              checked={groupByKeys.includes(key)}
              label={key}
              disabled={queryLoading}
            />
            {groupByKeys.includes(key) && ![
              'radioId',
              'talkgroup',
            ].includes(key) && <Form.Check
              className='ms-4'
              type='switch'
              onChange={(e => e.target.checked
                ? addColumn(key)
                : removeColumn(key)
              )}
              checked={columnKeys.includes(key)}
              label='Column'
            />}
          </React.Fragment>)}
      </Col>
      <Col md={3}>
        <h3>Events To Query</h3>
        {[ ...validEventTypes, ].sort((a, b) => a.localeCompare(b)).map(key => <Form.Check
          key={key}
          type='checkbox'
          onChange={e => e.target.checked
            ? addEventType(key)
            : removeEventType(key)
          }
          disabled={queryLoading}
          checked={eventTypes.includes(key)}
          label={key}
        />)}
      </Col>
      <Col md={3}>
        <Form.Select
          onChange={e => setTimeframe(e.target.value as typeof timeframe)}
          value={timeframe}
          disabled={queryLoading}
        >
          <option value='day'>1 Day</option>
          <option value='week'>1 Week</option>
          <option value='month'>1 Month (28 days)</option>
        </Form.Select>

        <Col className='d-grid mt-5'>
          <Button
            variant='success'
            disabled={groupByKeys.length === 0 || eventTypes.length === 0 || queryLoading}
            onClick={runQuery}
          >Run Query</Button>
        </Col>
      </Col>
    </Row>

    <Row className='justify-content-center mb-2'>
      <Col md={3}>
        {startTime && endTime && <>
          Data from {new Date(startTime)
            .toLocaleDateString()} to {new Date(endTime).toLocaleDateString()}
        </>}
        <Form.Check
          type='switch'
          checked={idsToNames}
          onChange={e => setIdsToNames(e.target.checked)}
          label='Use names instead of IDs'
        />
        <Form.Check
          type='switch'
          checked={showCounts}
          onChange={e => setShowCounts(e.target.checked)}
          label='Show event and recording counts'
        />
      </Col>
      {queryLoading && <Col xs={12}>
        <LoadingSpinner />
        <h4 className='text-center'>Query is {queryState || 'STARTING'}</h4>
      </Col>}
      {!queryLoading && <Table className='text-center'>
        <thead>
          {columnKeys.length > 0 && <tr>
            {groupByKeys.length > 1 && <th colSpan={groupByKeys.length - 1}></th>}
            <th colSpan={allColumnValues.length} className='border-start border-end'>{columnKeys[0]}</th>
            <th></th>
          </tr>}
          <tr>
            {groupByKeys
              .filter(key => !columnKeys.includes(key))
              .map(key => <th
                key={key}
                style={{
                  cursor: 'pointer',
                }}
                onClick={() => setSortColumn(key)}
              >{key}</th>)}
            {columnKeys.length > 0 && allColumnValues.map((v, i) => <th
              style={{
                cursor: 'pointer',
              }}
              key={i}
              onClick={() => setSortColumn(v)}
            >{v}</th>)}
            <th
              style={{
                cursor: 'pointer',
              }}
              onClick={() => setSortColumn('num')}
            >{columnKeys.length === 0 ? 'Count' : 'Total'}</th>
          </tr>
        </thead>
        <tbody>
          {rows
            .sort((a, b) => {
              if (sortColumn === '') {
                return 1;
              }

              const A_GT_B = sortDir ? -1 : 1;
              const B_GT_A = sortDir ? 1 : -1;

              const aVal = a[sortColumn] || 0;
              const bVal = b[sortColumn] || 0;

              return aVal >= bVal ? A_GT_B : B_GT_A;
            })
            .map((row, idx) => <tr key={idx}>
              {groupByKeys
                .filter(key => !columnKeys.includes(key))
                .map(key => {
                  if (key === 'radioId' || key === 'talkgroup') {
                    return <td key={key}>{getItemLink(
                      key === 'radioId' ? radios : talkgroups,
                      row[key] || '',
                      key === 'radioId' ? 'radio' : 'talkgroup',
                      showCounts,
                      !idsToNames
                    )}</td>;
                  }

                  return <td key={key}>{row[key] || '-'}</td>;
                })}
              {allColumnValues.map((key, i) => <td key={i}>{row[key]
                ? numberFormat.format(row[key])
                : '-'}</td>)}
              <td>{row.num
                ? numberFormat.format(row.num)
                : '-'}</td>
            </tr>)}
        </tbody>
      </Table>}
      {!queryLoading && data.length === 0 && <h4 className='text-center'>No results</h4>}
    </Row>
  </>;
}
