import { app } from './app.js'
import { ensurePresets } from './services/ensurePresets.js'

const port = process.env.PORT ? Number(process.env.PORT) : 4000

ensurePresets().catch((err) => console.error('ensurePresets failed:', err))

app.listen(port, () => {
  console.log(`Health Scanner API listening on http://localhost:${port}`)
})
