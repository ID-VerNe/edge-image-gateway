import { Hono } from 'hono';
import { AppEnvironment } from '../../../types/env';
import queryApi from './files/query';
import mutateApi from './files/mutate';
import shareApi from './files/share';

const fileApi = new Hono<AppEnvironment>();

// Mount sub-modules
fileApi.route('/', queryApi);
fileApi.route('/', mutateApi);
fileApi.route('/sign', shareApi);

export default fileApi;
