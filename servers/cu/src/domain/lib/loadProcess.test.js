/* eslint-disable no-throw-literal */
import { describe, test } from 'node:test'
import * as assert from 'node:assert'

import { createLogger } from '../logger.js'
import { loadProcessWith } from './loadProcess.js'

const PROCESS = 'process-123-9HdeqeuYQOgMgWucro'
const logger = createLogger('ao-cu:readState')

describe('loadProcess', () => {
  test('appends process owner, tags, block, state, result, from, and evaluatedAt to ctx', async () => {
    const tags = [
      { name: 'Contract-Src', value: 'foobar' },
      { name: 'Data-Protocol', value: 'ao' },
      { name: 'ao-type', value: 'process' },
      { name: 'Foo', value: 'Bar' },
      { name: 'Foo', value: 'Buzz' }
    ]
    const loadProcess = loadProcessWith({
      findProcess: async () => { throw { status: 404 } },
      saveProcess: async () => PROCESS,
      findLatestEvaluation: async () => { throw { status: 404 } },
      loadTransactionMeta: async (_id) => ({
        owner: { address: 'woohoo' },
        tags,
        block: { height: 123, timestamp: 1697574792 }
      }),
      logger
    })

    const res = await loadProcess({ id: PROCESS, to: 'sortkey-123' }).toPromise()
    assert.deepStrictEqual(res.tags, tags)
    assert.deepStrictEqual(res.owner, 'woohoo')
    assert.deepStrictEqual(res.block, { height: 123, timestamp: 1697574792 })
    assert.deepStrictEqual(res.state, { tags, owner: 'woohoo' })
    assert.deepStrictEqual(res.result, {
      messages: [],
      output: [],
      spawns: []
    })
    assert.equal(res.from, undefined)
    assert.equal(res.evaluatedAt, undefined)
    assert.equal(res.id, PROCESS)
  })

  test('use process from db to set owner, tags, and block', async () => {
    const tags = [
      { name: 'Contract-Src', value: 'foobar' },
      { name: 'Data-Protocol', value: 'ao' },
      { name: 'ao-type', value: 'process' },
      { name: 'Foo', value: 'Bar' }
    ]
    const loadProcess = loadProcessWith({
      findProcess: async () => ({
        id: PROCESS,
        owner: 'woohoo',
        tags,
        block: { height: 123, timestamp: 1697574792 }
      }),
      saveProcess: async () => assert.fail('should not save if found in db'),
      findLatestEvaluation: async () => { throw { status: 404 } },
      loadTransactionMeta: async (_id) => assert.fail('should not load transaction meta if found in db'),
      logger
    })

    const res = await loadProcess({ id: PROCESS }).toPromise()
    assert.deepStrictEqual(res.tags, tags)
    assert.deepStrictEqual(res.owner, 'woohoo')
    assert.deepStrictEqual(res.block, { height: 123, timestamp: 1697574792 })
    assert.equal(res.id, PROCESS)
  })

  test('use latest evaluation from db to set state, result, from, and evaluatedAt on ctx', async () => {
    const cachedEvaluation = {
      sortKey: 'sortkey-123',
      processId: PROCESS,
      evaluatedAt: new Date(),
      message: {
        tags: [
          { name: 'message', value: 'tags' }
        ]
      },
      output: {
        state: { foo: 'bar' },
        result: {
          messages: [
            {
              target: 'foobar',
              tags: [
                { name: 'foo', value: 'bar' }
              ]
            }
          ],
          output: [],
          spawns: []
        }
      }
    }

    const tags = [
      { name: 'Contract-Src', value: 'foobar' },
      { name: 'Data-Protocol', value: 'ao' },
      { name: 'ao-type', value: 'process' },
      { name: 'Foo', value: 'Bar' }
    ]
    const loadProcess = loadProcessWith({
      findProcess: async () => { throw { status: 404 } },
      saveProcess: async () => PROCESS,
      findLatestEvaluation: async ({ processId, to }) => {
        assert.equal(processId, PROCESS)
        assert.equal(to, 'sortkey-123')
        return cachedEvaluation
      },
      loadTransactionMeta: async (_id) => ({
        owner: { address: 'woohoo' },
        tags,
        block: { height: 123, timestamp: 1697574792 }
      }),
      logger
    })

    const res = await loadProcess({ id: PROCESS, to: 'sortkey-123' }).toPromise()
    assert.deepStrictEqual(res.state, cachedEvaluation.output.state)
    assert.deepStrictEqual(res.result, cachedEvaluation.output.result)
    assert.deepStrictEqual(res.from, cachedEvaluation.sortKey)
    assert.deepStrictEqual(res.evaluatedAt, cachedEvaluation.evaluatedAt)
    assert.equal(res.id, PROCESS)
  })

  test('save process to db if fetched from chain', async () => {
    const tags = [
      { name: 'Contract-Src', value: 'foobar' },
      { name: 'Data-Protocol', value: 'ao' },
      { name: 'ao-type', value: 'process' },
      { name: 'Foo', value: 'Bar' }
    ]
    const loadProcess = loadProcessWith({
      findProcess: async () => { throw { status: 404 } },
      saveProcess: async (process) => {
        assert.deepStrictEqual(process, {
          id: PROCESS,
          owner: 'woohoo',
          tags,
          block: { height: 123, timestamp: 1697574792 }
        })
        return PROCESS
      },
      findLatestEvaluation: async () => { throw { status: 404 } },
      loadTransactionMeta: async (_id) => ({
        owner: { address: 'woohoo' },
        tags,
        block: { height: 123, timestamp: 1697574792 }
      }),
      logger
    })

    await loadProcess({ id: PROCESS }).toPromise()
  })

  test('gracefully handled failure to save to db', async () => {
    const tags = [
      { name: 'Contract-Src', value: 'foobar' },
      { name: 'Data-Protocol', value: 'ao' },
      { name: 'ao-type', value: 'process' },
      { name: 'Foo', value: 'Bar' }
    ]
    const loadProcess = loadProcessWith({
      findProcess: async () => { throw { status: 404 } },
      saveProcess: async () => { throw { status: 409 } },
      findLatestEvaluation: async () => { throw { status: 404 } },
      loadTransactionMeta: async (_id) => ({
        owner: { address: 'woohoo' },
        tags,
        block: { height: 123, timestamp: 1697574792 }
      }),
      logger
    })

    const res = await loadProcess({ id: PROCESS }).toPromise()
    assert.deepStrictEqual(res.tags, tags)
    assert.deepStrictEqual(res.owner, 'woohoo')
    assert.deepStrictEqual(res.block, { height: 123, timestamp: 1697574792 })
    assert.equal(res.id, PROCESS)
  })

  test('throw if the Contract-Src tag is not provided', async () => {
    const loadProcess = loadProcessWith({
      findProcess: async () => { throw { status: 404 } },
      saveProcess: async () => PROCESS,
      findLatestEvaluation: async () => { throw { status: 404 } },
      loadTransactionMeta: async (_id) => ({
        owner: { address: 'woohoo' },
        tags: [
          { name: 'Not-Contract-Src', value: 'foobar' },
          { name: 'Data-Protocol', value: 'ao' },
          { name: 'ao-type', value: 'process' }
        ],
        block: { height: 123, timestamp: 1697574792 }
      }),
      logger
    })

    await loadProcess({ id: PROCESS }).toPromise()
      .then(() => assert.fail('unreachable. Should have thrown'))
      .catch(err => assert.equal(err, "Tag 'Contract-Src' of value 'undefined' was not valid on transaction"))
  })

  test('throw if the Data-Protocol tag is not "ao"', async () => {
    const loadProcess = loadProcessWith({
      findProcess: async () => { throw { status: 404 } },
      saveProcess: async () => PROCESS,
      findLatestEvaluation: async () => { throw { status: 404 } },
      loadTransactionMeta: async (_id) => ({
        owner: { address: 'woohoo' },
        tags: [
          { name: 'Contract-Src', value: 'foobar' },
          { name: 'Data-Protocol', value: 'not_ao' },
          { name: 'ao-type', value: 'process' }
        ],
        block: { height: 123, timestamp: 1697574792 }
      }),
      logger
    })

    await loadProcess({ id: PROCESS }).toPromise()
      .then(() => assert.fail('unreachable. Should have thrown'))
      .catch(err => assert.equal(err, "Tag 'Data-Protocol' of value 'not_ao' was not valid on transaction"))
  })

  test('throw if the ao-type tag is not "process"', async () => {
    const loadProcess = loadProcessWith({
      findProcess: async () => { throw { status: 404 } },
      saveProcess: async () => PROCESS,
      findLatestEvaluation: async () => { throw { status: 404 } },
      loadTransactionMeta: async (_id) => ({
        owner: { address: 'woohoo' },
        tags: [
          { name: 'Contract-Src', value: 'foobar' },
          { name: 'Data-Protocol', value: 'ao' },
          { name: 'ao-type', value: 'message' }
        ],
        block: { height: 123, timestamp: 1697574792 }
      }),
      logger
    })

    await loadProcess({ id: PROCESS }).toPromise()
      .then(() => assert.fail('unreachable. Should have thrown'))
      .catch(err => assert.equal(err, "Tag 'ao-type' of value 'message' was not valid on transaction"))
  })
})
