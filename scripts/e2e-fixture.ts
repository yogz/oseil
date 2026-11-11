// Writes the file the export/import journey imports: e2e/fixtures/mes-chiffres.xlsx.
// It is `exportSheets(fixtureInput())`, the wealth of the unit tests, as the site exports it,
// with one change: the settings show euros and do not mask the amounts, so that Mon argent
// shows the total the journey checks (the unit fixture masks them, in percent).
//
// To regenerate it after a change to the format or to the fixture:
//   npx tsx scripts/e2e-fixture.ts
// then commit the new file.
import { writeFile } from 'node:fs/promises'
import { exportSheets } from '../lib/transfer/export'
import { fixtureInput, fixtureSettings } from '../lib/transfer/__tests__/fixtures'
import { writeWorkbook } from '../lib/transfer/xlsx'

const PATH = 'e2e/fixtures/mes-chiffres.xlsx'

async function main() {
  const input = { ...fixtureInput(), settings: { ...fixtureSettings(), display: 'euros' as const, hideAmounts: false } }
  const blob = await writeWorkbook(exportSheets(input))
  await writeFile(PATH, Buffer.from(await blob.arrayBuffer()))
  console.log(`Écrit : ${PATH}`)
}

main()
