const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const axios = require("axios");
const WebSocket = require("ws");

const app = express();
const path = require('path');

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.static(path.join(__dirname, "static")));

// End Points
app.get("/", (req, res) => {
    res.send("<a href='/editor'>Go to The Editor</a>")
})

app.get("/editor", (req, res) => {
    res.sendFile(path.join(__dirname, "editor.html"));
})

// web socket to redirect esp8266 compilation logs to client page
const wss = new WebSocket.Server({ port: 8080 });

// Array to keep track of connected WebSocket clients
const connectedClients = [];

// Handle new WebSocket connections
wss.on('connection', (ws) => {
    console.log('New WebSocket client connected.');
    connectedClients.push(ws);

    ws.on('message', (data) => {
        data = data.toString();
        data = JSON.parse(data);

        if (data.type == "compillable-code") {
            sendMessage(JSON.stringify({ 'type': 'info', 'status': 201, 'message': 'Code Received For Compilation' }))

            const code = data.code;
            compileFirmware(code);
        }
    })

    ws.on('close', () => {
        console.log('WebSocket client disconnected.');
        // Remove the client from the array
        const index = connectedClients.indexOf(ws);
        if (index > -1) connectedClients.splice(index, 1);
    });
});

// Function to broadcast types to all connected WebSocket clients
function sendMessage(message) {
    connectedClients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
        }
    });
}

//functions
function compileFirmware(code) {
    const filePath = path.join(__dirname, '/pio/my_project/src/firmware.ino');

    console.log("compilation started");

    // Save code to a temporary file
    fs.writeFileSync(filePath, code, { encoding: 'utf8', flag: 'w' });
    sendMessage(JSON.stringify({ 'type': 'info', 'status': 200, 'message': `File firmware.ino saved successfully at ${filePath}` }));

    // Compile the code using Arduino CLI
    exec(`pio run --project-dir ${"pio/my_project"}`,
        (error, stdout, stderr) => {
            if (error) {
                console.log(error);
                sendMessage(JSON.stringify({ 'type': 'error', 'message': error.toString("\n") }));

            } else if (stderr) {
                console.log(stderr);
                sendMessage(JSON.stringify({ 'type': 'error', message: stderr.toString() }));

            } else if (stdout) {
                console.log(stdout);
                sendMessage(JSON.stringify({ 'type': 'info', message: stdout.toString() }));

                //send data to client
                const binFilePath = path.join(__dirname, "pio/my_project", '.pio', 'build', 'nodemcuv2', 'firmware.bin');

                // Check if the `.bin` file exists
                if (fs.existsSync(binFilePath)) {
                    sendMessage(JSON.stringify({ 'type': 'info', 'status':200, 'message': `Code compilled successfully\nBinary File saved at ${binFilePath}` }));
                    console.log("compiled successfully");

                    // send file to client
                    const binData = fs.readFileSync(binFilePath);
                    const firmwarePayload = {
                        'type': 'file',
                        'status':200,
                        'size':binData.length,
                        'name':'firmware.in',
                        'binary': binData.toString("base64"),
                        'message':'Receiving Binary File...'
                    }
                    // send firmware payload to client
                    sendMessage(JSON.stringify(firmwarePayload));
                } else {
                    console.error('Bin file not found. Ensure that the compilation was successful and the path is correct.');
                    sendMessage(JSON.stringify({ 'type': 'error', 'message': 'Bin file not found. Ensure that the compilation was successful and the path is correct.' }));
                }
            }
        });
}

// Start the server
app.listen(3000, () => {
    console.log('Server started on http://localhost:3000');
});