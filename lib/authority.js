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
    let apiList = await model.simpleSelect('select * from tbl_common_api where state = "1" and auth_flag = "1"', [])

    let apis = {}
    for (let a of apiList) {
      if (a.api_path) {
        apis[a.api_function] = a.auth_flag
      }
    }

    let patha = req.path.split('/')
    let func = patha[patha.length - 2].toUpperCase()

    let deviceResult = await Security.token2device(req)

    if (deviceResult < 0) {
      return res.status(401).send({
        errno: -1,
        msg: 'Auth Failed or session expired'
      })
    }

    let checkresult = await Security.token2user(req)

    if (func in apis) {
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
            msg: 'Auth Failed or session  expired'
          })
        }
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
