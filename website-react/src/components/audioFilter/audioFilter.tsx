import { AudioAction, AudioState } from "@/types/audio";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import Tabs from "react-bootstrap/Tabs";
import Tab from "react-bootstrap/Tab";
import Form from "react-bootstrap/Form";
import { defaultFilterPreset, filterPresets } from "@/logic/audioState";

export default function AudioFilter({
  state,
  dispatch,
}: Readonly<{
  state: AudioState,
  dispatch: React.ActionDispatch<[AudioAction]>;
}>) {
  const searchParams = useSearchParams();

  // On the first run, make the filters match the search params
  // On subsequent runs, make the search params match the filters
  useEffect(() => {
    if (state.filters.showFilterModal) return;

    const tgFilterQuery = searchParams.get('tg') || `p${defaultFilterPreset}`;
    const emergFilterQuery = searchParams.get('emerg') || '';
    const fFilterQuery = searchParams.get('f') || '';

    if (!state.filters.queryParsed) {
      dispatch({
        action: 'SetFilterValue',
        filter: 'f',
        value: fFilterQuery,
      });
      dispatch({
        action: 'SetFilterValue',
        filter: 'emerg',
        value: emergFilterQuery,
      });
      dispatch({
        action: 'SetFilterValue',
        filter: 'tg',
        value: tgFilterQuery,
      });
      console.log(tgFilterQuery);
      dispatch({
        action: 'QueryParamsParsed',
      });
      return;
    }

    const newParams = new URLSearchParams(searchParams.toString());
    let hasNewParams = false;
    if (
      typeof state.filters.tgValue !== 'undefined' &&
      state.filters.tgValue !== tgFilterQuery
    ) {
      hasNewParams = true;
      if (state.filters.tgValue === '') {
        newParams.delete('tg');
      } else {
        newParams.set('tg', state.filters.tgValue);
      }
    }

    if (
      typeof state.filters.emergValue !== 'undefined' &&
      state.filters.emergValue !== emergFilterQuery
    ) {
      hasNewParams = true;
      if (state.filters.emergValue === '') {
        newParams.delete('emerg');
      } else {
        newParams.set('emerg', state.filters.emergValue);
      }
    }

    if (hasNewParams) {
      newParams.delete('f');
      window.history.pushState(null, '', `?${newParams.toString()}`);
    }
  }, [
    state.filters.emergValue,
    state.filters.tgValue,
    state.filters.showFilterModal,
  ]);

  let currentTab: AudioState['filters']['tab'] = 'presets';
  if (typeof state.filters.tab !== 'undefined') {
    currentTab = state.filters.tab;
  } else if (typeof state.filters.tgValue !== 'undefined') {
    currentTab = state.filters.tgValue.startsWith('p')
      ? 'presets'
      : state.filters.tgValue.startsWith('tg')
        ? 'talkgroups'
        : 'all';
  }

  return (<Modal
    show={state.filters.showFilterModal}
    onHide={() => dispatch({
      action: 'SetFilterDisplay',
      state: false,
    })}
    size="lg"
  >
    <Modal.Header closeButton>Filters</Modal.Header>

    <Modal.Body>
      <Tabs
        activeKey={currentTab}
        onSelect={k => dispatch({
          action: 'SetFilterTab',
          tab: (k || 'presets') as AudioState['filters']['tab'],
        })}
        className="mb-3"
      >
        <Tab title="All" eventKey="all">
          All recorded DTR traffic will be displayed

          <Form.Check
            type="switch"
            checked={state.filters.emergValue === 'y'}
            onChange={event => dispatch({
              action: 'SetFilterValue',
              filter: 'emerg',
              value: event.target.checked ? 'y' : '',
            })}
            label="Only show emergency traffic"
          />
        </Tab>
        <Tab title="Presets" eventKey="presets">
          <Form.Select
            onChange={event => dispatch({
              action: 'SetFilterValue',
              filter: 'tg',
              value: `p${event.target.value}`,
            })}
            value={typeof state.filters.tgValue === 'undefined'
              || state.filters.tgValue === ''
              || !state.filters.tgValue.startsWith('p')
              ? defaultFilterPreset
              : state.filters.tgValue.slice(1)
            }
          >
            {Object.keys(filterPresets).map(preset => (<option
              key={preset}
              value={preset}
            >{preset}</option>))}
          </Form.Select>
        </Tab>
      </Tabs>
    </Modal.Body>

    <Modal.Footer
      className="justify-content-between"
    >
      <Button
        variant="success"
        onClick={() => dispatch({
          action: 'SetFilterDisplay',
          state: false,
        })}
      >Apply</Button>
      <Button // @TODO - implement this
        variant="warning"
        onClick={() => dispatch({
          action: 'SetFilterDisplay',
          state: false,
        })}
      >Apply and Jump to Present</Button>
    </Modal.Footer>
  </Modal>);
}