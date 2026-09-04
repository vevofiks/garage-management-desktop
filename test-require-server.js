const path = require('path');
process.env.PORT = '3456';
process.env.HOSTNAME = '127.0.0.1';
try {
  console.log('Requiring standalone server...');
  require(path.join(__dirname, '.next/standalone/babuawamir/server.js'));
  console.log('Successfully called require on server.js');
} catch (e) {
  console.error('Failed to require server.js:', e);
}
