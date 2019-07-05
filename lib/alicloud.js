const Core = require('@alicloud/pop-core')
let logger = console
let client = null

const setLogger = appointLogger => {
  logger = appointLogger.createLogger(__filename)
}

const initAlicloud = config => {
  client = new Core({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    endpoint: 'https://dysmsapi.aliyuncs.com',
    apiVersion: '2017-05-25'
  })
}

const SendSms = async params => {
  let result = await client.request('SendSms', params, { method: 'POST' })
}

module.exports = {
  setLogger: setLogger,
  initAlicloud: initAlicloud,
  SendSms: SendSms
}
