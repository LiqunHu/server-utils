const _ = require('lodash')
const amqp = require('amqp-connection-manager')

let logger = console
let connection
let sendChannel
const exchange = 'common-delay-exchange'
const delayQueue = 'delayedjobs'

const setLogger = (appointLogger) => {
  logger = appointLogger.createLogger(__filename)
}

const initRabbitmq = (rabbitmqConfig) => {
  connection = amqp.connect([rabbitmqConfig.url])
  connection.on('connect', function () {
    logger.info('MQ Connected!')
  })
  connection.on('disconnect', function (err) {
    logger.info('MQ Disconnected.', err.stack)
  })
  sendChannel = connection.createChannel({
    json: true,
    setup: function (channel) {
      let waitFunc = []
      for (let q of rabbitmqConfig.publisherQueue.queues) {
        waitFunc.push(channel.assertQueue(q, { durable: true }))
      }
      waitFunc.push(channel.assertExchange(exchange, 'x-delayed-message', {
        autoDelete: false,
        durable: true,
        passive: true,
        arguments: { 'x-delayed-type': 'direct' },
      }))
      waitFunc.push(channel.bindQueue(delayQueue, exchange, delayQueue))
      return Promise.all(waitFunc)
    },
  })
}
const startConsumer = (qname, router) => {
  const channelWrapper = connection.createChannel({
    setup: function (channel) {
      // `channel` here is a regular amqplib `ConfirmChannel`.
      return Promise.all([
        channel.assertQueue(qname, { durable: true }),
        channel.prefetch(1),
        channel.consume(
          qname,
          (msg) => {
            if (msg !== null) {
              try {
                let req = {
                    rabbitmq: true,
                    params: {
                      method: '',
                    },
                    body: {},
                  },
                  res = {
                    rabbitmq: true,
                    errno: '0',
                    msg: 'ok',
                    info: {},
                  }
                let request = JSON.parse(msg.content.toString())
                req.params.method = _.last(_.split(request.url, '/'))
                req.body = request.message
                let url = request.url.substring(0, request.url.length - req.params.method.length - 1)
                if (url in router) {
                  router[url](req, res)
                    .then(() => {
                      logger.info(url + ' Success')
                      channel.ack(msg)
                    })
                    .catch(function (error) {
                      logger.error(error)
                    })
                } else {
                  res.errno = -1
                  res.msg = 'url is not in router list'
                  channel.nack(msg)
                }
              } catch (error) {
                channel.nack(msg)
                logger.error(error)
              }
            }
          },
          { noAck: false }
        ),
      ])
    },
  })

  channelWrapper.waitForConnect()
}

const startConsumers = (rabbitmqConfig, router) => {
  rabbitmqConfig.consumerQueue.forEach((queue) => {
    startConsumer(queue, router)
  })
  startConsumer(delayQueue, router)
}

const initRabbitmqClient = (rabbitmqConfig, router) => {
  if (_.isObject(rabbitmqConfig)) {
    initRabbitmq(rabbitmqConfig)
    if (!_.isEmpty(router)) {
      startConsumers(rabbitmqConfig, router)
    }
  }
}

const sendToQueue = async (queue, url, message) => {
  await sendChannel.sendToQueue(queue, { url: url, message: message })
}

const sendToDelay = async (url, message, delay) => {
  await sendChannel.publish(exchange, delayQueue, { url: url, message: message }, { headers: { 'x-delay': delay } })
}

module.exports = {
  setLogger: setLogger,
  initRabbitmqClient: initRabbitmqClient,
  sendToQueue: sendToQueue,
  sendToDelay: sendToDelay
}
