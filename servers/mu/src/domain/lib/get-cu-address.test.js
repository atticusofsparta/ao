import { describe, test } from 'node:test'
import * as assert from 'node:assert'

import { getCuAddressWith } from './get-cu-address.js'

const logger = () => undefined
logger.tap = () => (args) => {
  return args
}

// selectNode doesnt return processId just here for testing
async function selectNode ({ processId }) {
  return processId
}

describe('getCuAddress', () => {
  test('select a cu address by process id', async () => {
    const getCuAddress = getCuAddressWith({
      selectNode,
      logger
    })

    const result = await getCuAddress({
      tx: {
        processId: 'id-1'
      }
    }).toPromise()

    assert.equal(result.cuAddress, 'id-1')
  })
})
