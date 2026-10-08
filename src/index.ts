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
import './cards/goal/index';
import './cards/forecast/index';
import './cards/radar/index';
import './cards/metar/index';
import './cards/astro/index';
import './cards/tank/index';
import './cards/cylinder/index';
import './cards/synoptic/index';
import './cards/frame/index';
import './cards/plan/index';
import './cards/energy/index';

declare const __AVIONICS_VERSION__: string;
declare const __AVIONICS_BUILD__: string;

console.info(
  `%c AVIONICS-CARDS %c v${__AVIONICS_VERSION__} · build ${__AVIONICS_BUILD__} UTC `,
  'background:#00e5ff;color:#000;font-weight:700',
  'background:#000;color:#00e5ff',
);
