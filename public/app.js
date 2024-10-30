let mediaRecorder;
let audioChunks = [];

const voiceBtn = document.getElementById('voice-btn');
const sendBtn = document.getElementById('send-btn');
const textInput = document.getElementById('text-input');
const responseAudio = document.getElementById('response-audio');
const transcriptionElem = document.getElementById('transcription');
const historyList = document.getElementById('history-list');

// Capturar audio cuando el botón de grabar es presionado
voiceBtn.addEventListener('click', () => {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.start();

            mediaRecorder.addEventListener('dataavailable', event => {
                audioChunks.push(event.data);
            });

            mediaRecorder.addEventListener('stop', () => {
                const audioBlob = new Blob(audioChunks);
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = function () {
                    const base64Audio = reader.result.split(',')[1];
                    sendAudio(base64Audio);
                };
            });

            // Detener grabación después de 5 segundos (puedes ajustarlo)
            setTimeout(() => {
                mediaRecorder.stop();
            }, 2000);
        });
});

// Enviar texto cuando el botón "Enviar" es presionado
sendBtn.addEventListener('click', () => {
    const text = textInput.value;
    if (text) {
        sendText(text);
        textInput.value = '';
    }
});

function sendAudio(base64Audio) {
    fetch('/send-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64Audio })
    }).then(response => response.json())
      .then(handleResponse);
}

function sendText(text) {
    fetch('/send-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
    }).then(response => response.json())
      .then(handleResponse);
}

function handleResponse(data) {
    console.log("data: ", data)
    // Mostrar la transcripción si está presente
    if (data.status) {
        console.log("test")
        transcriptionElem.textContent = data.status; // Muestra la transcripción
    } else {
        console.log("testtttt 2")
        transcriptionElem.textContent = 'No se recibió transcripción.';
    }

    // Si hay un archivo de audio, actualizamos la etiqueta <audio>
    if (data.audio) {
        responseAudio.src = `data:audio/wav;base64,${data.audio}`;
        responseAudio.play();
    }

}

const socket = new WebSocket('ws://localhost:8080');

socket.addEventListener('open', () => {
    console.log('Conectado al servidor WebSocket');
});

socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'text') {
        // Mostrar la transcripción
        if (data.transcription && data.transcription !== 'Sin respuesta') {
            transcriptionElem.textContent = data.transcription;

            // Agregar a la lista de historial
            const li = document.createElement('li');
            li.textContent = `Pregunta: ${textInput.value || 'Desconocida'}, Respuesta: ${data.transcription}`;
            historyList.appendChild(li);
        }
    } else if (data.type === 'audio') {
        // Reproducir el audio recibido en base64
        if (data.audio) {
            responseAudio.src = `data:audio/wav;base64,${data.audio}`;
            responseAudio.play();
        }
    } else {
        console.log('Otro tipo de mensaje:', data);
    }
});


socket.addEventListener('close', () => {
    console.log('Conexión cerrada con el servidor WebSocket');
});

