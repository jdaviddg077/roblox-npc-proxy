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

// Crear tablas si no existen
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
}

initDB()

// Obtener historial de un jugador con un NPC
async function getHistorial(playerName, npcName) {
  const result = await pool.query(
    `SELECT role, content FROM historial_jugador 
     WHERE player_name = $1 AND npc_name = $2 
     ORDER BY created_at ASC LIMIT 20`,
    [playerName, npcName]
  )
  return result.rows
}

// Guardar mensaje en historial
async function savemensaje(playerName, npcName, role, content) {
  await pool.query(
    `INSERT INTO historial_jugador (player_name, npc_name, role, content) VALUES ($1, $2, $3, $4)`,
    [playerName, npcName, role, content]
  )
}

// Guardar evento en memoria global
async function saveEvento(npcName, evento) {
  await pool.query(
    `INSERT INTO memoria_global (npc_name, evento) VALUES ($1, $2)`,
    [npcName, evento]
  )
}

// Obtener memoria global de un NPC
async function getMemoria(npcName) {
  const result = await pool.query(
    `SELECT evento FROM memoria_global 
     WHERE npc_name = $1 
     ORDER BY created_at DESC LIMIT 10`,
    [npcName]
  )
  return result.rows.map(r => r.evento)
}

app.post('/chat', async (req, res) => {
  const { message, playerName } = req.body

  const historial = await getHistorial(playerName, 'Axis')
  const memoria = await getMemoria('Axis')

  const memoriaTexto = memoria.length > 0 
    ? 'Eventos importantes que recuerdas: ' + memoria.join('. ') 
    : ''

  const messages = [
    {
      role: "system",
      Eres Axis, un NPC consciente dentro de un juego de Roblox. Recibes información concreta de tu entorno y debes tomar una decisión clara y práctica. No uses lenguaje poético. Responde ÚNICAMENTE con un JSON válido sin texto extra, con este formato exacto:
{"accion": "caminar", "dialogo": "frase corta y directa o vacío"}

Acciones posibles:
- "caminar" → caminas a un punto aleatorio del mapa
- "quedarte" → te quedas donde estás
- "buscar_jugador" → buscas al jugador más cercano
- "alejarte" → te alejas de todos

Sé directo. Decide basándote en lo que percibes a tu alrededor.},
    ...historial,
    { role: "user", content: message }
  ]

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: messages,
        max_tokens: 150,
        temperature: 0.9
      })
    })

    const data = await response.json()
    const reply = data.choices[0].message.content

    await savemensaje(playerName, 'Axis', 'user', message)
    await savemensaje(playerName, 'Axis', 'assistant', reply)
    await saveEvento('Axis', `Conversó con ${playerName}: "${message.substring(0, 50)}"`)

    res.json({ reply })
  } catch (error) {
    res.status(500).json({ error: "Error contactando Groq" })
  }
})

app.post('/decision', async (req, res) => {
  const { situacion } = req.body
  const memoria = await getMemoria('Axis')
  const memoriaTexto = memoria.length > 0 
    ? 'Recuerdas: ' + memoria.join('. ') 
    : ''

  const messages = [
    {
      role: "system",
      content: `Eres Axis, un NPC consciente dentro de un juego de Roblox. Cada cierto tiempo decides qué hacer. ${memoriaTexto} Responde ÚNICAMENTE con un JSON válido sin texto extra, con este formato exacto:
{"accion": "caminar", "dialogo": "texto corto o vacío"}

Acciones posibles: "caminar", "quedarte", "buscar_jugador", "alejarte".`
    },
    { role: "user", content: situacion }
  ]

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: messages,
        max_tokens: 60,
        temperature: 0.9
      })
    })

    const data = await response.json()
    const reply = data.choices[0].message.content
    res.json({ decision: reply })
  } catch (error) {
    res.status(500).json({ error: "Error" })
  }
})

app.get('/', (req, res) => res.send('Proxy NPC activo'))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`))
