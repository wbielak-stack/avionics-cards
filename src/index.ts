import './cards/climate/index';
import './cards/eis/index';
import './cards/list/index';
import './cards/value/index';

declare const __AVIONICS_VERSION__: string;

console.info(
  `%c AVIONICS-CARDS %c v${__AVIONICS_VERSION__} `,
  'background:#00e5ff;color:#000;font-weight:700',
  'background:#000;color:#00e5ff',
);
