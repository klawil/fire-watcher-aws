import {
  readFileSync, writeFileSync
} from 'fs';

// Get the coverage information
const coverageInfo = JSON.parse(readFileSync('./coverage/coverage-summary.json', {
  encoding: 'utf8',
}));

const coverage = Math.floor(coverageInfo.total.lines.pct);
const badge = {
  schemaVersion: 1,
  label: 'Coverage',
  message: `${coverage}%`,
};
if (coverage <= 0) {
  badge.color = 'red';
} else if (coverage < 50) {
  badge.color = 'orange';
} else if (coverage < 80) {
  badge.color = 'yellow';
} else if (coverage < 90) {
  badge.color = 'yellowgreen';
} else if (coverage < 95) {
  badge.color = 'green';
} else {
  badge.color = 'brightgreen';
}
console.log(badge);
writeFileSync('./coverage/badge.json', JSON.stringify(badge));
