/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback } from 'react';

import { useDispatch } from 'react-redux';

import { TimelineTabs } from '../../../../common/types';
import { useInitializeUrlParam } from '../../utils/global_query_string';
import {
  dispatchUpdateTimeline,
  queryTimelineById,
} from '../../../timelines/components/open_timeline/helpers';
import type { TimelineUrl } from '../../../timelines/store/timeline/model';
import { timelineActions } from '../../../timelines/store/timeline';
import { URL_PARAM_KEY } from '../use_url_state';
import { useIsExperimentalFeatureEnabled } from '../use_experimental_features';

export const useInitTimelineFromUrlParam = () => {
  const dispatch = useDispatch();

  const isEsqlTabDisabled = useIsExperimentalFeatureEnabled('timelineEsqlTabDisabled');

  const onInitialize = useCallback(
    (initialState: TimelineUrl | null) => {
      if (initialState != null) {
        queryTimelineById({
          activeTimelineTab:
            initialState.activeTab === TimelineTabs.esql && isEsqlTabDisabled
              ? TimelineTabs.query
              : initialState.activeTab,
          duplicate: false,
          graphEventId: initialState.graphEventId,
          timelineId: initialState.id,
          openTimeline: initialState.isOpen,
          updateIsLoading: (status: { id: string; isLoading: boolean }) =>
            dispatch(timelineActions.updateIsLoading(status)),
          updateTimeline: dispatchUpdateTimeline(dispatch),
          savedSearchId: initialState.savedSearchId,
        });
      }
    },
    [dispatch, isEsqlTabDisabled]
  );

  useInitializeUrlParam(URL_PARAM_KEY.timeline, onInitialize);
};
