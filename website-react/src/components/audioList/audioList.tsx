'use client';

import Table from "react-bootstrap/Table";
import { BsStar, BsStarFill } from "react-icons/bs";
import React, { useEffect, useReducer, useRef, useState } from "react";
import { AudioAction, AudioState, filterPresets, FilterPresetUrlParams } from "@/types/audio";
import { audioReducer, defaultAudioState } from "@/logic/audioState";
import { dateToStr } from "@/logic/dateAndFile";
import { ApiAudioListResponse, ApiAudioTalkgroupsResponse } from "$/audioApi";
import styles from './audioList.module.css';
import AudioPlayerBar from "../audioPlayerBar/audioPlayerBar";
// import { useSearchParams } from "next/navigation";
import LoadingSpinner from "../loadingSpinner/loadingSpinner";
import { useRefIntersection } from "@/logic/uiUtils";
import AudioFilter from "../audioFilter/audioFilter";
import { fNameToDate } from "$/stringManipulation";

const loadAfterAddedMinWait = 10000;

function useLoadFiles(
  state: AudioState,
  dispatch: React.ActionDispatch<[AudioAction]>,
) {
  const [afterRef, afterRefIntersecting] = useRefIntersection();
  const [beforeRef, beforeRefIntersecting] = useRefIntersection();

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
      dispatch({
        action: 'AddAudioFile',
        files: responseToParse.files,
        location: responseToParse.direction,
      });
    }

    dispatch({
      action: 'ClearApiResponse',
      direction: responseToParse.direction,
    });
  }, [state.apiResponse, state.api, dispatch]);

  const afterAddedTimeout = useRef<NodeJS.Timeout | null>(null);
  const [afterAddedLastCall, setAfterAddedLastCall] = useState<number | null>(0);
  const [afterAddedTrigger, setAfterAddedTrigger] = useState(false);

  useEffect(() => {
    // Wait for the query to be parsed
    if (!state.queryParsed) return;

    // If the API keys are not set then load files
    let shouldLoadFiles = false;
    let loadFilesDirection: 'before' | 'after' = 'after';
    if (Object.keys(state.api).length === 0) {
      shouldLoadFiles = true;
    } else if (
      afterRefIntersecting && typeof state.api.afterLastCall === 'undefined'
    ) {
      shouldLoadFiles = true;
      loadFilesDirection = 'after';
    } else if (
      beforeRefIntersecting && typeof state.api.beforeLastCall === 'undefined'
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
        loadFilesDirection === 'after' &&
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
        key: loadFilesDirection,
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

        // Make sure we aren't overwriting a response (super hacky...)

        dispatch({
          action: 'AddApiResponse',
          ...newData,
          callId,
          direction: loadFilesDirection,
        });
      } catch (e) {
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
  }, []);

  const setFilePlaying = (file: string) => () => {
    dispatch({
      action: 'SetPlayerFile',
      file,
    });
  }

  const [
    loadAfter,
    loadBefore,
  ] = useLoadFiles(state, dispatch);
  const loadAfterIdx = state.files.length >= 5
    ? 4
    : 0;
  const loadBeforeIdx = state.files.length >= 5
    ? state.files.length - 5
    : state.files.length - 1;
  const currentRef = useRef<HTMLElement | null>(null);

  return (<>
    {state.files.length > 0
    ? <Table
      responsive={true}
    >
      <thead>
        <tr>
          <th>Len</th>
          <th>Talkgroup</th>
          <th>Date</th>
          <th className={styles.hideSmall}>Tower</th>
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
            refs.push((node) => currentRef.current = node);
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
                ].join(' ')
              }
              onClick={setFilePlaying(file.Key)}
            >
              <td>{file.Len}</td>
              <td className="text-start">{state.talkgroups[file.Talkgroup]?.name || file.Talkgroup}</td>
              <td>{dateToStr(new Date(file.StartTime * 1000))}</td>
              <td className={styles.hideSmall}>{file.Tower === 'vhf'
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
                colSpan={3}
              ><b>Approximate Transcript:</b> {file.Transcript}</td>
              <td></td>
            </tr>}
          </React.Fragment>)
      })}
      </tbody>
    </Table>
    : <LoadingSpinner />
    }

    <AudioFilter
      state={state}
      dispatch={dispatch}
    />

    <AudioPlayerBar
      state={state}
      dispatch={dispatch}
    />
  </>);
}
