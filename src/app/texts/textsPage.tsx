'use client';

import React, { useContext, useEffect, useRef, useState } from "react";
import Container from "react-bootstrap/Container";
import Table from "react-bootstrap/Table";
import styles from "./textsPage.module.css";
import LoadingSpinner from "@/components/loadingSpinner/loadingSpinner";
import { fNameToDate } from "@/common/stringManipulation";
import { dateTimeToTimeStr, secondsToTime } from "@/logic/dateAndFile";
import { useRefIntersection } from "@/logic/uiUtils";
import { AddAlertContext } from "@/logic/clientContexts";
import { Variant } from "react-bootstrap/esm/types";
import { typeFetch } from "@/logic/typeFetch";
import { FrontendTextObject, GetAllTextsApi } from "@/common/apiv2/texts";

interface TextObject extends FrontendTextObject {
  pageTime?: number;
}

function makePercentString(numerator: number, denominator: number) {
	if (denominator === 0) return '';
	const percentStr = `${Math.round(numerator * 100 / denominator)}%`;

	if (numerator !== denominator) {
	  return <>{percentStr}<br />({numerator})</>;
	}

	return <>{percentStr}</>;
}

function getPercentile(values: number[], percentile: number) {
	if (values.length === 0) return '';

	values = values.sort((a, b) => a > b ? 1 : -1);
	const index = Math.ceil(values.length * percentile / 100) - 1;

	const valueSeconds = Math.round(values[index] / 1000);
	return secondsToTime(valueSeconds);
}

async function getTexts(
  isPage: boolean,
  loadBefore: number | null,
  addAlert: (type: Variant, message: string) => void
) {
  try {
    const [ code, apiResult ] = await typeFetch<GetAllTextsApi>({
      path: '/api/v2/texts/',
      method: 'GET',
      params: {
        page: isPage ? 'y' : 'n',
        before: loadBefore === null ? undefined : loadBefore,
      },
    });

    if (
      code !== 200 ||
      apiResult === null ||
      'message' in apiResult
    ) throw { code, apiResult };

    return (apiResult.texts as TextObject[])
      .map(text => {
        if (text.isPage)
          text.pageTime = fNameToDate(text.body || '').getTime();
      
        const baselineTime = text.isPage ? text.pageTime || text.datetime : text.datetime;
      
        text.delivered = text.delivered || [];
        text.delivered = text.delivered.map(t => t - baselineTime);
      
        text.sent = text.sent || [];
        text.sent = text.sent.map(t => t - baselineTime);
      
        return text;
      });
  } catch (e) {
    addAlert('danger', `Failed to get ${isPage ? 'paging' : 'non paging'} texts`);
    console.error(`Failed to get texts (page: ${isPage})`, e);
  }
  return [];
}

function TextsTable({
  isPage,
}: Readonly<{
  isPage: boolean;
}>) {
  const [texts, setTexts] = useState<TextObject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastLoad, setLastLoad] = useState(0);

  const [loadMoreRef, loadMoreRefInView] = useRefIntersection();
  const [scrollIdx, setScrollIdx] = useState(0);
  const scrollRef = useRef<HTMLTableRowElement | null>(null);
  const addAlert = useContext(AddAlertContext);

  useEffect(() => {
    if (
      (texts.length > 0 && loadMoreRefInView === false) ||
      isLoading ||
      Date.now() - lastLoad <= 2000
    ) return;

    setIsLoading(true);
    setScrollIdx(texts.length - 1);
    (async () => {
      setTexts(await getTexts(isPage, texts[texts.length - 1]?.datetime || null, addAlert));
      setLastLoad(Date.now());
      setIsLoading(false);
    })();
  }, [texts, isLoading, loadMoreRefInView, isPage, lastLoad, addAlert]);

  const loadNextBatchRefIdx = texts.length - 1;

  return (<>
    <h2 className="text-center">{isPage ? 'Paging' : 'Other'} Texts</h2>

    <Container fluid>
      {texts.length > 0 && <Table striped className={`align-middle ${styles.tableScrollY}`}>
        <thead className="floatHead"><tr className="text-center">
          <th>{isPage && 'Page '}Time</th>
          <th>Message</th>
          {!isPage && <th>Media</th>}
          <th>Recipients</th>
          <th>Sent</th>
          <th>Delivered</th>
          <th>Errored</th>
          {isPage && <th>Opened</th>}
          {isPage && <th>Text Time</th>}
          <th>P50</th>
          <th>P75</th>
          <th>Last</th>
        </tr></thead>
        <tbody>
          {texts.map((text, idx) => <tr
            key={text.datetime}
            {...(idx === loadNextBatchRefIdx
                ? { ref: loadMoreRef }
                : idx === scrollIdx
                  ? { ref: scrollRef }
                  : {})}
          >
            <td>{dateTimeToTimeStr(text.datetime)}</td>
            <td>{text.body?.split(/\n/g).map((part, i) => <React.Fragment key={i}>{part}<br /></React.Fragment>)}</td>
            {!isPage && <td>{text.mediaUrls?.split(',')
              .filter(s => s !== '')
              .map((v, i) => <a key={i} href={v}>{i + 1}</a>)
              .join(', ')}</td>}
            <td className="text-center">{text.recipients}</td>
            <td className="text-center">{makePercentString((text.sent || []).length, text.recipients || 0)}</td>
            <td className="text-center">{makePercentString((text.delivered || []).length, text.recipients || 0)}</td>
            <td className="text-center">{makePercentString((text.undelivered || []).length, text.recipients || 0)}</td>
            {isPage && <td className="text-center">{makePercentString((text.csLookedTime || []).length, text.recipients || 0)}</td>}
            {isPage && <td className="text-center">{secondsToTime(Math.round((text.datetime - (text.pageTime || text.datetime)) / 1000))}</td>}
            <td className="text-center">
              {getPercentile(text.sent || [], 50)}<br />
              {getPercentile(text.delivered || [], 50)}
            </td>
            <td className="text-center">
              {getPercentile(text.sent || [], 75)}<br />
              {getPercentile(text.delivered || [], 75)}
            </td>
            <td className="text-center">
              {getPercentile(text.sent || [], 100)}<br />
              {getPercentile(text.delivered || [], 100)}
            </td>
          </tr>)}
        </tbody>
      </Table>}
      {texts.length === 0 && <LoadingSpinner />}
    </Container>
  </>)
}

export default function TextsPage() {
  return (<>
    {/* @TODO - Implement the form to send an announcement from the website */}

    <TextsTable
      isPage={true}
    />

    <TextsTable
      isPage={false}
    />
  </>);
}
