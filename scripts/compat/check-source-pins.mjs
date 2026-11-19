import { readFileSync } from 'node:fs';
import { authoredDevPins } from './contract.mjs';

authoredDevPins(JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')));
console.log('Authored cohort development pins are exact; lock and compatibility checks remain separate.');
