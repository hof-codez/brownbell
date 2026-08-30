const fs = require('fs');
const path = require('path');

const files = [
  path.join(__dirname, 'supabase/functions/set-duo-name/index.ts'),
  path.join(__dirname, 'supabase/functions/suggest-duo-names/index.ts'),
];

let allPassed = true;

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const hasBoomSupport = /\['main',\s*'nextup',\s*'boom'\]/.test(text) || /\[\s*'main'\s*,\s*'nextup'\s*,\s*'boom'\s*\]/.test(text);
  console.log(`${hasBoomSupport ? '✅' : '❌'} ${path.relative(__dirname, file)} accepts awardType 'boom'`);
  allPassed &&= hasBoomSupport;
}

if (!allPassed) {
  console.error('\n❌ Some boom-support validation checks failed');
  process.exit(1);
}

console.log('\n✅ ALL CHECKS PASSED');
