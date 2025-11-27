'use client';

import React, {
  useCallback,
  useContext, useEffect, useRef, useState
} from 'react';
import {
  Container, Form, Modal, Nav, Navbar
} from 'react-bootstrap';
import Button from 'react-bootstrap/Button';
import Table from 'react-bootstrap/Table';
import {
  BsFilter,
  BsPauseFill, BsPlayFill
} from 'react-icons/bs';

import styles from '@/components/audioList/audioList.module.css';
import progressStyles from '@/components/audioPlayerBar/audioPlayerBar.module.css';
import LoadingSpinner from '@/components/loadingSpinner/loadingSpinner';
import { FullFileObject } from '@/types/api/files';
import { GetPagesApi } from '@/types/api/pages';
import {
  PagingTalkgroup, pagingTalkgroups
} from '@/types/api/users';
import { pagingTalkgroupConfig } from '@/types/backend/department';
import { dateToStr } from '@/utils/common/dateAndFile';
import { getLogger } from '@/utils/common/logger';
import { AddAlertContext } from '@/utils/frontend/clientContexts';
import { typeFetch } from '@/utils/frontend/typeFetch';
import { useRefIntersection } from '@/utils/frontend/uiUtils';

const logger = getLogger('pagesPage');

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
  let durationVal = Math.round(duration);
  let timestampVal = Math.round(timestamp);
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
  durationStr += `${durationVal.toString().padStart(2, '0')}`;
  timestampStr += `${timestampVal.toString().padStart(2, '0')}`;
  return `${timestampStr} / ${durationStr}`;
}

export default function PagesPage() {
  const [
    pages,
    setPages,
  ] = useState<FullFileObject[]>([]);
  const [
    allLoaded,
    setAllLoaded,
  ] = useState(false);
  const [
    lastLoad,
    setLastLoad,
  ] = useState(0);

  const [
    loadMoreRef,
    loadMoreRefInView,
  ] = useRefIntersection();
  const addAlert = useContext(AddAlertContext);

  const audioRef = useRef(new Audio());
  const [
    playerState,
    setPlayerState,
  ] = useState<{
    file: string | null;
    state: 'playing' | 'paused';
    timestamp: number;
    duration: number;
  }>({
    file: null,
    state: 'paused',
    timestamp: 0,
    duration: 0,
  });
  // Play new files
  useEffect(() => {
    if (playerState.file === null) {
      return;
    }

    audioRef.current.src = `/${playerState.file}`;
    audioRef.current.currentTime = 0;
    audioRef.current.play()
      .catch(e => {
        logger.error('Failed to play file', e);
        addAlert('danger', 'Failed to play file');
      });
    setPlayerState(cur => ({
      ...cur,
      state: 'playing',
    }));
  }, [
    playerState.file,
    addAlert,
  ]);
  // Track player state
  useEffect(() => {
    // Callbacks
    const setPlayerTimes = () => setPlayerState(cur => ({
      ...cur,
      timestamp: audioRef.current.currentTime,
      duration: audioRef.current.duration,
    }));
    const ended = () => setPlayerState(cur => ({
      ...cur,
      state: 'paused',
    }));

    // Add the listeners
    const currentAudio = audioRef.current;
    currentAudio.addEventListener('timeupdate', setPlayerTimes);
    currentAudio.addEventListener('loadedmetadata', setPlayerTimes);
    currentAudio.addEventListener('ended', ended);
    currentAudio.addEventListener('error', ended);
  });

  // Filter modal
  const [
    filterModalOpen,
    setFilterModalOpen,
  ] = useState<boolean>(false);
  const [
    tgFilter,
    setTgFilterRaw,
  ] = useState<PagingTalkgroup[]>([]);
  const [
    tgChanges,
    setTgChanges,
  ] = useState<Partial<{
    [key in PagingTalkgroup]: boolean;
  }>>({});
  const parseTgFilterChanges = useCallback(() => {
    if (Object.keys(tgChanges).length === 0) {
      return;
    }

    setTgFilterRaw(cur => {
      return [
        ...cur.filter(v => typeof tgChanges[v] === 'undefined'),
        ...(Object.keys(tgChanges) as unknown as (keyof typeof tgChanges)[])
          .filter(k => tgChanges[k]),
      ];
    });

    setPages([]);
    setAllLoaded(false);
    setLastLoad(0);
  }, [ tgChanges, ]);

  useEffect(() => logger.warn('Tg Filter:', tgFilter), [ tgFilter, ]);

  // Load the pages
  useEffect(() => {
    if (
      allLoaded ||
      (pages.length > 0 && loadMoreRefInView === false) ||
      Date.now() - lastLoad <= 2000
    ) {
      return;
    }

    let useResult = true;
    (async () => {
      const [
        code,
        apiResult,
      ] = await typeFetch<GetPagesApi>({
        path: '/api/v2/pages/',
        method: 'GET',
        query: {
          ...pages.length > 0
            ? {
              before: pages[pages.length - 1].StartTime || Date.now(),
            }
            : {},
          ...tgFilter.length > 0
            ? {
              tg: tgFilter,
            }
            : {},
        },
      });

      if (!useResult) {
        return;
      }

      if (
        code !== 200 ||
        apiResult === null ||
        'message' in apiResult
      ) {
        addAlert('danger', 'Failed to get pages');
        logger.error('Failed to get pages', code, apiResult);
        return;
      }

      if (
        apiResult.files.length === 0
      ) {
        addAlert('info', 'No more pages to load');
        setAllLoaded(true);
        return;
      }

      setPages(old => [
        ...old,
        ...apiResult.files,
      ]);
      setLastLoad(Date.now());
    })();

    return () => {
      useResult = false;
    };
  }, [
    allLoaded,
    lastLoad,
    loadMoreRefInView,
    pages,
    addAlert,
    tgFilter,
  ]);

  const playFile = (file: string | undefined) => {
    if (typeof file === 'undefined') {
      return;
    }

    setPlayerState(cur => ({
      ...cur,
      file,
    }));
  };

  const playPauseButtonPress = useCallback(() => {
    logger.warn('playPauseCallback');
    if (playerState.state === 'playing') {
      audioRef.current.pause();
      setPlayerState(cur => ({
        ...cur,
        state: 'paused',
      }));
    } else {
      audioRef.current.play();
      setPlayerState(cur => ({
        ...cur,
        state: 'playing',
      }));
    }
  }, [ playerState.state, ]);

  const loadNextBatchRefIdx = pages.length - 1;
  const playerProgress = typeof playerState.duration === 'undefined' ||
    typeof playerState.timestamp === 'undefined' ||
    playerState.duration === 0
    ? 0
    : Math.round(100 * playerState.timestamp / playerState.duration);
  const playerDuration = timeToStr(playerState.timestamp, playerState.duration);

  return <>
    {pages.length > 0 && <Table responsive className='align-middle'>
      <thead className='floatHead'><tr className='text-center'>
        <th>Len</th>
        <th>Department</th>
        <th>Date</th>
        <th>Tower</th>
        <th>{/* Link */}</th>
      </tr></thead>
      <tbody>
        {pages.map((file, idx) => <React.Fragment key={idx}>
          <tr
            onClick={() => playFile(file.Key)}
            className={
              [
                file.Transcript && styles.noBottomBorder,
                playerState.file === file.Key ? styles.fileRowActive : '',
                styles.fileRow,
                'align-middle',
              ].join(' ')
            }
            {...idx === loadNextBatchRefIdx
              ? { ref: loadMoreRef, }
              : {}
            }
          >
            <td>{file.Len}</td>
            <td className='text-start'>{
              typeof pagingTalkgroupConfig[file.Talkgroup as PagingTalkgroup] !== 'undefined'
                ? pagingTalkgroupConfig[file.Talkgroup as PagingTalkgroup].partyBeingPaged
                : `TG ${file.Talkgroup}`
            }</td>
            <td>{dateToStr(new Date((file.StartTime || 0) * 1000))}</td>
            <td>{file.Tower === 'vhf'
              ? 'VHF'
              : file.Tower || 'N/A'
            }</td>
            <td><Button
              onClick={e => e.stopPropagation()}
              href={`/?tg=${file.Talkgroup}&f=${file.Key?.split('/').pop()}`}
            >Jump To</Button></td>
          </tr>
          {file.Transcript && <tr
            onClick={() => playFile(file.Key)}
            className={[
              styles.fileRow,
              playerState.file === file.Key ? styles.fileRowActive : '',
            ].join(' ')}
          >
            <td></td>
            <td
              className='text-start'
              colSpan={4}
            ><b>Approximate Transcript:</b> {file.Transcript}</td>
          </tr>}
        </React.Fragment>)}
      </tbody>
    </Table>}
    {pages.length === 0 && lastLoad === 0 && <LoadingSpinner />}
    {pages.length === 0 && lastLoad > 0 && <h3 className='text-center'>No Pages Found</h3>}
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
          onClick={playPauseButtonPress}
          variant={playerState.state === 'playing' ? 'outline-secondary' : 'outline-success'}
          className='d-flex justify-content-center d-lg-none'
        >{playerState.state !== 'playing' ? <BsPlayFill /> : <BsPauseFill />}</Button>

        <Nav className='mb-2 mb-lg-0 justify-content-start d-none d-lg-flex'>
          <Nav.Item
            onClick={playPauseButtonPress}
          >
            <Nav.Link active={playerState.state === 'playing'}>
              {playerState.state === 'playing'
                ? <><BsPauseFill /> Pause</>
                : <><BsPlayFill /> Play</>}
            </Nav.Link>
          </Nav.Item>
        </Nav>

        <Navbar.Text>
          <div
            className={`${progressStyles.progressBarContainer} progress ms-1 mt-1`}
            onClick={e => {
              if (playerState.duration > 0) {
                const target = e.currentTarget;
                const rect = target.getBoundingClientRect();
                const percent = (e.pageX - rect.x) / rect.width;
                const newValue = Math.round(percent * playerState.duration * 10) / 10;
                audioRef.current.currentTime = newValue;
              }
            }}>
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
        <Nav className='ms-auto'>
          <Nav.Link
            active={filterModalOpen}
            onClick={() => setFilterModalOpen(old => !old)}
          ><BsFilter /></Nav.Link>
        </Nav>
      </Container>
    </Navbar>
    <Modal
      show={filterModalOpen}
      onHide={() => {
        setFilterModalOpen(false);
      }}
      onShow={() => setTgChanges(tgFilter.length > 0
        ? {}
        : pagingTalkgroups.reduce((agg, tg) => ({
          ...agg,
          [tg]: true,
        }), {}))}
      size='lg'
    >
      <Modal.Header closeButton>Departments</Modal.Header>

      <Modal.Body>
        {[ ...pagingTalkgroups, ]
          .sort((a, b) => {
            const aName = (pagingTalkgroupConfig[a].partyBeingPaged || '').toLowerCase();
            const bName = (pagingTalkgroupConfig[b].partyBeingPaged || '').toLowerCase();
            return aName.localeCompare(bName);
          })
          .map(tg => <Form.Check
            key={tg}
            type='switch'
            checked={typeof tgChanges[tg] !== 'undefined'
              ? tgChanges[tg]
              : tgFilter.includes(tg)
            }
            onChange={e => setTgChanges(old => {
              const newVal = { ...old, };
              delete newVal[tg];

              if (e.target.checked && !tgFilter.includes(tg)) {
                newVal[tg] = true;
              } else if (!e.target.checked && tgFilter.includes(tg)) {
                newVal[tg] = false;
              }

              return newVal;
            })}
            label={pagingTalkgroupConfig[tg].partyBeingPaged || `TG ${tg}`}
          />)}
      </Modal.Body>

      <Modal.Footer
        className='justify-content-between'
      >
        <Button
          variant='success'
          onClick={() => {
            parseTgFilterChanges();
            setFilterModalOpen(false);
          }}
          disabled={Object.keys(tgChanges).length === 0}
        >Apply</Button>
        <Button
          variant='danger'
          onClick={() => setFilterModalOpen(false)}
        >Close</Button>
      </Modal.Footer>
    </Modal>
  </>;
}
