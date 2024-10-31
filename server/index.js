const express = require('express');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const http = require('http');
const WavEncoder = require('wav-encoder');

require('dotenv').config();

const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(bodyParser.json({
    limit:'10mb'
}));
app.use(bodyParser.urlencoded({
    limit:'10mb', extended:true
}))

const server = new WebSocket.Server({ port: 8080 });

server.on('connection', (socket) => {
  console.log('Cliente conectado');

  // Enviar un evento al cliente
  socket.send(JSON.stringify({ event: 'welcome', message: '¡Hola desde el servidor!' }));

  // Escuchar mensajes del cliente
  socket.on('message', (message) => {
    console.log(`Mensaje recibido: ${message}`);
  });

  // Simular el envío de un evento después de un tiempo
  setTimeout(() => {
    socket.send(JSON.stringify({ event: 'update', data: 'Nueva actualización disponible' }));
  }, 5000);
});

// Función para establecer conexión WebSocket con OpenAI Realtime API
function connectToOpenAI() {
    const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";
    const ws = new WebSocket(url, {
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'OpenAI-Beta': 'realtime=v1'
        }
    });

    ws.on('open', () => {
        console.log('Conexión establecida con la API Realtime de OpenAI');
    });



    ws.on('error', (error) => {
        console.error('Error en la conexión con la API:', error);
    });

    ws.on('close', () => {
        console.log('Conexión cerrada con la API');
    });

    return ws;
}

// Establecemos conexión al iniciar el servidor
let ws = connectToOpenAI();

// Enviar audio a OpenAI Realtime API
app.post('/send-audio', async (req, res) => {
    const audioBase64 = req.body.audio;

    // Construimos el evento en formato JSON
    const eventAudio = {
        type: 'conversation.item.create',
        item: {
            type: 'message',
            role: 'user',
            content: [
                {
                    type: 'input_audio',
                    audio: audioBase64
                }
            ]
        }
    };

    ws.send(JSON.stringify(eventAudio));

    const responseCreateAudio = {
        type: "response.create",
        response: {
            modalities: ["audio","text"],
            instructions: "Respond as Marcuss, assisting with real-time game questions in Spanish, switching languages if requested.",
            voice: "alloy",
            output_audio_format: "pcm16",
            tool_choice: "auto",
            
        }
    };
    ws.send(JSON.stringify(responseCreateAudio));
    
    res.json({ status: 'Audio sent, awaiting AI response' });
});

// Enviar texto a OpenAI Realtime API
app.post('/send-text', async (req, res) => {
    const text = req.body.text;

    // Construimos el evento en formato JSON
    const userMessage = {
        type: 'conversation.item.create',
        item: {
            type: 'message',
            role: 'user',
            content: [
                {
                    type: 'input_text',
                    text: text
                }
            ]
        }
    };
    // Send the user's message
    ws.send(JSON.stringify(userMessage));

    // Trigger AI's response to user message
    const responseCreate = {
        type: "response.create",
        response: {
            modalities: ["text", "audio"],
            instructions: "Respond as Marcuss, assisting with real-time game questions in Spanish, switching languages if requested.",
            voice: "alloy",
            output_audio_format: "pcm16",
        }
    };
    ws.send(JSON.stringify(responseCreate));
    
    res.json({ status: 'Message sent, awaiting AI response' });
});


async function pcm16ToWavBase64(pcmData) {
    const float32Data = new Float32Array(pcmData.buffer);

    const wavData = await WavEncoder.encode({
        sampleRate: 16000, 
        channelData: [float32Data] 
    });

    return Buffer.from(wavData).toString('base64');
}
ws.on('message',  (data) => {
    try {
        const response = JSON.parse(data);
        console.log('Mensaje completo recibido:', response);

        // Verificar si el mensaje contiene un delta de audio
        if (response.type === 'response.audio.delta' && response.delta) {
            const pcmBuffer = Buffer.from(response.delta, 'binary');
            
          pcm16ToWavBase64(pcmBuffer).then(base64Audio=>{
                 // Enviar el audio en base64 a todos los clientes conectados
            server.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: 'audio',
                        audio: base64Audio,
                    }));
                }
            });
          });


           
        }

        // También manejamos la transcripción de texto
        if (response.transcript && typeof response.transcript === 'string' && response.transcript.trim() !== '') {
            const content = response.transcript;
            server.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: 'text',
                        transcription: content,
                    }));
                }
            });
        }
    } catch (error) {
        console.error('Error al procesar el mensaje:', error);
    }
});


// Iniciar el servidor en el puerto 3000
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
