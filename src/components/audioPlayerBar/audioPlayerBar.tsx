import {
  AudioAction, AudioState
} from '@/types/frontend/audio';
import Nav from 'react-bootstrap/Nav';
import Container from 'react-bootstrap/Container';
import Navbar from 'react-bootstrap/Navbar';
import {
  BsArrowBarUp, BsCalendar, BsDownload, BsFilter, BsPauseFill, BsPlayFill
} from 'react-icons/bs';
import styles from './audioPlayerBar.module.css';
import {
  useEffect, useRef, useState
} from 'react';
import { useSearchParams } from 'next/navigation';
import Button from 'react-bootstrap/Button';
import { findClosestFileIdx } from '@/utils/common/dateAndFile';

function timeToStr(timestamp?: number, duration?: number) {
  if (
    typeof timestamp === 'undefined' ||
    typeof duration === 'undefined' ||
    Number.isNaN(timestamp) ||
    Number.isNaN(duration)
  ) {
    return '- / -';
  }

  const includeMinutes = duration >= 60;
  let durationVal = Math.round(duration * 10) / 10;
  let timestampVal = Math.round(timestamp * 10) / 10;
  let durationStr = '';
  let timestampStr = '';
  if (includeMinutes) {
    const durationMinutes = Math.floor(durationVal / 60);
    durationVal -= durationMinutes * 60;
    durationStr = `${durationMinutes}:`;

    const timestampMinutes = Math.floor(timestampVal / 60);
    timestampVal -= timestampMinutes * 60;
    timestampStr = `${timestampMinutes}:`;
  }
  durationStr += `${durationVal.toFixed(1).padStart(4, '0')}`;
  timestampStr += `${timestampVal.toFixed(1).padStart(4, '0')}`;
  return `${timestampStr} / ${durationStr}`;
}

export default function AudioPlayerBar({
  state,
  dispatch,
}: Readonly<{
  state: AudioState;
  dispatch: React.ActionDispatch<[AudioAction]>;
}>) {
  const playerProgress = typeof state.player.duration === 'undefined' ||
    typeof state.player.timestamp === 'undefined' ||
    state.player.duration === 0
    ? 0
    : Math.round(100 * state.player.timestamp / state.player.duration);
  const playerDuration = timeToStr(state.player.timestamp, state.player.duration);

  const [
    autoPlay,
    setAutoPlay,
  ] = useState(true);

  function playPauseButtonPress() {
    dispatch({
      action: 'SetPlayerState',
      state: state.player.state === 'playing'
        ? 'paused'
        : 'playing',
    });
  }

  // Add listeners for duration, start, and stop
  const audioRef = useRef(new Audio());
  const [
    wasEnded,
    setWasEnded,
  ] = useState(false);
  useEffect(() => {
    // Callbacks
    const setPlayerTimes = () => {
      if (wasEnded) return;
      if (audioRef.current.ended) {
        setWasEnded(true);
      }
      dispatch({
        action: 'SetPlayerTimes',
        timestamp: audioRef.current.currentTime,
        duration: audioRef.current.duration,
      });
    };
    const ended = () => dispatch({
      action: 'SetPlayerState',
      state: 'ended',
    });
    const playing = () => {
      setWasEnded(false);
      dispatch({
        action: 'SetPlayerState',
        state: 'playing',
      });
    };
    const paused = () => dispatch({
      action: 'SetPlayerState',
      state: audioRef.current.ended ? 'ended' : 'paused',
    });

    const currentAudio = audioRef.current;

    // Add the listeners
    currentAudio.addEventListener('timeupdate', setPlayerTimes);
    currentAudio.addEventListener('loadedmetadata', setPlayerTimes);
    currentAudio.addEventListener('ended', ended);
    currentAudio.addEventListener('play', playing);
    currentAudio.addEventListener('paused', paused);

    return () => {
      currentAudio.removeEventListener('timeupdate', setPlayerTimes);
      currentAudio.removeEventListener('loadedmetadata', setPlayerTimes);
      currentAudio.removeEventListener('ended', ended);
      currentAudio.removeEventListener('play', playing);
      currentAudio.removeEventListener('paused', paused);
    };
  }, [
    dispatch,
    wasEnded,
  ]);

  // Add effects that process changes to the player
  useEffect(() => {
    // Check for a source change
    if (
      state.player.fileUrl &&
      !audioRef.current.src.includes(state.player.fileUrl)
    ) {
      audioRef.current.src = state.player.fileUrl;
    } else if (
      !state.player.fileUrl &&
      state.files.length > 0
    ) {
      let closestIdx = 0;
      if (state.filter.f) {
        closestIdx = findClosestFileIdx(
          state.files,
          state.filter.f
        );
      }
      dispatch({
        action: 'SetPlayerFile',
        file: state.files[closestIdx].Key,
      });
      return;
    } else if (!state.player.fileUrl) {
      if (typeof state.player.duration !== 'undefined') {
        dispatch({
          action: 'ClearPlayer',
        });
      }
      return;
    }

    // Play/pause
    if (
      audioRef.current.src.includes('audio') &&
      state.player.state === 'playing' &&
      audioRef.current.paused
    ) {
      audioRef.current.play()
        .catch(e => {
          console.log('Failed to play file', e);
          dispatch({
            action: 'SetPlayerState',
            state: 'paused',
          });
        });
    } else if (
      audioRef.current.src.includes('audio') &&
      (state.player.state === 'paused' || state.player.state === 'ended') &&
      !audioRef.current.paused
    ) {
      audioRef.current.pause();
    }
  }, [
    state.player.state,
    state.player.fileUrl,
    state.player.duration,
    state.files,
    dispatch,
    state.filter.f,
  ]);

  // Keep the URL updated
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!state.player.fileUrl) return;

    // Check for a change in the file URL
    if (!state.player.fileUrl.endsWith(searchParams.get('f') || 'NONE')) {
      const newParams = new URLSearchParams(searchParams.toString());
      const newF = state.player.fileUrl?.split('/').pop();
      if (typeof newF !== 'undefined') {
        newParams.set('f', newF);
        window.history.replaceState(null, '', `?${newParams.toString()}`);
      }
    }
  }, [
    searchParams,
    state.player.fileUrl,
  ]);

  // Auto play the next file
  useEffect(() => {
    if (
      !autoPlay ||
      state.player.state !== 'ended' ||
      state.files.length === 0
    ) return;

    const currentFileIndex = state.files.findIndex(f => f.Key === state.player.fileUrl);
    if (currentFileIndex <= 0) return;

    dispatch({
      action: 'SetPlayerFile',
      file: state.files[currentFileIndex - 1].Key,
    });
  }, [
    autoPlay,
    dispatch,
    state.files,
    state.player.fileUrl,
    state.player.state,
  ]);

  return <>
    <Navbar
      fixed='bottom'
      expand='lg'
      className='bg-body-tertiary'
      style={{
        borderTop: 'solid 1px grey',
      }}
    >
      <Container fluid={true}>
        <Button
          variant={autoPlay ? 'outline-primary' : 'outline-secondary'}
          className='d-flex justify-content-center d-lg-none'
          disabled={!state.player.fileUrl}
          onClick={() => setAutoPlay(!autoPlay)}
        ><BsArrowBarUp /></Button>
        <Button
          onClick={playPauseButtonPress}
          variant={state.player.state === 'playing' ? 'outline-secondary' : 'outline-success'}
          className='d-flex justify-content-center d-lg-none'
          disabled={!state.player.fileUrl}
        >{state.player.state !== 'playing' ? <BsPlayFill /> : <BsPauseFill />}</Button>

        <Nav className='mb-2 mb-lg-0 justify-content-start d-none d-lg-flex'>
          <Nav.Item
            onClick={() => setAutoPlay(!autoPlay)}
          ><Nav.Link
              active={autoPlay}
            >
              <BsArrowBarUp /> Auto Play Next File
            </Nav.Link></Nav.Item>
          <Nav.Item
            onClick={playPauseButtonPress}
          ><Nav.Link active={state.player.state === 'playing'}>
              {state.player.state === 'playing'
                ? <><BsPauseFill /> Pause</>
                : <><BsPlayFill /> Play</>}
            </Nav.Link></Nav.Item>
        </Nav>

        <Navbar.Text>
          <div className={`${styles.progressBarContainer} progress ms-1 mt-1`}>
            <div
              className='progress-bar'
              role='progressbar'
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={playerProgress}
              style={{
                width: `${playerProgress}%`,
              }}
            ></div>
          </div>
        </Navbar.Text>
        <Navbar.Text className='ms-2 mt-1 d-none d-sm-block'>{playerDuration}</Navbar.Text>

        <Navbar.Toggle aria-controls='audio-navbar-collapse' />
        <Navbar.Collapse id='audio-navbar-collapse'>
          <Nav className='ms-auto'>
            <Nav.Link
              disabled={!state.player.fileUrl}
              href={state.player.fileUrl}
              download={state.player.fileUrl?.split('/').pop() || state.player.fileUrl}
            ><BsDownload /> Download File</Nav.Link>
            <Nav.Link
              active={state.filterModalOpen}
              onClick={() => dispatch({
                action: state.filterModalOpen ? 'CloseFilterModal' : 'OpenFilterModal',
              })}
            ><BsFilter /> Filter Files</Nav.Link>
            <Nav.Link
              active={state.calendarModalOpen}
              onClick={() => dispatch({
                action: state.calendarModalOpen ? 'CloseCalendarModal' : 'OpenCalendarModal',
              })}
            ><BsCalendar /> Jump to Time</Nav.Link>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  </>;
}
