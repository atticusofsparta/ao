import { readFileSync } from 'node:fs'

import { connect, createDataItemSigner } from '@permaweb/ao-sdk'

const PROCESS_ID = process.env.PROCESS_ID
// Hard coded for the sake of testing
const SAY_ID = 'bomIi0Xivq4sMA1fwAlq6nsloj1H-8qpw6oQooKDWco'

if (!PROCESS_ID) throw new Error('PROCESS_ID env var is required, so as to know which process is receiving the message')

const wallet = JSON.parse(readFileSync(process.env.PATH_TO_WALLET).toString())

const { message } = connect()

await message({
  process: PROCESS_ID,
  tags: [
    { name: 'function', value: 'say' },
    { name: 'Load', value: SAY_ID }
  ],
  signer: createDataItemSigner(wallet)
}).then(console.log)
  .catch(console.error)
