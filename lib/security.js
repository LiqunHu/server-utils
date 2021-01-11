const CryptoJS = require('crypto-js')
const RedisClient = require('./redisClient')

let logger = console
let config = null

const setLogger = (appointLogger) => {
  logger = appointLogger.createLogger(__filename)
}

const setConfig = (cfg) => {
  config = cfg
}

const token2user = async (req) => {
  try {
    let token_str = req.get('authorization')
    if (!token_str) {
      logger.debug('no token')
      return -1
    }

    let tokensplit = token_str.split('_')
    if (tokensplit.length != 5) {
      return -1
    }

    let type = tokensplit[0],
      uid = tokensplit[1],
      expires = tokensplit[3],
      sha1 = tokensplit[4]

    if (parseInt(expires) < Date.now()) {
      logger.debug('expires')
      return -3
    }

    let authData = await RedisClient.get(['AUTH', type, uid].join('_'))
    if (authData) {
      let user = authData.user
      if (!user) {
        logger.debug('user do not exist')
        return -1
      }
      req.user = user

      if (authData.session_token != token_str) {
        logger.debug('login from other place')
        return -2
      }

      let s = [type, uid, user.created_at, expires, config.SECRET_KEY].join('_')

      if (sha1 != CryptoJS.SHA1(s).toString()) {
        logger.error('invalid sha1')
        return -1
      }

      let patha = req.path.split('/')
      let func = patha[patha.length - 2].toUpperCase()

      // if (
      //   config.syslogFlag &&
      //   func !== 'AUTH' &&
      //   method !== 'init' &&
      //   method !== 'search' &&
      //   method.search(/search/i) < 0
      // ) {
      //   tb_common_userlog.create({
      //     user_id: user.user_id,
      //     api_function: func,
      //     userlog_method: method,
      //     userlog_para: JSON.stringify(req.body)
      //   })
      // }

      let apiList = authData.authApis

      //auth control
      let apis = {}
      for (let m of apiList) {
        apis[m.api_function] = ''
      }

      if (func in apis) {
        return 0
      }
    } else {
      logger.error('Redis get authData failed')
      return -1
    }

    return -1
  } catch (error) {
    logger.error(error)
    return -1
  }
}

// const aesEncryptModeCFB = (msg, pwd, magicNo) => {
//   let key = CryptoJS.enc.Hex.parse(pwd)
//   let iv = CryptoJS.enc.Hex.parse(magicNo)

//   let identifyCode = CryptoJS.AES.encrypt(msg, key, {
//     iv: iv,
//     mode: CryptoJS.mode.CBC,
//     padding: CryptoJS.pad.Pkcs7
//   }).toString()
//   return identifyCode
// }

const aesDecryptModeCFB = (msg, pwd, magicNo) => {
  let key = CryptoJS.enc.Hex.parse(pwd)
  let iv = CryptoJS.enc.Hex.parse(magicNo)

  let decrypted = CryptoJS.AES.decrypt(msg, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }).toString(CryptoJS.enc.Utf8)
  return decrypted
}

const user2token = (type, user, magicNo) => {
  try {
    let expires = ''
    if (type === 'MOBILE' || type === 'OA' || type === 'MP') {
      expires = Date.now() + config.MOBILE_TOKEN_AGE
    } else if (type === 'SYSTEM') {
      expires = Date.now() + config.SYSTEM_TOKEN_AGE
    } else {
      expires = Date.now() + config.TOKEN_AGE
    }

    let s = [type, user.user_id, user.created_at.toISOString(), expires.toString(), config.SECRET_KEY].join('_')
    let L = [type, user.user_id, magicNo, expires.toString(), CryptoJS.SHA1(s).toString()]
    return L.join('_')
  } catch (error) {
    logger.error(error)
    return null
  }
}

const device2token = (device, login_time) => {
  try {
    let expires = Date.now() + config.DEVICE_TOKEN_AGE

    let s = [device.device_id, login_time, expires.toString(), config.SECRET_KEY].join('_')
    let L = [device.device_id, expires.toString(), CryptoJS.SHA1(s).toString()]
    return L.join('_')
  } catch (error) {
    logger.error(error)
    return null
  }
}

const token2device = async (req) => {
  try {
    let device_token = req.get('device')
    if (device_token) {
      let tokensplit = device_token.split('_')
      if (tokensplit.length != 3) {
        return -1
      }
      let device_id = tokensplit[0],
        expires = tokensplit[1],
        sha1 = tokensplit[2]

      if (parseInt(expires) < Date.now()) {
        logger.error('expires')
        return -1
      }

      let authData = await RedisClient.get(['AUTH', 'DEVICE', device_id].join('_'))
      if (authData) {
        let device = authData.device
        if (!device) {
          logger.error('devicd do not exist')
          return -1
        }
        req.device = device

        if (authData.device_token != device_token) {
          return -1
        }

        let s = [device.device_id, authData.login_time, expires, config.SECRET_KEY].join('_')
        if (sha1 != CryptoJS.SHA1(s).toString()) {
          logger.error('invalid sha1')
          return -1
        }

        return 0
      } else {
        logger.error('Redis get authData failed')
        return -1
      }
    }

    return 0
  } catch (error) {
    logger.error(error)
    return -1
  }
}

module.exports = {
  setLogger: setLogger,
  setConfig: setConfig,
  token2user: token2user,
  user2token: user2token,
  device2token: device2token,
  token2device: token2device,
  aesDecryptModeCFB: aesDecryptModeCFB,
}
