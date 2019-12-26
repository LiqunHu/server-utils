const rabbitmqClinet = require('./lib/rabbitmqClinet')
const websocketUtil = require('./lib/websocketUtil')
const redisClient = require('./lib/redisClient')
const authority = require('./lib/authority')
const scheduleJob = require('./lib/scheduleJob')
const smsClient = require('./lib/smsClient')
const twilioClient = require('./lib/twilioClient')
const fileUtil = require('./lib/fileUtil')
const mongoClient = require('./lib/mongoClient')
const elasticsearchClient = require('./lib/elasticsearchClient')
const alicloud = require('./lib/alicloud')
const WXPay = require('./lib/wxpay')

const setLogger = appointLogger => {
  rabbitmqClinet.setLogger(appointLogger)
  websocketUtil.setLogger(appointLogger)
  authority.setLogger(appointLogger)
  scheduleJob.setLogger(appointLogger)
  smsClient.setLogger(appointLogger)
  twilioClient.setLogger(appointLogger)
  fileUtil.setLogger(appointLogger)
  alicloud.setLogger(appointLogger)
}

module.exports = {
  setLogger: setLogger,
  authority: authority,
  rabbitmqClinet: rabbitmqClinet,
  redisClient: redisClient,
  scheduleJob: scheduleJob,
  websocketUtil: websocketUtil,
  smsClient: smsClient,
  twilioClient: twilioClient,
  fileUtil: fileUtil,
  mongoClient: mongoClient,
  elasticsearchClient: elasticsearchClient,
  alicloud: alicloud,
  WXPay: WXPay.wxpay
}
