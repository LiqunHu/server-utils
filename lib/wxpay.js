const xml2js = require('xml2js')
const rp = require('request-promise')
const md5 = require('md5')

let payConfig = {
  appid: '',
  mch_id: '',
  pfx: '',
  partner_key: '',
}

const initWxpay = (cfg) => {
  payConfig.appid = cfg.appid
  payConfig.mch_id = cfg.mch_id
  payConfig.pfx = cfg.pfx
  payConfig.partner_key = cfg.partner_key
}

const sign = (param) => {
  let querystring =
    Object.keys(param)
      .filter(function (key) {
        return param[key] !== undefined && param[key] !== '' && ['pfx', 'partner_key', 'sign', 'key'].indexOf(key) < 0
      })
      .sort()
      .map(function (key) {
        return key + '=' + param[key]
      })
      .join('&') +
    '&key=' +
    payConfig.partner_key

  return md5(querystring).toUpperCase()
}

function generateNonceString(length) {
  let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let maxPos = chars.length
  let noceStr = ''
  for (let i = 0; i < (length || 32); i++) {
    noceStr += chars.charAt(Math.floor(Math.random() * maxPos))
  }
  return noceStr
}

function buildXML(json) {
  let builder = new xml2js.Builder()
  return builder.buildObject(json)
}

const createUnifiedOrder = async (opts) => {
  opts.nonce_str = opts.nonce_str || generateNonceString()
  opts.appid = payConfig.appid
  opts.mch_id = payConfig.mch_id
  opts.sign = sign(opts)

  let options = {
    url: 'https://api.mch.weixin.qq.com/pay/unifiedorder',
    method: 'POST',
    body: buildXML(opts),
    agentOptions: {
      pfx: payConfig.pfx,
      passphrase: payConfig.mch_id,
    },
  }

  let response = await rp(options)
  let parser = new xml2js.Parser({
    trim: true,
    explicitArray: false,
    explicitRoot: false,
  })
  let result = await parser.parseStringPromise(response)
  if (result.return_code === 'FAIL') {
    throw result
  } else {
    return result
  }
}

const genJSAPIPayRequest = async (order) => {
  order.trade_type = 'JSAPI'
  let data = await createUnifiedOrder(order)
  if (data.result_code !== 'SUCCESS') {
    throw JSON.stringify(data)
  }
  let reqparam = {
    appId: payConfig.appid,
    timeStamp: Math.floor(Date.now() / 1000) + '',
    nonceStr: data.nonce_str,
    package: 'prepay_id=' + data.prepay_id,
    signType: 'MD5',
  }
  reqparam.paySign = sign(reqparam)
  return reqparam
}

const genNATIVEPayRequest = async (order) => {
  order.trade_type = 'NATIVE'
  let data = await createUnifiedOrder(order)
  return data
}

const queryOrder = async (query) => {
  if (!(query.transaction_id || query.out_trade_no)) {
    throw '缺少参数'
  }

  query.nonce_str = query.nonce_str || generateNonceString()
  query.appid = payConfig.appid
  query.mch_id = payConfig.mch_id
  query.sign = sign(query)
  let options = {
    url: 'https://api.mch.weixin.qq.com/pay/orderquery',
    method: 'POST',
    body: buildXML(query),
  }

  let response = await rp(options)
  let parser = new xml2js.Parser({
    trim: true,
    explicitArray: false,
    explicitRoot: false,
  })
  let result = await parser.parseStringPromise(response)
  return result
}

const closeOrder = async (order) => {
  if (!order.out_trade_no) {
    throw '缺少参数'
  }

  order.nonce_str = order.nonce_str || generateNonceString()
  order.appid = payConfig.appid
  order.mch_id = payConfig.mch_id
  order.sign = sign(order)
  let options = {
    url: 'https://api.mch.weixin.qq.com/pay/closeorder',
    method: 'POST',
    body: buildXML(order),
  }

  let response = await rp(options)
  let parser = new xml2js.Parser({
    trim: true,
    explicitArray: false,
    explicitRoot: false,
  })
  let result = await parser.parseStringPromise(response)
  return result
}

const refundOrder = async (order) => {
  if (!(order.transaction_id || order.out_refund_no)) {
    throw '缺少参数'
  }

  order.nonce_str = order.nonce_str || generateNonceString()
  order.appid = payConfig.appid
  order.mch_id = payConfig.mch_id
  order.sign = sign(order)
  let options = {
    url: 'https://api.mch.weixin.qq.com/secapi/pay/refund',
    method: 'POST',
    body: buildXML(order),
    agentOptions: {
      pfx: payConfig.pfx,
      passphrase: payConfig.mch_id,
    },
  }

  let response = await rp(options)
  let parser = new xml2js.Parser({
    trim: true,
    explicitArray: false,
    explicitRoot: false,
  })
  let result = await parser.parseStringPromise(response)
  return result
}

module.exports = {
  initWxpay: initWxpay,
  createUnifiedOrder: createUnifiedOrder,
  genJSAPIPayRequest: genJSAPIPayRequest,
  genNATIVEPayRequest: genNATIVEPayRequest,
  queryOrder: queryOrder,
  closeOrder: closeOrder,
  refundOrder: refundOrder,
}
