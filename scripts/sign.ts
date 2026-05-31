import { generateHMAC } from '../src/utils/hmac';

const args = process.argv.slice(2);

if (args.length < 3) {
  console.log('Usage: npx tsx scripts/sign.ts <path> <expires_in_seconds> <secret>');
  process.exit(1);
}

const path = args[0];
const expiresIn = parseInt(args[1], 10);
const secret = args[2];

const exp = Math.floor(Date.now() / 1000) + expiresIn;
const message = `${path}|${exp}`;

generateHMAC(message, secret).then(sig => {
  console.log(`\nURL Path: ${path}?sig=${sig}&exp=${exp}`);
}).catch(err => {
  console.error('Error generating HMAC:', err);
});
