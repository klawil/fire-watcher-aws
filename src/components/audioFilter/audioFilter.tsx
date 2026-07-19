import { useSearchParams } from 'next/navigation';
import {
  useCallback, useContext, useEffect, useState
} from 'react';
import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import Row from 'react-bootstrap/Row';
import Tab from 'react-bootstrap/Tab';
import Table from 'react-bootstrap/Table';
import Tabs from 'react-bootstrap/Tabs';

import { UpdateTextSeenApi } from '@/types/api/texts';
import {
  AudioAction, AudioState, FilterPresetUrlParams, filterPresetValues,
  filterPresets
} from '@/types/frontend/audio';
import { fNameToDate } from '@/utils/common/strings';
import { defaultFilterPreset } from '@/utils/frontend/audioState';
import { AddAlertContext } from '@/utils/frontend/clientContexts';
import { typeFetch } from '@/utils/frontend/typeFetch';

function fFromTimestamp(rawTime: string): string | undefined {
  const parsedValue = Number(rawTime);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return undefined;
  }

  const seconds = parsedValue > 100000000000
    ? Math.floor(parsedValue / 1000)
    : Math.floor(parsedValue);
  if (seconds <= 0) {
    return undefined;
  }

  return `00-${seconds.toString().padStart(10, '0')}_000000000-call_0.m4a`;
}

function parseTgFilter(rawTg: string | null): string | undefined {
  if (rawTg === null) {
    return `p${defaultFilterPreset}`;
  }
  if (rawTg === 'all') {
    return rawTg;
  }

  if (rawTg.startsWith('p')) {
    const presetName = rawTg.slice(1);
    if (filterPresetValues.includes(presetName as FilterPresetUrlParams)) {
      return rawTg;
    }
    return undefined;
  }

  if (rawTg.startsWith('tg')) {
    const talkgroups = rawTg.slice(2).split('|')
      .filter(v => v !== '')
      .map(v => Number(v));
    if (
      talkgroups.length === 0 ||
      talkgroups.some(v => Number.isNaN(v) || v < 0)
    ) {
      return undefined;
    }

    return `tg${talkgroups.join('|')}`;
  }

  return undefined;
}

export default function AudioFilter({
  state,
  dispatch,
}: Readonly<{
  state: AudioState,
  dispatch: React.ActionDispatch<[AudioAction]>;
}>) {
  const searchParams = useSearchParams();
  const addAlert = useContext(AddAlertContext);
  const [
    noStart,
    setNoStart,
  ] = useState(false);
  useEffect(() => {
    if (noStart) {
      return;
    }

    const rawParams = new URLSearchParams(searchParams.toString());

    // If `nostart` is present, remove it and block initial loading behavior.
    if (rawParams.get('nostart') !== null) {
      rawParams.delete('nostart');
      window.history.replaceState(null, '', `?${rawParams.toString()}`);
      setNoStart(true);
      return;
    }

    if (!state.queryParsed) {
      let shouldReplaceState = false;

      // Parse links from paging messages, then remove these params and continue parsing.
      if (
        rawParams.get('p') !== null &&
        rawParams.get('m') !== null
      ) {
        const phone = Number(rawParams.get('p'));
        const message = Number(rawParams.get('m'));
        if (!Number.isNaN(phone) && !Number.isNaN(message)) {
          (async () => {
            const [ code, ] = await typeFetch<UpdateTextSeenApi>({
              path: '/api/v2/texts/{id}/',
              method: 'PATCH',
              params: {
                id: message,
              },
              body: {
                phone: phone,
              },
            });
            if (code !== 200) {
              throw new Error(`Failed to update text seen - ${code}`);
            }
          })().catch(() => {
            addAlert('warning', 'Failed to mark paging message as seen');
          });
        }
      }
      if (rawParams.get('p') !== null || rawParams.get('m') !== null) {
        rawParams.delete('p');
        rawParams.delete('m');
        shouldReplaceState = true;
      }

      // Parse tg/emerg/tone with validation.
      const invalidFilterKeys: string[] = [];
      const parsedTg = parseTgFilter(rawParams.get('tg'));
      if (
        rawParams.get('tg') !== null &&
        typeof parsedTg === 'undefined'
      ) {
        invalidFilterKeys.push('tg');
        rawParams.delete('tg');
        shouldReplaceState = true;
      }

      const emergRaw = rawParams.get('emerg');
      let parsedEmerg: 'y' | 'n' | undefined = undefined;
      if (emergRaw !== null) {
        if (emergRaw === 'y' || emergRaw === 'n') {
          parsedEmerg = emergRaw;
        } else {
          invalidFilterKeys.push('emerg');
          rawParams.delete('emerg');
          shouldReplaceState = true;
        }
      }

      const toneRaw = rawParams.get('tone');
      let parsedTone: 'y' | 'n' | undefined = undefined;
      if (toneRaw !== null) {
        if (toneRaw === 'y' || toneRaw === 'n') {
          parsedTone = toneRaw;
        } else {
          invalidFilterKeys.push('tone');
          rawParams.delete('tone');
          shouldReplaceState = true;
        }
      }

      if (invalidFilterKeys.length > 0) {
        addAlert(
          'warning',
          `Invalid filter parameter${invalidFilterKeys.length > 1 ? 's' : ''}: ${invalidFilterKeys.join(', ')}`
        );
      }

      // Parse f first, then f_time if needed.
      const rawF = rawParams.get('f');
      const rawFTime = rawParams.get('f_time');
      let parsedF: string | undefined = undefined;
      if (rawF !== null) {
        const parsedDate = fNameToDate(rawF);
        if (parsedDate.getTime() > 0) {
          parsedF = rawF;
        } else {
          addAlert('warning', 'Invalid value for f; falling back to f_time if available');
          rawParams.delete('f');
          shouldReplaceState = true;
        }
      }
      if (typeof parsedF === 'undefined' && rawFTime !== null) {
        parsedF = fFromTimestamp(rawFTime);
      }
      if (rawFTime !== null) {
        rawParams.delete('f_time');
        shouldReplaceState = true;
      }

      if (shouldReplaceState) {
        window.history.replaceState(null, '', `?${rawParams.toString()}`);
      }

      dispatch({
        action: 'QueryParamsParsed',
        tg: parsedTg,
        emerg: parsedEmerg,
        tone: parsedTone,
        f: parsedF,
      });
      return;
    }

    // Keep filter query params in sync after initial parsing.
    if (state.queryParsed) {
      const newParams = new URLSearchParams(searchParams.toString());
      let wasChange = false;
      (Object.keys(state.filter) as (keyof AudioState['filter'])[])
        .forEach(key => {
          if (key === 'f' || key === 'f_time') {
            return;
          }

          if (
            typeof state.filter[key] === 'undefined' ||
            state.filter[key] === 'n'
          ) {
            if (newParams.get(key) !== null) {
              newParams.delete(key);
              wasChange = true;
            }
          } else if (newParams.get(key) !== state.filter[key]) {
            newParams.set(key, state.filter[key] || '');
            wasChange = true;
          }
        });

      if (wasChange) {
        window.history.pushState(null, '', `?${newParams.toString()}`);
      }
    }
  }, [
    addAlert,
    noStart,
    searchParams,
    state.filter,
    state.queryParsed,
    dispatch,
  ]);

  const [
    filterChanges,
    setFilterChangesRaw,
  ] = useState<Partial<
    Pick<AudioState['filter'], 'tg'> &
    Pick<AudioState['filter'], 'tone'> &
    Pick<AudioState['filter'], 'emerg'>
  >>({});
  const setFilterChanges = useCallback((changes: typeof filterChanges) =>
    setFilterChangesRaw(current => {
      const newValues = {
        ...state.filter,
        ...current,
        ...changes,
      };

      // Mutually exclude `emerg` and `tone`
      if (newValues.emerg === 'y' && newValues.tone === 'y') {
        newValues[typeof changes.emerg !== 'undefined' ? 'tone' : 'emerg'] = 'n';
      }

      (Object.keys(newValues) as (keyof typeof newValues)[])
        .forEach(key => {
          if (typeof newValues[key] === 'undefined') {
            delete newValues[key];
            return;
          }
        });
      if (
        typeof newValues.tone !== 'undefined' &&
        newValues.tg !== 'all'
      ) {
        delete newValues.tone;
      }
      if (
        typeof newValues.emerg !== 'undefined' &&
        newValues.tg !== 'all'
      ) {
        delete newValues.emerg;
      }

      return newValues;
    }), [ state.filter, ]);

  const setCurrentTab = useCallback((tab: string) => {
    if (tab === 'all') {
      setFilterChanges({
        tg: 'all',
      });
    } else if (tab === 'presets') {
      setFilterChanges({
        tg: `p${defaultFilterPreset}`,
      });
    } else if (tab === 'talkgroup') {
      setFilterChanges({
        tg: 'tg',
      });
    }
  }, [ setFilterChanges, ]);

  const hasChanges = (Object.keys(filterChanges) as (keyof typeof filterChanges)[])
    .filter(key => typeof filterChanges[key] !== 'undefined')
    .filter(key => filterChanges[key] !== state.filter[key])
    .length > 0;

  const closeFilter = useCallback((apply: boolean, jumpToPresent: boolean) => {
    // Set the state to show the modal is closed
    dispatch({
      action: 'CloseFilterModal',
    });

    // Just straight close the filter and don't save changes
    if (!apply) {
      setFilterChangesRaw({});
      return;
    }

    // Save the changes and reset the files to trigger a loading event
    const playerFileName = state.player.fileUrl?.split('/').pop();
    dispatch({
      action: 'SetNewFilters',
      ...filterChanges,
      f: !jumpToPresent
        ? playerFileName || state.filter.f
        : undefined,
    });
  }, [
    dispatch,
    filterChanges,
    state.filter.f,
    state.player.fileUrl,
  ]);

  const [
    tgFilter,
    setTgFilter,
  ] = useState('');

  // Exit early if we haven't parsed the search string yet
  if (!state.queryParsed) {
    return <></>;
  }

  let tgValueParsed: {
    type: 'presets';
    value: FilterPresetUrlParams;
  } | {
    type: 'talkgroup';
    value: number[];
  } | {
    type: 'all';
  } = {
    type: 'presets',
    value: defaultFilterPreset,
  };
  const presetValue = typeof filterChanges.tg !== 'undefined'
    ? filterChanges.tg
    : state.filter.tg || '';
  if (
    presetValue === '' ||
    presetValue.startsWith('p')
  ) {
    const presetName = presetValue.slice(1);
    if (filterPresetValues.includes(presetName as FilterPresetUrlParams)) {
      tgValueParsed = {
        type: 'presets',
        value: presetName as FilterPresetUrlParams,
      };
    }
  } else if (presetValue.startsWith('tg')) {
    tgValueParsed = {
      type: 'talkgroup',
      value: presetValue.slice(2).split('|')
        .filter(s => s !== '')
        .map(s => Number(s)),
    };
  } else if (presetValue === 'all') {
    tgValueParsed = { type: 'all', };
  }

  const addTg = (tg: string) => {
    if (tgValueParsed.type !== 'talkgroup') {
      return;
    }

    setFilterChanges({
      tg: `tg${[
        ...tgValueParsed.value,
        tg,
      ].join('|')}`,
    });
  };
  const rmTg = (tg: string) => {
    if (tgValueParsed.type !== 'talkgroup') {
      return;
    }

    setFilterChanges({
      tg: `tg${tgValueParsed.value.filter(v => v.toString() !== tg).join('|')}`,
    });
  };

  return <Modal
    show={state.filterModalOpen}
    onHide={() => closeFilter(false, false)}
    size='lg'
  >
    <Modal.Header closeButton>Filters</Modal.Header>

    <Modal.Body>
      <Tabs
        activeKey={tgValueParsed.type}
        onSelect={k => setCurrentTab(k || 'presets')}
        className='mb-3'
      >
        <Tab title='All' eventKey='all'>
          All recorded DTR traffic will be displayed

          <Form.Check
            type='switch'
            checked={typeof filterChanges.emerg !== 'undefined'
              ? filterChanges.emerg === 'y'
              : state.filter.emerg === 'y'}
            onChange={e => setFilterChanges({
              emerg: e.target.checked ? 'y' : 'n',
            })}
            label='Only show emergency traffic'
          />

          <Form.Check
            type='switch'
            checked={typeof filterChanges.tone !== 'undefined'
              ? filterChanges.tone === 'y'
              : state.filter.tone === 'y'}
            onChange={e => setFilterChanges({
              tone: e.target.checked ? 'y' : 'n',
            })}
            label='Only show pages'
          />
        </Tab>
        <Tab title='Presets' eventKey='presets'>
          <Form.Select
            onChange={e => setFilterChanges({
              tg: `p${e.target.value}`,
            })}
            value={tgValueParsed.type === 'presets'
              ? tgValueParsed.value
              : defaultFilterPreset
            }
          >
            {filterPresetValues
              .filter(preset => !filterPresets[preset].hide)
              .sort((a, b) => a.localeCompare(b))
              .map(preset => <option
                key={preset}
                value={preset}
              >{filterPresets[preset].label || preset}</option>)}
          </Form.Select>
        </Tab>
        <Tab as={Container} title='Talkgroups' eventKey='talkgroup'>
          {tgValueParsed.type === 'talkgroup' && <Row>
            <Col md={6} xs={12}>
              <h5 className='text-center'>Talkgroups</h5>
              <Form.Control
                type='text'
                value={tgFilter}
                onChange={e => setTgFilter(e.target.value)}
                placeholder='Filter Talkgroups'
              />
              <div style={{
                height: '200px',
                overflowY: 'scroll',
              }}>
                <Table>
                  <tbody>
                    {Object.keys(state.talkgroups)
                      .filter(tg => {
                        if (tgValueParsed.value.includes(Number(tg))) {
                          return false;
                        }

                        const filter = tgFilter.toLowerCase();
                        const nameMatch = state.talkgroups[tg].selectName
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
                        state.talkgroups[a].selectName
                          .localeCompare(state.talkgroups[b].selectName))
                      .map(tg => <tr
                        key={tg}
                        onClick={() => addTg(tg)}
                      >
                        <td
                          style={{
                            cursor: 'pointer',
                          }}
                        >{state.talkgroups[tg].selectName}</td>
                      </tr>)}
                  </tbody>
                </Table>
              </div>
            </Col>
            <Col md={6} xs={12}>
              <h5 className='text-center'>Selected</h5>
              <div style={{
                height: '200px',
                overflowY: 'scroll',
              }}>
                <Table>
                  <tbody>
                    {Object.keys(state.talkgroups)
                      .filter(tg => tgValueParsed.value.includes(Number(tg)))
                      .sort((a, b) =>
                        state.talkgroups[a].selectName
                          .localeCompare(state.talkgroups[b].selectName))
                      .map(tg => <tr
                        key={tg}
                        onClick={() => rmTg(tg)}
                      >
                        <td
                          style={{
                            cursor: 'pointer',
                          }}
                        >{state.talkgroups[tg].selectName}</td>
                      </tr>)}
                  </tbody>
                </Table>
              </div>
            </Col>
          </Row>}
        </Tab>
      </Tabs>
    </Modal.Body>

    <Modal.Footer
      className='justify-content-between'
    >
      <Button
        variant='success'
        onClick={() => closeFilter(true, false)}
        disabled={!hasChanges}
      >Apply</Button>
      <Button
        variant='warning'
        onClick={() => closeFilter(true, true)}
        disabled={!hasChanges}
      >Apply and Jump to Present</Button>
    </Modal.Footer>
  </Modal>;
}
