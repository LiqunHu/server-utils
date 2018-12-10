const _ = require('lodash')
const amqplib = require('amqplib')
const genericPool = require('generic-pool')

let logger = console.out
let publisherPools = null

const setLogger = appointLogger => {
  logger = appointLogger.createLogger(__filename)
}


const fail = (err, conn) => {
  logger.error(err)
  if (conn) conn.close()
}

const startConsumer = (connectOptions, qname, router) => {
  amqplib
    .connect(connectOptions)
    .then(conn => {
      conn
        .createChannel()
        .then(ch => {
          return ch.assertQueue(qname, { durable: true }).then(ok => {
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
                        errno: 0,
                        msg: 'ok',
                        info: {}
                      }
                    let request = JSON.parse(msg.content.toString())
                    req.params.method = _.last(_.split(request.url, '/'))
                    req.body = request.message
                    let url = request.url.substring(0, request.url.length - req.params.method.length - 1)
                    if (url in router) {
                      await router[url](req, res)
                    } else {
                      res.errno = -1
                      res.msg = 'url is not in router list'
                    }

                    ch.ack(msg)
                  } catch (error) {
                    ch.nack(msg)
                    logger.error(error)
                  }
                }
              },
              { noAck: false }
            )
          })
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
  if (_.isObject(rabbitmqConfig)) {
    rabbitmqConfig.consumerQueue.forEach(queue => {
      startConsumer(rabbitmqConfig.connectOptions, queue, router)
    })
  }
}

const genConnectionPools = rabbitmqConfig => {
  if (publisherPools === null && _.isObject(rabbitmqConfig)) {
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
  startConsumers(rabbitmqConfig, router)
  genConnectionPools(rabbitmqConfig)
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
            ch.assertQueue(queue)
              .then(ok => {
                ch.sendToQueue(queue, Buffer.from(JSON.stringify({ url: url, message: message })))
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
  sendToQueue: sendToQueue
}
