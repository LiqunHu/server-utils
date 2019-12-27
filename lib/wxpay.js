const xml2js = require('xml2js')
const request = require('request')
const md5 = require('md5')

module.exports = {
  wxpay: WXPay
}

function WXPay() {
  if (!(this instanceof WXPay)) {
    return new WXPay(arguments[0])
  }

  this.options = arguments[0]
  this.wxpayID = {
    appid: this.options.appid,
    mch_id: this.options.mch_id
  }
}

function mix() {
  let root = arguments[0]
  if (arguments.length == 1) {
    return root
  }
  for (let i = 1; i < arguments.length; i++) {
    for (let k in arguments[i]) {
      root[k] = arguments[i][k]
    }
  }
  return root
}

function buildXML(json) {
  let builder = new xml2js.Builder()
  return builder.buildObject(json)
}

function parseXML(xml, fn) {
  let parser = new xml2js.Parser({
    trim: true,
    explicitArray: false,
    explicitRoot: false
  })
  parser.parseString(xml, fn || function() {})
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

function pipe(stream, fn) {
  let buffers = []
  stream.on('data', function(trunk) {
    buffers.push(trunk)
  })
  stream.on('end', function() {
    fn(null, Buffer.concat(buffers))
  })
  stream.once('error', fn)
}

WXPay.mix = function() {
  switch (arguments.length) {
    case 1: {
      let obj = arguments[0]
      for (let key in obj) {
        if (WXPay.prototype.hasOwnProperty(key)) {
          throw new Error('Prototype method exist. method: ' + key)
        }
        WXPay.prototype[key] = obj[key]
      }
      break
    }
    case 2: {
      let key = arguments[0].toString(),
        fn = arguments[1]
      if (WXPay.prototype.hasOwnProperty(key)) {
        throw new Error('Prototype method exist. method: ' + key)
      }
      WXPay.prototype[key] = fn
      break
    }
  }
}

WXPay.mix('option', function(option) {
  for (let k in option) {
    this.options[k] = option[k]
  }
})

WXPay.mix('sign', function(param) {
  let querystring =
    Object.keys(param)
      .filter(function(key) {
        return param[key] !== undefined && param[key] !== '' && ['pfx', 'partner_key', 'sign', 'key'].indexOf(key) < 0
      })
      .sort()
      .map(function(key) {
        return key + '=' + param[key]
      })
      .join('&') +
    '&key=' +
    this.options.partner_key

  return md5(querystring).toUpperCase()
})

WXPay.mix('createUnifiedOrder', function(opts) {
  let _this = this
  return new Promise(function(resolve, reject) {
    opts.nonce_str = opts.nonce_str || generateNonceString()
    mix(opts, _this.wxpayID)
    opts.sign = _this.sign(opts)

    request(
      {
        url: 'https://api.mch.weixin.qq.com/pay/unifiedorder',
        method: 'POST',
        body: buildXML(opts),
        agentOptions: {
          pfx: _this.options.pfx,
          passphrase: _this.options.mch_id
        }
      },
      function(err, response, body) {
        if (err) {
          reject(err)
        }
        let parser = new xml2js.Parser({
          trim: true,
          explicitArray: false,
          explicitRoot: false
        })
        parser.parseString(body, function(err, result) {
          if (err) {
            reject(err)
          }
          if (result.return_code === 'FAIL') {
              reject(result)
              
          }
          resolve(result)
        })
      }
    )
  })
})

WXPay.mix('getBrandWCPayRequestParams', async function(order) {
  order.trade_type = 'JSAPI'
  let _this = this
  let data = await this.createUnifiedOrder(order)
  let reqparam = {
    appId: _this.options.appid,
    timeStamp: Math.floor(Date.now() / 1000) + '',
    nonceStr: data.nonce_str,
    package: 'prepay_id=' + data.prepay_id,
    signType: 'MD5'
  }
  reqparam.paySign = _this.sign(reqparam)
  return reqparam
})

WXPay.mix('createMerchantPrepayUrl', function(param) {
  param.time_stamp = param.time_stamp || Math.floor(Date.now() / 1000)
  param.nonce_str = param.nonce_str || generateNonceString()
  mix(param, this.wxpayID)
  param.sign = this.sign(param)
  let query = Object.keys(param)
    .filter(function(key) {
      return ['sign', 'mch_id', 'product_id', 'appid', 'time_stamp', 'nonce_str'].indexOf(key) >= 0
    })
    .map(function(key) {
      return key + '=' + encodeURIComponent(param[key])
    })
    .join('&')

  return 'weixin://wxpay/bizpayurl?' + query
})

WXPay.mix('useWXCallback', function(fn) {
  return function(req, res, next) {
    let _this = this
    res.success = function() {
      res.end(
        buildXML({
          xml: {
            return_code: 'SUCCESS'
          }
        })
      )
    }
    res.fail = function() {
      res.end(
        buildXML({
          xml: {
            return_code: 'FAIL'
          }
        })
      )
    }

    pipe(req, function(err, data) {
      let xml = data.toString('utf8')
      parseXML(xml, function(err, msg) {
        req.wxmessage = msg
        fn.apply(_this, [msg, req, res, next])
      })
    })
  }
})

WXPay.mix('queryOrder', function(query) {
  let _this = this
  return new Promise(function(resolve, reject) {
    if (!(query.transaction_id || query.out_trade_no)) {
      reject('缺少参数')
    }

    query.nonce_str = query.nonce_str || generateNonceString()
    mix(query, _this.wxpayID)
    query.sign = _this.sign(query)

    request(
      {
        url: 'https://api.mch.weixin.qq.com/pay/orderquery',
        method: 'POST',
        body: buildXML({
          xml: query
        })
      },
      function(err, res, body) {
        if (err) {
          reject(err)
        }
        let parser = new xml2js.Parser({
          trim: true,
          explicitArray: false,
          explicitRoot: false
        })
        parser.parseString(body, function(err, result) {
          if (err) {
            reject(err)
          }
          resolve(result)
        })
      }
    )
  })
})

WXPay.mix('closeOrder', function(order) {
  let _this = this
  return new Promise(function(resolve, reject) {
    if (!order.out_trade_no) {
      reject('缺少参数')
    }

    order.nonce_str = order.nonce_str || generateNonceString()
    mix(order, _this.wxpayID)
    order.sign = _this.sign(order)

    request(
      {
        url: 'https://api.mch.weixin.qq.com/pay/closeorder',
        method: 'POST',
        body: buildXML({
          xml: order
        })
      },
      function(err, res, body) {
        if (err) {
          reject(err)
        }
        let parser = new xml2js.Parser({
          trim: true,
          explicitArray: false,
          explicitRoot: false
        })
        parser.parseString(body, function(err, result) {
          if (err) {
            reject(err)
          }
          resolve(result)
        })
      }
    )
  })
})

WXPay.mix('refund', function(order) {
  let _this = this
  return new Promise(function(resolve, reject) {
    if (!(order.transaction_id || order.out_refund_no)) {
      reject('缺少参数')
    }

    order.nonce_str = order.nonce_str || generateNonceString()
    mix(order, _this.wxpayID)
    order.sign = _this.sign(order)

    request(
      {
        url: 'https://api.mch.weixin.qq.com/secapi/pay/refund',
        method: 'POST',
        body: buildXML({
          xml: order
        }),
        agentOptions: {
          pfx: _this.options.pfx,
          passphrase: _this.options.mch_id
        }
      },
      function(err, response, body) {
        if (err) {
          reject(err)
        }
        let parser = new xml2js.Parser({
          trim: true,
          explicitArray: false,
          explicitRoot: false
        })
        parser.parseString(body, function(err, result) {
          if (err) {
            reject(err)
          }
          resolve(result)
        })
      }
    )
  })
})
