const _ = require('lodash')
const twilio = require('twilio')
const phone  = require('phone')

let logger = console
let client = null
let caller = null

const setLogger = appointLogger => {
  logger = appointLogger.createLogger(__filename)
}

const initTwilio = cfg => {
  if (!_.isEmpty(cfg)) {
    client = new twilio(cfg.accountSid, cfg.authToken)
    caller = cfg.caller
  }
}

const sendMessage = async (phoneno, message) => {
  let phCk = phone(phoneno)
  if(phCk.length > 1) {
    if(phCk[1] === 'USA'){
      const result = await client.messages.create({
        body: message,
        to: phCk[0], // Text this number
        from: caller // From a valid Twilio number
      })
      logger.debug(result)
      return result
    } else {
      throw 'Not USA phone'
    }
  } else {
    throw 'phone No error'
  }
  
}

module.exports = {
  setLogger: setLogger,
  initTwilio: initTwilio,
  sendMessage: sendMessage
}
