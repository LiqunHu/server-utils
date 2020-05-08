const moment = require('moment')
const RedisClient = require('./redisClient')
const Security = require('./security')

let logger = console
let model = null
let apitimes = null

const setLogger = (appointLogger) => {
  logger = appointLogger.createLogger(__filename)
  Security.setLogger(appointLogger)
}

const initMiddleware = (mod, config, apitconfig) => {
  model = mod
  Security.setConfig(config)
  RedisClient.initClient(config.redis)
  if (apitconfig) {
    apitimes = apitconfig
  }
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

    // let deviceResult = await Security.token2device(req)

    // if (deviceResult < 0) {
    //   return res.status(401).send({
    //     errno: -1,
    //     msg: 'Auth Failed or session expired'
    //   })
    // }

    let checkresult = await Security.token2user(req)

    if (func in apis) {
      if (checkresult != 0) {
        if (checkresult === -2) {
          logger.info('UNAUTHORIZED')
          return res.status(401).send({
            errno: -2,
            msg: 'Login from other place',
          })
        } else {
          logger.info('UNAUTHORIZED')
          return res.status(401).send({
            errno: -1,
            msg: 'Auth Failed or session expired',
          })
        }
      }
    }

    // apitimes Check
    let apifunc = (patha[patha.length - 2] + patha[patha.length - 1]).toUpperCase()
    if (apitimes[apifunc]) {
      if (!req.user) {
        return res.status(401).send({
          errno: -1,
          msg: 'Auth Failed or session expired',
        })
      }
      if (req.user.groups.indexOf('VIP1') < 0 && req.user.groups.indexOf('VIP2') < 0 && req.user.groups.indexOf('VIP3') < 0) {
        let key = `APITIMES_${req.user.user_id}`
        let creatAt = await RedisClient.hget(key, 'create_at')
        let now = moment().format('YYYY-MM-DD')
        if (creatAt != now) {
          await RedisClient.del(key)
          await RedisClient.hmset(key, { create_at: now, apifunc: 1 })
          await RedisClient.expire(key, 24 * 60 * 60)
        } else {
          let visitcount = await RedisClient.hget(key, apifunc)
          if (visitcount) {
            if (visitcount >= apitimes[apifunc]) {
              return res.status(700).send({
                errno: 'auth_13',
                msg: '免费用户访问此时超限制',
              })
            } else {
              await RedisClient.hincrby(key, apifunc, 1)
            }
          } else {
            await RedisClient.hset(key, apifunc, 1)
          }
        }
      }
    }
  } catch (error) {
    let sendData = {}
    if (process.env.NODE_ENV === 'dev') {
      sendData = {
        errno: -1,
        msg: error.stack,
      }
    } else {
      sendData = {
        errno: -1,
        msg: 'Internal Error',
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
  aesDecryptModeCFB: Security.aesDecryptModeCFB,
}