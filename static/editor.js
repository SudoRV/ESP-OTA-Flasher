const navbar = document.querySelector("nav").clientHeight

let CompiledCodeEditor;
let fileBlob;

function syncScroll(id) {
    let header = document.getElementById(id);
    let headerScrollPosition = header.getBoundingClientRect().y + window.pageYOffset - header.clientHeight - navbar / 2;

    window.scrollTo({
        top: headerScrollPosition,
        behavior: 'smooth'
    });
}

//editor logic
let impHeaderEditor = createEditor("imp-headers");
let impFunctionEditor = createEditor("imp-functions");
let mainEditor = createEditor("editor");

function createEditor(editorID) {
    var editor = ace.edit(editorID);
    editor.session.setMode("ace/mode/c_cpp"); // C++ mode
    // editor.setTheme("ace/theme/monokai");

    let opts;
    if (editorID == "imp-headers") {
        const lines = editor.session.getLength();
        opts = {
            minLines: lines,
            maxLines: lines,
        }
    }

    editor.setOptions({
        enableBasicAutocompletion: true,
        enableSnippets: true,
        enableLiveAutocompletion: true,
        fontSize: "16px",
        ...opts
    });

    return editor;
}


async function compile(btn) {
    const compiledCodePage = document.getElementById("compiled-code");

    if (btn.innerText == "Return") {
        compiledCodePage.classList.remove("slide-up");
    }
    else if (btn.innerText == "Uploaded") {
        btn.innerText = "Return";
    }
    else if (btn.innerText == "Upload") {
        btn.innerText = "Uploading";
        btn.disabled = true;
        btn.style.opacity = 0.6;

        FlashFirmware3(btn, fileBlob);
    } else if (btn.innerText == "Compile") {
        const compillableCode = CompiledCodeEditor.getValue();

        // add the output logge box


        btn.innerText = "Compiling";
        btn.style.opacity = 0.6;
        btn.disabled = true;

        compilerSocket(btn, compillableCode);
        return;
    } else if (btn.innerText == "Run") {
        btn.innerText = "Compile";
        var mainCode = mainEditor.getValue();

        document.body.classList.add("overflow-hidden")

        compiledCodePage.classList.add("slide-up");
        CompiledCodeEditor = createEditor("compiled-code-editor");
        document.getElementById("compiled-code").style.marginTop = navbar.clientHeight + "px";

        //add important headers
        const headers = mainCode.match(/#include\s*<.*>/g);

        if (!headers) {
            mainCode = impHeaderEditor.getValue() + "\n" + mainCode.slice(0);
        } else {
            const lastHeader = headers[headers.length - 1];
            const lastHeaderIndex = mainCode.indexOf(lastHeader) + lastHeader.length;

            mainCode = mainCode.slice(0, lastHeaderIndex) + "\n" + impHeaderEditor.getValue() + "\n" + mainCode.slice(lastHeaderIndex);
        }

        //add important functions
        const setupLoopIndex = mainCode.indexOf(mainCode.match(/void\s+setup\s*\(.*\)\s*\{/g));
        mainCode = mainCode.slice(0, setupLoopIndex) + "\n" + impFunctionEditor.getValue() + "\n\n" + mainCode.slice(setupLoopIndex);

        // compillable code edition
        CompiledCodeEditor.setValue(mainCode, -1)
    }
}

function compilerSocket(compileBtn, code) {
    const ws = new WebSocket("ws://localhost:8080");
    var logArray = [];
    isbinFileReceived = 0;

    ws.onopen = () => {
        console.log('Connected to WebSocket server');
        //send the compillable code to server
        ws.send(JSON.stringify({ 'type': 'compillable-code', 'code': code }));
    };

    ws.onmessage = async (event) => {
        var data = JSON.parse(event.data);
        console.log('message from compiler:', data.type);

        // await printLog2(data.type, data.status, data.message);
        logArray.push(data);

        if (data.type == "file") {
            const binaryData = base64ToUint8Array(data.binary);
            // Create a Blob from the binary data
            fileBlob = new Blob([binaryData], { type: 'application/octet-stream' });

            // close connection if received file
            ws.close();
            
            isbinFileReceived = 1;

            compileBtn.disabled = false;
            compileBtn.style.opacity = 1;
            compileBtn.innerText = "Upload";
        }
    };

    // feed log array to the compiler box 
    let isPrinting = 0;
    const printLogInterval = setInterval(() => {
        if (logArray.length > 0 && !isPrinting) {
            var data = logArray[0];
            printLog2(data.type, data.status, data.message);
        }
        if(isbinFileReceived && logArray.length == 0){
            clearInterval(printLogInterval);
        }
    }, 100)

    function delay(ms) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve();
            }, ms);
        });
    }

    async function printLog2(type, status, logData) {
        isPrinting = 1;
        console.log(isPrinting)
        const compilerOutput = document.getElementById("compiler-output");
        // Split the log data into lines
        const logLines = logData.split("\n");
        // Process each line with a delay
        for (const line of logLines) {
            if (line.trim() !== "") { // Skip empty lines
                let logStyle = "";

                // Apply styles based on log type and status
                if (type === "info") {
                    logStyle = status === 200 ? "color: green;" : "color: white;";
                } else if (type === "error") {
                    logStyle = "color: red;";
                }

                // Append the line to the container using innerHTML
                compilerOutput.innerHTML += `<span style="${logStyle}">${line}</span><br>`;

                // Auto-scroll to the bottom for real-time effect
                compilerOutput.scrollTop = compilerOutput.scrollHeight;

                // Wait for the delay before processing the next line
                await delay(100); // Delay of 300ms per line
            }
        }
        isPrinting = 0;
        logArray.shift();
    }

    ws.onclose = () => {
        console.log('WebSocket connection closed');
    };
}

async function compileFirmware(code) {
    return new Promise(async (resolve, reject) => {
        const response = await fetch("/compile", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                code: code
            })
        })
        if (!response.ok) {
            throw new Error(`Failed to compile: ${response.status}`);
        } else {
            alert(response.status);
        }
        var blob = await response.blob();
        resolve(blob);
    })
}

async function FlashFirmware3(fileBlob) {
    // Establish a WebSocket connection to the ESP8266
    const ws = new WebSocket("ws://192.168.31.118:81");

    // Event listener for WebSocket connection
    ws.onopen = () => {
        console.log("WebSocket connection established");
        // Call function to send the file
        sendFileViaWebSocket(fileBlob);
    };

    // Function to send the binary file via WebSocket to esp8266
    function sendFileViaWebSocket(fileBlob) {
        const reader = new FileReader();
        reader.onload = () => {
            const arrayBuffer = reader.result; // Get ArrayBuffer of the file
            const chunkSize = 1024; // Chunk size for sending data
            let offset = 0;

            // Function to send chunks
            function sendNextChunk() {
                if (offset < arrayBuffer.byteLength) {
                    const chunk = arrayBuffer.slice(offset, offset + chunkSize);
                    ws.send(chunk); // Send chunk via WebSocket
                    offset += chunkSize;
                    // console.log(`Sent chunk: ${offset}/${arrayBuffer.byteLength}`);
                    setTimeout(sendNextChunk, 10); // Delay for stable transfer
                } else {
                    console.log("File upload complete");
                    ws.send("END"); // Signal the server that the upload is complete
                }
            }

            sendNextChunk(); // Start sending chunks
        };

        reader.onerror = (err) => {
            console.error("Error reading file:", err);
        };

        reader.readAsArrayBuffer(fileBlob); // Read Blob as ArrayBuffer
    }

    // Handle WebSocket messages from the server
    ws.onmessage = (event) => {
        data = event.data;
        data = JSON.parse(data);

        console.log("Message from server:", data);

        // handle the esp8266 logs to print on compiler :)

        // if(data.type == )

        if (data.message == "Update completed successfully. Rebooting") {
            btn.innerText = "Uploaded";
            btn.style.opacity = 1;
            btn.disabled = true;
        }
    };

    // Handle WebSocket errors
    ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        ws.close();
    };

    // Handle WebSocket close
    ws.onclose = () => {
        console.log("WebSocket connection closed");
        ws.close();
    };
}


// handle compiler output box size adjustment
const compiledCodeEditorElt = document.getElementById("compiled-code-editor");
const compilerOutputBox = document.getElementById("compiler-output-box");
const adjustmentBtn = document.getElementById("adjustment-btn");
let isDragging = false;
adjustmentBtn.addEventListener("mousedown", (event) => {
    isDragging = true;
    bodyh = window.innerHeight;
    window.addEventListener("mousemove", (event) => {
        if (!isDragging) return;
        pointerPosition = event.clientY;
        compilerOutputH = bodyh - pointerPosition;
        compilerH = pointerPosition;

        compiledCodeEditorElt.style.height = `${compilerH}px`;
        compilerOutputBox.style.height = `${compilerOutputH}px`;
    })

    adjustmentBtn.addEventListener("mouseup", (event) => {
        isDragging = false;
    })
});
