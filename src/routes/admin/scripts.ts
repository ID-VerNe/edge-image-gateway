import { STATE } from './scripts/state';
import { UTILS } from './scripts/utils';
import { NAVIGATION } from './scripts/navigation';
import { RENDER } from './scripts/render';
import { SELECTION } from './scripts/selection';
import { ACTIONS } from './scripts/actions';
import { EVENTS } from './scripts/events';

// Using raw strings to avoid template literal escaping hell
export const SCRIPTS = `
  ${STATE}
  ${UTILS}
  ${NAVIGATION}
  ${RENDER}
  ${SELECTION}
  ${ACTIONS}
  ${EVENTS}
`;
