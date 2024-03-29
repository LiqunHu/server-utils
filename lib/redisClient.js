const Redis = require('ioredis')

let client = null

const initClient = (config) => {
  if (config.cluster) {
    client = new Redis.Cluster(config.cluster)
  } else {
    if (config.password) {
      client = new Redis({
        port: config.port, // Redis port
        host: config.host, // Redis host
        db: config.db ? config.db : 0,
        password: config.password,
      })
    } else {
      client = new Redis({
        port: config.port, // Redis port
        host: config.host, // Redis host
        db: config.db ? config.db : 0,
      })
    }
  }
}

/**
 * 设置缓存
 * @param key 缓存key
 * @param value 缓存value
 * @param expired 缓存的有效时长，单位秒
 */
const set = (key, value, expired) => {
  return new Promise((resolve, reject) => {
    client.set(key, JSON.stringify(value), (err) => {
      if (err) {
        reject(err)
      }
      if (expired) {
        client.expire(key, expired, (err) => {
          if (err) {
            reject(err)
          }
          resolve()
        })
      } else {
        resolve()
      }
    })
  })
}

/**
 * 获取缓存
 * @param key 缓存key
 */
const get = async (key) => {
  let result = await client.get(key)
  if (result) {
    return JSON.parse(result)
  } else {
    return ''
  }
}

const hmset = async (key, data) => {
  await client.hmset(key, data)
}

const hset = (key, field, value, expired) => {
  return new Promise((resolve, reject) => {
    client.hset(key, field, JSON.stringify(value), (err) => {
      if (err) {
        reject(err)
      }
      if (expired) {
        client.expire(key, expired, (err) => {
          if (err) {
            reject(err)
          }
          resolve()
        })
      } else {
        resolve()
      }
    })
  })
}

const hgetall = async (key) => {
  let result = await client.hgetall(key)
  return result
}

const hget = async (key, field) => {
  let result = await client.hget(key, field)
  return result
}

const hdel = async (key, fields) => {
  await client.hdel(key, fields)
}

const hincrby = async (key, field, increment) => {
  let result = await client.hincrby(key, field, increment)
  return result
}

/**
 * 移除缓存
 * @param key 缓存key
 * @param callback 回调函数
 */
const del = async (key) => {
  await client.del(key)
}

const ttl = (key) => {
  return new Promise((resolve, reject) => {
    client.ttl(key, (err, data) => {
      if (err) {
        reject(err)
      }
      resolve(data)
    })
  })
}

const incr = (key) => {
  return new Promise((resolve, reject) => {
    client.incr(key, (err, data) => {
      if (err) {
        reject(err)
      }
      resolve(data)
    })
  })
}

const sadd = (key, members) => {
  client.sadd(key, members)
}

const srem = (key, members) => {
  client.srem(key, members)
}

const smembers = (key) => {
  return new Promise((resolve, reject) => {
    client.smembers(key, function (err, res) {
      if (err) {
        reject(err)
      }
      resolve(res)
    })
  })
}

const geoadd = async (key, longitude, latitude, value) => {
  await client.geoadd(key, longitude, latitude, value)
}

const georadius = async (key, longitude, latitude, radius, unit, ...args) => {
  let result = await client.georadius(key, longitude, latitude, radius, unit, ...args)
  return result
}

const keys = async (key) => {
  let result = await client.keys(key)
  return result
}

const lrem = async (key, count, value) => {
  await client.lrem(key, count, value)
}

const lpush = async (key, value) => {
  await client.lpush(key, value)
}

const ltrim = async (key, start, stop) => {
  await client.ltrim(key, start, stop)
}

const lrange = async (key, start, stop) => {
  let result = await client.lrange(key, start, stop)
  return result
}

const expire = async (key, seconds) => {
  await client.expire(key, seconds)
}
module.exports = {
  initClient: initClient,
  set: set,
  get: get,
  hget: hget,
  hgetall: hgetall,
  hmset: hmset,
  hset: hset,
  hdel: hdel,
  hincrby: hincrby,
  del: del,
  ttl: ttl,
  incr: incr,
  sadd: sadd,
  srem: srem,
  smembers: smembers,
  geoadd: geoadd,
  georadius: georadius,
  keys: keys,
  lrem: lrem,
  lpush: lpush,
  ltrim: ltrim,
  lrange: lrange,
  expire: expire,
}
