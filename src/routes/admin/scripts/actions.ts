import { FILE_ACTIONS } from './actions/fileActions';
import { REPO_ACTIONS } from './actions/repoActions';
import { SHARE_ACTIONS } from './actions/shareActions';
import { TOKEN_ACTIONS } from './actions/tokenActions';
import { PROVIDER_ACTIONS } from './actions/providerActions';

export const ACTIONS = `
  async function fetchWithTOTP(url, options = {}) {
    return await fetch(url, options);
  }
  ${FILE_ACTIONS}
  ${REPO_ACTIONS}
  ${SHARE_ACTIONS}
  ${TOKEN_ACTIONS}
  ${PROVIDER_ACTIONS}
`;
