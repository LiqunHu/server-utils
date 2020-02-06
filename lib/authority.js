const _ = require('lodash')
const RedisClient = require('./redisClient')
const Security = require('./security')

let logger = console
let model = null

const setLogger = appointLogger => {
  logger = appointLogger.createLogger(__filename)
  Security.setLogger(appointLogger)
}

const initMiddleware = (mod, config) => {
  model = mod
  Security.setConfig(config)
  RedisClient.initClient(config.redis)
}

const AuthMiddleware = async (req, res, next) => {
  try {
    let apis = await RedisClient.get('AUTHAPI')
    if (_.isEmpty(apis)) {
      let apiList = await model.simpleSelect('select api_function, auth_flag from tbl_common_api where state = "1" and api_function != ""', [])

      for (let a of apiList) {
        apis[a.api_function] = a.auth_flag
      }
    }

    let patha = req.path.split('/')
    let func = patha[patha.length - 2].toUpperCase()

    let checkresult = await Security.token2user(req)

    if (func in apis) {
      if (apis[func] === '1') {
        if (checkresult != 0) {
          if (checkresult === -2) {
            logger.info('UNAUTHORIZED')
            return res.status(401).send({
              errno: -2,
              msg: 'Login from other place'
            })
          } else {
            logger.info('UNAUTHORIZED')
            return res.status(401).send({
              errno: -1,
              msg: 'Auth Failed or session expired'
            })
          }
        }
      }
    } else {
      if (func != 'AUTH') {
        logger.info('UNAUTHORIZED')
        return res.status(401).send({
          errno: -1,
          msg: 'Auth Failed or session expired'
        })
      }
    }
  } catch (error) {
    let sendData = {}
    if (process.env.NODE_ENV === 'test') {
      sendData = {
        errno: -1,
        msg: error.stack
      }
    } else {
      sendData = {
        errno: -1,
        msg: 'Internal Error'
      }
    }
    return res.status(500).send(sendData)
  }
  next()
}

module.exports = {
  setLogger: setLogger,
  initMiddleware: initMiddleware,
  AuthMiddleware: AuthMiddleware,
  user2token: Security.user2token,
  device2token: Security.device2token,
  aesDecryptModeCFB: Security.aesDecryptModeCFB
}
