'use client';

import { fNameToDate } from "$/stringManipulation";
import { AudioAction, AudioState } from "@/types/audio";
import { useCallback, useState } from "react";
import { Button, Modal } from "react-bootstrap";
import DatePicker from "react-datepicker";

import "react-datepicker/dist/react-datepicker.css";

export default function CalendarModal({
  state,
  dispatch,
}: Readonly<{
  state: AudioState,
  dispatch: React.ActionDispatch<[AudioAction]>;
}>) {
  const [hour, setHour] = useState(0);
  const [minute, setMinute] = useState(0);
  const [newDatetime, setNewDatetime] = useState<Date | null>(null);

  const jumpToTime = useCallback(() => {
    if (newDatetime === null) return;

    const newDate = new Date(newDatetime.getTime());
    newDate.setMilliseconds(0);
    newDate.setSeconds(0);
    newDate.setHours(hour);
    newDate.setMinutes(minute);

    setHour(0);
    setMinute(0);
    setNewDatetime(null);
    dispatch({
      action: 'JumpToTime',
      f: `00-${Math.floor(newDate.getTime() / 1000).toString().padStart(10, '0')}_000000000-call_0.m4a`,
    });
  }, [newDatetime, dispatch, hour, minute]);

  const hourOptions = Array.from(Array(24), (v, idx) => idx);
  const minuteOptions = [0, 15, 30, 45];

  const currentDatetime = newDatetime !== null
    ? newDatetime
    : state.filter.f
      ? fNameToDate(state.filter.f)
      : new Date();

  return (<Modal
    show={state.calendarModalOpen}
    onHide={() => dispatch({
      action: 'CloseCalendarModal',
    })}
  >
    <Modal.Header closeButton>Jump to Time</Modal.Header>
    <Modal.Body>
      <DatePicker
        selected={currentDatetime}
        onChange={date => date && setNewDatetime(date)}
      /> at <select
        value={hour}
        onChange={e => setHour(Number(e.target.value))}
      >{hourOptions.map(h => <option
        key={h}
        value={h}
      >{h.toString().padStart(2, '0')}</option>)}</select> :
      <select
        value={minute}
        onChange={e => setMinute(Number(e.target.value))}
      >{minuteOptions.map(m => <option
        key={m}
        value={m}
      >{m.toString().padStart(2, '0')}</option>)}</select>
    </Modal.Body>

    <Modal.Footer className="justify-content-between">
      <Button
        variant="success"
        onClick={jumpToTime}
        disabled={newDatetime === null}
      >Go to Time</Button>
      <Button
        variant="primary"
        onClick={() => dispatch({
          action: 'SetNewFilters',
          ...state.filter,
          f: undefined,
        })}
      >Go to Present</Button>
      <Button
        variant="warning"
        onClick={() => dispatch({ action: 'CloseCalendarModal' })}
      >Cancel</Button>
    </Modal.Footer>
  </Modal>)
}
