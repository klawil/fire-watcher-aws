'use client';

import Table from "react-bootstrap/Table";
import { BsStar, BsStarFill } from "react-icons/bs";
import React, { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AudioAction, AudioState } from "@/types/audio";
import { audioReducer, defaultAudioState } from "@/logic/audioState";
import { dateToStr } from "@/logic/dateAndFile";
import { ApiAudioListResponse, ApiAudioTalkgroupsResponse } from "$/audioApi";
import styles from './audioList.module.css';
import { useDarkMode } from "@/logic/clientHooks";
import AudioPlayerBar from "../audioPlayerBar/audioPlayerBar";
import { useSearchParams } from "next/navigation";
import LoadingSpinner from "../loadingSpinner/loadingSpinner";

function useRefIntersection(): [
  // React.RefObject<HTMLTableRowElement | null>,
  (node: HTMLTableRowElement | null) => void,
  boolean,
] {
  const [node, setNode] = useState<HTMLTableRowElement | null>(null);

  const [refIntersecting, setRefIntersecting] = useState(false);

  const setRef = useCallback(
    (node: HTMLTableRowElement | null) => setNode(node),
    [],
  );

  useEffect(() => {
    if (node === null) return;

    const observer = new IntersectionObserver(
      ([entry]) => setRefIntersecting(entry.isIntersecting),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [setRef, refIntersecting];
}

function useLoadFiles(
  state: AudioState,
  dispatch: React.ActionDispatch<[AudioAction]>,
) {
  const [afterRef, afterRefIntersecting] = useRefIntersection();
  const [beforeRef, beforeRefIntersecting] = useRefIntersection();
  const runIds = useRef<{
    before?: number;
    after?: number;
  }>({})

  useEffect(() => {
    // Wait for the query to be parsed
    if (!state.filters.queryParsed) return;

    // Should we load files?
    // - after or before ref are in view
    // - number of files is 0 AND no lastCall for any value
    if (
      !afterRefIntersecting &&
      !beforeRefIntersecting &&
      !(
        state.files.length === 0 &&
        typeof runIds.current.after === 'undefined' &&
        typeof runIds.current.before === 'undefined'
      )
    ) return;

    // Check to make sure that we aren't re-running a request
    if (
      (
        afterRefIntersecting &&
        typeof runIds.current.after !== 'undefined'
      ) ||
      (
        beforeRefIntersecting &&
        typeof runIds.current.before !== 'undefined'
      )
    ) return;

    (async () => {
      const direction = beforeRefIntersecting
        ? 'before'
        : 'after';
      const callId = Date.now();
      runIds.current[direction] = callId;

      const urlParams: URLSearchParams = new URLSearchParams();
      urlParams.set('action', 'list');
      if (
        direction === 'before' &&
        state.api.before
      ) {
        urlParams.set('before', state.api.before.toString());
      } else if (
        direction === 'after' &&
        state.api.after
      ) {
        urlParams.set('after', state.api.after.toString());
      } // @TODO - implement afterAdded

      if (state.filters.tgRawValue) {
        urlParams.set('tg', state.filters.tgRawValue);
      }
      if (state.filters.emergValue) {
        urlParams.set('emerg', state.filters.emergValue);
      }

      const url = `/api/audio?${urlParams.toString()}`;
      try {
        const newData: ApiAudioListResponse = await fetch(url)
          .then(r => r.json());

        // Check for being the correct call ID
        if (runIds.current[direction] !== callId)
          throw new Error(`Not the current call - ${callId} - ${runIds.current[direction]}`);

        // Check for API success
        if (!newData.success)
          throw new Error(JSON.stringify(newData));

        // Set the new before/after/afterAdded values
        if (
          newData.before &&
          (
            !state.api.before ||
            state.api.before > newData.before
          )
        ) {
          dispatch({
            action: 'SetApiKey',
            key: 'before',
            value: newData.before,
          });
        }
        if (
          newData.after &&
          (
            !state.api.after ||
            state.api.after > newData.after
          )
        ) {
          dispatch({
            action: 'SetApiKey',
            key: 'after',
            value: newData.after,
          });
        }
        if (
          newData.afterAdded &&
          (
            !state.api.afterAdded ||
            state.api.afterAdded > newData.afterAdded
          )
        ) {
          dispatch({
            action: 'SetApiKey',
            key: 'afterAdded',
            value: newData.afterAdded,
          });
        }

        // Actually add the files to state
        if (
          newData.files &&
          newData.files.length > 0
        )
          dispatch({
            action: 'AddAudioFile',
            files: newData.files,
            location: direction,
          });
      } catch (e) {
        console.error(`Error fetching data`, e, url);
      }

      delete runIds.current[direction];
    })();
  }, [
    state.api,
    state.filters,
    afterRefIntersecting,
    beforeRefIntersecting,
  ]);

  useEffect(() => console.log('after', afterRefIntersecting), [afterRefIntersecting]);
  useEffect(() => console.log('before', beforeRefIntersecting), [beforeRefIntersecting]);

  return [afterRef, beforeRef];
}

export default function AudioList() {
  const [state, dispatch] = useReducer<
    AudioState,
    [ AudioAction ]
  >(audioReducer, defaultAudioState);
  const darkMode = useDarkMode();

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

  const searchParams = useSearchParams();
  useEffect(() => {
    if (
      searchParams.get('f') === null ||
      typeof state.player.file !== 'undefined' ||
      state.files.length === 0
    ) return;

    // Find the file key
    const fileKey = searchParams.get('f') || 'NONE';
    let file: null | string = null;
    for (let i = 0; i < state.files.length; i++) {
      if (state.files[i].Key.includes(fileKey)) {
        file = state.files[i].Key;
        break;
      }
    }

    if (file !== null) {
      dispatch({
        action: 'SetPlayerFile',
        file,
      });
    }
  }, [state.files, state.player.file, searchParams]);
  useEffect(() => {
    if (
      typeof state.player.file === 'undefined' ||
      state.files.length === 0
    ) return;

    if (!state.player.file.includes(searchParams.get('f') || 'NONE')) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('f', state.player.file.split('/').pop() || '');
      window.history.replaceState(null, '', `?${params.toString()}`);
    }
  }, [ state.player.file, searchParams ]);

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
    : state.files.length;

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
        {state.files.map((file, idx) => (<React.Fragment key={file.Key}>
          <tr
            {...(
              idx === loadBeforeIdx
                ? { ref: loadBefore }
                : idx === loadAfterIdx
                  ? { ref: loadAfter }
                  : {}
            )}
            className={
              [
                file.Transcript && styles.noBottomBorder,
                state.player.file === file.Key && styles[`fileRowActive-${darkMode ? 'dark' : 'light'}`],
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
                state.player.file === file.Key && styles[`fileRowActive-${darkMode ? 'dark' : 'light'}`],
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
        </React.Fragment>))}
      </tbody>
    </Table>
    : <LoadingSpinner />
    }

    <AudioPlayerBar
      state={state}
      dispatch={dispatch}
    />
  </>);
}
