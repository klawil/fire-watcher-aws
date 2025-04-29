import {
  readFileSync, writeFileSync
} from 'fs';

// Get the coverage information
const coverageInfo = JSON.parse(readFileSync('./coverage/coverage-summary.json', {
  encoding: 'utf8',
}));
const coverage = Math.floor(coverageInfo.total.lines.pct);
const coverageBadge = {
  schemaVersion: 1,
  label: 'Coverage',
  message: `${coverageInfo.total.lines.covered} / ${coverageInfo.total.lines.total} (${coverage}%)`,
};
if (coverage <= 0) {
  coverageBadge.color = 'red';
} else if (coverage < 50) {
  coverageBadge.color = 'orange';
} else if (coverage < 80) {
  coverageBadge.color = 'yellow';
} else if (coverage < 90) {
  coverageBadge.color = 'yellowgreen';
} else if (coverage < 95) {
  coverageBadge.color = 'green';
} else {
  coverageBadge.color = 'brightgreen';
}
writeFileSync('./reports/coverage.json', JSON.stringify(coverageBadge));

// Get the test result information
const testResults = JSON.parse(readFileSync('./coverage/test-results.json', {
  encoding: 'utf8',
}));
const failed = testResults.numFailedTests;
const testsResultsBadge = {
  schemaVersion: 1,
  label: 'Test Results',
  message: failed === 0
    ? 'PASSING'
    : `FAILED ${failed}`,
  color: failed === 0
    ? 'brightgreen'
    : 'red',
};
writeFileSync('./reports/testResults.json', JSON.stringify(testsResultsBadge));
