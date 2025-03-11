'use client';

import Table from "react-bootstrap/Table";
import { BsStar, BsStarFill } from "react-icons/bs";
import React, { useEffect, useReducer } from "react";
import { AudioAction, AudioState } from "@/types/audio";
import { audioReducer, defaultAudioState } from "@/logic/audioState";
import { dateToStr } from "@/logic/dateAndFile";
import { ApiAudioListResponse, ApiAudioTalkgroupsResponse, AudioFileObject } from "$/audioApi";
import styles from './audioList.module.css';
import { useDarkMode } from "@/logic/clientHooks";
import AudioPlayerBar from "../audioPlayerBar/audioPlayerBar";
import { useSearchParams } from "next/navigation";
import LoadingSpinner from "../loadingSpinner/loadingSpinner";

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

  useEffect(() => {
    (async () => {
      const fileData: ApiAudioListResponse = await fetch(`/api/audio?action=list&tg=${encodeURIComponent('8332|8333|18332')}`)
        .then(r => r.json());
      
      if (!fileData.success || typeof fileData.files === 'undefined') return;

      dispatch({
        action: 'AddAudioFile',
        files: fileData.files,
        location: 'before',
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
        {state.files.map(file => (<React.Fragment key={file.Key}>
          <tr
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
