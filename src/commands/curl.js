import { Command } from 'commander';
import axios from 'axios';
import { logger } from '../utils/logger.js';

const curl = new Command('curl')
  .description('Send a raw HTTP request (bypasses CORS, for testing)')
  .argument('<url>', 'Target URL')
  .option('-X, --method <method>', 'HTTP method', 'GET')
  .option('-H, --header <headers...>', 'Request headers (key:value)', [])
  .option('-d, --data <body>', 'Request body (JSON string or plain text)')
  .action(async (url, options) => {
    const method = options.method.toUpperCase();
    const headers = {};
    if (options.header) {
      options.header.forEach(h => {
        const [key, ...vals] = h.split(':');
        if (key && vals.length) headers[key.trim()] = vals.join(':').trim();
      });
    }

    try {
      const response = await axios({
        method,
        url,
        headers,
        data: options.data || undefined,
        timeout: 10000,
        validateStatus: () => true,
      });

      console.log(`\n${logger.bold('Response')}  ${response.status} ${response.statusText}`);
      if (response.data) {
        if (typeof response.data === 'object') {
          console.log(JSON.stringify(response.data, null, 2));
        } else {
          console.log(response.data);
        }
      }
    } catch (err) {
      logger.error('Request failed: ' + (err.response?.data?.message || err.message));
      process.exit(1);
    }
  });

export default curl;
