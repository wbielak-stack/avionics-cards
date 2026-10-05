import './cards/climate/index';
import './cards/eis/index';
import './cards/list/index';
import './cards/value/index';
import './cards/dial/index';
import './cards/bars/index';
import './cards/weather/index';
import './cards/graph/index';
import './cards/wind/index';
import './cards/softkeys/index';
import './cards/endurance/index';

declare const __AVIONICS_VERSION__: string;
declare const __AVIONICS_BUILD__: string;

console.info(
  `%c AVIONICS-CARDS %c v${__AVIONICS_VERSION__} · build ${__AVIONICS_BUILD__} UTC `,
  'background:#00e5ff;color:#000;font-weight:700',
  'background:#000;color:#00e5ff',
);
