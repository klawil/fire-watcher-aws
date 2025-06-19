import { useSearchParams } from 'next/navigation';
import {
  useCallback, useEffect, useState
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
  AudioAction, AudioState, FilterPresetUrlParams, allowedNostartParams, filterPresetValues,
  filterPresets
} from '@/types/frontend/audio';
import { defaultFilterPreset } from '@/utils/frontend/audioState';
import { typeFetch } from '@/utils/frontend/typeFetch';

export default function AudioFilter({
  state,
  dispatch,
}: Readonly<{
  state: AudioState,
  dispatch: React.ActionDispatch<[AudioAction]>;
}>) {
  const searchParams = useSearchParams();
  const [
    noStart,
    setNoStart,
  ] = useState(false);
  useEffect(() => {

    /*
     * If `nostart` is present in the URL, don't load any data. This is to allow a link to the
     * specific filter set that automatically jumps to the present to be saved on a mobile device
     */
    if (
      !noStart &&
      searchParams.get('nostart') !== null
    ) {
      setNoStart(true);
      return;
    }
    if (noStart) {
      const newParams = new URLSearchParams(searchParams.toString());
      if (newParams.get('nostart') !== null) {
        [ ...newParams.keys(), ]
          .filter(key => !allowedNostartParams.includes(key))
          .forEach(key => newParams.delete(key));
        window.history.replaceState(null, '', `?${newParams.toString()}`);
      }
      return;
    }

    // Check for a link from a paging message
    if (
      !state.queryParsed &&
      searchParams.get('p') !== null &&
      searchParams.get('m') !== null
    ) {
      (async (phone: number, message: number) => {
        if (Number.isNaN(phone) || Number.isNaN(message)) {
          throw new Error('Invalid phone or message');
        }

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
      })(Number(searchParams.get('p')), Number(searchParams.get('m')));

      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete('p');
      newParams.delete('m');
      window.history.replaceState(null, '', `?${newParams.toString()}`);
      return;
    }

    const searchParamValues = {
      tg: searchParams.get('tg') || `p${defaultFilterPreset}`,
      emerg: (searchParams.get('emerg') || undefined) as 'n' | 'y' | undefined,
      tone: (searchParams.get('tone') || undefined) as 'n' | 'y' | undefined,
      f: searchParams.get('f') || undefined,
    };

    // Pull in the raw values from search params on the first run
    if (!state.queryParsed) {
      dispatch({
        action: 'QueryParamsParsed',
        ...searchParamValues,
      });
      return;
    }

    // Check to see if the params have changed
    let wasChange = false;
    const newSearchParams = new URLSearchParams(searchParams.toString());
    (Object.keys(searchParamValues) as (keyof typeof searchParamValues)[])
      .forEach(key => {
        if (key === 'f') {
          return;
        }

        if (
          typeof state.filter[key] === 'undefined' ||
          state.filter[key] === 'n'
        ) {
          newSearchParams.delete(key);
          wasChange = true;
        } else if (
          newSearchParams.get(key) !== state.filter[key] &&
          (
            newSearchParams.get(key) !== null ||
            state.filter[key] !== 'n'
          )
        ) {
          newSearchParams.set(key, state.filter[key]);
          wasChange = true;
        }
      });
    if (wasChange) {
      window.history.pushState(null, '', `?${newSearchParams.toString()}`);
    }
  }, [
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
    dispatch({
      action: 'SetNewFilters',
      ...filterChanges,
      f: !jumpToPresent
        ? searchParams.get('f') || undefined
        : undefined,
    });
  }, [
    dispatch,
    filterChanges,
    searchParams,
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

                        if (
                          tgFilter !== '' &&
                          !state.talkgroups[tg].selectName
                            .toLowerCase()
                            .includes(tgFilter.toLowerCase())
                        ) {
                          return false;
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
