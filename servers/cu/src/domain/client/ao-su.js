/* eslint-disable camelcase */
import { Transform, compose as composeStreams } from 'node:stream'
import { of } from 'hyper-async'
import { always, applySpec, filter, has, ifElse, isNil, isNotNil, juxt, last, mergeAll, path, pathOr, pipe, prop } from 'ramda'
import DataLoader from 'dataloader'

import { backoff, mapForwardedBy, mapFrom, parseTags, strFromFetchError } from '../utils.js'

const okRes = (res) => {
  if (res.ok) return res
  throw res
}

const resToJson = (res) => res.json()

/**
 * See new shape in https://github.com/permaweb/ao/issues/563#issuecomment-2020597581
 */
export const mapNode = pipe(
  juxt([
    // fromAssignment
    pipe(
      path(['assignment']),
      (assignment) => parseTags(assignment.tags),
      applySpec({
        /**
         * There could be multiple Exclude tags,
         * but parseTags will accumulate them into an array,
         *
         * which is what we want
         */
        Exclude: path(['Exclude']),
        /**
         * Data from the assignment, to be placed
         * on the message
         */
        message: applySpec({
          Message: path(['Message']),
          Target: path(['Process']),
          Epoch: pipe(path(['Epoch']), parseInt),
          Nonce: pipe(path(['Nonce']), parseInt),
          Timestamp: pipe(path(['Timestamp']), parseInt),
          'Block-Height': pipe(
          /**
           * Returns a left padded integer like '000001331218'
           *
           * So use parseInt to convert it into a number
           */
            path(['Block-Height']),
            parseInt
          ),
          'Hash-Chain': path(['Hash-Chain'])
        })
      })
    ),
    // fromMessage
    pipe(
      path(['message']),
      ifElse(
        isNil,
        /**
         * No message, meaning this is an Assignment for an existing message
         * on chain, to be hydrated later (see hydrateMessages)
         */
        always(undefined),
        applySpec({
          Id: path(['id']),
          Signature: path(['signature']),
          Data: path(['data']),
          Owner: path(['owner', 'address']),
          Anchor: path(['anchor']),
          From: (message) => mapFrom({ tags: message.tags, owner: message.owner.address }),
          'Forwarded-By': (message) => mapForwardedBy({ tags: message.tags, owner: message.owner.address }),
          Tags: pathOr([], ['tags'])
        })
      )
    ),
    // static
    always({ Cron: false })
  ]),
  // Combine into the desired shape
  ([fAssignment, fMessage = {}, fStatic]) => ({
    cron: undefined,
    ordinate: fAssignment.message.Nonce,
    name: `Scheduled Message ${fMessage.Id || fAssignment.message.Message} ${fAssignment.message.Timestamp}:${fAssignment.message.Nonce}`,
    exclude: fAssignment.Exclude,
    isAssignment: !fMessage.Id,
    message: mergeAll([
      fMessage,
      fAssignment.message,
      /**
       * Ensure Id is always set, regardless if this is a message
       * or just an Assignment for an existing message on-chain
       */
      { Id: fMessage.Id || fAssignment.message.Message },
      fStatic
    ]),
    /**
     * We need the block metadata per message,
     * so that we can calculate cron messages
     *
     * Separating them here, makes it easier to access later
     * down the pipeline
     */
    block: {
      height: fAssignment.message['Block-Height'],
      timestamp: fAssignment.message.Timestamp
    }
  })
)

export const loadMessagesWith = ({ fetch, logger: _logger, pageSize }) => {
  const logger = _logger.child('ao-su:loadMessages')

  const fetchPageDataloader = new DataLoader(async (args) => {
    fetchPageDataloader.clearAll()

    return Promise.allSettled(
      args.map(({ suUrl, processId, from, to, pageSize }) => {
        return Promise.resolve({ 'process-id': processId, from, to, limit: pageSize })
          .then(filter(isNotNil))
          .then(params => new URLSearchParams(params))
          .then((params) => fetch(`${suUrl}/${processId}?${params.toString()}`).then(okRes))
          .catch(async (err) => {
            logger(
              'Error Encountered when fetching page of scheduled messages from SU \'%s\' for process \'%s\' between \'%s\' and \'%s\'',
              suUrl,
              processId,
              from,
              to
            )
            throw new Error(`Encountered Error fetching scheduled messages from Scheduler Unit: ${await strFromFetchError(err)}`)
          })
          .then(resToJson)
      })
    ).then((values) =>
      /**
       * By returning the error, Dataloader will register as an error
       * for the individual call to load, without failing the batch as a whole
       *
       * See https://www.npmjs.com/package/dataloader#caching-errors
       */
      values.map(v => v.status === 'fulfilled' ? v.value : v.reason)
    )
  }, {
    cacheKeyFn: ({ suUrl, processId, from, to, pageSize }) => `${suUrl},${processId},${from},${to},${pageSize}`,
    batchScheduleFn: (cb) => setTimeout(cb, 20)
  })

  /**
   * Returns an async generator that emits scheduled messages,
   * one at a time
   *
   * Scheduled messages are fetched a page at a time, but
   * emitted from the generator one message at a time.
   *
   * When the currently fetched page is drained, the next page is fetched
   * dynamically
   */
  function fetchAllPages ({ suUrl, processId, from, to }) {
    async function fetchPage ({ from }) {
      const params = new URLSearchParams(filter(isNotNil, { 'process-id': processId, from, to, limit: pageSize }))

      return backoff(
        () => fetchPageDataloader.load({ suUrl, processId, from, to, pageSize }),
        { maxRetries: 5, delay: 500, log: logger, name: `loadMessages(${JSON.stringify({ suUrl, processId, params: params.toString() })})` }
      )
    }

    return async function * scheduled () {
      let curPage = []
      let curFrom = from
      let hasNextPage = true

      let total = 0

      while (hasNextPage) {
        await Promise.resolve()
          .then(() => {
            logger(
              'Loading next page of max %s messages for process "%s" from SU "%s" between "%s" and "%s"',
              pageSize,
              processId,
              suUrl,
              from || 'initial',
              to || 'latest'
            )
            return fetchPage({ from: curFrom })
          })
          .then(({ page_info, edges }) => {
            total += edges.length
            curPage = edges
            hasNextPage = page_info.has_next_page
            curFrom = page_info.has_next_page && pipe(
              last,
              path(['cursor'])
            )(edges)
          })

        while (curPage.length) yield curPage.shift()
      }

      logger(
        'Successfully loaded a total of %s scheduled messages for process "%s" from SU "%s" between "%s" and "%s"...',
        total,
        processId,
        suUrl,
        from || 'initial',
        to || 'latest')
    }
  }

  function mapAoMessage ({ processId, processOwner, processTags, moduleId, moduleOwner, moduleTags }) {
    const AoGlobal = {
      Process: { Id: processId, Owner: processOwner, Tags: processTags },
      Module: { Id: moduleId, Owner: moduleOwner, Tags: moduleTags }
    }

    return async function * (edges) {
      for await (const edge of edges) {
        yield pipe(
          prop('node'),
          /**
           * Map to the expected shape
           */
          mapNode,
          (scheduled) => {
            scheduled.AoGlobal = AoGlobal
            return scheduled
          }
        )(edge)
      }
    }
  }

  return (args) =>
    of(args)
      .map(({ suUrl, processId, owner: processOwner, tags: processTags, moduleId, moduleOwner, moduleTags, from, to }) => {
        return composeStreams(
          /**
           * compose will convert the AsyncIterable into a readable Duplex
           */
          fetchAllPages({ suUrl, processId, from, to })(),
          Transform.from(mapAoMessage({ processId, processOwner, processTags, moduleId, moduleOwner, moduleTags }))
        )
      })
      .toPromise()
}

export const loadProcessWith = ({ fetch, logger }) => {
  return async ({ suUrl, processId }) => {
    return backoff(
      () => fetch(`${suUrl}/processes/${processId}`, { method: 'GET' }).then(okRes),
      { maxRetries: 5, delay: 500, log: logger, name: `loadProcess(${JSON.stringify({ suUrl, processId })})` }
    )
      .catch(async (err) => {
        logger('Error Encountered when loading process "%s" from SU "%s"', processId, suUrl)
        throw new Error(await strFromFetchError(err))
      })
      .then(resToJson)
      .then(applySpec({
        owner: path(['owner', 'address']),
        tags: path(['tags']),
        block: applySpec({
          height: pipe(
            path(['block']),
            (block) => parseInt(block)
          ),
          /**
           * SU is currently sending back timestamp in milliseconds,
           */
          timestamp: path(['timestamp'])
        })
      }))
  }
}

export const loadTimestampWith = ({ fetch, logger }) => {
  return ({ suUrl, processId }) => backoff(
    () => fetch(`${suUrl}/timestamp?process-id=${processId}`).then(okRes),
    { maxRetries: 5, delay: 500, log: logger, name: `loadTimestamp(${JSON.stringify({ suUrl, processId })})` }
  )
    .catch(async (err) => {
      logger('Error Encountered when loading timestamp for process "%s" from SU "%s"', processId, suUrl)
      throw new Error(await strFromFetchError(err))
    })
    .then(resToJson)
    .then((res) => ({
      /**
       * TODO: SU currently sends these back as strings
       * so need to parse them to integers
       */
      timestamp: parseInt(res.timestamp),
      height: parseInt(res.block_height)
    }))
}

export const loadMessageMetaWith = ({ fetch, logger }) => {
  const legacyMeta = (res) => ({
    processId: res.process_id,
    timestamp: res.timestamp,
    nonce: res.nonce
  })

  const meta = pipe(
    pathOr([], ['assignment', 'tags']),
    parseTags,
    applySpec({
      processId: path(['Process']),
      timestamp: pipe(
        path(['Timestamp']),
        parseInt
      ),
      nonce: pipe(
        path(['Nonce']),
        parseInt
      )
    })
  )

  const mapMeta = ifElse(has('assignment'), meta, legacyMeta)

  return async ({ suUrl, processId, messageTxId }) => {
    return backoff(
      () => fetch(`${suUrl}/${messageTxId}?process-id=${processId}`, { method: 'GET' }).then(okRes),
      { maxRetries: 5, delay: 500, log: logger, name: `loadMessageMeta(${JSON.stringify({ suUrl, processId, messageTxId })})` }
    )
      .catch(async (err) => {
        logger(
          'Error Encountered when loading message meta for message "%s" to process "%s" from SU "%s"',
          messageTxId, processId, suUrl
        )
        throw new Error(await strFromFetchError(err))
      })
      .then(resToJson)
      /**
       * Map to the expected shape, depending on the response shape.
       * See https://github.com/permaweb/ao/issues/563
       */
      .then(mapMeta)
  }
}
