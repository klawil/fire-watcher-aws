import { AudioAction, AudioState, filterPresets, FilterPresetUrlParams, filterPresetValues } from "@/types/audio";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import Tabs from "react-bootstrap/Tabs";
import Tab from "react-bootstrap/Tab";
import Form from "react-bootstrap/Form";
import { defaultFilterPreset } from "@/logic/audioState";


export default function AudioFilter({
  state,
  dispatch,
}: Readonly<{
  state: AudioState,
  dispatch: React.ActionDispatch<[AudioAction]>;
}>) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const searchParamValues = {
      tg: searchParams.get('tg') || `p${defaultFilterPreset}`,
      emerg: searchParams.get('emerg') || undefined,
      f: searchParams.get('f') || undefined,
    };

    // Pull in the raw values from search params on the first run
    if (!state.queryParsed) {
      // @TODO - implement callsign listening to page logic
      // @TODO - implement the nostart logic
      // @TODO - implement add to home screen?
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
        if (key === 'f') return;

        if (typeof state.filter[key] === 'undefined') {
          newSearchParams.delete(key);
        } else if (newSearchParams.get(key) !== state.filter[key]) {
          newSearchParams.set(key, state.filter[key]);
          wasChange = true;
        }
      });
    if (wasChange) {
      window.history.pushState(null, '', `?${newSearchParams.toString()}`);
    }
  }, [searchParams, state.filter, state.queryParsed, dispatch]);

  const [filterChanges, setFilterChangesRaw] = useState<Partial<
    Pick<AudioState['filter'], 'tg'> &
    Pick<AudioState['filter'], 'emerg'>
  >>({});
  const setFilterChanges = useCallback((changes: typeof filterChanges) =>
      setFilterChangesRaw(current => {
        const newValues = {
          ...current,
          ...changes,
        };

        (Object.keys(newValues) as (keyof typeof newValues)[])
          .forEach((key) => {
            if (typeof newValues[key] === 'undefined') {
              delete newValues[key];
              return;
            }

            if (newValues[key] === state.filter[key]) {
              delete newValues[key];
            }
          });
        if (
          typeof newValues.emerg !== 'undefined' &&
          newValues.tg !== 'all'
        ) {
          delete newValues.emerg;
        }

        return newValues;
      }), [state.filter]);

  const setCurrentTab = useCallback((tab: string) => {
    if (tab === 'all') {
      setFilterChanges({
        tg: 'all',
      });
    } else if (tab === 'presets') {
      setFilterChanges({
        tg: `p${defaultFilterPreset}`,
      });
    } else if (tab === 'talkgroups') {
      setFilterChanges({
        tg: `tg8198`,
      });
    }
  }, [setFilterChanges]);

  const hasChanges = (Object.keys(filterChanges) as (keyof typeof filterChanges)[])
    .filter(key => typeof filterChanges[key] !== 'undefined')
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
  }, [dispatch, filterChanges, searchParams]);

  // Exit early if we haven't parsed the search string yet
  if (!state.queryParsed) return <></>;

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
  } else if (/^tg([0-9]+,?)+$/.test(presetValue)) {
    tgValueParsed = {
      type: 'talkgroup',
      value: presetValue.slice(2).split('|')
        .map(s => Number(s)),
    };
  } else if (presetValue === 'all') {
    tgValueParsed = { type: 'all' };
  }

  return (<Modal
    show={state.filterModalOpen}
    onHide={() => closeFilter(false, false)}
    size="lg"
  >
    <Modal.Header closeButton>Filters</Modal.Header>

    <Modal.Body>
      <Tabs
        activeKey={tgValueParsed.type}
        onSelect={k => setCurrentTab(k || 'presets')}
        className="mb-3"
      >
        <Tab title="All" eventKey="all">
          All recorded DTR traffic will be displayed

          <Form.Check
            type="switch"
            checked={state.filter.emerg === 'y'}
            onChange={e => setFilterChanges({
              emerg: e.target.checked ? 'y' : undefined,
            })}
            label="Only show emergency traffic"
          />
        </Tab>
        <Tab title="Presets" eventKey="presets">
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
              .map(preset => (<option
                key={preset}
                value={preset}
              >{filterPresets[preset].label || preset}</option>))}
          </Form.Select>
        </Tab>
        {/* @TODO - implement talkgroups tab */}
      </Tabs>
    </Modal.Body>

    <Modal.Footer
      className="justify-content-between"
    >
      <Button
        variant="success"
        onClick={() => closeFilter(true, false)}
        disabled={!hasChanges}
      >Apply</Button>
      <Button
        variant="warning"
        onClick={() => closeFilter(true, true)}
        disabled={!hasChanges}
      >Apply and Jump to Present</Button>
    </Modal.Footer>
  </Modal>);
}