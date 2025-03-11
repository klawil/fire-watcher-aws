import { AudioAction, AudioState } from "@/types/audio";
import Nav from "react-bootstrap/Nav";
import Container from "react-bootstrap/Container";
import Navbar from "react-bootstrap/Navbar";
import { BsArrowBarUp, BsDownload, BsFilter, BsPauseFill, BsPlayFill } from "react-icons/bs";
import styles from './audioPlayerBar.module.css';
import { useEffect, useRef } from "react";
import AudioFilter from "../audioFilter/audioFilter";

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

  function toggleAutoplayButtonPress() {
    dispatch({
      action: 'TogglePlayerAutoplay',
    });
  }

  function playPauseButtonPress() {
    dispatch({
      action: 'SetPlayerState',
      state: state.player.state === 'playing'
        ? 'paused'
        : 'playing',
    });
  }

  const audioRef = useRef(new Audio());
  useEffect(() => {
    // Duration
    const audio = audioRef.current;

    audioRef.current.addEventListener('timeupdate', () => dispatch({
      action: 'SetPlayerTimestamp',
      timestamp: audioRef.current.currentTime,
      duration: audioRef.current.duration,
    }));
    audioRef.current.addEventListener('loadedmetadata', () => dispatch({
      action: 'SetPlayerDuration',
      duration: audioRef.current.duration,
      timestamp: audioRef.current.currentTime,
    }));
    audioRef.current.addEventListener('ended', () => dispatch({
      action: 'SetPlayerState',
      state: 'finished',
    }));
    audioRef.current.addEventListener('play', () => dispatch({
      action: 'SetPlayerState',
      state: 'playing',
    }));
    audioRef.current.addEventListener('paused', () => dispatch({
      action: 'SetPlayerState',
      state: 'playing',
    }));
  }, []);
  useEffect(() => {
    // Play/pause
    if (
      audioRef.current.src !== '' &&
      state.player.state === 'playing' &&
      audioRef.current.paused
    ) {
      audioRef.current.play();
    } else if (
      audioRef.current.src !== '' &&
      !audioRef.current.paused
    ) {
      audioRef.current.pause();
    }
  }, [state.player.state]);
  useEffect(() => {
    // Source updates
    if (
      state.player.file &&
      audioRef.current.src !== state.player.file
    ) {
      audioRef.current.src = state.player.file;
      audioRef.current.play()
        .catch(() => dispatch({
          action: 'SetPlayerState',
          state: 'paused',
        }));
    }
  }, [state.player.file]);

  return (<>
    <AudioFilter
      state={state}
      dispatch={dispatch}
    />
    <Navbar
      fixed="bottom"
      expand="lg"
      bg="dark"
      style={{
        borderTop: 'solid 1px grey',
      }}
    >
      <Container fluid={true}>
        <Navbar.Toggle
          onClick={toggleAutoplayButtonPress}
          className={state.player.autoPlay ? styles.playerButtonActive : ''}
        ><BsArrowBarUp /></Navbar.Toggle>
        <Navbar.Toggle onClick={playPauseButtonPress}>
          {state.player.state === 'playing' ? <BsPauseFill /> : <BsPlayFill />}
        </Navbar.Toggle>
        <Navbar.Toggle><BsDownload /></Navbar.Toggle>

        <Nav className="mb-2 mb-lg-0">
          <Nav.Item
            onClick={toggleAutoplayButtonPress}
          ><Nav.Link active={state.player.autoPlay}>
            <BsArrowBarUp className="me-2" />
          </Nav.Link></Nav.Item>
          <Nav.Item
            onClick={playPauseButtonPress}
          ><Nav.Link active={state.player.autoPlay}>
            {state.player.state === 'playing'
              ? <BsPauseFill className="me-2"/>
              : <BsPlayFill className="me-2" />}
          </Nav.Link></Nav.Item>
          {state.player.file && <Nav.Item><Nav.Link
            href={state.player.file}
            download={state.player.file.split('/').pop() || state.player.file}
          ><BsDownload className="me-2" /></Nav.Link></Nav.Item>}
        </Nav>
        <Navbar.Text>
          <div className={`${styles.progressBarContainer} progress ms-1 mt-1`}>
            <div
              className="progress-bar"
              role="progressbar"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={playerProgress}
              style={{
                width: `${playerProgress}%`,
              }}
            ></div>
          </div>
        </Navbar.Text>

        <Nav className="mb-2 mb-lg-0">
          <Nav.Item
            onClick={() => dispatch({
              action: 'SetFilterDisplay',
              state: !state.filters.showFilterModal,
            })}
          ><Nav.Link
            active={state.filters.showFilterModal}
          ><BsFilter /></Nav.Link></Nav.Item>
        </Nav>
      </Container>
    </Navbar>
  </>)
}
