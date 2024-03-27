/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

export type { IntlShape, WrappedComponentProps } from '.';

export {
  FormattedDate,
  FormattedTime,
  FormattedNumber,
  FormattedPlural,
  FormattedMessage,
  FormattedRelativeTime,
} from '.';

export { injecti18n } from './src/compatiblity_layer';

export { I18nProvider } from './src/provider';
export { injectI18n } from './src/inject';
