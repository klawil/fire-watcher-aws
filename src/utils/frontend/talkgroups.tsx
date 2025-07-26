import {
  useContext, useEffect,
  useState
} from 'react';

import { getLogger } from '../common/logger';

import { AddAlertContext } from './clientContexts';
import { typeFetch } from './typeFetch';

import {
  GetAllRadiosApi, RadioObject
} from '@/types/api/radios';
import {
  FullTalkgroupObject, GetAllTalkgroupsApi
} from '@/types/api/talkgroups';

const logger = getLogger('talkgroups');

/**
 * Load and expose talkgroup information
 * @param loadAll true to load talkgroups with events and with just recordings
 */
export function useTalkgroups(loadAll: boolean = false) {
  const addAlert = useContext(AddAlertContext);

  const [
    talkgroups,
    setTalkgroups,
  ] = useState<{
    [key: string]: FullTalkgroupObject;
  }>({});

  useEffect(() => {
    (async () => {
      const [
        code,
        tgData,
      ] = await typeFetch<GetAllTalkgroupsApi>({
        path: '/api/v2/talkgroups/',
        method: 'GET',
        ...loadAll
          ? {
            query: {
              all: 'y',
            },
          }
          : {},
      });

      if (
        code !== 200 ||
        tgData === null ||
        'message' in tgData
      ) {
        logger.error('Failed to load talkgroup information', code, tgData);
        addAlert('danger', 'Failed to load talkgroup names');
        return;
      }

      setTalkgroups(tgData.talkgroups.reduce((
        agg: typeof talkgroups,
        item
      ) => {
        agg[item.ID.toString()] = {
          ...item,
        };

        return agg;
      }, {}));
    })();
  }, [
    addAlert,
    loadAll,
  ]);

  const renameTalkgroup = (id: string, newName: string) => {
    setTalkgroups(old => {
      old[id] = {
        ...old[id] || {},
        Name: newName === '' ? undefined : newName,
      };

      return old;
    });
  };

  return {
    talkgroups,
    renameTalkgroup,
  };
}

/**
 * Load and expose radio information
 */
export function useRadios() {
  const addAlert = useContext(AddAlertContext);

  const [
    radios,
    setRadios,
  ] = useState<{
    [key: string]: RadioObject;
  }>({});

  useEffect(() => {
    (async () => {
      const [
        code,
        radioData,
      ] = await typeFetch<GetAllRadiosApi>({
        path: '/api/v2/radios/',
        method: 'GET',
      });

      if (
        code !== 200 ||
        radioData === null ||
        'message' in radioData
      ) {
        logger.error('Failed to load radio information', code, radioData);
        addAlert('danger', 'Failed to load radio names');
        return;
      }

      setRadios(radioData.radios.reduce((
        agg: typeof radios,
        item
      ) => {
        agg[item.RadioID] = {
          ...item,
        };

        return agg;
      }, {}));
    })();
  }, [ addAlert, ]);

  const renameRadio = (id: string, newName: string) => {
    setRadios(old => {
      old[id] = {
        ...old[id] || {},
        Name: newName === '' ? undefined : newName,
      };

      return old;
    });
  };

  return {
    radios,
    renameRadio,
  };
}

type CommonProperties<T, U> = {
  [K in keyof T & keyof U]: T[K] extends U[K] ? (U[K] extends T[K] ? T[K] : never) : never;
};

type BaseItem = Partial<CommonProperties<RadioObject, FullTalkgroupObject>>;

interface BaseItemMap {
  [key: string]: BaseItem;
}

export const buildFilterItemsFunc = (items: BaseItemMap, filterRaw: string) => (key: string) => {
  // If the filter is empty, return all the items
  if (filterRaw === '') {
    return true;
  }
  const filter = filterRaw.toLowerCase();

  // Get the item name (if available)
  const itemName = (items[key]?.Name || '').toLowerCase();
  return itemName.includes(filter) || key.includes(filter);
};

export const buildSortItemsFunc = (
  items: BaseItemMap,
  reverse: boolean = false
) => (a: string, b: string) => {
  const A_GT_B = reverse ? -1 : 1;
  const B_GT_A = reverse ? 1 : -1;

  // Pull out the raw items
  const aItem = items[a];
  const bItem = items[b];

  // Pull out the names
  const aName = aItem?.Name;
  const bName = bItem?.Name;

  // Sort by ID if neither has a name, then put named first, then by name
  if (!aName && !bName) {
    return Number(a) > Number(b) ? A_GT_B : B_GT_A;
  } else if (!aName) {
    return A_GT_B;
  } else if (!bName) {
    return B_GT_A;
  } else {
    return aName.localeCompare(bName) * (reverse ? -1 : 1);
  }
};

export function getItemName(
  items: BaseItemMap,
  key: string,
  counts: boolean = false,
  idOnly: boolean = false
) {
  const item = items[key];
  const idStr = `[ID ${key}]`;

  const name = typeof item !== 'undefined' && item.Name && !idOnly
    ? `${item.Name} ${idStr}`
    : idStr;

  if (counts) {
    const recordings = item?.Count || 0;
    const events = item?.EventsCount || 0;

    return `${name} [${recordings >= 1000 ? '1,000+' : recordings} Recordings, ${events >= 1000 ? '1,000+' : events} Events]`;
  }

  return name;
}

export function getItemLink(
  items: BaseItemMap,
  key: string,
  type: 'radio' | 'talkgroup',
  counts: boolean = false,
  idOnly: boolean = false
) {
  const name = getItemName(items, key, counts, idOnly);
  const url = `/events/?${type === 'radio' ? 'radioId' : 'tg'}=${key}`;
  return <a href={url}>{name}</a>;
}
