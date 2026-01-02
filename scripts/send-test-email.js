const net = require('net');

const SMTP_PORT = 2525;
const SMTP_HOST = 'localhost';

const args = process.argv.slice(2);
const TO_EMAIL = args[0] || 'admin@tempmail.local';

console.log(`Sending test email to: ${TO_EMAIL}`);
console.log(`Connecting to ${SMTP_HOST}:${SMTP_PORT}...`);

const client = new net.Socket();

const boundary = '----=_Part_0_123456789';

const emailBody = `From: Test Sender <sender@example.com>
To: ${TO_EMAIL}
Subject: Test Email ${new Date().toLocaleTimeString()}
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="${boundary}"

--${boundary}
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: 7bit

This is a test email sent from the local debugger script.
It contains both plain text and HTML versions.

--${boundary}
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: 7bit

<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: sans-serif; padding: 20px; }
  .box { background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 10px 0; }
  h1 { color: #6366f1; }
</style>
</head>
<body>
  <h1>Hello from Localhost! 👋</h1>
  <p>This email confirms that your local SMTP server is working correctly.</p>
  
  <div class="box">
    <h3>Why this is cool:</h3>
    <ul>
      <li>No need to deploy to VPS for testing</li>
      <li>Instant feedback loop</li>
      <li>Safe debugging environment</li>
    </ul>
  </div>

  <p>Run <code>npm run send-test [your-email]</code> to send more!</p>
  
  <p>
    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. 
    Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
    Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
  </p>
  
  ${Array(20).fill('<p>Adding some long content to test scrolling behavior... Line filling text here to make sure we overflow.</p>').join('\n')}
</body>
</html>

--${boundary}--
.
`.replace(/\n/g, '\r\n');

client.connect(SMTP_PORT, SMTP_HOST, function () {
    console.log('Connected to SMTP server');
});

let step = 0;

client.on('data', function (data) {
    const response = data.toString();
    console.log('S:', response.trim());

    if (response.startsWith('220') && step === 0) {
        sendCommand('HELO localhost');
        step++;
    } else if (response.startsWith('250') && step === 1) {
        sendCommand('MAIL FROM:<sender@example.com>');
        step++;
    } else if (response.startsWith('250') && step === 2) {
        sendCommand(`RCPT TO:<${TO_EMAIL}>`);
        step++;
    } else if (response.startsWith('250') && step === 3) {
        sendCommand('DATA');
        step++;
    } else if (response.startsWith('354') && step === 4) {
        client.write(emailBody); // Send body ending with dot
        console.log('C: [Sending Email Body...]');
        step++;
    } else if (response.startsWith('250') && step === 5) {
        sendCommand('QUIT');
        step++;
    } else if (response.startsWith('221') && step === 6) {
        client.destroy();
        console.log('✅ Email sent successfully!');
    }
});

function sendCommand(cmd) {
    console.log(`C: ${cmd}`);
    client.write(cmd + '\r\n');
}

client.on('close', function () {
    console.log('Connection closed');
});

client.on('error', function (err) {
    console.error('Connection error:', err.message);
    console.log('Make sure the SMTP server is running: npm run smtp:local');
});
