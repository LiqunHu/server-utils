const _ = require('lodash')
const dayjs = require('dayjs')
const RedisClient = require('./redisClient')
const Security = require('./security')

let logger = console
let model = null
let apiTimes = null

const setLogger = (appointLogger) => {
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

    // let deviceResult = await Security.token2device(req)

    // if (deviceResult < 0) {
    //   return res.status(401).send({
    //     errno: -1,
    //     msg: 'Auth Failed or session expired'
    //   })
    // }

    let checkresult = await Security.token2user(req)

    if (func in apis) {
      if (apis[func] === '1') {
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
    } else {
      if (func != 'AUTH') {
        logger.info('UNAUTHORIZED')
        return res.status(401).send({
          errno: -1,
          msg: 'Auth Failed or session expired',
        })
      }
    }

    // apitimes Check
    if (apiTimes === null) {
      apiTimes = {}
      let times = await model.simpleSelect('select api_function_method, api_times_visit_limit from tbl_common_api_times', [])
      for (let r of times) {
        apiTimes[r.api_function_method] = r.api_times_visit_limit
      }
      await RedisClient.del('APITIMES')
      await RedisClient.hmset('APITIMES', apiTimes)
    }
    let apifunc = (patha[patha.length - 2] + patha[patha.length - 1]).toUpperCase()
    if (_.has(apiTimes, apifunc)) {
      if (!req.user) {
        return res.status(401).send({
          errno: -1,
          msg: 'Auth Failed or session expired',
        })
      }
      let token_str = req.get('authorization')
      let tokensplit = token_str.split('_')
      if (tokensplit[0] !== 'SYSTEM') { //系统token 不校验次数
        if (req.user.groups.indexOf('VIP1') < 0 && req.user.groups.indexOf('VIP2') < 0 && req.user.groups.indexOf('VIP3') < 0) {
          let key = `APITIMES_${req.user.user_id}`
          let creatAt = await RedisClient.hget(key, 'create_at')
          let now = dayjs().format('YYYY-MM-DD')

          if (apiTimes[apifunc] === 0) {
            return res.status(700).send({
              errno: 'auth_13',
              msg: '免费用户访问此时超限制',
            })
          }

          if (creatAt != now) {
            await RedisClient.del(key)
            let setData = { create_at: now }
            setData[apifunc] = 1
            await RedisClient.hmset(key, setData)

            await RedisClient.expire(key, 24 * 60 * 60)
          } else {
            let visitcount = await RedisClient.hget(key, apifunc)
            if (visitcount) {
              if (parseInt(visitcount) >= apiTimes[apifunc]) {
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
