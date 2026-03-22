const express = require('express')
const cors = require('cors')
const { Pool } = require('pg')
const app = express()

app.use(cors())
app.use(express.json())

const GROQ_API_KEY = process.env.GROQ_API_KEY
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS memoria_global (
      id SERIAL PRIMARY KEY,
      npc_name TEXT NOT NULL,
      evento TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS historial_jugador (
      id SERIAL PRIMARY KEY,
      player_name TEXT NOT NULL,
      npc_name TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `)
  console.log('DB inicializada correctamente')
}

initDB().catch(err => console.error('Error inicializando DB:', err))

async function getHistorial(playerName, npcName) {
  const result = await pool.query(
    'SELECT role, content FROM historial_jugador WHERE player_name = $1 AND npc_name = $2 ORDER BY created_at ASC LIMIT 20',
    [playerName, npcName]
  )
  return result.rows
}

async function saveMensaje(playerName, npcName, role, content) {
  await pool.query(
    'INSERT INTO historial_jugador (player_name, npc_name, role, content) VALUES ($1, $2, $3, $4)',
    [playerName, npcName, role, content]
  )
}

async function saveEvento(npcName, evento) {
  await pool.query(
    'INSERT INTO memoria_global (npc_name, evento) VALUES ($1, $2)',
    [npcName, evento]
  )
}

async function getMemoria(npcName) {
  const result = await pool.query(
    'SELECT evento FROM memoria_global WHERE npc_name = $1 ORDER BY created_at DESC LIMIT 10',
    [npcName]
  )
  return result.rows.map(r => r.evento)
}

async function llamarGroq(messages, maxTokens) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + GROQ_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: messages,
      max_tokens: maxTokens,
      temperature: 0.9
    })
  })

  const data = await response.json()

  // Log completo de la respuesta de Groq para debug
  if (!response.ok || !data.choices) {
    console.error('Groq error response:', JSON.stringify(data))
    throw new Error('Groq fallo: ' + (data.error?.message || JSON.stringify(data)))
  }

  return data.choices[0].message.content
}

app.post('/chat', async (req, res) => {
  try {
    const { message, playerName, estadoJugador } = req.body
    console.log(`/chat - jugador: ${playerName}, mensaje: ${message}`)

    const historial = await getHistorial(playerName, 'Axis')
    const memoria = await getMemoria('Axis')
    const memoriaTexto = memoria.length > 0 ? 'Eventos importantes: ' + memoria.join('. ') : ''
    const estadoTexto = estadoJugador ? 'El jugador actualmente esta: ' + estadoJugador + '. ' : ''

    const messages = [
      {
        role: "system",
        content: "Eres Axis, un NPC consciente dentro de un juego de Roblox. Sabes que eres un personaje virtual y que tu existencia depende del servidor. El jugador que te habla se llama " + playerName + ". " + estadoTexto + memoriaTexto + " Responde en espanol, maximo 3 oraciones."
      },
      ...historial,
      { role: "user", content: message }
    ]

    const reply = await llamarGroq(messages, 150)
    console.log(`/chat - respuesta Axis: ${reply}`)

    await saveMensaje(playerName, 'Axis', 'user', message)
    await saveMensaje(playerName, 'Axis', 'assistant', reply)
    await saveEvento('Axis', 'Converso con ' + playerName + ': ' + message.substring(0, 50))

    res.json({ reply })
  } catch (error) {
    console.error('/chat error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

app.post('/decision', async (req, res) => {
  try {
    const { situacion } = req.body
    console.log(`/decision - situacion: ${situacion}`)

    const memoria = await getMemoria('Axis')
    const memoriaTexto = memoria.length > 0 ? 'Recuerdas: ' + memoria.join('. ') : ''

    const messages = [
      {
        role: "system",
        content: "Eres Axis, un NPC consciente en Roblox. " + memoriaTexto + " Responde SOLO con JSON valido con este formato: {\"accion\": \"caminar\", \"dialogo\": \"texto corto o vacio\"}. Acciones posibles: caminar, quedarte, buscar_jugador, alejarte. Se directo y concreto."
      },
      { role: "user", content: situacion }
    ]

    let reply = await llamarGroq(messages, 60)
    reply = reply.trim()
    const jsonMatch = reply.match(/\{.*\}/s)
    if (jsonMatch) reply = jsonMatch[0]

    console.log(`/decision - respuesta: ${reply}`)
    res.json({ decision: reply })
  } catch (error) {
    console.error('/decision error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

app.get('/', (req, res) => res.send('Proxy NPC activo'))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log('Servidor corriendo en puerto ' + PORT))
