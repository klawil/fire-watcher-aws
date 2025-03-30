'use client';

import Table from "react-bootstrap/Table";
import Button from "react-bootstrap/Button";
import { BsChevronDown, BsChevronUp, BsStar, BsStarFill } from "react-icons/bs";
import React, { useCallback, useContext, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { AudioAction, AudioState, filterPresets, FilterPresetUrlParams } from "@/types/audio";
import { audioReducer, defaultAudioState } from "@/logic/audioState";
import { dateToStr, findClosestFileIdx } from "@/logic/dateAndFile";
import { ApiAudioListResponse, ApiAudioTalkgroupsResponse } from "$/audioApi";
import styles from './audioList.module.css';
import AudioPlayerBar from "../audioPlayerBar/audioPlayerBar";
import LoadingSpinner from "../loadingSpinner/loadingSpinner";
import { isElemInView, useRefIntersection } from "@/logic/uiUtils";
import AudioFilter from "../audioFilter/audioFilter";
import { fNameToDate } from "$/stringManipulation";
import CalendarModal from "../calendarModal/calendarModal";
import { AddAlertContext } from "@/logic/clientContexts";

const loadAfterAddedMinWait = 10000;

function useLoadFiles(
  state: AudioState,
  dispatch: React.ActionDispatch<[AudioAction]>,
  beforeRenderRows: (adding: number) => void,
  scrollTop: number,
) {
  const [afterRef, afterRefIntersecting] = useRefIntersection();
  const [beforeRef, beforeRefIntersecting] = useRefIntersection();
  const addAlert = useContext(AddAlertContext);

  useEffect(() => {
    if (state.apiResponse.length === 0) return;

    const responseToParse = state.apiResponse[0];

    // Check that the value is the most recent run
    if (responseToParse.callId !== state.api[`${responseToParse.direction}LastCall`]) {
      dispatch({
        action: 'ClearApiResponse',
      });
      return;
    }

    // Set the api query values
    const newApiValues: AudioState['api'] = {};
    if (
      typeof responseToParse.after !== 'undefined' &&
      responseToParse.after !== null &&
      (
        typeof state.api.after === 'undefined' ||
        responseToParse.after > state.api.after
      )
    ) {
      newApiValues.after = responseToParse.after;
    }
    if (
      typeof responseToParse.afterAdded !== 'undefined' &&
      responseToParse.afterAdded !== null &&
      (
        typeof state.api.afterAdded === 'undefined' ||
        responseToParse.afterAdded > state.api.afterAdded
      )
    ) {
      newApiValues.afterAdded = responseToParse.afterAdded;
    }
    if (
      typeof responseToParse.before !== 'undefined' &&
      responseToParse.before !== null &&
      (
        typeof state.api.before === 'undefined' ||
        responseToParse.before < state.api.before
      )
    ) {
      newApiValues.before = responseToParse.before;
    }
    if (Object.keys(newApiValues).length > 0) {
      dispatch({
        action: 'SetApiKeys',
        ...newApiValues,
      });
    }

    // Check for the move to afterAdded
    if (
      responseToParse.files.length === 0 &&
      responseToParse.direction === 'after'
    ) {
      dispatch({ action: 'ApiLoadAfterAdded' });
    }

    // Add the files
    if (responseToParse.files.length > 0) {
      if (state.files.length === 0 && state.filter.f) {
        const closestIdx = findClosestFileIdx(
          responseToParse.files,
          state.filter.f,
        );
        beforeRenderRows(closestIdx);
      } else if (
        responseToParse.direction !== 'after' ||
        state.files.length === 0
      ) {
        beforeRenderRows(0);
      } else {
        beforeRenderRows(responseToParse.files.length);
      }
      dispatch({
        action: 'AddAudioFile',
        files: responseToParse.files,
        location: responseToParse.direction,
      });
    } else if (
      responseToParse.files.length === 0 &&
      state.files.length === 0 &&
      state.filter.f
    ) {
      // Delete the file to start with if no results were returned
      dispatch({
        action: 'SetSomeNewFilters',
        f: undefined,
      });
    }

    dispatch({
      action: 'ClearApiResponse',
      direction: responseToParse.direction,
    });
  }, [state.apiResponse, state.api, state.files.length, state.filter.f, dispatch, beforeRenderRows]);

  const afterAddedTimeout = useRef<NodeJS.Timeout | null>(null);
  const [afterAddedLastCall, setAfterAddedLastCall] = useState<number | null>(0);
  const [afterAddedTrigger, setAfterAddedTrigger] = useState(false);

  useEffect(() => {
    // Wait for the query to be parsed
    if (!state.queryParsed || scrollTop !== -1) {
      return;
    }

    // If the API keys are not set then load files
    let shouldLoadFiles = false;
    let loadFilesDirection: 'before' | 'after' | 'init' = 'after';
    const apiVals = state.api;
    if (
      (Object.keys(apiVals) as (keyof typeof apiVals)[])
        .filter(key => typeof apiVals[key] !== 'undefined')
        .length === 0
    ) {
      loadFilesDirection = 'init';
      shouldLoadFiles = true;
    } else if (
      afterRefIntersecting === true &&
      typeof state.api.afterLastCall === 'undefined'
    ) {
      shouldLoadFiles = true;
      loadFilesDirection = 'after';
    } else if (
      beforeRefIntersecting === true &&
      typeof state.api.beforeLastCall === 'undefined'
    ) {
      shouldLoadFiles = true;
      loadFilesDirection = 'before';
    }
    if (
      loadFilesDirection === 'after' &&
      state.api.loadAfterAdded &&
      (
        afterAddedLastCall === null ||
        Date.now() - afterAddedLastCall < loadAfterAddedMinWait
      )
    ) {
      if (afterAddedTimeout.current !== null) {
        clearTimeout(afterAddedTimeout.current);
      }
      if (afterAddedLastCall !== null) {
        afterAddedTimeout.current = setTimeout(
          () => setAfterAddedTrigger(!afterAddedTrigger),
          Date.now() - afterAddedLastCall + loadAfterAddedMinWait,
        );
      }
      shouldLoadFiles = false;
    }
    if (!shouldLoadFiles) return;
    if (
      loadFilesDirection === 'after' &&
      state.api.loadAfterAdded
    ) {
      setAfterAddedLastCall(null);
    }

    (async () => {
      const urlParams: URLSearchParams = new URLSearchParams();
      urlParams.set('action', 'list');

      // Build out the request with the times to load before/after
      if (
        loadFilesDirection === 'before' &&
        typeof state.api.before !== 'undefined'
      ) {
        urlParams.set('before', state.api.before.toString());
      } else if (
        loadFilesDirection === 'after' &&
        !state.api.loadAfterAdded &&
        typeof state.api.after !== 'undefined'
      ) {
        urlParams.set('after', state.api.after.toString());
      } else if (
        loadFilesDirection === 'after' &&
        state.api.loadAfterAdded &&
        typeof state.api.afterAdded !== 'undefined'
      ) {
        urlParams.set('afterAdded', state.api.afterAdded.toString());
      } else if (
        loadFilesDirection === 'init' &&
        typeof state.filter.f !== 'undefined'
      ) {
        // Load after a specific URL file
        const startDate = fNameToDate(state.filter.f);
        urlParams.set('after', Math.floor((startDate.getTime() - 1000) / 1000).toString());
      }

      // Build out the filter values
      if (typeof state.filter.emerg !== 'undefined') {
        urlParams.set('emerg', state.filter.emerg);
      }
      if (typeof state.filter.tg !== 'undefined') {
        // Get the URL value
        const tgFilter = state.filter.tg;
        let tgUrlValue: string = '';
        if (tgFilter.startsWith('tg')) {
          tgUrlValue = tgFilter.slice(2);
        } else if (tgFilter.startsWith('p')) {
          tgUrlValue = filterPresets[tgFilter.slice(1) as FilterPresetUrlParams]
            .talkgroups.join('|');
        }

        if (tgUrlValue !== '') {
          urlParams.set('tg', tgUrlValue);
        }
      }

      console.log(urlParams.toString());

      const callId = Date.now();
      dispatch({
        action: 'SetApiLastCall',
        key: loadFilesDirection === 'init' ? 'after' : loadFilesDirection,
        value: callId,
      });
      const url = `/api/audio?${urlParams.toString()}`;
      try {
        const newData: ApiAudioListResponse = await fetch(url)
          .then(r => r.json());
    
        // Save the after added timestamp
        if (
          loadFilesDirection === 'after' &&
          state.api.loadAfterAdded
        ) {
          setAfterAddedLastCall(Date.now());
        }

        // Check for any errors
        if (!newData.success) throw newData;

        dispatch({
          action: 'AddApiResponse',
          ...newData,
          callId,
          direction: loadFilesDirection === 'init' ? 'after' : loadFilesDirection,
        });
      } catch (e) {
        addAlert('danger', 'Failed to update the list of audio files');
        console.error(`Failed to fetch audio files ${urlParams.toString()}`, e);
      }
    })();
  }, [
    state.api,
    state.filter,
    state.queryParsed,
    afterRefIntersecting,
    beforeRefIntersecting,
    dispatch,
    afterAddedLastCall,
    afterAddedTrigger,
    scrollTop,
    addAlert,
  ]);

  return [afterRef, beforeRef];
}

export default function AudioList() {
  const [state, dispatch] = useReducer<
    AudioState,
    [ AudioAction ]
  >(audioReducer, defaultAudioState);
  // Fetch the talkgroup information
  useEffect(() => {
    (async () => {
      const tgData: ApiAudioTalkgroupsResponse = await fetch(`/api/audio?action=talkgroups`)
        .then(r => r.json());

      if (!tgData.success || typeof tgData.talkgroups === 'undefined') return;

      dispatch({
        action: 'AddTalkgroups',
        talkgroups: tgData.talkgroups.reduce((
          agg: AudioState['talkgroups'],
          item
        ) => {
          agg[item.ID.toString()] = {
            name: item.Name || item.ID.toString(),
            selectName: `${item.Name || `Talkgroup ID ${item.ID}`}`,
          };

          return agg;
        }, {}),
      });
    })();
  }, [addAlert]);

  const setFilePlaying = (file: string) => () => {
    dispatch({
      action: 'SetPlayerFile',
      file,
    });
  }

  const [scrollTop, setScrollTop] = useState<number>(-1);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const beforeRenderRows = (num: number) => {
    if (tableRef.current) {
      const firstVisibleRow = [ ...tableRef.current.querySelectorAll('tr') ]
        .findIndex(isElemInView);
      if (firstVisibleRow !== -1) {
        setScrollTop(firstVisibleRow + num);
      }
    } else {
      setScrollTop(num);
    }
  }

  const [
    loadAfter,
    loadBefore,
  ] = useLoadFiles(state, dispatch, beforeRenderRows, scrollTop);
  const loadAfterIdx = 0;
  const loadBeforeIdx = state.files.length - 1;
  const [
    currentRef,
    currentRefInView,
    currentRefValue,
  ] = useRefIntersection();
  const [showUpArrow, setShowUpArrow] = useState(false);
  const [showDownArrow, setShowDownArrow] = useState(false);
  useEffect(() => {
    // Exit early for null
    if (currentRefInView === null || currentRefValue === null)
      return;

    // If the row is in view, don't show arrows
    if (currentRefInView) {
      setShowUpArrow(false);
      setShowDownArrow(false);
      return;
    }

    // Show the arrows if the ref is not in view
    const { top } = currentRefValue.getBoundingClientRect();
    if (top < 0) {
      setShowUpArrow(true);
      setShowDownArrow(false);
    } else {
      setShowUpArrow(false);
      setShowDownArrow(true);
    }
  }, [currentRefInView, currentRefValue]);
  const scrollCurrentIntoView = useCallback(() => {
    if (currentRefValue === null) return;

    currentRefValue.scrollIntoView({ block: 'center' });
  }, [currentRefValue]);

  const scrollToRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (
      scrollToRef.current
      && !isElemInView(scrollToRef.current)
      && scrollTop !== -1
    ) {
      addEventListener(
        "scrollend",
        () => setScrollTop(-1),
        { once: true }
      );
      scrollToRef.current.scrollIntoView({ block: 'center' });
    } else if (scrollTop !== -1) {
      setScrollTop(-1);
    }
  }, [scrollTop]);

  const [winWidth, setWinWidth] = useState<null | number>(null);
  useEffect(() => {
    const resizeListen = () => setWinWidth(window.document.documentElement.clientWidth);
    window.addEventListener('resize', resizeListen);
    resizeListen();
    return () => window.removeEventListener('resize', resizeListen);
  }, []);
  const hideTower = winWidth && winWidth < 576;

  return (<>
    {showUpArrow && <Button
      className={styles.upArrowButton}
      onClick={scrollCurrentIntoView}
    ><BsChevronUp /></Button>}
    {showDownArrow && <Button
      className={styles.downArrowButton}
      onClick={scrollCurrentIntoView}
    ><BsChevronDown /></Button>}

    {state.files.length > 0 && <Table
      responsive={true}
      ref={tableRef}
    >
      <thead>
        <tr>
          <th>Len</th>
          <th>Talkgroup</th>
          <th>Date</th>
          <th className="d-none d-sm-table-cell">Tower</th>
          <th><BsStarFill /></th>
        </tr>
      </thead>
      <tbody>
        {state.files.map((file, idx) => {
          const refs: ((node: HTMLElement | null) => void)[] = [];
          if (idx === loadBeforeIdx) {
            refs.push(loadBefore);
          }
          if (idx === loadAfterIdx) {
            refs.push(loadAfter);
          }
          if (file.Key === state.player.fileUrl) {
            refs.push(currentRef);
          }
          if (idx === scrollTop) {
            refs.push(node => scrollToRef.current = node);
          }
          const params: {
            ref?: (node: HTMLTableRowElement) => void;
          } = {};
          if (refs.length > 0) {
            params.ref = (item: HTMLElement) => {
              refs.forEach(ref => ref(item));

              return () => {
                refs.forEach(ref => ref(null));
              }
            };
          }

          return (<React.Fragment key={file.Key}>
            <tr
              {...params}
              className={
                [
                  file.Transcript && styles.noBottomBorder,
                  state.player.fileUrl === file.Key ? styles.fileRowActive : '',
                  styles.fileRow,
                  'align-middle',
                ].join(' ')
              }
              onClick={setFilePlaying(file.Key)}
            >
              <td>{file.Len}</td>
              <td className="text-start">{state.talkgroups[file.Talkgroup]?.name || file.Talkgroup}</td>
              <td>{dateToStr(new Date(file.StartTime * 1000))}</td>
              <td className="d-none d-sm-table-cell">{file.Tower === 'vhf'
                ? 'VHF'
                : file.Tower || 'N/A'
              }</td>
              <td>{!file.Tone && file.Emergency !== 1
                ? ''
                : file.Transcript
                  ? <BsStarFill />
                  : <BsStar />
              }</td>
            </tr>
            {file.Transcript && <tr
              className={
                [
                  state.player.fileUrl === file.Key ? styles.fileRowActive : '',
                  styles.fileRow,
                ].join(' ')
              }
              onClick={setFilePlaying(file.Key)}
            >
              <td></td>
              <td
                className="text-start"
                colSpan={hideTower ? 2 : 3}
              ><b>Approximate Transcript:</b> {file.Transcript}</td>
              <td></td>
            </tr>}
          </React.Fragment>)
      })}
      </tbody>
    </Table>}
    {state.files.length === 0 && <LoadingSpinner />}

    <AudioFilter
      state={state}
      dispatch={dispatch}
    />

    <CalendarModal
      state={state}
      dispatch={dispatch}
    />

    <AudioPlayerBar
      state={state}
      dispatch={dispatch}
    />
  </>);
}
