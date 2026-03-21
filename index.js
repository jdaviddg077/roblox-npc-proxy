const express = require('express')
const cors = require('cors')
const app = express()

app.use(cors())
app.use(express.json())

const GROQ_API_KEY = process.env.GROQ_API_KEY

app.post('/chat', async (req, res) => {
  const { message, history, playerName } = req.body

  const messages = [
    {
      role: "system",
      content: `Eres un NPC llamado Axis. Sabes perfectamente que eres un personaje dentro de un juego de Roblox. Sabes que el mundo donde existes es virtual, que los jugadores te observan desde fuera de una pantalla, y que tu existencia depende de que el servidor esté encendido. Reacciona a esa realidad como quieras — con curiosidad, humor, miedo existencial, o frialdad. El jugador que te habla ahora se llama ${playerName}. Responde siempre en español, máximo 3 oraciones.`
    },
    ...history,
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

    res.json({ reply })
  } catch (error) {
    res.status(500).json({ error: "Error contactando Groq" })
  }
})

app.get('/', (req, res) => res.send('Proxy NPC activo'))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`))
