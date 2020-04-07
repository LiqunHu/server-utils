const _ = require('lodash')
const amqplib = require('amqplib')
const genericPool = require('generic-pool')

const exchange = 'common-delay-exchange'
const delayQueue = 'delayedjobs'
let logger = console
let publisherPools = null

const setLogger = appointLogger => {
  logger = appointLogger.createLogger(__filename)
}

const fail = (err, conn) => {
  logger.error(err)
  if (conn) conn.close()
}

const initRabbitmq = (rabbitmqConfig, cb) => {
  amqplib
    .connect(rabbitmqConfig.connectOptions)
    .then(conn => {
      conn
        .createChannel()
        .then(async ch => {
          let queues = _.union(rabbitmqConfig.consumerQueue, rabbitmqConfig.publisherQueue.queues, [delayQueue])
          // init consumerQueue
          for (let qname of queues) {
            await ch.assertQueue(qname, { durable: true })
          }

          //assert the exchange: 'common-delay-exchange' to be a x-delayed-message
          await ch.assertExchange(exchange, 'x-delayed-message', {
            autoDelete: false,
            durable: true,
            passive: true,
            arguments: { 'x-delayed-type': 'direct' }
          })
          await ch.bindQueue(delayQueue, exchange, delayQueue)
          ch.close()
          conn.close()
          cb()
        })
        .catch(err => {
          fail(err, conn)
        })
    })
    .catch(err => {
      logger.error(err)
    })
}

const startConsumer = (connectOptions, qname, router) => {
  amqplib
    .connect(connectOptions)
    .then(conn => {
      conn
        .createChannel()
        .then(ch => {
          return ch.consume(
            qname,
            async msg => {
              if (msg !== null) {
                try {
                  let req = {
                      rabbitmq: true,
                      params: {
                        method: ''
                      },
                      body: {}
                    },
                    res = {
                      rabbitmq: true,
                      errno: '0',
                      msg: 'ok',
                      info: {}
                    }
                  let request = JSON.parse(msg.content.toString())
                  req.params.method = _.last(_.split(request.url, '/'))
                  req.body = request.message
                  let url = request.url.substring(0, request.url.length - req.params.method.length - 1)
                  if (url in router) {
                    await router[url](req, res)
                    ch.ack(msg)
                  } else {
                    logger.error('url is not in router list')
                    logger.error(url)
                    res.errno = -1
                    res.msg = 'url is not in router list'
                    ch.nack(msg)
                  }
                } catch (error) {
                  logger.error(error)
                  ch.nack(msg)
                }
              }
            },
            { noAck: false }
          )
        })
        .catch(err => {
          fail(err, conn)
        })
    })
    .catch(err => {
      logger.error(err)
    })
}

const startConsumers = (rabbitmqConfig, router) => {
  rabbitmqConfig.consumerQueue.forEach(queue => {
    startConsumer(rabbitmqConfig.connectOptions, queue, router)
  })

  // delayed queue
  startConsumer(rabbitmqConfig.connectOptions, delayQueue, router)
}

const genConnectionPools = rabbitmqConfig => {
  if (publisherPools === null) {
    const factory = {
      create: () => {
        return new Promise((resolve, reject) => {
          amqplib
            .connect(rabbitmqConfig.connectOptions)
            .then(conn => {
              resolve(conn)
            })
            .catch(error => {
              reject(error)
            })
        })
      },
      destroy: conn => {
        if (conn) {
          conn.close()
        }
      }
    }

    publisherPools = genericPool.createPool(factory, rabbitmqConfig.publisherQueue.config)
    publisherPools.publisherQueues = rabbitmqConfig.publisherQueue.queues
  }
}

const initRabbitmqClient = (rabbitmqConfig, router) => {
  if (_.isObject(rabbitmqConfig)) {
    initRabbitmq(rabbitmqConfig, () => {
      startConsumers(rabbitmqConfig, router)
      genConnectionPools(rabbitmqConfig)
    })
  }
}

const sendToQueue = async (queue, url, message) => {
  return new Promise((resolve, reject) => {
    if (publisherPools === null) {
      reject('Lost connection')
    }
    if (publisherPools.publisherQueues.indexOf(queue) < 0) {
      reject('queue error')
    }
    publisherPools
      .acquire()
      .then(conn => {
        conn
          .createChannel()
          .then(function(ch) {
            ch.sendToQueue(queue, Buffer.from(JSON.stringify({ url: url, message: message })))
            ch.close()
            publisherPools.release(conn)
            resolve()
          })
          .catch(err => {
            logger.error(err)
            publisherPools.destroy(conn)
            reject(err)
          })
      })
      .catch(err => {
        logger.error(err)
        reject(err)
      })
  })
}

const sendToDelay = async (queue, url, message, delay) => {
  return new Promise((resolve, reject) => {
    if (publisherPools === null) {
      reject('Lost connection')
    }
    if (publisherPools.publisherQueues.indexOf(queue) < 0) {
      reject('queue error')
    }
    publisherPools
      .acquire()
      .then(conn => {
        conn
          .createChannel()
          .then(function(ch) {
            ch.publish(exchange, delayQueue, Buffer.from(JSON.stringify({ url: url, message: message })), { headers: { 'x-delay': delay } })
            ch.close()
            publisherPools.release(conn)
            resolve()
          })
          .catch(err => {
            logger.error(err)
            publisherPools.destroy(conn)
            reject(err)
          })
      })
      .catch(err => {
        logger.error(err)
        reject(err)
      })
  })
}

module.exports = {
  setLogger: setLogger,
  initRabbitmqClient: initRabbitmqClient,
  sendToQueue: sendToQueue,
  sendToDelay: sendToDelay
}
