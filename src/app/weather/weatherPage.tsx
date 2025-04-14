'use client';

import Link from 'next/link';
import {
  useCallback, useContext, useEffect, useState
} from 'react';
import {
  Col, Image, Row
} from 'react-bootstrap';

import styles from './weather.module.css';

import LoadingSpinner from '@/components/loadingSpinner/loadingSpinner';
import { WeatherResultJson } from '@/deprecated/common/weather';
import { AddAlertContext } from '@/utils/frontend/clientContexts';

export default function WeatherPage() {
  const addAlert = useContext(AddAlertContext);
  const [
    weatherData,
    setWeatherData,
  ] = useState<WeatherResultJson | null | undefined>();
  const [
    isLoading,
    setIsLoading,
  ] = useState(false);
  useEffect(() => {
    if (typeof weatherData !== 'undefined' || isLoading) return;

    setIsLoading(true);
    (async () => {
      try {
        const result: WeatherResultJson = await fetch('/weather.json')
          .then(r => r.json());

        setWeatherData(result);
      } catch (e) {
        console.error('Failed to get weather information', e);
        addAlert('danger', 'Failed to load weather information');
        setWeatherData(null);
      }
      setIsLoading(false);
    })();
  }, [
    isLoading,
    weatherData,
    addAlert,
  ]);

  const [
    imgNode,
    setImgNode,
  ] = useState<null | HTMLElement>(null);
  const [
    imgNodeHeight,
    setImgNodeHeight,
  ] = useState(555);
  const setImgRef = useCallback(
    (node: HTMLElement | null) => setImgNode(node),
    []
  );
  useEffect(() => {
    if (imgNode === null) return;

    const setSize = () => {
      if (imgNode === null) return;

      const newWidth = imgNode.clientWidth;
      const ratio = 555 / 815;
      const newHeight = Math.ceil(newWidth * ratio);
      setImgNodeHeight(newHeight);
    };
    setSize();
    imgNode.addEventListener('resize', setSize);

    return () => imgNode.removeEventListener('resize', setSize);
  }, [ imgNode, ]);

  return <>
    {(typeof weatherData === 'undefined' || isLoading) && <LoadingSpinner />}
    {weatherData === null && <h2 className='text-center'>Failed to Load Weather Data</h2>}
    {weatherData && <>
      <Row>
        <Col md={6}>
          <h2 className='text-center'>Readiness Level</h2>
          <Col xs={12} className='font-monospace text-center'>
            <table className={styles.table}><tbody>
              <tr>
                <td className='px-2'>National</td>
                <td className='px-2'>{weatherData.readiness.National}</td>
                <td className='px-2'><a href='https://www.nifc.gov/nicc/sitreprt.pdf'>National Sitrep</a></td>
              </tr>
              <tr>
                <td className='px-2'>RM GACC</td>
                <td className='px-2'>{weatherData.readiness.RMA}</td>
                <td className='px-2'><a href='https://gacc.nifc.gov/rmcc/intell.php'>RM GACC Intel</a></td>
              </tr>
            </tbody></table>
          </Col>

          <h2 className='text-center mt-5'>Active Fires</h2>
          <Col xs={12} className='font-monospace text-center'>
            <table className={styles.table}>
              <thead><tr>
                <th className='px-2'>Type</th>
                <th className='px-2'>Saguache</th>
                <th className='px-2'>Colorado</th>
              </tr></thead>
              <tbody>
                <tr>
                  <th className='px-2'>New</th>
                  <td className='px-2'>{weatherData.stateFires.new[0]}</td>
                  <td className='px-2'>{weatherData.stateFires.new[1]}</td>
                </tr>
                <tr>
                  <th className='px-2'>Ongoing</th>
                  <td className='px-2'>{weatherData.stateFires.ongoing[0]}</td>
                  <td className='px-2'>{weatherData.stateFires.ongoing[1]}</td>
                </tr>
                <tr>
                  <th className='px-2'>RX</th>
                  <td className='px-2'>{weatherData.stateFires.rx[0]}</td>
                  <td className='px-2'>{weatherData.stateFires.rx[1]}</td>
                </tr>
              </tbody>
            </table>
          </Col>
          <Col xs={12} className='font-monospace'><a href='https://gacc.nifc.gov/rmcc/'>RM GACC Incident Map</a></Col>
          <Col xs={12} className='font-monospace'><a href='https://inciweb.nwcg.gov/'>InciWeb - National Incident Map</a></Col>

          <h2 className='text-center mt-5'>Weather Alerts</h2>
          <Col xs={12} className='font-monospace' dangerouslySetInnerHTML={{ __html: weatherData.weather, }} />
          <Col xs={12} className='font-monospace'>
            <a href='https://forecast.weather.gov/MapClick.php?lon=-105.6988059170544&lat=37.9934785363087#.YmFqWPPMIeY'>Crestone 7 Day Forecast</a><br />
            <a href='https://forecast.weather.gov/MapClick.php?w0=t&w3=sfcwind&w3u=1&w4=sky&w5=pop&w6=rh&w13u=0&w14=haines&w15=lal&w16=twind&w16u=1&pqpfhr=6&psnwhr=6&AheadHour=0&Submit=Submit&FcstType=graphical&textField2=-105.6988059170544&textField1=37.9934785363087&site=all&unit=0&dd=&bw='>Crestone Hourly Forecast</a><br />
            <a href='https://www.weather.gov/crh/FWFdisplay?zone=COZ224'>Fire Weather Forecast</a><br />
            <a href='https://www.weather.gov/media/pub/DssPacket.pdf'>Fire Weather Decision Support Packet</a>
          </Col>

          <h2 className='text-center mt-5'>Fire Restrictions</h2>
          <Col xs={12} className='font-monospace' dangerouslySetInnerHTML={{ __html: weatherData.bans, }} />
          <Col xs={12} className='font-monospace'><a href='https://www.google.com/maps/d/u/0/embed?mid=1cEAhNHqp82AXABF8qU7k6sRFI4392V0e&ll=38.91583034559255%2C-106.1196738784554&z=7'>Colorado Restriction Map</a></Col>
        </Col>

        <Col md={6}>
          <h2 className='text-center'>Fire Weather Maps</h2>
          <h3 className='text-center'>Today</h3>
          <a
            className={styles.imgContainer}
            href='https://www.spc.noaa.gov/products/fire_wx/fwdy1.html'
            style={{
              height: `${imgNodeHeight}px`,
            }}
          >
            <Image
              className={styles.img}
              width={815}
              height={555}
              src='https://www.spc.noaa.gov/products/fire_wx/day1otlk_fire.gif'
              fluid
              alt='Fire weather map for today'
            />
            <svg height='555' width='815' className={`img img-fluid ${styles.img}`} viewBox='0 0 815 555'>
              <circle cx='282' cy='278' r='3' strokeWidth='0' fill='black' />
            </svg>
          </a>
          <Col
            as={Link}
            xs={12}
            className='font-monospace mb-3'
            href='https://www.spc.noaa.gov/products/fire_wx/fwdy1.html'
          >Day 2 Fire Weather Outlook</Col>

          <h3 className='text-center'>Tomorrow</h3>
          <a
            className={styles.imgContainer}
            ref={setImgRef}
            href='https://www.spc.noaa.gov/products/fire_wx/fwdy1.html'
            style={{
              height: `${imgNodeHeight}px`,
            }}
          >
            <Image
              className={styles.img}
              width={815}
              height={555}
              src='https://www.spc.noaa.gov/products/fire_wx/day2otlk_fire.gif'
              fluid
              alt='Fire weather map for today'
            />
            <svg height='555' width='815' className={`img img-fluid ${styles.img}`} viewBox='0 0 815 555'>
              <circle cx='282' cy='278' r='3' strokeWidth='0' fill='black' />
            </svg>
          </a>
          <Col
            as={Link}
            xs={12}
            className='font-monospace mb-3'
            href='https://www.spc.noaa.gov/products/fire_wx/fwdy2.html'
          >Day 2 Fire Weather Outlook</Col>
        </Col>

        <Col xs={12} className='font-monospace mt-5 text-center'>{weatherData.updated}</Col>
      </Row>
    </>}
  </>;
}
